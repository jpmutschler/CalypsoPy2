#!/usr/bin/env python3
"""
CalypsoPy+ Link Training Time Measurement Test - Enhanced Version
Tracks LTSSM state transitions using kernel dmesg logs
Supports device selection and event triggering
"""

import logging
import subprocess
import re
import time
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from collections import defaultdict

try:
    from .com_error_monitor import COMErrorMonitor, ErrorCounters
    from .ltssm_monitor import LTSSMMonitor, LTSSMState, LTSSMTransition
except ImportError:
    from com_error_monitor import COMErrorMonitor, ErrorCounters
    from ltssm_monitor import LTSSMMonitor, LTSSMState, LTSSMTransition

logger = logging.getLogger(__name__)


# LTSSMTransition is now imported from ltssm_monitor module


class LinkTrainingTimeMeasurement:
    """
    Link Training Time Measurement Test - Enhanced Version
    Analyzes PCIe LTSSM state transitions from kernel logs
    Supports device selection and event triggering
    """

    def __init__(self):
        self.has_root = self._check_root()
        self.has_sudo = self._check_sudo()
        self.permission_level = 'root' if self.has_root else 'sudo' if self.has_sudo else 'user'

        # LTSSM states according to PCIe spec
        self.ltssm_states = [
            'Detect', 'Polling', 'Configuration', 'Recovery',
            'L0', 'L0s', 'L1', 'L2', 'Disabled', 'Loopback', 'Hot Reset'
        ]

        logger.info(f"Link Training Time Measurement initialized (permission: {self.permission_level})")

    def _check_root(self) -> bool:
        """Check if running as root"""
        try:
            import os
            return os.geteuid() == 0
        except:
            return False

    def _check_sudo(self) -> bool:
        """Check if sudo is available"""
        try:
            result = subprocess.run(
                ['sudo', '-n', 'true'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=2
            )
            return result.returncode == 0
        except:
            return False

    def _run_command(self, command: List[str]) -> Optional[str]:
        """Execute command with appropriate permissions"""
        try:
            if not self.has_root and not self.has_sudo:
                # Try without sudo
                result = subprocess.run(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=10
                )
            else:
                # Use sudo if not root
                if not self.has_root:
                    command = ['sudo'] + command

                result = subprocess.run(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=10
                )

            if result.returncode == 0:
                return result.stdout
            else:
                logger.warning(f"Command failed: {' '.join(command)}")
                return None

        except subprocess.TimeoutExpired:
            logger.error(f"Command timeout: {' '.join(command)}")
            return None
        except Exception as e:
            logger.error(f"Command error: {e}")
            return None

    def get_available_devices(self) -> List[Dict[str, Any]]:
        """
        Get list of available NVMe devices for selection

        Returns:
            List of device info dictionaries
        """
        devices = []

        # Get NVMe device list
        nvme_output = self._run_command(['nvme', 'list'])

        if nvme_output:
            lines = nvme_output.strip().split('\n')
            for line in lines[2:]:  # Skip header lines
                if '/dev/nvme' in line:
                    parts = line.split()
                    if len(parts) >= 3:
                        device = parts[0]  # /dev/nvme0n1

                        # Get PCI address for this device
                        pci_address = self._get_pci_address_for_nvme(device)

                        devices.append({
                            'device': device,
                            'pci_address': pci_address,
                            'model': ' '.join(parts[1:3]) if len(parts) >= 3 else 'Unknown',
                            'available': True
                        })

        # Also list PCIe devices directly
        lspci_output = self._run_command(['lspci', '-D'])
        if lspci_output:
            for line in lspci_output.split('\n'):
                if 'Non-Volatile memory controller' in line or 'NVM Express' in line:
                    pci_address = line.split()[0]

                    # Check if already in list
                    if not any(d['pci_address'] == pci_address for d in devices):
                        devices.append({
                            'device': f'PCI Device {pci_address}',
                            'pci_address': pci_address,
                            'model': 'NVMe Controller',
                            'available': True
                        })

        return devices

    def _get_pci_address_for_nvme(self, nvme_device: str) -> Optional[str]:
        """Get PCI address for an NVMe device"""
        try:
            # Follow symlink to get actual device
            # /dev/nvme0n1 -> /sys/block/nvme0n1/device -> PCI address
            device_name = nvme_device.split('/')[-1].rstrip('0123456789')  # nvme0n1 -> nvme

            result = self._run_command(['readlink', '-f', f'/sys/class/nvme/{device_name}/device'])

            if result:
                # Extract PCI address from path
                # e.g., /sys/devices/pci0000:00/0000:00:1c.0/0000:01:00.0
                match = re.search(r'(\d{4}:\d{2}:\d{2}\.\d)', result)
                if match:
                    return match.group(1)
        except:
            pass

        return None

    def trigger_device_reset(self, pci_address: str) -> Dict[str, Any]:
        """
        Trigger a PCIe device reset to force link retraining

        Args:
            pci_address: PCI address (e.g., 0000:01:00.0)

        Returns:
            Result dictionary with success status
        """
        result = {
            'success': False,
            'message': '',
            'pci_address': pci_address
        }

        if not (self.has_root or self.has_sudo):
            result['message'] = 'Root/sudo permissions required for device reset'
            return result

        try:
            # Clear dmesg to get fresh logs
            logger.info(f"Clearing dmesg logs before reset...")
            self._run_command(['dmesg', '-C'])

            # Trigger reset
            reset_path = f'/sys/bus/pci/devices/{pci_address}/reset'
            logger.info(f"Triggering reset for device {pci_address}")

            if self.has_root:
                subprocess.run(['sh', '-c', f'echo 1 > {reset_path}'], check=True, timeout=5)
            else:
                subprocess.run(['sudo', 'sh', '-c', f'echo 1 > {reset_path}'], check=True, timeout=5)

            # Wait for device to come back
            time.sleep(2)

            result['success'] = True
            result['message'] = f'Device {pci_address} reset successfully'
            logger.info(result['message'])

        except subprocess.TimeoutExpired:
            result['message'] = f'Device reset timed out for {pci_address}'
            logger.error(result['message'])
        except Exception as e:
            result['message'] = f'Device reset failed: {str(e)}'
            logger.error(result['message'])

        return result

    def trigger_hotplug_event(self, pci_address: str) -> Dict[str, Any]:
        """
        Trigger a hot-plug event (remove and rescan) to force link retraining

        Args:
            pci_address: PCI address (e.g., 0000:01:00.0)

        Returns:
            Result dictionary with success status
        """
        result = {
            'success': False,
            'message': '',
            'pci_address': pci_address
        }

        if not (self.has_root or self.has_sudo):
            result['message'] = 'Root/sudo permissions required for hot-plug'
            return result

        try:
            # Clear dmesg to get fresh logs
            logger.info(f"Clearing dmesg logs before hot-plug...")
            self._run_command(['dmesg', '-C'])

            # Remove device
            remove_path = f'/sys/bus/pci/devices/{pci_address}/remove'
            logger.info(f"Removing device {pci_address}")

            if self.has_root:
                subprocess.run(['sh', '-c', f'echo 1 > {remove_path}'], check=True, timeout=5)
            else:
                subprocess.run(['sudo', 'sh', '-c', f'echo 1 > {remove_path}'], check=True, timeout=5)

            # Wait a moment
            time.sleep(1)

            # Rescan to bring device back
            logger.info(f"Rescanning PCI bus...")
            rescan_path = '/sys/bus/pci/rescan'

            if self.has_root:
                subprocess.run(['sh', '-c', f'echo 1 > {rescan_path}'], check=True, timeout=10)
            else:
                subprocess.run(['sudo', 'sh', '-c', f'echo 1 > {rescan_path}'], check=True, timeout=10)

            # Wait for device to stabilize
            time.sleep(2)

            result['success'] = True
            result['message'] = f'Hot-plug completed successfully for {pci_address}'
            logger.info(result['message'])

        except subprocess.TimeoutExpired:
            result['message'] = f'Hot-plug timed out for {pci_address}'
            logger.error(result['message'])
        except Exception as e:
            result['message'] = f'Hot-plug failed: {str(e)}'
            logger.error(result['message'])

        return result

    def parse_dmesg_logs(self, since_timestamp: Optional[float] = None) -> List[Dict[str, Any]]:
        """
        Parse dmesg logs for PCIe link training events

        Args:
            since_timestamp: Only return events after this timestamp (optional)
        """

        dmesg_output = self._run_command(['dmesg', '-T'])

        if not dmesg_output:
            logger.warning("Could not retrieve dmesg logs")
            return []

        events = []

        # Patterns to match PCIe link training related messages
        patterns = [
            # Link training state transitions
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*link.*training.*state.*(\w+).*->.*(\w+)',
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*LTSSM.*(\w+).*->.*(\w+)',
            # Link up/down events
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*link.*up',
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*link.*down',
            # Link speed changes
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*speed.*(\d+\.?\d*)\s*GT/s',
            # Link width changes
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*width.*x(\d+)',
            # Training errors
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*training.*error',
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*retrain',
        ]

        for line in dmesg_output.split('\n'):
            for pattern in patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    try:
                        timestamp = float(match.group(1))

                        # Filter by timestamp if provided
                        if since_timestamp and timestamp < since_timestamp:
                            continue

                        device = match.group(2) if len(match.groups()) > 1 else 'unknown'

                        event = {
                            'timestamp': timestamp,
                            'device': device,
                            'raw_message': line.strip(),
                            'event_type': self._classify_event(line)
                        }

                        # Extract state information if present
                        if len(match.groups()) > 3:
                            event['from_state'] = match.group(3)
                            event['to_state'] = match.group(4)

                        events.append(event)

                    except Exception as e:
                        logger.debug(f"Error parsing line: {e}")
                        continue

        return events

    def _classify_event(self, message: str) -> str:
        """Classify the type of PCIe event"""
        message_lower = message.lower()

        if 'ltssm' in message_lower or 'state' in message_lower:
            return 'state_transition'
        elif 'link up' in message_lower:
            return 'link_up'
        elif 'link down' in message_lower:
            return 'link_down'
        elif 'speed' in message_lower or 'gt/s' in message_lower:
            return 'speed_change'
        elif 'width' in message_lower:
            return 'width_change'
        elif 'error' in message_lower:
            return 'training_error'
        elif 'retrain' in message_lower:
            return 'retrain'
        else:
            return 'other'

    def calculate_training_times(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate link training statistics from events"""

        if not events:
            return {
                'total_events': 0,
                'devices': [],
                'training_sequences': []
            }

        # Group events by device
        device_events = defaultdict(list)
        for event in events:
            device_events[event['device']].append(event)

        # Calculate statistics per device
        device_stats = []
        all_sequences = []

        for device, dev_events in device_events.items():
            # Sort events by timestamp
            dev_events.sort(key=lambda x: x['timestamp'])

            # Find training sequences (link down -> link up)
            sequences = []
            link_down_time = None

            for event in dev_events:
                if event['event_type'] == 'link_down':
                    link_down_time = event['timestamp']
                elif event['event_type'] == 'link_up' and link_down_time:
                    training_time = (event['timestamp'] - link_down_time) * 1000  # Convert to ms
                    sequences.append({
                        'start_time': link_down_time,
                        'end_time': event['timestamp'],
                        'duration_ms': round(training_time, 3)
                    })
                    link_down_time = None

            # Calculate statistics
            if sequences:
                durations = [seq['duration_ms'] for seq in sequences]
                avg_time = sum(durations) / len(durations)
                min_time = min(durations)
                max_time = max(durations)
            else:
                avg_time = min_time = max_time = None

            # Count event types
            event_type_counts = defaultdict(int)
            for event in dev_events:
                event_type_counts[event['event_type']] += 1

            device_stats.append({
                'device': device,
                'total_events': len(dev_events),
                'training_sequences': len(sequences),
                'avg_training_time_ms': round(avg_time, 3) if avg_time else None,
                'min_training_time_ms': round(min_time, 3) if min_time else None,
                'max_training_time_ms': round(max_time, 3) if max_time else None,
                'event_counts': dict(event_type_counts),
                'sequences': sequences
            })

            all_sequences.extend([{**seq, 'device': device} for seq in sequences])

        return {
            'total_events': len(events),
            'devices': device_stats,
            'training_sequences': all_sequences,
            'time_range': {
                'start': min(e['timestamp'] for e in events),
                'end': max(e['timestamp'] for e in events),
                'duration_seconds': max(e['timestamp'] for e in events) - min(e['timestamp'] for e in events)
            }
        }

    def run_measurement_test(self, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Run complete link training time measurement test

        Args:
            options: Test options dictionary:
                - selected_device: PCI address to test (optional)
                - trigger_reset: Boolean, trigger device reset before test
                - trigger_hotplug: Boolean, trigger hot-plug before test
                - wait_time: Seconds to wait after trigger (default: 3)
                - calypso_manager: CalypsoPyManager instance for COM error monitoring (optional)
                - com_port: COM port for error monitoring (optional)
                - monitor_errors: Boolean, enable COM error monitoring (default: False)
                - error_sampling_interval: Error sampling interval in seconds (default: 1.0)

        Returns:
            Comprehensive test results
        """
        start_time = datetime.now()
        options = options or {}

        selected_device = options.get('selected_device')
        trigger_reset = options.get('trigger_reset', False)
        trigger_hotplug = options.get('trigger_hotplug', False)
        wait_time = options.get('wait_time', 3)
        
        # COM error monitoring options
        monitor_errors = options.get('monitor_errors', False)
        calypso_manager = options.get('calypso_manager')
        com_port = options.get('com_port')
        error_sampling_interval = options.get('error_sampling_interval', 1.0)

        result = {
            'test_name': 'Link Training Time Measurement',
            'status': 'pass',
            'timestamp': start_time.isoformat(),
            'permission_level': self.permission_level,
            'test_options': options,
            'warnings': [],
            'errors': [],
            'events': [],
            'statistics': {},
            'summary': {},
            'trigger_results': {},
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
            }
        }

        try:
            # Check permissions for triggers
            if (trigger_reset or trigger_hotplug) and not (self.has_root or self.has_sudo):
                result['warnings'].append(
                    "Root/sudo permissions required for device reset/hot-plug - triggers disabled"
                )
                trigger_reset = False
                trigger_hotplug = False

            # Get timestamp before any triggers
            before_timestamp = time.time()
            
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

            # Initialize LTSSM monitoring for target device
            ltssm_monitor = None
            try:
                # Use selected device or a default PCI address for LTSSM monitoring
                device_path = selected_device or "0000:01:00.0"  # Default PCIe device
                ltssm_monitor = LTSSMMonitor(device_path)
                
                # Start LTSSM monitoring
                if ltssm_monitor.start_monitoring(
                    sampling_interval=0.5  # Higher frequency for LTSSM state changes
                ):
                    result['ltssm_monitoring']['available'] = True
                    logger.info(f"LTSSM monitoring started for device: {device_path}")
                else:
                    result['warnings'].append("Failed to start LTSSM monitoring")
                    
            except Exception as e:
                result['warnings'].append(f"LTSSM monitoring setup failed: {str(e)}")
                logger.warning(f"LTSSM monitoring setup failed: {e}")

            # Trigger device reset if requested
            if trigger_reset and selected_device:
                logger.info(f"Triggering device reset for {selected_device}")
                reset_result = self.trigger_device_reset(selected_device)
                result['trigger_results']['reset'] = reset_result

                if not reset_result['success']:
                    result['warnings'].append(f"Device reset failed: {reset_result['message']}")
                else:
                    time.sleep(wait_time)

            # Trigger hot-plug if requested
            elif trigger_hotplug and selected_device:
                logger.info(f"Triggering hot-plug for {selected_device}")
                hotplug_result = self.trigger_hotplug_event(selected_device)
                result['trigger_results']['hotplug'] = hotplug_result

                if not hotplug_result['success']:
                    result['warnings'].append(f"Hot-plug failed: {hotplug_result['message']}")
                else:
                    time.sleep(wait_time)

            # Parse dmesg logs (only events after trigger if applicable)
            logger.info("Parsing dmesg logs for link training events...")
            if trigger_reset or trigger_hotplug:
                # Only get events after the trigger
                events = self.parse_dmesg_logs(since_timestamp=before_timestamp)
            else:
                # Get all available events
                events = self.parse_dmesg_logs()

            # Filter by selected device if specified
            if selected_device and events:
                events = [e for e in events if e['device'] == selected_device]

            if not events:
                result['status'] = 'warning'
                result['warnings'].append(
                    "No link training events found. Try triggering a reset or hot-plug event."
                )
                result['summary'] = {
                    'total_events': 0,
                    'devices_monitored': 0,
                    'training_sequences_detected': 0
                }
            else:
                result['events'] = events

                # Calculate training statistics
                statistics = self.calculate_training_times(events)
                result['statistics'] = statistics

                # Generate summary
                total_sequences = sum(dev['training_sequences'] for dev in statistics['devices'])

                # Calculate overall averages
                all_avg_times = [dev['avg_training_time_ms'] for dev in statistics['devices']
                                 if dev['avg_training_time_ms'] is not None]
                overall_avg = sum(all_avg_times) / len(all_avg_times) if all_avg_times else None

                result['summary'] = {
                    'total_events': statistics['total_events'],
                    'devices_monitored': len(statistics['devices']),
                    'training_sequences_detected': total_sequences,
                    'overall_avg_training_time_ms': round(overall_avg, 3) if overall_avg else None,
                    'time_range_seconds': round(statistics['time_range']['duration_seconds'], 2),
                    'selected_device': selected_device,
                    'trigger_used': 'reset' if trigger_reset else 'hotplug' if trigger_hotplug else 'none'
                }

                logger.info(f"Found {len(events)} link training events across {len(statistics['devices'])} devices")

            # Stop error monitoring and correlate with link training events
            if error_monitor and error_monitor.is_monitoring():
                try:
                    error_data = error_monitor.stop_monitoring()
                    if error_data:
                        result['error_monitoring']['data'] = error_data.to_dict()
                        
                        # Correlate error counter changes with link training events
                        correlation = self._correlate_errors_with_events(error_data, events)
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

            # Stop LTSSM monitoring and correlate with link training events
            if ltssm_monitor and ltssm_monitor.is_monitoring():
                try:
                    ltssm_data = ltssm_monitor.stop_monitoring()
                    if ltssm_data:
                        result['ltssm_monitoring']['data'] = ltssm_data.to_dict()
                        
                        # Correlate LTSSM state transitions with link training events
                        ltssm_correlation = self._correlate_ltssm_with_events(ltssm_data, events)
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

        except Exception as e:
            logger.error(f"Link training measurement test failed: {e}")
            result['status'] = 'error'
            result['errors'].append(f"Exception during measurement: {str(e)}")
            
            # Ensure monitoring is stopped even on failure
            if error_monitor and error_monitor.is_monitoring():
                try:
                    error_monitor.stop_monitoring()
                except:
                    pass
            
            if ltssm_monitor and ltssm_monitor.is_monitoring():
                try:
                    ltssm_monitor.stop_monitoring()
                except:
                    pass

        end_time = datetime.now()
        result['duration_ms'] = int((end_time - start_time).total_seconds() * 1000)

        return result
    
    def _correlate_errors_with_events(self, error_data, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Correlate Atlas 3 cumulative error counter changes with link training events
        
        Args:
            error_data: ErrorMonitorResult from monitoring session
            events: List of link training events from dmesg
            
        Returns:
            Correlation analysis dictionary
        """
        correlation = {
            'summary': {},
            'error_timing': {},
            'error_spikes': [],
            'event_correlation': {},
            'baseline_errors': {},
            'cumulative_analysis': {}
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
            
            correlation['summary'] = {
                'total_new_errors': total_new_errors,
                'error_changes_from_baseline': total_error_changes,
                'monitoring_duration': error_data.session_end - error_data.session_start,
                'samples_collected': error_data.total_samples,
                'baseline_timestamp': baseline.timestamp
            }
            
            # If we have new errors during the test, analyze timing
            if total_new_errors > 0:
                correlation['summary']['status'] = 'new_errors_detected'
                correlation['summary']['message'] = f'Detected {total_new_errors} new errors during test'
                
                # Find error increments relative to baseline
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
                            spike = {
                                'timestamp': sample.timestamp,
                                'sample_index': i,
                                'incremental_errors': sample_increment,
                                'cumulative_from_baseline': delta_from_baseline,
                                'increment_total': increment_total,
                                'elapsed_since_start': sample.timestamp - baseline.timestamp
                            }
                            correlation['error_spikes'].append(spike)
                
                # Enhanced cumulative analysis
                correlation['cumulative_analysis'] = {
                    'peak_error_rate': self._calculate_peak_error_rate(error_data.samples, baseline),
                    'error_progression': self._analyze_error_progression(error_data.samples, baseline),
                    'error_timeline': [(sample.timestamp - baseline.timestamp, 
                                      sum(max(0, getattr(sample, attr) - getattr(baseline, attr)) 
                                          for attr in ['port_receive', 'bad_tlp', 'bad_dllp', 'rec_diag']))
                                     for sample in error_data.samples]
                }
                
                # Correlate error spikes with link training events
                if correlation['error_spikes'] and events:
                    for spike in correlation['error_spikes']:
                        spike_time = spike['timestamp']
                        
                        # Find events within ±3 seconds of error spike (tighter window for precision)
                        nearby_events = []
                        for event in events:
                            time_diff = abs(event['timestamp'] - spike_time)
                            if time_diff <= 3.0:  # 3 second window
                                nearby_events.append({
                                    'event': event,
                                    'time_offset': event['timestamp'] - spike_time,
                                    'event_type': event.get('event_type', 'unknown')
                                })
                        
                        if nearby_events:
                            correlation['event_correlation'][f'spike_{spike_time}'] = {
                                'error_spike': spike,
                                'nearby_events': nearby_events,
                                'correlation_strength': len(nearby_events)
                            }
            else:
                correlation['summary']['status'] = 'no_new_errors'
                correlation['summary']['message'] = 'No new errors detected during test (error counters remained stable)'
                
        except Exception as e:
            correlation['summary'] = {'status': 'correlation_error', 'message': f'Error during correlation: {str(e)}'}
            logger.warning(f"Error correlation failed: {e}")
        
        return correlation
    
    def _calculate_peak_error_rate(self, samples, baseline):
        """Calculate the peak error rate (errors per second) during the test"""
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
    
    def _analyze_error_progression(self, samples, baseline):
        """Analyze how errors progressed throughout the test"""
        if len(samples) < 2:
            return {'pattern': 'insufficient_data'}
        
        # Calculate error counts at different test phases
        mid_point = len(samples) // 2
        
        early_errors = sum(max(0, getattr(samples[mid_point], attr) - getattr(baseline, attr))
                          for attr in ['port_receive', 'bad_tlp', 'bad_dllp', 'rec_diag'])
        
        late_errors = sum(max(0, getattr(samples[-1], attr) - getattr(baseline, attr))
                         for attr in ['port_receive', 'bad_tlp', 'bad_dllp', 'rec_diag'])
        
        if early_errors == 0 and late_errors == 0:
            pattern = 'stable'
        elif early_errors > 0 and late_errors == early_errors:
            pattern = 'early_errors_then_stable'
        elif early_errors == 0 and late_errors > 0:
            pattern = 'late_errors'
        elif late_errors > early_errors:
            pattern = 'progressive_increase'
        else:
            pattern = 'variable'
        
        return {
            'pattern': pattern,
            'early_phase_errors': early_errors,
            'late_phase_errors': late_errors,
            'total_progression': late_errors - early_errors
        }
    
    def _correlate_ltssm_with_events(self, ltssm_data, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Correlate LTSSM state transitions with link training events
        
        Args:
            ltssm_data: LTSSMMonitorResult from monitoring session
            events: List of link training events from dmesg
            
        Returns:
            Correlation analysis dictionary
        """
        correlation = {
            'summary': {},
            'state_transitions': [],
            'training_sequences': [],
            'state_timing': {},
            'transition_correlation': {}
        }
        
        try:
            if not ltssm_data or not ltssm_data.transitions:
                correlation['summary'] = {'status': 'no_ltssm_data', 'message': 'No LTSSM transitions recorded'}
                return correlation
            
            # Organize transitions by device
            device_transitions = {}
            for transition in ltssm_data.transitions:
                device = transition.device
                if device not in device_transitions:
                    device_transitions[device] = []
                device_transitions[device].append(transition)
            
            # Analyze state transitions
            total_transitions = len(ltssm_data.transitions)
            training_related = 0
            
            for transition in ltssm_data.transitions:
                # Check if this is a training-related state
                is_training = transition.from_state in ['Detect', 'Polling', 'Configuration', 'Recovery'] or \
                             transition.to_state in ['Detect', 'Polling', 'Configuration', 'Recovery']
                
                if is_training:
                    training_related += 1
                
                correlation['state_transitions'].append({
                    'timestamp': transition.timestamp,
                    'device': transition.device,
                    'from_state': transition.from_state,
                    'to_state': transition.to_state,
                    'is_training_related': is_training,
                    'duration_ns': getattr(transition, 'duration_ns', None)
                })
            
            # Find training sequences (Detect -> ... -> L0)
            for device, transitions in device_transitions.items():
                transitions.sort(key=lambda x: x.timestamp)
                
                current_sequence = []
                for transition in transitions:
                    if transition.from_state == 'Detect' or (current_sequence and 
                        current_sequence[-1]['to_state'] in ['Detect', 'Polling', 'Configuration', 'Recovery']):
                        current_sequence.append({
                            'timestamp': transition.timestamp,
                            'from_state': transition.from_state,
                            'to_state': transition.to_state
                        })
                        
                        # Check if sequence completed (reached L0)
                        if transition.to_state == 'L0':
                            if len(current_sequence) > 1:
                                sequence_duration = (transition.timestamp - current_sequence[0]['timestamp']) / 1000000  # Convert to ms
                                correlation['training_sequences'].append({
                                    'device': device,
                                    'start_time': current_sequence[0]['timestamp'],
                                    'end_time': transition.timestamp,
                                    'duration_ms': round(sequence_duration, 3),
                                    'sequence': current_sequence.copy()
                                })
                            current_sequence = []
                    else:
                        current_sequence = []
            
            # Correlate with dmesg events
            if events:
                for event in events:
                    event_time_ns = event['timestamp'] * 1000000000  # Convert to nanoseconds
                    
                    # Find LTSSM transitions within ±2 seconds
                    nearby_transitions = []
                    for transition in ltssm_data.transitions:
                        time_diff_ns = abs(transition.timestamp - event_time_ns)
                        if time_diff_ns <= 2000000000:  # 2 second window in nanoseconds
                            nearby_transitions.append({
                                'transition': {
                                    'device': transition.device,
                                    'from_state': transition.from_state,
                                    'to_state': transition.to_state,
                                    'timestamp': transition.timestamp
                                },
                                'time_offset_ms': round(time_diff_ns / 1000000, 3)
                            })
                    
                    if nearby_transitions:
                        correlation['transition_correlation'][f'event_{event["timestamp"]}'] = {
                            'dmesg_event': event,
                            'nearby_transitions': nearby_transitions,
                            'correlation_strength': len(nearby_transitions)
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
            
            # Calculate averages for each state
            for state, durations in state_durations.items():
                correlation['state_timing'][state] = {
                    'avg_duration_ms': round(sum(durations) / len(durations), 3),
                    'min_duration_ms': round(min(durations), 3),
                    'max_duration_ms': round(max(durations), 3),
                    'occurrence_count': len(durations)
                }
            
            correlation['summary'] = {
                'total_transitions': total_transitions,
                'training_related_transitions': training_related,
                'training_sequences_detected': len(correlation['training_sequences']),
                'devices_with_transitions': len(device_transitions),
                'correlated_events': len(correlation['transition_correlation']),
                'monitoring_duration_ms': round((ltssm_data.session_end - ltssm_data.session_start) * 1000, 3),
                'status': 'success'
            }
            
        except Exception as e:
            correlation['summary'] = {'status': 'correlation_error', 'message': f'Error during LTSSM correlation: {str(e)}'}
            logger.warning(f"LTSSM correlation failed: {e}")
        
        return correlation


if __name__ == '__main__':
    # Test the link training measurement module
    logging.basicConfig(level=logging.INFO)

    measurement = LinkTrainingTimeMeasurement()

    # List available devices
    print("\nAvailable Devices:")
    print("=" * 60)
    devices = measurement.get_available_devices()
    for dev in devices:
        print(f"  {dev['device']} ({dev['pci_address']}) - {dev['model']}")

    # Run test
    print(f"\n{'=' * 60}")
    print(f"Link Training Time Measurement Test Results")
    print(f"{'=' * 60}")

    test_options = {
        'selected_device': None,  # Test all devices
        'trigger_reset': False,
        'trigger_hotplug': False
    }

    test_result = measurement.run_measurement_test(test_options)

    print(f"Status: {test_result['status'].upper()}")
    print(f"Duration: {test_result['duration_ms']}ms")
    print(f"Permission Level: {test_result['permission_level']}")
    print(f"\nSummary:")
    for key, value in test_result.get('summary', {}).items():
        print(f"  {key}: {value}")

    if test_result.get('trigger_results'):
        print(f"\nTrigger Results:")
        for trigger, tres in test_result['trigger_results'].items():
            print(f"  {trigger}: {tres['message']}")

    if test_result.get('statistics', {}).get('devices'):
        print(f"\nPer-Device Statistics:")
        for dev in test_result['statistics']['devices']:
            print(f"  {dev['device']}:")
            print(f"    Events: {dev['total_events']}")
            print(f"    Training Sequences: {dev['training_sequences']}")
            if dev['avg_training_time_ms']:
                print(f"    Avg Training Time: {dev['avg_training_time_ms']}ms")

    if test_result.get('warnings'):
        print(f"\nWarnings:")
        for warn in test_result['warnings']:
            print(f"  - {warn}")

    if test_result.get('errors'):
        print(f"\nErrors:")
        for err in test_result['errors']:
            print(f"  - {err}")