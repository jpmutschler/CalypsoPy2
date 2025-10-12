"""
CalypsoPy+ Link Retrain Count Test
Monitors PCIe Link Control register for retrain attempts and validates against PCIe 6.x specification

This test:
1. Filters devices to only test endpoints downstream of Atlas 3 switch (not the switch itself)
2. Initiates user-configured number of link retrains via setpci
3. Monitors Link Status register for training status and retrain events
4. Compares results to PCIe 6.x specification for compliance
5. Provides comprehensive results with visualization support
"""

import subprocess
import re
import time
import logging
from typing import Dict, List, Optional, Any, Tuple, Set
from datetime import datetime
import json

try:
    from .com_error_monitor import COMErrorMonitor, ErrorCounters
    from .ltssm_monitor import LTSSMMonitor, LTSSMState, LTSSMTransition
except ImportError:
    from com_error_monitor import COMErrorMonitor, ErrorCounters
    from ltssm_monitor import LTSSMMonitor, LTSSMState, LTSSMTransition

logger = logging.getLogger(__name__)


class LinkRetrainCount:
    """
    PCIe Link Retrain Count Test

    Monitors and validates link retrain behavior by:
    - Filtering to only Atlas 3 downstream endpoint devices
    - Reading PCIe Link Control/Status registers via setpci
    - Initiating controlled link retrains
    - Tracking retrain success/failure rates
    - Validating against PCIe 6.x specification
    """

    # Atlas 3 Identifiers
    ATLAS3_VENDOR_ID = '1000'
    ATLAS3_DEVICE_ID = 'c040'

    # PCIe Register Offsets (from PCIe capability structure)
    LINK_CONTROL_OFFSET = 0x10  # Link Control Register
    LINK_STATUS_OFFSET = 0x12   # Link Status Register

    # Link Control Register Bits
    LINK_CONTROL_RETRAIN_LINK = 0x20  # Bit 5: Retrain Link

    # Link Status Register Bits
    LINK_STATUS_TRAINING = 0x800      # Bit 11: Link Training
    LINK_STATUS_TRAINED = 0x2000      # Bit 13: Link Autonomous Bandwidth Status

    # PCIe 6.x Specification Compliance Thresholds
    MAX_RETRAIN_TIME_MS = 1000        # Max time for retrain (PCIe 6.x: 1000ms typical)
    MAX_RETRAIN_ATTEMPTS = 255        # Max retrain attempts before failure
    RETRAIN_TIMEOUT_MS = 5000         # Timeout for a single retrain attempt

    def __init__(self):
        """Initialize Link Retrain Count test"""
        self.has_root = self._check_root_access()
        self.has_sudo = self._check_sudo_access()
        self.has_setpci = self._check_setpci_available()
        self.atlas3_buses = set()  # Buses downstream of Atlas 3

        if self.has_root:
            self.permission_level = "root"
        elif self.has_sudo:
            self.permission_level = "sudo"
        else:
            self.permission_level = "user"

        logger.info(f"Link Retrain Count test initialized (permission: {self.permission_level})")

    def _check_root_access(self) -> bool:
        """Check if running with root privileges"""
        try:
            import os
            return os.geteuid() == 0
        except:
            return False

    def _check_sudo_access(self) -> bool:
        """Check if sudo is available"""
        try:
            result = subprocess.run(
                ['sudo', '-n', 'true'],
                capture_output=True,
                timeout=1
            )
            return result.returncode == 0
        except:
            return False

    def _check_setpci_available(self) -> bool:
        """Check if setpci command is available"""
        try:
            result = subprocess.run(
                ['which', 'setpci'],
                capture_output=True,
                timeout=1
            )
            return result.returncode == 0
        except:
            return False

    def _run_command(self, cmd: List[str], use_sudo: bool = False, timeout: int = 5) -> Optional[str]:
        """Run a shell command and return output"""
        if use_sudo and self.has_sudo and not self.has_root:
            cmd = ['sudo'] + cmd

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )

            if result.returncode == 0:
                return result.stdout.strip()
            else:
                logger.warning(f"Command failed: {' '.join(cmd)} - {result.stderr}")
                return None
        except subprocess.TimeoutExpired:
            logger.error(f"Command timeout: {' '.join(cmd)}")
            return None
        except Exception as e:
            logger.error(f"Command error: {e}")
            return None

    def _identify_atlas3_buses(self) -> Set[int]:
        """
        Identify all buses that are downstream of Atlas 3 switch
        Returns set of bus numbers
        """
        atlas3_buses = set()

        # Get all PCIe devices
        output = self._run_command(['lspci', '-nn'])
        if not output:
            logger.warning("Failed to run lspci")
            return atlas3_buses

        # Find Atlas 3 root bridge and downstream ports
        atlas3_bdfs = []
        for line in output.strip().split('\n'):
            # Look for Atlas 3 devices (vendor 1000, device c040)
            if f'[{self.ATLAS3_VENDOR_ID}:{self.ATLAS3_DEVICE_ID}]' in line:
                bdf_match = re.match(r'^([0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])', line)
                if bdf_match:
                    atlas3_bdfs.append(bdf_match.group(1))

        if not atlas3_bdfs:
            logger.warning("No Atlas 3 devices found")
            return atlas3_buses

        logger.info(f"Found {len(atlas3_bdfs)} Atlas 3 bridge(s): {atlas3_bdfs}")

        # For each Atlas 3 bridge, get subordinate bus range
        for bdf in atlas3_bdfs:
            output = self._run_command(['lspci', '-vvv', '-s', bdf], use_sudo=self.has_sudo)
            if output:
                # Extract subordinate bus number
                bus_match = re.search(r'Bus:\s+primary=([0-9a-f]+),\s+secondary=([0-9a-f]+),\s+subordinate=([0-9a-f]+)',
                                      output)
                if bus_match:
                    subordinate_bus = int(bus_match.group(3), 16)
                    secondary_bus = int(bus_match.group(2), 16)

                    # Add all buses from secondary to subordinate
                    for bus_num in range(secondary_bus, subordinate_bus + 1):
                        atlas3_buses.add(bus_num)

                    logger.info(f"Atlas 3 bridge {bdf}: buses {secondary_bus:02x}-{subordinate_bus:02x}")

        return atlas3_buses

    def _is_device_atlas3_downstream(self, pci_address: str) -> bool:
        """
        Check if a device is downstream of Atlas 3 switch (not the switch itself)

        Args:
            pci_address: PCI address like "03:00.0" or "0000:03:00.0"

        Returns:
            True if device is an endpoint downstream of Atlas 3
        """
        if not pci_address or pci_address == 'Unknown':
            return False

        # Extract bus number
        # Handle both "03:00.0" and "0000:03:00.0" formats
        if pci_address.count(':') == 2:
            # Format: 0000:03:00.0
            bus_str = pci_address.split(':')[1]
        else:
            # Format: 03:00.0
            bus_str = pci_address.split(':')[0]

        try:
            bus_num = int(bus_str, 16)
            is_downstream = bus_num in self.atlas3_buses

            # Additional check: Make sure it's not the Atlas 3 switch itself
            if is_downstream:
                # Check device class - switches are PCI bridges (class 0604)
                output = self._run_command(['lspci', '-s', pci_address, '-n'])
                if output:
                    # Check if it's a bridge (class 0604)
                    if '0604:' in output:
                        logger.debug(f"Device {pci_address} is a PCI bridge - excluding from test")
                        return False

                    # Check if it's an Atlas 3 device
                    if f'{self.ATLAS3_VENDOR_ID}:{self.ATLAS3_DEVICE_ID}' in output:
                        logger.debug(f"Device {pci_address} is Atlas 3 switch - excluding from test")
                        return False

            logger.debug(
                f"Device {pci_address} (bus {bus_num:02x}): {'downstream endpoint' if is_downstream else 'NOT downstream'} of Atlas 3")
            return is_downstream
        except:
            return False

    def _is_endpoint_device(self, pci_address: str) -> bool:
        """
        Check if device is an endpoint (not a bridge/switch)

        Args:
            pci_address: PCI address

        Returns:
            True if device is an endpoint
        """
        output = self._run_command(['lspci', '-s', pci_address, '-v'])
        if output:
            # Bridges will have "PCI bridge" or "Host bridge" in description
            if 'bridge' in output.lower():
                return False
        return True

    def get_pcie_capability_offset(self, pci_address: str) -> Optional[int]:
        """
        Get PCIe capability structure offset for a device

        Args:
            pci_address: PCI address (e.g., 0000:01:00.0)

        Returns:
            Capability offset or None if not found
        """
        # Read capability pointer from offset 0x34
        cap_ptr_output = self._run_command(
            ['setpci', '-s', pci_address, '0x34.b'],
            use_sudo=True
        )

        if not cap_ptr_output:
            return None

        try:
            cap_ptr = int(cap_ptr_output, 16)
        except ValueError:
            return None

        # Walk capability list to find PCIe capability (ID 0x10)
        current_offset = cap_ptr
        max_iterations = 48  # Prevent infinite loops

        for _ in range(max_iterations):
            if current_offset == 0 or current_offset == 0xFF:
                break

            # Read capability ID and next pointer
            cap_data = self._run_command(
                ['setpci', '-s', pci_address, f'{current_offset:#x}.l'],
                use_sudo=True
            )

            if not cap_data:
                break

            try:
                cap_value = int(cap_data, 16)
                cap_id = cap_value & 0xFF
                next_ptr = (cap_value >> 8) & 0xFF

                # Check if this is PCIe capability (0x10)
                if cap_id == 0x10:
                    return current_offset

                current_offset = next_ptr
            except ValueError:
                break

        return None

    def read_link_control(self, pci_address: str, cap_offset: int) -> Optional[int]:
        """Read Link Control register"""
        offset = cap_offset + self.LINK_CONTROL_OFFSET
        output = self._run_command(
            ['setpci', '-s', pci_address, f'{offset:#x}.w'],
            use_sudo=True
        )

        if output:
            try:
                return int(output, 16)
            except ValueError:
                pass
        return None

    def read_link_status(self, pci_address: str, cap_offset: int) -> Optional[int]:
        """Read Link Status register"""
        offset = cap_offset + self.LINK_STATUS_OFFSET
        output = self._run_command(
            ['setpci', '-s', pci_address, f'{offset:#x}.w'],
            use_sudo=True
        )

        if output:
            try:
                return int(output, 16)
            except ValueError:
                pass
        return None

    def write_link_control(self, pci_address: str, cap_offset: int, value: int) -> bool:
        """Write Link Control register"""
        offset = cap_offset + self.LINK_CONTROL_OFFSET
        result = self._run_command(
            ['setpci', '-s', pci_address, f'{offset:#x}.w={value:#x}'],
            use_sudo=True
        )
        return result is not None

    def trigger_link_retrain(self, pci_address: str, cap_offset: int) -> Dict[str, Any]:
        """
        Trigger a link retrain by setting Retrain Link bit

        Args:
            pci_address: PCI address
            cap_offset: PCIe capability offset

        Returns:
            Result dictionary with timing and status
        """
        start_timestamp = time.time()
        result = {
            'success': False,
            'pci_address': pci_address,
            'start_time': start_timestamp,
            'retrain_time_ms': 0,
            'training_detected': False,
            'training_completed': False,
            'timeout': False,
            'error': None
        }

        # Read current Link Control
        link_control = self.read_link_control(pci_address, cap_offset)
        if link_control is None:
            result['error'] = 'Failed to read Link Control register'
            return result

        # Set Retrain Link bit (bit 5)
        new_link_control = link_control | self.LINK_CONTROL_RETRAIN_LINK

        # Write back to trigger retrain
        start_time = time.time()
        if not self.write_link_control(pci_address, cap_offset, new_link_control):
            result['error'] = 'Failed to write Link Control register'
            return result

        # Monitor Link Status for training completion
        timeout_time = start_time + (self.RETRAIN_TIMEOUT_MS / 1000.0)
        training_started = False

        while time.time() < timeout_time:
            link_status = self.read_link_status(pci_address, cap_offset)

            if link_status is None:
                time.sleep(0.001)  # 1ms delay
                continue

            # Check if training is in progress (bit 11)
            if link_status & self.LINK_STATUS_TRAINING:
                training_started = True
                result['training_detected'] = True

            # Check if training completed (bit 11 cleared after being set)
            if training_started and not (link_status & self.LINK_STATUS_TRAINING):
                result['training_completed'] = True
                result['success'] = True
                result['retrain_time_ms'] = (time.time() - start_time) * 1000
                return result

            time.sleep(0.001)  # 1ms polling interval

        # Timeout occurred
        result['timeout'] = True
        result['retrain_time_ms'] = (time.time() - start_time) * 1000
        result['error'] = 'Retrain timeout'

        return result

    def run_retrain_test(self, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run link retrain count test

        Args:
            options: Test configuration
                - pci_address: Target PCI device (required if discovered_devices not provided)
                - num_retrains: Number of retrains to perform (default: 5)
                - delay_between_ms: Delay between retrains in ms (default: 100)
                - discovered_devices: List of devices from NVMe/PCIe discovery (optional)
                - filter_endpoints_only: Only test endpoint devices, not bridges (default: True)
                - calypso_manager: CalypsoPyManager instance for Atlas 3 Switch error monitoring (optional)
                - com_port: COM port for error monitoring (optional)
                - monitor_errors: Boolean, enable COM error monitoring (default: False)
                - error_sampling_interval: Error sampling interval in seconds (default: 1.0)

        Returns:
            Test result dictionary
        """
        start_time = time.time()
        
        # CalypsoPy+ error monitoring options
        monitor_errors = options.get('monitor_errors', False)
        calypso_manager = options.get('calypso_manager')
        com_port = options.get('com_port')
        error_sampling_interval = options.get('error_sampling_interval', 1.0)

        result = {
            'test_name': 'Link Retrain Count',
            'test_id': 'link_retrain_count',
            'timestamp': datetime.now().isoformat(),
            'status': 'fail',
            'duration_ms': 0,
            'permission_level': self.permission_level,
            'summary': {},
            'devices': [],
            'statistics': {},
            'compliance': {},
            'warnings': [],
            'errors': [],
            'error_monitoring': {
                'enabled': monitor_errors,
                'available': False,
                'data': None,
                'correlation': {}
            },
            'ltssm_monitoring': {
                'enabled': True,
                'available': False,
                'data': None,
                'correlation': {}
            },
            'filtered_info': {
                'total_discovered': 0,
                'atlas3_downstream': 0,
                'endpoints_only': 0,
                'excluded_count': 0,
                'excluded_devices': []
            }
        }

        # Check permissions
        if not (self.has_root or self.has_sudo):
            result['errors'].append('Root or sudo access required for link retrain test')
            result['duration_ms'] = int((time.time() - start_time) * 1000)
            return result

        if not self.has_setpci:
            result['errors'].append('setpci command not available - install pciutils')
            result['duration_ms'] = int((time.time() - start_time) * 1000)
            return result

        # Identify Atlas 3 buses
        self.atlas3_buses = self._identify_atlas3_buses()

        if not self.atlas3_buses:
            result['warnings'].append('No Atlas 3 buses identified - cannot filter devices')

        # Get target devices
        all_devices = []
        filter_endpoints = options.get('filter_endpoints_only', True)

        if options.get('discovered_devices'):
            # Use devices from NVMe/PCIe discovery
            for device in options['discovered_devices']:
                if device.get('pci_address'):
                    all_devices.append({
                        'pci_address': device['pci_address'],
                        'name': device.get('model', device.get('device', 'Unknown')),
                        'device_type': device.get('device_type', 'Unknown')
                    })
        elif options.get('pci_address'):
            # Single device specified
            all_devices.append({
                'pci_address': options['pci_address'],
                'name': options.get('device_name', 'Unknown'),
                'device_type': 'Manually Specified'
            })
        else:
            result['errors'].append('No target devices specified')
            result['duration_ms'] = int((time.time() - start_time) * 1000)
            return result

        result['filtered_info']['total_discovered'] = len(all_devices)

        # Filter devices to only Atlas 3 downstream endpoints
        target_devices = []
        excluded_devices = []

        for device_info in all_devices:
            pci_address = device_info['pci_address']
            device_name = device_info['name']

            # Check if downstream of Atlas 3
            if not self._is_device_atlas3_downstream(pci_address):
                excluded_devices.append({
                    'pci_address': pci_address,
                    'name': device_name,
                    'reason': 'Not downstream of Atlas 3 switch'
                })
                logger.info(f"Excluding {device_name} ({pci_address}): Not downstream of Atlas 3")
                continue

            # Check if it's an endpoint (not a bridge)
            if filter_endpoints and not self._is_endpoint_device(pci_address):
                excluded_devices.append({
                    'pci_address': pci_address,
                    'name': device_name,
                    'reason': 'Device is a bridge/switch, not an endpoint'
                })
                logger.info(f"Excluding {device_name} ({pci_address}): Bridge/Switch device")
                continue

            # Device passed filters
            target_devices.append(device_info)
            logger.info(f"Including {device_name} ({pci_address}): Atlas 3 downstream endpoint")

        result['filtered_info']['atlas3_downstream'] = len([d for d in all_devices
                                                             if self._is_device_atlas3_downstream(d['pci_address'])])
        result['filtered_info']['endpoints_only'] = len(target_devices)
        result['filtered_info']['excluded_count'] = len(excluded_devices)
        result['filtered_info']['excluded_devices'] = excluded_devices

        if not target_devices:
            if excluded_devices:
                result['errors'].append(
                    f'No valid endpoint devices found. {len(excluded_devices)} device(s) excluded: '
                    f'{", ".join([d["reason"] for d in excluded_devices[:3]])}'
                )
            else:
                result['errors'].append('No Atlas 3 downstream endpoint devices found')
            result['duration_ms'] = int((time.time() - start_time) * 1000)
            return result

        logger.info(f"Testing {len(target_devices)} Atlas 3 downstream endpoint device(s)")
        if excluded_devices:
            logger.info(f"Excluded {len(excluded_devices)} device(s) from testing")

        # Initialize Atlas 3 PCIe error monitoring if requested
        error_monitor = None
        if monitor_errors and calypso_manager and com_port:
            try:
                error_monitor = COMErrorMonitor(calypso_manager, com_port)
                
                # Start monitoring Atlas 3 link training errors in background
                if error_monitor.start_monitoring(
                    sampling_interval=error_sampling_interval
                ):
                    result['error_monitoring']['available'] = True
                    logger.info(f"Atlas 3 error monitoring started on {com_port}")
                else:
                    result['warnings'].append("Failed to start Atlas 3 error monitoring")
                    
            except Exception as e:
                result['warnings'].append(f"Atlas 3 error monitoring setup failed: {str(e)}")
                logger.warning(f"Error monitoring setup failed: {e}")
        elif monitor_errors:
            result['warnings'].append("Atlas 3 error monitoring requested but CalypsoPy manager or port not provided")

        # Initialize LTSSM monitoring for retrain events
        ltssm_monitor = None
        try:
            # Use first target device or a default PCI address for LTSSM monitoring
            device_path = target_devices[0]['pci_address'] if target_devices else "0000:01:00.0"
            ltssm_monitor = LTSSMMonitor(device_path)
            
            # Start LTSSM monitoring for retrain events
            if ltssm_monitor.start_monitoring(
                sampling_interval=0.1  # Very high frequency for retrain events
            ):
                result['ltssm_monitoring']['available'] = True
                logger.info(f"LTSSM monitoring started for device: {device_path}")
            else:
                result['warnings'].append("Failed to start LTSSM monitoring")
                
        except Exception as e:
            result['warnings'].append(f"LTSSM monitoring setup failed: {str(e)}")
            logger.warning(f"LTSSM monitoring setup failed: {e}")

        # Get test parameters
        num_retrains = options.get('num_retrains', 5)
        delay_between_ms = options.get('delay_between_ms', 100)

        # Test each device
        total_retrains = 0
        successful_retrains = 0
        failed_retrains = 0
        timeout_retrains = 0

        all_retrain_times = []

        for device_info in target_devices:
            pci_address = device_info['pci_address']
            device_name = device_info['name']

            logger.info(f"Testing device: {device_name} ({pci_address})")

            # Find PCIe capability offset
            cap_offset = self.get_pcie_capability_offset(pci_address)

            if cap_offset is None:
                result['warnings'].append(f'Could not find PCIe capability for {pci_address}')
                continue

            device_result = {
                'pci_address': pci_address,
                'name': device_name,
                'capability_offset': f'0x{cap_offset:02x}',
                'retrains': [],
                'statistics': {
                    'total': 0,
                    'successful': 0,
                    'failed': 0,
                    'timeouts': 0,
                    'avg_time_ms': 0,
                    'min_time_ms': 0,
                    'max_time_ms': 0
                }
            }

            # Perform retrains
            retrain_times = []

            for i in range(num_retrains):
                retrain_result = self.trigger_link_retrain(pci_address, cap_offset)

                total_retrains += 1
                device_result['retrains'].append({
                    'sequence': i + 1,
                    'success': retrain_result['success'],
                    'time_ms': round(retrain_result['retrain_time_ms'], 2),
                    'training_detected': retrain_result['training_detected'],
                    'training_completed': retrain_result['training_completed'],
                    'timeout': retrain_result['timeout'],
                    'error': retrain_result.get('error')
                })

                if retrain_result['success']:
                    successful_retrains += 1
                    retrain_times.append(retrain_result['retrain_time_ms'])
                    all_retrain_times.append(retrain_result['retrain_time_ms'])
                elif retrain_result['timeout']:
                    timeout_retrains += 1
                else:
                    failed_retrains += 1

                # Delay between retrains
                if i < num_retrains - 1:
                    time.sleep(delay_between_ms / 1000.0)

            # Calculate device statistics
            if retrain_times:
                device_result['statistics']['total'] = len(device_result['retrains'])
                device_result['statistics']['successful'] = successful_retrains
                device_result['statistics']['failed'] = failed_retrains
                device_result['statistics']['timeouts'] = timeout_retrains
                device_result['statistics']['avg_time_ms'] = round(sum(retrain_times) / len(retrain_times), 2)
                device_result['statistics']['min_time_ms'] = round(min(retrain_times), 2)
                device_result['statistics']['max_time_ms'] = round(max(retrain_times), 2)

            result['devices'].append(device_result)

        # Overall statistics
        result['summary'] = {
            'total_devices': len(target_devices),
            'total_retrains': total_retrains,
            'successful_retrains': successful_retrains,
            'failed_retrains': failed_retrains,
            'timeout_retrains': timeout_retrains,
            'success_rate': round((successful_retrains / total_retrains * 100) if total_retrains > 0 else 0, 1)
        }

        if all_retrain_times:
            result['statistics'] = {
                'avg_retrain_time_ms': round(sum(all_retrain_times) / len(all_retrain_times), 2),
                'min_retrain_time_ms': round(min(all_retrain_times), 2),
                'max_retrain_time_ms': round(max(all_retrain_times), 2),
                'std_dev_ms': round(self._calculate_std_dev(all_retrain_times), 2)
            }

        # PCIe 6.x Compliance Check
        compliance_issues = []

        if all_retrain_times:
            avg_time = result['statistics']['avg_retrain_time_ms']
            max_time = result['statistics']['max_retrain_time_ms']

            if max_time > self.MAX_RETRAIN_TIME_MS:
                compliance_issues.append(
                    f'Max retrain time ({max_time}ms) exceeds PCIe 6.x limit ({self.MAX_RETRAIN_TIME_MS}ms)'
                )

            if avg_time > self.MAX_RETRAIN_TIME_MS / 2:
                result['warnings'].append(
                    f'Average retrain time ({avg_time}ms) is high (>50% of spec limit)'
                )

        if failed_retrains > 0:
            compliance_issues.append(f'{failed_retrains} retrain(s) failed to complete')

        if timeout_retrains > 0:
            compliance_issues.append(f'{timeout_retrains} retrain(s) timed out')

        result['compliance'] = {
            'spec_version': 'PCIe 6.x',
            'max_retrain_time_ms': self.MAX_RETRAIN_TIME_MS,
            'max_retrain_attempts': self.MAX_RETRAIN_ATTEMPTS,
            'compliant': len(compliance_issues) == 0,
            'issues': compliance_issues
        }

        # Stop error monitoring and correlate with retrain events
        if error_monitor and error_monitor.is_monitoring():
            try:
                error_data = error_monitor.stop_monitoring()
                if error_data:
                    result['error_monitoring']['data'] = error_data.to_dict()
                    
                    # Correlate error counter changes with retrain events
                    correlation = self._correlate_errors_with_retrains(error_data, result['devices'])
                    result['error_monitoring']['correlation'] = correlation
                    
                    # Add summary for easy access
                    result['error_monitoring']['summary'] = {
                        'duration_seconds': error_data.session_end - error_data.session_start,
                        'total_samples': error_data.total_samples,
                        'error_changes_detected': sum(abs(delta) for delta in (error_data.error_deltas or {}).values()) > 0,
                        'total_error_changes': sum(abs(delta) for delta in (error_data.error_deltas or {}).values()),
                        'error_deltas': error_data.error_deltas,
                        'monitoring_successful': True
                    }
                    
                    logger.info(f"Error monitoring correlation: {correlation['summary']}")
                else:
                    result['warnings'].append("Error monitoring stopped but no data collected")
            except Exception as e:
                result['warnings'].append(f"Error stopping monitoring: {str(e)}")
                logger.warning(f"Error stopping monitoring: {e}")

        # Stop LTSSM monitoring and correlate with retrain events
        if ltssm_monitor and ltssm_monitor.is_monitoring():
            try:
                ltssm_data = ltssm_monitor.stop_monitoring()
                if ltssm_data:
                    result['ltssm_monitoring']['data'] = ltssm_data.to_dict()
                    
                    # Correlate LTSSM state transitions with retrain events
                    ltssm_correlation = self._correlate_ltssm_with_retrains(ltssm_data, result['devices'])
                    result['ltssm_monitoring']['correlation'] = ltssm_correlation
                    
                    # Add summary for easy access
                    result['ltssm_monitoring']['summary'] = {
                        'duration_seconds': ltssm_data.session_end - ltssm_data.session_start,
                        'total_samples': ltssm_data.total_samples,
                        'total_transitions': len(ltssm_data.transitions),
                        'devices_monitored': len(ltssm_data.device_states) if ltssm_data.device_states else 0,
                        'monitoring_successful': True
                    }
                    
                    logger.info(f"LTSSM monitoring completed: {len(ltssm_data.transitions)} transitions detected")
                else:
                    result['warnings'].append("LTSSM monitoring stopped but no data collected")
            except Exception as e:
                result['warnings'].append(f"Error stopping LTSSM monitoring: {str(e)}")
                logger.warning(f"LTSSM monitoring stop failed: {e}")

        # Determine overall status
        if len(compliance_issues) == 0 and failed_retrains == 0:
            result['status'] = 'pass'
        elif failed_retrains == 0 and len(result['warnings']) > 0:
            result['status'] = 'warning'
        else:
            result['status'] = 'fail'

        result['duration_ms'] = int((time.time() - start_time) * 1000)

        return result

    def _correlate_errors_with_retrains(self, error_data, devices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Correlate Atlas 3 cumulative error counter changes with link retrain events
        
        Args:
            error_data: ErrorMonitorResult from monitoring session
            devices: List of device test results with retrain events
            
        Returns:
            Correlation analysis dictionary
        """
        correlation = {
            'summary': {},
            'error_timing': {},
            'error_spikes': [],
            'retrain_correlation': {},
            'baseline_errors': {},
            'cumulative_analysis': {},
            'retrain_analysis': {}
        }
        
        try:
            if not error_data or not error_data.samples or len(error_data.samples) < 2:
                correlation['summary'] = {'status': 'no_error_data', 'message': 'Insufficient error counter data'}
                return correlation
            
            # Establish baseline from first sample (test start)
            baseline = error_data.samples[0]
            correlation['baseline_errors'] = {
                'timestamp': baseline.timestamp,
                'port_receive': baseline.port_receive,
                'bad_tlp': baseline.bad_tlp,
                'bad_dllp': baseline.bad_dllp,
                'rec_diag': baseline.rec_diag
            }
            
            # Calculate total error changes from baseline to final
            final_sample = error_data.samples[-1]
            total_error_changes = {
                'port_receive': final_sample.port_receive - baseline.port_receive,
                'bad_tlp': final_sample.bad_tlp - baseline.bad_tlp,
                'bad_dllp': final_sample.bad_dllp - baseline.bad_dllp,
                'rec_diag': final_sample.rec_diag - baseline.rec_diag
            }
            
            total_new_errors = sum(max(0, delta) for delta in total_error_changes.values())
            
            # Collect all retrain timestamps for analysis
            all_retrain_times = []
            total_retrains = 0
            for device in devices:
                for retrain in device.get('retrains', []):
                    if retrain.get('start_time', 0) > 0:
                        all_retrain_times.append({
                            'timestamp': retrain['start_time'],
                            'device': device['pci_address'],
                            'retrain_number': retrain.get('retrain_number', 0),
                            'duration_ms': retrain.get('duration_ms', 0)
                        })
                        total_retrains += 1
            
            correlation['retrain_analysis'] = {
                'total_retrains_performed': total_retrains,
                'retrain_timestamps': all_retrain_times,
                'retrain_timespan_seconds': (max(r['timestamp'] for r in all_retrain_times) - 
                                           min(r['timestamp'] for r in all_retrain_times)) if all_retrain_times else 0
            }
            
            correlation['summary'] = {
                'total_new_errors': total_new_errors,
                'error_changes_from_baseline': total_error_changes,
                'monitoring_duration': error_data.session_end - error_data.session_start,
                'samples_collected': error_data.total_samples,
                'baseline_timestamp': baseline.timestamp,
                'retrains_performed': total_retrains,
                'errors_per_retrain': total_new_errors / total_retrains if total_retrains > 0 else 0
            }
            
            # If we have new errors during the test, analyze timing
            if total_new_errors > 0:
                correlation['summary']['status'] = 'new_errors_detected'
                correlation['summary']['message'] = f'Detected {total_new_errors} new errors during {total_retrains} retrains'
                
                # Find error increments relative to baseline and correlate with retrains
                for i, sample in enumerate(error_data.samples[1:], 1):  # Skip baseline
                    # Calculate delta from baseline
                    delta_from_baseline = {
                        'port_receive': max(0, sample.port_receive - baseline.port_receive),
                        'bad_tlp': max(0, sample.bad_tlp - baseline.bad_tlp),
                        'bad_dllp': max(0, sample.bad_dllp - baseline.bad_dllp),
                        'rec_diag': max(0, sample.rec_diag - baseline.rec_diag)
                    }
                    
                    # Check if this sample shows any error increase from previous sample
                    if i > 1:
                        prev_sample = error_data.samples[i-1]
                        sample_increment = {
                            'port_receive': max(0, sample.port_receive - prev_sample.port_receive),
                            'bad_tlp': max(0, sample.bad_tlp - prev_sample.bad_tlp),
                            'bad_dllp': max(0, sample.bad_dllp - prev_sample.bad_dllp),
                            'rec_diag': max(0, sample.rec_diag - prev_sample.rec_diag)
                        }
                        
                        increment_total = sum(sample_increment.values())
                        
                        if increment_total > 0:
                            # Find nearby retrains for this error spike
                            nearby_retrains = []
                            for retrain_event in all_retrain_times:
                                time_diff = abs(retrain_event['timestamp'] - sample.timestamp)
                                if time_diff <= 2.0:  # 2 second window for retrain correlation
                                    nearby_retrains.append({
                                        'retrain': retrain_event,
                                        'time_offset': retrain_event['timestamp'] - sample.timestamp
                                    })
                            
                            spike = {
                                'timestamp': sample.timestamp,
                                'sample_index': i,
                                'incremental_errors': sample_increment,
                                'cumulative_from_baseline': delta_from_baseline,
                                'increment_total': increment_total,
                                'elapsed_since_start': sample.timestamp - baseline.timestamp,
                                'nearby_retrains': nearby_retrains,
                                'retrain_correlation_strength': len(nearby_retrains)
                            }
                            correlation['error_spikes'].append(spike)
                
                # Enhanced cumulative analysis for retrain scenarios
                correlation['cumulative_analysis'] = {
                    'peak_error_rate': self._calculate_peak_error_rate_retrain(error_data.samples, baseline),
                    'error_progression': self._analyze_error_progression_retrain(error_data.samples, baseline, all_retrain_times),
                    'error_timeline': [(sample.timestamp - baseline.timestamp, 
                                      sum(max(0, getattr(sample, attr) - getattr(baseline, attr)) 
                                          for attr in ['port_receive', 'bad_tlp', 'bad_dllp', 'rec_diag']))
                                     for sample in error_data.samples],
                    'retrain_vs_error_correlation': self._calculate_retrain_error_correlation(
                        error_data.samples, baseline, all_retrain_times)
                }
                
                # Create detailed retrain correlation analysis
                retrain_correlated_spikes = [spike for spike in correlation['error_spikes'] 
                                           if spike['retrain_correlation_strength'] > 0]
                
                if retrain_correlated_spikes:
                    correlation['retrain_correlation'] = {
                        'correlated_error_spikes': len(retrain_correlated_spikes),
                        'total_error_spikes': len(correlation['error_spikes']),
                        'correlation_percentage': (len(retrain_correlated_spikes) / len(correlation['error_spikes'])) * 100,
                        'spike_details': retrain_correlated_spikes
                    }
                else:
                    correlation['retrain_correlation'] = {
                        'correlated_error_spikes': 0,
                        'total_error_spikes': len(correlation['error_spikes']),
                        'correlation_percentage': 0,
                        'message': 'No temporal correlation found between error spikes and retrain events'
                    }
            else:
                correlation['summary']['status'] = 'no_new_errors'
                correlation['summary']['message'] = f'No new errors detected during {total_retrains} retrains (error counters remained stable)'
                
        except Exception as e:
            correlation['summary'] = {'status': 'correlation_error', 'message': f'Error during correlation: {str(e)}'}
            logger.warning(f"Error correlation failed: {e}")
        
        return correlation
    
    def _calculate_peak_error_rate_retrain(self, samples, baseline):
        """Calculate the peak error rate (errors per second) during retrain test"""
        if len(samples) < 3:
            return 0.0
            
        max_rate = 0.0
        for i in range(2, len(samples)):
            prev_sample = samples[i-1]
            curr_sample = samples[i]
            time_diff = curr_sample.timestamp - prev_sample.timestamp
            
            if time_diff > 0:
                error_diff = sum(max(0, getattr(curr_sample, attr) - getattr(prev_sample, attr))
                               for attr in ['port_receive', 'bad_tlp', 'bad_dllp', 'rec_diag'])
                rate = error_diff / time_diff
                max_rate = max(max_rate, rate)
        
        return max_rate
    
    def _analyze_error_progression_retrain(self, samples, baseline, retrain_times):
        """Analyze how errors progressed throughout the retrain test"""
        if len(samples) < 2:
            return {'pattern': 'insufficient_data'}
        
        # Divide the test into phases based on retrain activity
        if not retrain_times:
            return {'pattern': 'no_retrains'}
        
        test_start = baseline.timestamp
        test_end = samples[-1].timestamp
        
        # Find errors in different phases
        pre_retrain_errors = 0
        during_retrain_errors = 0
        post_retrain_errors = 0
        
        first_retrain = min(r['timestamp'] for r in retrain_times)
        last_retrain = max(r['timestamp'] for r in retrain_times)
        
        for sample in samples:
            errors_from_baseline = sum(max(0, getattr(sample, attr) - getattr(baseline, attr))
                                     for attr in ['port_receive', 'bad_tlp', 'bad_dllp', 'rec_diag'])
            
            if sample.timestamp < first_retrain:
                pre_retrain_errors = max(pre_retrain_errors, errors_from_baseline)
            elif sample.timestamp <= last_retrain + 2.0:  # Include 2s buffer after last retrain
                during_retrain_errors = max(during_retrain_errors, errors_from_baseline)
            else:
                post_retrain_errors = max(post_retrain_errors, errors_from_baseline)
        
        # Determine pattern
        if pre_retrain_errors == 0 and during_retrain_errors == 0 and post_retrain_errors == 0:
            pattern = 'stable_no_errors'
        elif pre_retrain_errors == 0 and during_retrain_errors > 0:
            pattern = 'errors_during_retrains'
        elif during_retrain_errors > pre_retrain_errors:
            pattern = 'errors_increased_with_retrains'
        elif post_retrain_errors > during_retrain_errors:
            pattern = 'errors_after_retrains'
        else:
            pattern = 'variable_error_pattern'
        
        return {
            'pattern': pattern,
            'pre_retrain_errors': pre_retrain_errors,
            'during_retrain_errors': during_retrain_errors,
            'post_retrain_errors': post_retrain_errors,
            'error_increase_during_retrains': during_retrain_errors - pre_retrain_errors,
            'retrain_timespan_seconds': last_retrain - first_retrain if retrain_times else 0
        }
    
    def _calculate_retrain_error_correlation(self, samples, baseline, retrain_times):
        """Calculate statistical correlation between retrain events and error increases"""
        if not retrain_times or len(samples) < 3:
            return {'correlation': 'insufficient_data'}
        
        # Create time windows around each retrain (±2 seconds)
        retrain_windows = []
        for retrain in retrain_times:
            start_window = retrain['timestamp'] - 2.0
            end_window = retrain['timestamp'] + 2.0
            retrain_windows.append((start_window, end_window, retrain))
        
        # Count error increases inside vs outside retrain windows
        errors_in_windows = 0
        errors_outside_windows = 0
        
        for i in range(1, len(samples)):
            prev_sample = samples[i-1]
            curr_sample = samples[i]
            
            # Check for error increase
            error_increase = sum(max(0, getattr(curr_sample, attr) - getattr(prev_sample, attr))
                               for attr in ['port_receive', 'bad_tlp', 'bad_dllp', 'rec_diag'])
            
            if error_increase > 0:
                # Check if this sample is within any retrain window
                in_window = any(start <= curr_sample.timestamp <= end 
                              for start, end, _ in retrain_windows)
                
                if in_window:
                    errors_in_windows += error_increase
                else:
                    errors_outside_windows += error_increase
        
        total_errors = errors_in_windows + errors_outside_windows
        
        if total_errors == 0:
            return {'correlation': 'no_errors_detected'}
        
        correlation_strength = errors_in_windows / total_errors if total_errors > 0 else 0
        
        return {
            'correlation': 'strong' if correlation_strength > 0.7 else 'moderate' if correlation_strength > 0.4 else 'weak',
            'correlation_strength': correlation_strength,
            'errors_during_retrains': errors_in_windows,
            'errors_outside_retrains': errors_outside_windows,
            'total_error_increases': total_errors,
            'retrain_windows_analyzed': len(retrain_windows)
        }
    
    def _correlate_ltssm_with_retrains(self, ltssm_data, devices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Correlate LTSSM state transitions with link retrain events
        
        Args:
            ltssm_data: LTSSMMonitorResult from monitoring session
            devices: List of device test results with retrain events
            
        Returns:
            Correlation analysis dictionary
        """
        correlation = {
            'summary': {},
            'state_transitions': [],
            'retrain_sequences': [],
            'state_timing': {},
            'retrain_correlation': {},
            'retrain_analysis': {}
        }
        
        try:
            if not ltssm_data or not ltssm_data.transitions:
                correlation['summary'] = {'status': 'no_ltssm_data', 'message': 'No LTSSM transitions recorded'}
                return correlation
            
            # Collect all retrain events with precise timing
            all_retrain_events = []
            total_retrains = 0
            
            for device in devices:
                device_addr = device['pci_address']
                for retrain in device.get('retrains', []):
                    # Extract timing from the retrain event
                    if 'start_time' in retrain or retrain.get('sequence'):
                        # Estimate start time if not available
                        start_time = retrain.get('start_time', time.time())
                        duration_ms = retrain.get('time_ms', 0)
                        
                        all_retrain_events.append({
                            'device': device_addr,
                            'sequence': retrain.get('sequence', total_retrains + 1),
                            'start_time': start_time,
                            'duration_ms': duration_ms,
                            'success': retrain.get('success', False),
                            'training_detected': retrain.get('training_detected', False)
                        })
                        total_retrains += 1
            
            correlation['retrain_analysis'] = {
                'total_retrains_performed': total_retrains,
                'retrain_events': all_retrain_events,
                'retrain_timespan_seconds': (max(r['start_time'] for r in all_retrain_events) - 
                                           min(r['start_time'] for r in all_retrain_events)) if all_retrain_events else 0
            }
            
            # Organize LTSSM transitions by device
            device_transitions = {}
            for transition in ltssm_data.transitions:
                device = transition.device
                if device not in device_transitions:
                    device_transitions[device] = []
                device_transitions[device].append(transition)
            
            # Analyze state transitions related to retrains
            training_related_transitions = 0
            retrain_related_transitions = 0
            
            for transition in ltssm_data.transitions:
                # Check if this is a training-related state
                is_training = transition.from_state in ['Detect', 'Polling', 'Configuration', 'Recovery'] or \
                             transition.to_state in ['Detect', 'Polling', 'Configuration', 'Recovery']
                
                if is_training:
                    training_related_transitions += 1
                
                # Check if this transition is near a retrain event
                transition_time_seconds = transition.timestamp / 1000000000  # Convert from nanoseconds
                
                is_retrain_related = False
                for retrain_event in all_retrain_events:
                    if transition.device == retrain_event['device']:
                        time_diff = abs(transition_time_seconds - retrain_event['start_time'])
                        if time_diff <= 1.0:  # Within 1 second of retrain
                            is_retrain_related = True
                            break
                
                if is_retrain_related:
                    retrain_related_transitions += 1
                
                correlation['state_transitions'].append({
                    'timestamp': transition.timestamp,
                    'device': transition.device,
                    'from_state': transition.from_state,
                    'to_state': transition.to_state,
                    'is_training_related': is_training,
                    'is_retrain_related': is_retrain_related,
                    'duration_ns': getattr(transition, 'duration_ns', None)
                })
            
            # Find retrain sequences (Recovery -> ... -> L0)
            for device, transitions in device_transitions.items():
                transitions.sort(key=lambda x: x.timestamp)
                
                current_sequence = []
                for transition in transitions:
                    # Look for retrain-triggered sequences starting with Recovery or going to Recovery
                    if (transition.from_state in ['Recovery', 'Detect', 'Polling'] or 
                        transition.to_state in ['Recovery', 'Detect', 'Polling']) or \
                       (current_sequence and current_sequence[-1]['to_state'] in 
                        ['Detect', 'Polling', 'Configuration', 'Recovery']):
                        
                        current_sequence.append({
                            'timestamp': transition.timestamp,
                            'from_state': transition.from_state,
                            'to_state': transition.to_state
                        })
                        
                        # Check if sequence completed (reached L0)
                        if transition.to_state == 'L0':
                            if len(current_sequence) > 1:
                                sequence_duration = (transition.timestamp - current_sequence[0]['timestamp']) / 1000000  # Convert to ms
                                
                                # Find associated retrain event
                                associated_retrain = None
                                seq_start_time_seconds = current_sequence[0]['timestamp'] / 1000000000
                                
                                for retrain_event in all_retrain_events:
                                    if (retrain_event['device'] == device and 
                                        abs(seq_start_time_seconds - retrain_event['start_time']) <= 2.0):
                                        associated_retrain = retrain_event
                                        break
                                
                                correlation['retrain_sequences'].append({
                                    'device': device,
                                    'start_time': current_sequence[0]['timestamp'],
                                    'end_time': transition.timestamp,
                                    'duration_ms': round(sequence_duration, 3),
                                    'sequence': current_sequence.copy(),
                                    'associated_retrain': associated_retrain
                                })
                            current_sequence = []
                    else:
                        current_sequence = []
            
            # Calculate detailed correlation analysis
            if all_retrain_events:
                retrain_with_ltssm = 0
                retrain_without_ltssm = 0
                
                for retrain_event in all_retrain_events:
                    # Check if this retrain has associated LTSSM transitions
                    has_ltssm_activity = any(
                        t['device'] == retrain_event['device'] and t['is_retrain_related']
                        for t in correlation['state_transitions']
                    )
                    
                    if has_ltssm_activity:
                        retrain_with_ltssm += 1
                    else:
                        retrain_without_ltssm += 1
                
                correlation['retrain_correlation'] = {
                    'retrains_with_ltssm_activity': retrain_with_ltssm,
                    'retrains_without_ltssm_activity': retrain_without_ltssm,
                    'ltssm_correlation_percentage': (retrain_with_ltssm / total_retrains) * 100 if total_retrains > 0 else 0,
                    'retrain_sequences_detected': len(correlation['retrain_sequences'])
                }
            
            # Calculate state timing statistics
            state_durations = {}
            for device, transitions in device_transitions.items():
                for i in range(len(transitions) - 1):
                    current = transitions[i]
                    next_trans = transitions[i + 1]
                    
                    state = current.to_state
                    duration_ms = (next_trans.timestamp - current.timestamp) / 1000000
                    
                    if state not in state_durations:
                        state_durations[state] = []
                    state_durations[state].append(duration_ms)
            
            # Calculate averages for each state during retrain test
            for state, durations in state_durations.items():
                correlation['state_timing'][state] = {
                    'avg_duration_ms': round(sum(durations) / len(durations), 3),
                    'min_duration_ms': round(min(durations), 3),
                    'max_duration_ms': round(max(durations), 3),
                    'occurrence_count': len(durations)
                }
            
            correlation['summary'] = {
                'total_transitions': len(ltssm_data.transitions),
                'training_related_transitions': training_related_transitions,
                'retrain_related_transitions': retrain_related_transitions,
                'retrain_sequences_detected': len(correlation['retrain_sequences']),
                'devices_with_transitions': len(device_transitions),
                'retrains_performed': total_retrains,
                'monitoring_duration_ms': round((ltssm_data.session_end - ltssm_data.session_start) * 1000, 3),
                'status': 'success'
            }
            
        except Exception as e:
            correlation['summary'] = {'status': 'correlation_error', 'message': f'Error during LTSSM correlation: {str(e)}'}
            logger.warning(f"LTSSM correlation failed: {e}")
        
        return correlation

    def _calculate_std_dev(self, values: List[float]) -> float:
        """Calculate standard deviation"""
        if len(values) < 2:
            return 0.0

        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        return variance ** 0.5


# Test execution function
def run_link_retrain_count_test(options: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute link retrain count test

    Args:
        options: Test configuration dictionary

    Returns:
        Test results dictionary
    """
    test = LinkRetrainCount()
    return test.run_retrain_test(options)


# Command-line test execution
if __name__ == "__main__":
    print("=" * 80)
    print("CalypsoPy+ Link Retrain Count Test")
    print("=" * 80)

    # Example test with single device
    test_options = {
        'pci_address': '0000:01:00.0',  # Replace with actual device
        'device_name': 'Test NVMe Device',
        'num_retrains': 5,
        'delay_between_ms': 100
    }

    test = LinkRetrainCount()

    print(f"\nPermission Level: {test.permission_level}")
    print(f"setpci Available: {test.has_setpci}")

    if not (test.has_root or test.has_sudo):
        print("\n⚠️  Root or sudo access required for this test")
        exit(1)

    if not test.has_setpci:
        print("\n⚠️  setpci not available - install pciutils package")
        exit(1)

    print(f"\nRunning test on {test_options['pci_address']}...")
    print(f"Number of retrains: {test_options['num_retrains']}")

    result = test.run_retrain_test(test_options)

    print(f"\nStatus: {result['status'].upper()}")
    print(f"Duration: {result['duration_ms']}ms")
    print(f"\nSummary:")
    for key, value in result['summary'].items():
        print(f"  {key}: {value}")

    if result.get('statistics'):
        print(f"\nStatistics:")
        for key, value in result['statistics'].items():
            print(f"  {key}: {value}")

    if result.get('compliance'):
        print(f"\nPCIe 6.x Compliance:")
        print(f"  Compliant: {result['compliance']['compliant']}")
        if result['compliance']['issues']:
            print(f"  Issues:")
            for issue in result['compliance']['issues']:
                print(f"    - {issue}")

    if result.get('devices'):
        print(f"\nPer-Device Results:")
        for device in result['devices']:
            print(f"\n  {device['name']} ({device['pci_address']}):")
            print(f"    Capability Offset: {device['capability_offset']}")
            print(f"    Successful: {device['statistics']['successful']}")
            print(f"    Failed: {device['statistics']['failed']}")
            print(f"    Avg Time: {device['statistics']['avg_time_ms']}ms")

    if result.get('warnings'):
        print(f"\nWarnings:")
        for warning in result['warnings']:
            print(f"  ⚠️  {warning}")

    if result.get('errors'):
        print(f"\nErrors:")
        for error in result['errors']:
            print(f"  ❌ {error}")