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
        result = {
            'success': False,
            'pci_address': pci_address,
            'start_time': time.time(),
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

        Returns:
            Test result dictionary
        """
        start_time = time.time()

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

        # Determine overall status
        if len(compliance_issues) == 0 and failed_retrains == 0:
            result['status'] = 'pass'
        elif failed_retrains == 0 and len(result['warnings']) > 0:
            result['status'] = 'warning'
        else:
            result['status'] = 'fail'

        result['duration_ms'] = int((time.time() - start_time) * 1000)

        return result

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