#!/usr/bin/env python3
"""
CalypsoPy+ Link Training Time Measurement Test
Tracks LTSSM state transitions using kernel dmesg logs
"""

import logging
import subprocess
import re
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class LTSSMTransition:
    """Represents a single LTSSM state transition"""
    timestamp: float
    device: str
    from_state: str
    to_state: str
    duration_us: Optional[float] = None


class LinkTrainingTimeMeasurement:
    """
    Link Training Time Measurement Test
    Analyzes PCIe LTSSM state transitions from kernel logs
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

    def parse_dmesg_logs(self) -> List[Dict[str, Any]]:
        """Parse dmesg logs for PCIe link training events"""

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

    def run_measurement_test(self) -> Dict[str, Any]:
        """
        Run complete link training time measurement test
        Returns comprehensive test results
        """
        start_time = datetime.now()

        result = {
            'test_name': 'Link Training Time Measurement',
            'status': 'pass',
            'timestamp': start_time.isoformat(),
            'permission_level': self.permission_level,
            'warnings': [],
            'errors': [],
            'events': [],
            'statistics': {},
            'summary': {}
        }

        try:
            # Check permissions
            if not self.has_root and not self.has_sudo:
                result['warnings'].append(
                    "Limited permissions - some dmesg logs may not be accessible"
                )

            # Parse dmesg logs
            logger.info("Parsing dmesg logs for link training events...")
            events = self.parse_dmesg_logs()

            if not events:
                result['status'] = 'warning'
                result['warnings'].append(
                    "No link training events found in kernel logs. This may be normal if no recent training occurred."
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
                    'time_range_seconds': round(statistics['time_range']['duration_seconds'], 2)
                }

                logger.info(f"Found {len(events)} link training events across {len(statistics['devices'])} devices")

        except Exception as e:
            logger.error(f"Link training measurement test failed: {e}")
            result['status'] = 'error'
            result['errors'].append(f"Exception during measurement: {str(e)}")

        end_time = datetime.now()
        result['duration_ms'] = int((end_time - start_time).total_seconds() * 1000)

        return result


if __name__ == '__main__':
    # Test the link training measurement module
    logging.basicConfig(level=logging.INFO)

    measurement = LinkTrainingTimeMeasurement()
    test_result = measurement.run_measurement_test()

    print(f"\n{'=' * 60}")
    print(f"Link Training Time Measurement Test Results")
    print(f"{'=' * 60}")
    print(f"Status: {test_result['status'].upper()}")
    print(f"Duration: {test_result['duration_ms']}ms")
    print(f"Permission Level: {test_result['permission_level']}")
    print(f"\nSummary:")
    for key, value in test_result.get('summary', {}).items():
        print(f"  {key}: {value}")

    if test_result.get('statistics', {}).get('devices'):
        print(f"\nPer-Device Statistics:")
        for dev in test_result['statistics']['devices']:
            print(f"  {dev['device']}:")
            print(f"    Events: {dev['total_events']}")
            print(f"    Training Sequences: {dev['training_sequences']}")
            if dev['avg_training_time_ms']:
                print(f"    Avg Training Time: {dev['avg_training_time_ms']}ms")
                print(f"    Min/Max: {dev['min_training_time_ms']}ms / {dev['max_training_time_ms']}ms")

    if test_result.get('warnings'):
        print(f"\nWarnings:")
        for warn in test_result['warnings']:
            print(f"  - {warn}")

    if test_result.get('errors'):
        print(f"\nErrors:")
        for err in test_result['errors']:
            print(f"  - {err}")