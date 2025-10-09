#!/usr/bin/env python3
"""
CalypsoPy+ NVMe Discovery Tests
Discovers and validates NVMe devices downstream of Atlas 3 switch
"""

import os
import json
import re
import subprocess
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class NVMeNamespace:
    """Represents an NVMe namespace"""
    namespace_id: int
    device_path: str  # e.g., /dev/nvme0n1
    size_bytes: int
    formatted_lba_size: int
    utilization_percent: float = 0.0


@dataclass
class NVMeController:
    """Represents an NVMe controller"""
    device: str  # e.g., nvme0
    device_path: str  # e.g., /dev/nvme0
    model: str
    serial: str
    firmware: str
    pci_address: str
    namespaces: List[NVMeNamespace] = field(default_factory=list)
    temperature: Optional[int] = None
    available_spare: Optional[int] = None
    percentage_used: Optional[int] = None
    critical_warning: int = 0


class NVMeDiscovery:
    """
    NVMe Device Discovery and Validation
    Uses nvme-cli for comprehensive NVMe information
    """

    def __init__(self):
        self.has_nvme_cli = self._check_nvme_cli()
        self.has_root = os.geteuid() == 0
        self.has_sudo = self._check_sudo()
        logger.info(f"NVMe Discovery initialized (nvme-cli: {self.has_nvme_cli}, "
                    f"permissions: {'root' if self.has_root else 'sudo' if self.has_sudo else 'user'})")

    def _check_nvme_cli(self) -> bool:
        """Check if nvme-cli is installed"""
        try:
            result = subprocess.run(
                ['nvme', 'version'],
                capture_output=True,
                timeout=2
            )
            return result.returncode == 0
        except:
            return False

    def _check_sudo(self) -> bool:
        """Check if sudo is available"""
        if self.has_root:
            return True
        try:
            result = subprocess.run(
                ['sudo', '-n', 'true'],
                capture_output=True,
                timeout=1
            )
            return result.returncode == 0
        except:
            return False

    def _run_command(self, cmd: List[str], use_sudo: bool = False, require_root: bool = False) -> Optional[str]:
        """
        Run command with appropriate permissions
        Returns command output or None on failure
        """
        if require_root and not self.has_root and not self.has_sudo:
            logger.warning(f"Command requires root but not available: {' '.join(cmd)}")
            return None

        try:
            if use_sudo and not self.has_root and self.has_sudo:
                cmd = ['sudo'] + cmd

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                return result.stdout
            else:
                logger.debug(f"Command failed: {' '.join(cmd)}: {result.stderr}")
                return None

        except subprocess.TimeoutExpired:
            logger.error(f"Command timeout: {' '.join(cmd)}")
            return None
        except Exception as e:
            logger.error(f"Command error: {' '.join(cmd)}: {e}")
            return None

    def discover_nvme_devices(self) -> List[NVMeController]:
        """
        Discover all NVMe controllers in the system
        Works with or without nvme-cli
        """
        controllers = []

        if self.has_nvme_cli:
            controllers = self._discover_with_nvme_cli()
        else:
            controllers = self._discover_from_sysfs()

        logger.info(f"Discovered {len(controllers)} NVMe controller(s)")
        return controllers

    def _discover_with_nvme_cli(self) -> List[NVMeController]:
        """Discover NVMe devices using nvme-cli"""
        controllers = []

        # Get list of NVMe devices
        output = self._run_command(['nvme', 'list', '-o', 'json'], use_sudo=True)
        if not output:
            logger.warning("nvme list command failed, falling back to sysfs")
            return self._discover_from_sysfs()

        try:
            data = json.loads(output)
            devices_data = data.get('Devices', [])

            # Group by controller
            controller_map = {}
            for device_data in devices_data:
                device_path = device_data.get('DevicePath', '')
                # Extract controller name (nvme0 from /dev/nvme0n1)
                match = re.match(r'/dev/(nvme\d+)', device_path)
                if not match:
                    continue

                controller_name = match.group(1)

                if controller_name not in controller_map:
                    # Create new controller
                    controller = NVMeController(
                        device=controller_name,
                        device_path=f'/dev/{controller_name}',
                        model=device_data.get('ModelNumber', 'Unknown').strip(),
                        serial=device_data.get('SerialNumber', 'Unknown').strip(),
                        firmware=device_data.get('Firmware', 'Unknown').strip(),
                        pci_address=''  # Will fill in from sysfs
                    )
                    controller_map[controller_name] = controller

                    # Get PCI address from sysfs
                    pci_addr = self._get_pci_address(controller_name)
                    if pci_addr:
                        controller.pci_address = pci_addr

                    # Get SMART data
                    self._update_smart_data(controller)

                # Add namespace
                namespace_match = re.search(r'n(\d+)$', device_path)
                if namespace_match:
                    ns_id = int(namespace_match.group(1))
                    namespace = NVMeNamespace(
                        namespace_id=ns_id,
                        device_path=device_path,
                        size_bytes=device_data.get('PhysicalSize', 0),
                        formatted_lba_size=device_data.get('SectorSize', 512),
                        utilization_percent=device_data.get('UsedBytes', 0) / max(device_data.get('PhysicalSize', 1),
                                                                                  1) * 100
                    )
                    controller_map[controller_name].namespaces.append(namespace)

            controllers = list(controller_map.values())

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse nvme list JSON: {e}")
            return self._discover_from_sysfs()
        except Exception as e:
            logger.error(f"Error discovering with nvme-cli: {e}")
            return self._discover_from_sysfs()

        return controllers

    def _discover_from_sysfs(self) -> List[NVMeController]:
        """
        Discover NVMe devices from sysfs
        Fallback method that works without nvme-cli
        """
        controllers = []
        nvme_sys_path = '/sys/class/nvme'

        if not os.path.exists(nvme_sys_path):
            logger.info("No NVMe devices found in sysfs")
            return controllers

        try:
            for controller_name in os.listdir(nvme_sys_path):
                if not controller_name.startswith('nvme'):
                    continue

                controller_path = os.path.join(nvme_sys_path, controller_name)

                # Read controller info from sysfs
                model = self._read_sysfs_file(controller_path, 'model', 'Unknown')
                serial = self._read_sysfs_file(controller_path, 'serial', 'Unknown')
                firmware = self._read_sysfs_file(controller_path, 'firmware_rev', 'Unknown')
                pci_addr = self._get_pci_address(controller_name)

                controller = NVMeController(
                    device=controller_name,
                    device_path=f'/dev/{controller_name}',
                    model=model.strip(),
                    serial=serial.strip(),
                    firmware=firmware.strip(),
                    pci_address=pci_addr or 'Unknown'
                )

                # Find namespaces
                controller.namespaces = self._find_namespaces(controller_name)

                controllers.append(controller)

        except Exception as e:
            logger.error(f"Error discovering from sysfs: {e}")

        return controllers

    def _read_sysfs_file(self, base_path: str, filename: str, default: str = '') -> str:
        """Read a file from sysfs"""
        try:
            with open(os.path.join(base_path, filename), 'r') as f:
                return f.read().strip()
        except:
            return default

    def _get_pci_address(self, controller_name: str) -> Optional[str]:
        """Get PCI address for NVMe controller from sysfs"""
        try:
            device_link = f'/sys/class/nvme/{controller_name}/device'
            if os.path.islink(device_link):
                real_path = os.readlink(device_link)
                # Extract PCI address from path like ../../../0000:03:00.0
                match = re.search(r'([0-9a-f]{4}:[0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])', real_path)
                if match:
                    # Return without domain (0000:03:00.0 -> 03:00.0)
                    full_addr = match.group(1)
                    return full_addr.split(':', 1)[1] if ':' in full_addr else full_addr
        except:
            pass
        return None

    def _find_namespaces(self, controller_name: str) -> List[NVMeNamespace]:
        """Find all namespaces for a controller"""
        namespaces = []

        # Look for nvmeXnY devices in /dev
        try:
            for entry in os.listdir('/dev'):
                match = re.match(rf'{controller_name}n(\d+)$', entry)
                if match:
                    ns_id = int(match.group(1))
                    device_path = f'/dev/{entry}'

                    # Get size from sysfs
                    size_bytes = 0
                    try:
                        with open(f'/sys/block/{entry}/size', 'r') as f:
                            # Size is in 512-byte sectors
                            size_bytes = int(f.read().strip()) * 512
                    except:
                        pass

                    namespace = NVMeNamespace(
                        namespace_id=ns_id,
                        device_path=device_path,
                        size_bytes=size_bytes,
                        formatted_lba_size=512  # Default, can't determine without nvme-cli
                    )
                    namespaces.append(namespace)
        except:
            pass

        return namespaces

    def _update_smart_data(self, controller: NVMeController):
        """Update controller with SMART health data"""
        if not self.has_nvme_cli:
            return

        output = self._run_command(
            ['nvme', 'smart-log', controller.device_path, '-o', 'json'],
            use_sudo=True
        )

        if not output:
            return

        try:
            smart_data = json.loads(output)
            controller.temperature = smart_data.get('temperature', None)
            controller.available_spare = smart_data.get('avail_spare', None)
            controller.percentage_used = smart_data.get('percent_used', None)
            controller.critical_warning = smart_data.get('critical_warning', 0)
        except:
            pass

    def get_controller_details(self, controller: NVMeController) -> Dict[str, Any]:
        """Get detailed information about an NVMe controller"""
        details = {
            'device': controller.device,
            'model': controller.model,
            'serial': controller.serial,
            'firmware': controller.firmware,
            'pci_address': controller.pci_address,
            'namespace_count': len(controller.namespaces),
            'total_capacity_gb': sum(ns.size_bytes for ns in controller.namespaces) / (1024 ** 3),
        }

        if controller.temperature is not None:
            details['temperature_c'] = controller.temperature
        if controller.available_spare is not None:
            details['available_spare_pct'] = controller.available_spare
        if controller.percentage_used is not None:
            details['percentage_used'] = controller.percentage_used
        if controller.critical_warning:
            details['critical_warning'] = controller.critical_warning

        return details

    def run_discovery_test(self) -> Dict[str, Any]:
        """
        Run complete NVMe discovery test
        Returns comprehensive test results
        """
        start_time = datetime.now()

        result = {
            'test_name': 'NVMe Discovery',
            'status': 'pass',
            'timestamp': start_time.isoformat(),
            'has_nvme_cli': self.has_nvme_cli,
            'permission_level': 'root' if self.has_root else 'sudo' if self.has_sudo else 'user',
            'warnings': [],
            'errors': [],
            'controllers': [],
            'summary': {}
        }

        try:
            # Discover controllers
            controllers = self.discover_nvme_devices()

            if not controllers:
                result['warnings'].append("No NVMe devices found in system")
                result['status'] = 'warning'

            # Build controller details
            total_namespaces = 0
            total_capacity_gb = 0.0

            for controller in controllers:
                controller_info = self.get_controller_details(controller)

                # Check for critical warnings
                if controller.critical_warning:
                    result['warnings'].append(
                        f"{controller.device}: Critical warning detected (0x{controller.critical_warning:02x})"
                    )
                    result['status'] = 'warning'

                # Check temperature
                if controller.temperature and controller.temperature > 70:
                    result['warnings'].append(
                        f"{controller.device}: High temperature ({controller.temperature}°C)"
                    )

                # Check available spare
                if controller.available_spare and controller.available_spare < 10:
                    result['warnings'].append(
                        f"{controller.device}: Low available spare ({controller.available_spare}%)"
                    )

                total_namespaces += len(controller.namespaces)
                total_capacity_gb += controller_info['total_capacity_gb']

                result['controllers'].append(controller_info)

            # Summary
            result['summary'] = {
                'controller_count': len(controllers),
                'total_namespaces': total_namespaces,
                'total_capacity_gb': round(total_capacity_gb, 2)
            }

            if not self.has_nvme_cli:
                result['warnings'].append(
                    "nvme-cli not installed - limited functionality (install with: sudo apt install nvme-cli)"
                )

        except Exception as e:
            logger.error(f"NVMe discovery test failed: {e}")
            result['status'] = 'error'
            result['errors'].append(f"Exception during discovery: {str(e)}")

        end_time = datetime.now()
        result['duration_ms'] = int((end_time - start_time).total_seconds() * 1000)

        return result


if __name__ == '__main__':
    # Test the NVMe discovery module
    logging.basicConfig(level=logging.INFO)

    discovery = NVMeDiscovery()
    test_result = discovery.run_discovery_test()

    print(f"\n{'=' * 60}")
    print(f"NVMe Discovery Test Results")
    print(f"{'=' * 60}")
    print(f"Status: {test_result['status'].upper()}")
    print(f"Duration: {test_result['duration_ms']}ms")
    print(f"nvme-cli: {'Available' if test_result['has_nvme_cli'] else 'Not installed'}")
    print(f"\nSummary:")
    for key, value in test_result.get('summary', {}).items():
        print(f"  {key}: {value}")

    if test_result.get('controllers'):
        print(f"\nControllers:")
        for ctrl in test_result['controllers']:
            print(f"  {ctrl['device']}: {ctrl['model']} ({ctrl['total_capacity_gb']:.1f} GB)")

    if test_result.get('warnings'):
        print(f"\nWarnings:")
        for warn in test_result['warnings']:
            print(f"  - {warn}")

    if test_result.get('errors'):
        print(f"\nErrors:")
        for err in test_result['errors']:
            print(f"  - {err}")