#!/usr/bin/env python3
"""
Firmware Update Module for CalypsoPy+
Handles XMODEM firmware uploads to devices
Add this to your app.py or import it as a module
"""

import os
import time
import logging
import threading
from typing import Optional, Callable, Dict, Any
from io import BytesIO

logger = logging.getLogger(__name__)

# XMODEM Constants
SOH = 0x01  # Start of Header (128 byte blocks)
STX = 0x02  # Start of Header (1024 byte blocks)
EOT = 0x04  # End of Transmission
ACK = 0x06  # Acknowledge
NAK = 0x15  # Negative Acknowledge
CAN = 0x18  # Cancel
CRC = 0x43  # 'C' for CRC mode


class XmodemTransfer:
    """XMODEM protocol implementation for firmware transfers"""

    def __init__(self, serial_connection, mode='xmodem-1k'):
        self.serial = serial_connection
        self.mode = mode
        self.block_size = 1024 if '1k' in mode else 128
        self.use_crc = True  # Modern XMODEM uses CRC16
        self.timeout = 10
        self.retry_limit = 10
        self.cancelled = False

    def calculate_crc16(self, data: bytes) -> int:
        """Calculate CRC16-CCITT for XMODEM"""
        crc = 0
        for byte in data:
            crc ^= byte << 8
            for _ in range(8):
                if crc & 0x8000:
                    crc = (crc << 1) ^ 0x1021
                else:
                    crc = crc << 1
                crc &= 0xFFFF
        return crc

    def send_file(self, file_data: bytes, progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """Send file via XMODEM protocol"""
        result = {
            'success': False,
            'bytes_sent': 0,
            'blocks_sent': 0,
            'time_taken': 0,
            'error': None
        }

        start_time = time.time()

        try:
            # Wait for receiver ready (NAK or 'C')
            logger.info("Waiting for receiver ready signal...")
            ready = self._wait_for_receiver()
            if not ready:
                result['error'] = "Receiver not ready - timeout"
                return result

            # Prepare file blocks
            file_size = len(file_data)
            total_blocks = (file_size + self.block_size - 1) // self.block_size

            logger.info(f"Starting XMODEM transfer: {file_size} bytes, {total_blocks} blocks")

            # Send blocks
            block_num = 1
            offset = 0

            while offset < file_size and not self.cancelled:
                # Prepare block
                remaining = file_size - offset
                block_data = file_data[offset:offset + min(self.block_size, remaining)]

                # Pad block if necessary
                if len(block_data) < self.block_size:
                    block_data += bytes([0x1A] * (self.block_size - len(block_data)))  # PAD with SUB

                # Send block with retries
                success = self._send_block(block_num, block_data)
                if not success:
                    result['error'] = f"Failed to send block {block_num}"
                    self._cancel_transfer()
                    return result

                offset += self.block_size
                result['blocks_sent'] = block_num
                result['bytes_sent'] = min(offset, file_size)

                # Progress callback
                if progress_callback:
                    progress = (result['bytes_sent'] / file_size) * 100
                    progress_callback({
                        'percent': progress,
                        'bytes_sent': result['bytes_sent'],
                        'total_bytes': file_size,
                        'block': block_num,
                        'total_blocks': total_blocks
                    })

                block_num = (block_num + 1) % 256

            if self.cancelled:
                result['error'] = "Transfer cancelled"
                self._cancel_transfer()
                return result

            # Send EOT
            if self._send_eot():
                result['success'] = True
                result['time_taken'] = time.time() - start_time
                logger.info(f"XMODEM transfer complete: {result['bytes_sent']} bytes in {result['time_taken']:.2f}s")
            else:
                result['error'] = "Failed to complete transfer (EOT not acknowledged)"

        except Exception as e:
            logger.error(f"XMODEM transfer error: {str(e)}")
            result['error'] = str(e)
            self._cancel_transfer()

        return result

    def _wait_for_receiver(self) -> bool:
        """Wait for receiver to be ready"""
        self.serial.timeout = 3
        start_time = time.time()

        while time.time() - start_time < 60:  # 60 second timeout
            if self.serial.in_waiting:
                byte = self.serial.read(1)
                if byte:
                    if byte[0] == NAK:
                        logger.info("Receiver ready (NAK mode)")
                        self.use_crc = False
                        return True
                    elif byte[0] == CRC:
                        logger.info("Receiver ready (CRC mode)")
                        self.use_crc = True
                        return True
            time.sleep(0.1)

        return False

    def _send_block(self, block_num: int, data: bytes) -> bool:
        """Send a single block with retries"""
        for retry in range(self.retry_limit):
            # Construct packet
            if self.block_size == 1024:
                packet = bytes([STX])  # 1K blocks
            else:
                packet = bytes([SOH])  # 128 byte blocks

            packet += bytes([block_num])
            packet += bytes([255 - block_num])
            packet += data

            # Add CRC or checksum
            if self.use_crc:
                crc = self.calculate_crc16(data)
                packet += bytes([crc >> 8, crc & 0xFF])
            else:
                checksum = sum(data) & 0xFF
                packet += bytes([checksum])

            # Send packet
            self.serial.write(packet)
            self.serial.flush()

            # Wait for response
            response = self._wait_for_response()
            if response == ACK:
                return True
            elif response == CAN:
                logger.warning("Transfer cancelled by receiver")
                self.cancelled = True
                return False

            logger.warning(f"Block {block_num} NAK'd, retry {retry + 1}")

        return False

    def _send_eot(self) -> bool:
        """Send End of Transmission"""
        for retry in range(self.retry_limit):
            self.serial.write(bytes([EOT]))
            self.serial.flush()

            response = self._wait_for_response()
            if response == ACK:
                return True

        return False

    def _wait_for_response(self) -> Optional[int]:
        """Wait for single byte response"""
        self.serial.timeout = self.timeout
        response = self.serial.read(1)
        if response:
            return response[0]
        return None

    def _cancel_transfer(self):
        """Cancel the transfer"""
        try:
            self.serial.write(bytes([CAN, CAN]))
            self.serial.flush()
        except:
            pass

    def cancel(self):
        """Public method to cancel transfer"""
        self.cancelled = True


class FirmwareUpdater:
    """Manages firmware update process for CalypsoPy+"""

    def __init__(self, manager):
        self.manager = manager  # CalypsoPyManager instance
        self.active_transfers = {}
        self.transfer_lock = threading.RLock()

    def update_firmware(self, port: str, target: str, file_data: bytes,
                        progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """
        Update firmware for specified target

        Args:
            port: Serial port name
            target: 'mcu', 'sbr0', or 'sbr1'
            file_data: Firmware file bytes
            progress_callback: Optional callback for progress updates

        Returns:
            Result dictionary with success status and details
        """
        result = {
            'success': False,
            'target': target,
            'message': '',
            'details': {}
        }

        with self.transfer_lock:
            # Check if port is connected
            if port not in self.manager.connections:
                result['message'] = f"Port {port} not connected"
                return result

            # Check if transfer already in progress
            if port in self.active_transfers:
                result['message'] = "Transfer already in progress on this port"
                return result

            try:
                ser = self.manager.connections[port]

                # Send FDL command
                command = f"fdl {target}\r\n"
                logger.info(f"Sending firmware update command: {command.strip()}")

                ser.write(command.encode())
                ser.flush()

                # Wait for device to enter XMODEM mode
                time.sleep(0.5)

                # Check for ready response
                response = ser.read(ser.in_waiting).decode('utf-8', errors='ignore')
                logger.info(f"Device response: {response}")

                # Create XMODEM transfer
                xmodem = XmodemTransfer(ser, mode='xmodem-1k')
                self.active_transfers[port] = xmodem

                # Perform transfer
                transfer_result = xmodem.send_file(file_data, progress_callback)

                if transfer_result['success']:
                    result['success'] = True
                    result['message'] = f"Successfully updated {target}"
                    result['details'] = transfer_result
                else:
                    result['message'] = f"Failed to update {target}: {transfer_result.get('error', 'Unknown error')}"
                    result['details'] = transfer_result

            except Exception as e:
                logger.error(f"Firmware update error: {str(e)}")
                result['message'] = f"Update error: {str(e)}"

            finally:
                # Clean up
                if port in self.active_transfers:
                    del self.active_transfers[port]

        return result

    def update_sbr_both(self, port: str, file_data: bytes,
                        progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """Update both SBR halves sequentially"""
        result = {
            'success': False,
            'message': '',
            'sbr0': None,
            'sbr1': None
        }

        # Update SBR0
        logger.info("Starting SBR0 update...")

        def sbr0_progress(info):
            if progress_callback:
                progress_callback({
                    **info,
                    'phase': 'sbr0',
                    'overall_percent': info['percent'] / 2  # First half
                })

        result['sbr0'] = self.update_firmware(port, 'sbr0', file_data, sbr0_progress)

        if not result['sbr0']['success']:
            result['message'] = f"SBR0 update failed: {result['sbr0']['message']}"
            return result

        # Small delay between transfers
        time.sleep(2)

        # Update SBR1
        logger.info("Starting SBR1 update...")

        def sbr1_progress(info):
            if progress_callback:
                progress_callback({
                    **info,
                    'phase': 'sbr1',
                    'overall_percent': 50 + (info['percent'] / 2)  # Second half
                })

        result['sbr1'] = self.update_firmware(port, 'sbr1', file_data, sbr1_progress)

        if result['sbr1']['success']:
            result['success'] = True
            result['message'] = "Successfully updated both SBR halves"
        else:
            result['message'] = f"SBR1 update failed: {result['sbr1']['message']}"

        return result

    def cancel_transfer(self, port: str) -> bool:
        """Cancel active transfer on port"""
        with self.transfer_lock:
            if port in self.active_transfers:
                self.active_transfers[port].cancel()
                return True
        return False
