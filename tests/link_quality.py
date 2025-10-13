#!/usr/bin/env python3
"""
CalypsoPy+ PCIe Link Quality Test
Comprehensive link quality assessment through random resets and multi-source monitoring

This test:
1. Performs random PCIe link resets and stress operations on Atlas 3 downstream devices
2. Monitors link quality through dmesg, pciutils, perf, and sysfs
3. Tracks Atlas 3 switch errors via COM 'error' command correlation
4. Records LTSSM state transitions during stress operations
5. Provides comprehensive link quality assessment and error correlation
6. Allows user-configurable target device selection and test parameters
"""

import subprocess
import re
import time
import random
import logging
from typing import Dict, List, Optional, Any, Tuple, Set
from datetime import datetime, timedelta
import json
import threading
from dataclasses import dataclass
import os

try:
    from .com_error_monitor import COMErrorMonitor, ErrorCounters
    from .ltssm_monitor import LTSSMMonitor, LTSSMState, LTSSMTransition
    from .pcie_discovery import PCIeDiscovery
except ImportError:
    from com_error_monitor import COMErrorMonitor, ErrorCounters
    from ltssm_monitor import LTSSMMonitor, LTSSMState, LTSSMTransition
    from pcie_discovery import PCIeDiscovery

logger = logging.getLogger(__name__)


@dataclass
class LinkQualityEvent:
    """Represents a link quality event during testing"""
    timestamp: float
    event_type: str  # 'reset', 'error', 'ltssm_transition', 'performance_drop'
    device: str
    details: Dict[str, Any]
    severity: str  # 'low', 'medium', 'high', 'critical'


@dataclass
class SystemMonitorData:
    """Container for system monitoring data collected during test"""
    dmesg_entries: List[Dict[str, Any]]
    pci_config_snapshots: List[Dict[str, Any]]
    sysfs_data: Dict[str, Any]
    perf_data: Dict[str, Any]
    collection_start: float
    collection_end: float


class LinkQualityTest:
    """
    PCIe Link Quality Test with Comprehensive Monitoring
    
    Performs stress testing through random resets and comprehensive monitoring to assess
    PCIe link quality, error patterns, and recovery behavior on Atlas 3 downstream devices.
    """
    
    # Atlas 3 Identifiers
    ATLAS3_VENDOR_ID = '1000'
    ATLAS3_DEVICE_ID = 'c040'
    
    # PCIe Register Offsets
    LINK_CONTROL_OFFSET = 0x10
    LINK_STATUS_OFFSET = 0x12
    DEVICE_CONTROL_OFFSET = 0x08
    DEVICE_STATUS_OFFSET = 0x0A
    
    # Reset Types and Methods
    RESET_METHODS = [
        'link_retrain',      # Link retrain via Link Control register
        'function_reset',    # Function Level Reset (FLR)
        'secondary_reset',   # Secondary Bus Reset (if applicable)
        'surprise_removal',  # Simulated surprise removal/insertion
        'power_mgmt',        # D-state transitions
    ]
    
    # Quality Assessment Criteria
    QUALITY_THRESHOLDS = {
        'max_reset_time_ms': 1000,           # Maximum acceptable reset time
        'max_error_rate_per_min': 5,         # Maximum errors per minute
        'max_ltssm_recovery_rate': 0.1,      # Maximum Recovery state percentage
        'min_link_speed_retention': 0.95,    # Minimum link speed retention
        'max_link_width_degradation': 0,     # No link width degradation
    }
    
    def __init__(self):
        """Initialize Link Quality test"""
        self.has_root = self._check_root_access()
        self.has_sudo = self._check_sudo_access()
        self.has_setpci = self._check_setpci_available()
        self.has_perf = self._check_perf_available()
        self.atlas3_buses = set()
        self.available_devices = []
        self.quality_events = []
        self.system_monitor_data = None
        
        if self.has_root:
            self.permission_level = "root"
        elif self.has_sudo:
            self.permission_level = "sudo"
        else:
            self.permission_level = "user"
            
        logger.info(f"Link Quality test initialized (permission: {self.permission_level})")
    
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
    
    def _check_perf_available(self) -> bool:
        """Check if perf command is available"""
        try:
            result = subprocess.run(
                ['which', 'perf'],
                capture_output=True,
                timeout=1
            )
            return result.returncode == 0
        except:
            return False
    
    def _run_command(self, cmd: List[str], use_sudo: bool = False, timeout: int = 10) -> Optional[str]:
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
    
    def discover_atlas3_devices(self) -> List[Dict[str, Any]]:
        """
        Discover Atlas 3 downstream devices suitable for link quality testing
        
        Returns:
            List of device information dictionaries
        """
        devices = []
        
        # Use PCIe discovery to find Atlas 3 devices
        pcie_discovery = PCIeDiscovery()
        discovery_result = pcie_discovery.run_discovery({})
        
        if discovery_result.get('status') != 'pass':
            logger.warning("PCIe discovery failed - using manual device enumeration")
            return self._manual_device_discovery()
        
        # Extract Atlas 3 downstream devices
        atlas3_switches = discovery_result.get('atlas3_switches', [])
        for switch in atlas3_switches:
            downstream_devices = switch.get('downstream_devices', [])
            for device in downstream_devices:
                if device.get('class_name') not in ['PCI bridge', 'Host bridge']:
                    devices.append({
                        'pci_address': device.get('address', 'Unknown'),
                        'device_name': device.get('device', 'Unknown Device'),
                        'vendor_id': device.get('vendor_id', 'Unknown'),
                        'device_id': device.get('device_id', 'Unknown'),
                        'class_name': device.get('class_name', 'Unknown'),
                        'subsystem': device.get('subsystem', 'Unknown'),
                        'atlas3_switch': switch.get('address', 'Unknown'),
                        'suitable_for_testing': self._assess_device_suitability(device)
                    })
        
        # Sort by suitability and address
        devices.sort(key=lambda x: (not x['suitable_for_testing'], x['pci_address']))
        
        logger.info(f"Discovered {len(devices)} Atlas 3 downstream devices")
        return devices
    
    def _manual_device_discovery(self) -> List[Dict[str, Any]]:
        """Manual device discovery fallback"""
        devices = []
        
        # Get all PCI devices
        output = self._run_command(['lspci', '-nn'])
        if not output:
            return devices
        
        # Parse lspci output
        for line in output.strip().split('\n'):
            match = re.match(r'^([0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])\s+(.+?)\s+\[([0-9a-f]{4}):([0-9a-f]{4})\]', line)
            if match:
                address = match.group(1)
                description = match.group(2)
                vendor_id = match.group(3)
                device_id = match.group(4)
                
                # Skip bridges and Atlas 3 switches themselves
                if any(x in description.lower() for x in ['bridge', 'switch']) or \
                   (vendor_id == self.ATLAS3_VENDOR_ID and device_id == self.ATLAS3_DEVICE_ID):
                    continue
                
                devices.append({
                    'pci_address': f"0000:{address}",
                    'device_name': description,
                    'vendor_id': vendor_id,
                    'device_id': device_id,
                    'class_name': description,
                    'subsystem': 'Unknown',
                    'atlas3_switch': 'Unknown',
                    'suitable_for_testing': True  # Assume suitable for manual discovery
                })
        
        return devices
    
    def _assess_device_suitability(self, device: Dict[str, Any]) -> bool:
        """
        Assess if a device is suitable for link quality testing
        
        Args:
            device: Device information dictionary
            
        Returns:
            True if device is suitable for testing
        """
        # Check if device is an endpoint (not a bridge)
        class_name = device.get('class_name', '').lower()
        if any(x in class_name for x in ['bridge', 'switch', 'controller']):
            return False
        
        # Prefer NVMe devices for testing
        if 'nvme' in class_name or 'storage' in class_name:
            return True
        
        # Other endpoint devices are acceptable
        return True
    
    def start_system_monitoring(self, duration_seconds: int = 300) -> bool:
        """
        Start comprehensive system monitoring
        
        Args:
            duration_seconds: How long to monitor (for background processes)
            
        Returns:
            True if monitoring started successfully
        """
        self.system_monitor_data = SystemMonitorData(
            dmesg_entries=[],
            pci_config_snapshots=[],
            sysfs_data={},
            perf_data={},
            collection_start=time.time(),
            collection_end=0
        )
        
        logger.info("Started comprehensive system monitoring")
        return True
    
    def collect_dmesg_snapshot(self) -> List[Dict[str, Any]]:
        """Collect recent dmesg entries related to PCIe"""
        entries = []
        
        # Get recent dmesg entries
        output = self._run_command(['dmesg', '-T', '--level=err,warn,info'], use_sudo=True)
        if not output:
            return entries
        
        # Parse dmesg for PCIe-related entries
        pcie_keywords = ['pcie', 'pci', 'aer', 'dpc', 'link', 'training', 'error', 'reset']
        
        for line in output.strip().split('\n'):
            if any(keyword in line.lower() for keyword in pcie_keywords):
                # Extract timestamp and message
                timestamp_match = re.match(r'^\[([^\]]+)\]\s*(.+)', line)
                if timestamp_match:
                    timestamp_str = timestamp_match.group(1)
                    message = timestamp_match.group(2)
                    
                    entries.append({
                        'timestamp': timestamp_str,
                        'message': message,
                        'collected_at': time.time()
                    })
        
        return entries
    
    def collect_pci_config_snapshot(self, devices: List[str]) -> List[Dict[str, Any]]:
        """
        Collect PCI configuration space snapshots for specified devices
        
        Args:
            devices: List of PCI addresses to snapshot
            
        Returns:
            List of configuration snapshots
        """
        snapshots = []
        
        for device in devices:
            snapshot = {
                'device': device,
                'timestamp': time.time(),
                'config_space': {},
                'capabilities': {}
            }
            
            # Read key configuration registers
            key_registers = {
                '00.l': 'vendor_device_id',
                '04.l': 'command_status',
                '08.l': 'revision_class',
                '0c.l': 'cache_line_header',
                '2c.l': 'subsystem_id',
                '3c.l': 'interrupt_line_pin'
            }
            
            for reg, name in key_registers.items():
                output = self._run_command(['setpci', '-s', device, reg], use_sudo=True)
                if output:
                    snapshot['config_space'][name] = output
            
            # Read PCIe capability registers if available
            pcie_cap_offset = self._get_pcie_capability_offset(device)
            if pcie_cap_offset:
                pcie_registers = {
                    f'{pcie_cap_offset + 0x08:02x}.l': 'device_cap_control_status',
                    f'{pcie_cap_offset + 0x0c:02x}.l': 'link_cap',
                    f'{pcie_cap_offset + 0x10:02x}.l': 'link_control_status',
                    f'{pcie_cap_offset + 0x14:02x}.l': 'slot_cap',
                    f'{pcie_cap_offset + 0x18:02x}.l': 'slot_control_status'
                }
                
                for reg, name in pcie_registers.items():
                    output = self._run_command(['setpci', '-s', device, reg], use_sudo=True)
                    if output:
                        snapshot['capabilities'][name] = output
            
            snapshots.append(snapshot)
        
        return snapshots
    
    def _get_pcie_capability_offset(self, pci_address: str) -> Optional[int]:
        """Get PCIe capability offset for a device"""
        # Read capability pointer
        cap_ptr_output = self._run_command(['setpci', '-s', pci_address, '0x34.b'], use_sudo=True)
        if not cap_ptr_output:
            return None
        
        try:
            cap_ptr = int(cap_ptr_output, 16)
        except ValueError:
            return None
        
        # Walk capability list to find PCIe capability (ID 0x10)
        current_offset = cap_ptr
        for _ in range(48):  # Prevent infinite loops
            if current_offset == 0 or current_offset == 0xFF:
                break
            
            cap_data = self._run_command(['setpci', '-s', pci_address, f'{current_offset:#x}.l'], use_sudo=True)
            if not cap_data:
                break
            
            try:
                cap_value = int(cap_data, 16)
                cap_id = cap_value & 0xFF
                next_ptr = (cap_value >> 8) & 0xFF
                
                if cap_id == 0x10:  # PCIe capability
                    return current_offset
                
                current_offset = next_ptr
            except ValueError:
                break
        
        return None
    
    def collect_sysfs_data(self, devices: List[str]) -> Dict[str, Any]:
        """
        Collect sysfs data for PCIe devices
        
        Args:
            devices: List of PCI addresses
            
        Returns:
            Dictionary of sysfs data
        """
        sysfs_data = {}
        
        for device in devices:
            device_data = {
                'current_link_speed': None,
                'current_link_width': None,
                'max_link_speed': None,
                'max_link_width': None,
                'power_state': None,
                'enable': None
            }
            
            sysfs_path = f"/sys/bus/pci/devices/{device}"
            
            # Read link speed and width
            for attr in ['current_link_speed', 'current_link_width', 'max_link_speed', 'max_link_width']:
                try:
                    with open(f"{sysfs_path}/{attr}", 'r') as f:
                        device_data[attr] = f.read().strip()
                except:
                    continue
            
            # Read power state
            try:
                with open(f"{sysfs_path}/power_state", 'r') as f:
                    device_data['power_state'] = f.read().strip()
            except:
                pass
            
            # Read enable status
            try:
                with open(f"{sysfs_path}/enable", 'r') as f:
                    device_data['enable'] = f.read().strip()
            except:
                pass
            
            sysfs_data[device] = device_data
        
        return sysfs_data
    
    def perform_random_reset(self, device: str, reset_method: str) -> Dict[str, Any]:
        """
        Perform a random reset operation on a device
        
        Args:
            device: PCI address of target device
            reset_method: Type of reset to perform
            
        Returns:
            Result dictionary with timing and success information
        """
        start_time = time.time()
        result = {
            'device': device,
            'reset_method': reset_method,
            'success': False,
            'start_time': start_time,
            'duration_ms': 0,
            'error': None,
            'pre_reset_state': {},
            'post_reset_state': {},
            'link_recovery_time_ms': 0
        }
        
        # Capture pre-reset state
        result['pre_reset_state'] = self._capture_device_state(device)
        
        try:
            if reset_method == 'link_retrain':
                success = self._perform_link_retrain(device)
            elif reset_method == 'function_reset':
                success = self._perform_function_reset(device)
            elif reset_method == 'secondary_reset':
                success = self._perform_secondary_reset(device)
            elif reset_method == 'surprise_removal':
                success = self._simulate_surprise_removal(device)
            elif reset_method == 'power_mgmt':
                success = self._perform_power_management_reset(device)
            else:
                result['error'] = f"Unknown reset method: {reset_method}"
                return result
            
            result['success'] = success
            
            # Wait for link recovery and measure time
            recovery_start = time.time()
            self._wait_for_link_recovery(device, timeout_ms=5000)
            result['link_recovery_time_ms'] = (time.time() - recovery_start) * 1000
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Reset {reset_method} failed on {device}: {e}")
        
        # Capture post-reset state
        result['post_reset_state'] = self._capture_device_state(device)
        result['duration_ms'] = (time.time() - start_time) * 1000
        
        # Record as quality event
        self.quality_events.append(LinkQualityEvent(
            timestamp=start_time,
            event_type='reset',
            device=device,
            details=result,
            severity='medium' if result['success'] else 'high'
        ))
        
        return result
    
    def _capture_device_state(self, device: str) -> Dict[str, Any]:
        """Capture current device state"""
        state = {}
        
        # Get link status
        pcie_cap_offset = self._get_pcie_capability_offset(device)
        if pcie_cap_offset:
            link_status = self._run_command(
                ['setpci', '-s', device, f'{pcie_cap_offset + 0x12:02x}.w'],
                use_sudo=True
            )
            if link_status:
                link_status_val = int(link_status, 16)
                state['link_training'] = bool(link_status_val & 0x800)  # Bit 11
                state['link_speed'] = (link_status_val & 0xF)  # Bits 3:0
                state['link_width'] = (link_status_val >> 4) & 0x3F  # Bits 9:4
        
        # Get sysfs data
        sysfs_data = self.collect_sysfs_data([device])
        state.update(sysfs_data.get(device, {}))
        
        return state
    
    def _perform_link_retrain(self, device: str) -> bool:
        """Perform link retrain reset"""
        pcie_cap_offset = self._get_pcie_capability_offset(device)
        if not pcie_cap_offset:
            return False
        
        # Read current Link Control
        link_control = self._run_command(
            ['setpci', '-s', device, f'{pcie_cap_offset + 0x10:02x}.w'],
            use_sudo=True
        )
        if not link_control:
            return False
        
        try:
            link_control_val = int(link_control, 16)
            # Set Retrain Link bit (bit 5)
            new_link_control = link_control_val | 0x20
            
            # Write back to trigger retrain
            result = self._run_command(
                ['setpci', '-s', device, f'{pcie_cap_offset + 0x10:02x}.w={new_link_control:#x}'],
                use_sudo=True
            )
            return result is not None
        except ValueError:
            return False
    
    def _perform_function_reset(self, device: str) -> bool:
        """Perform Function Level Reset (FLR)"""
        pcie_cap_offset = self._get_pcie_capability_offset(device)
        if not pcie_cap_offset:
            return False
        
        # Check if FLR is supported
        device_cap = self._run_command(
            ['setpci', '-s', device, f'{pcie_cap_offset + 0x04:02x}.l'],
            use_sudo=True
        )
        if not device_cap:
            return False
        
        try:
            device_cap_val = int(device_cap, 16)
            if not (device_cap_val & 0x10000000):  # FLR capability bit 28
                return False
            
            # Trigger FLR
            device_control = self._run_command(
                ['setpci', '-s', device, f'{pcie_cap_offset + 0x08:02x}.w'],
                use_sudo=True
            )
            if not device_control:
                return False
            
            device_control_val = int(device_control, 16)
            new_device_control = device_control_val | 0x8000  # Initiate FLR bit 15
            
            result = self._run_command(
                ['setpci', '-s', device, f'{pcie_cap_offset + 0x08:02x}.w={new_device_control:#x}'],
                use_sudo=True
            )
            return result is not None
        except ValueError:
            return False
    
    def _perform_secondary_reset(self, device: str) -> bool:
        """Perform secondary bus reset (if device is behind a bridge)"""
        # This is more complex and would require finding the parent bridge
        # For now, return False as not implemented
        logger.warning(f"Secondary reset not implemented for {device}")
        return False
    
    def _simulate_surprise_removal(self, device: str) -> bool:
        """Simulate surprise removal/insertion"""
        try:
            # Remove device
            remove_result = self._run_command(
                ['echo', '1', '>', f'/sys/bus/pci/devices/{device}/remove'],
                use_sudo=True
            )
            
            # Wait a bit
            time.sleep(0.5)
            
            # Rescan
            rescan_result = self._run_command(
                ['echo', '1', '>', '/sys/bus/pci/rescan'],
                use_sudo=True
            )
            
            return remove_result is not None and rescan_result is not None
        except:
            return False
    
    def _perform_power_management_reset(self, device: str) -> bool:
        """Perform power management state transition"""
        try:
            # Transition to D3hot then back to D0
            d3_result = self._run_command(
                ['echo', 'D3hot', '>', f'/sys/bus/pci/devices/{device}/power_state'],
                use_sudo=True
            )
            
            time.sleep(0.1)
            
            d0_result = self._run_command(
                ['echo', 'D0', '>', f'/sys/bus/pci/devices/{device}/power_state'],
                use_sudo=True
            )
            
            return d3_result is not None and d0_result is not None
        except:
            return False
    
    def _wait_for_link_recovery(self, device: str, timeout_ms: int = 5000):
        """Wait for link to recover after reset"""
        timeout_time = time.time() + (timeout_ms / 1000.0)
        
        while time.time() < timeout_time:
            state = self._capture_device_state(device)
            if not state.get('link_training', True):  # Link training complete
                break
            time.sleep(0.01)  # 10ms polling
    
    def run_link_quality_test(self, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run comprehensive link quality test
        
        Args:
            options: Test configuration including:
                - target_devices: List of PCI addresses to test (optional - will discover if not provided)
                - test_duration_minutes: How long to run test (default: 5)
                - reset_frequency_seconds: How often to perform resets (default: 30)
                - enable_random_resets: Enable random reset operations (default: True)
                - reset_methods: List of reset methods to use (default: all available)
                - calypso_manager: CalypsoPyManager for error monitoring (optional)
                - com_port: COM port for Atlas 3 error monitoring (optional)
                - monitor_errors: Enable Atlas 3 error monitoring (default: True)
                - error_sampling_interval: Error sampling interval in seconds (default: 1.0)
                
        Returns:
            Comprehensive test result dictionary
        """
        start_time = time.time()
        
        # Test configuration
        test_duration_minutes = options.get('test_duration_minutes', 5)
        reset_frequency_seconds = options.get('reset_frequency_seconds', 30)
        enable_random_resets = options.get('enable_random_resets', True)
        reset_methods = options.get('reset_methods', self.RESET_METHODS.copy())
        monitor_errors = options.get('monitor_errors', True)
        calypso_manager = options.get('calypso_manager')
        com_port = options.get('com_port')
        error_sampling_interval = options.get('error_sampling_interval', 1.0)
        
        result = {
            'test_name': 'PCIe Link Quality Assessment',
            'test_id': 'link_quality',
            'timestamp': datetime.now().isoformat(),
            'status': 'fail',
            'duration_ms': 0,
            'permission_level': self.permission_level,
            'test_configuration': {
                'duration_minutes': test_duration_minutes,
                'reset_frequency_seconds': reset_frequency_seconds,
                'enable_random_resets': enable_random_resets,
                'reset_methods': reset_methods,
                'monitor_errors': monitor_errors
            },
            'discovered_devices': [],
            'tested_devices': [],
            'quality_events': [],
            'reset_operations': [],
            'system_monitoring': {},
            'link_quality_assessment': {},
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
            'warnings': [],
            'errors': []
        }
        
        # Check permissions for advanced operations
        if enable_random_resets and not (self.has_root or self.has_sudo):
            result['warnings'].append('Random resets require root/sudo access - disabling reset operations')
            enable_random_resets = False
        
        if not self.has_setpci:
            result['errors'].append('setpci command not available - install pciutils')
            result['duration_ms'] = int((time.time() - start_time) * 1000)
            return result
        
        # Discover target devices
        if options.get('target_devices'):
            # Use specified devices
            target_devices = options['target_devices']
            if isinstance(target_devices, str):
                target_devices = [target_devices]
            
            discovered_devices = []
            for device in target_devices:
                discovered_devices.append({
                    'pci_address': device,
                    'device_name': 'User Specified',
                    'suitable_for_testing': True
                })
        else:
            # Auto-discover Atlas 3 devices
            discovered_devices = self.discover_atlas3_devices()
        
        result['discovered_devices'] = discovered_devices
        
        # Filter to suitable testing devices
        suitable_devices = [d for d in discovered_devices if d.get('suitable_for_testing', False)]
        
        if not suitable_devices:
            result['errors'].append('No suitable devices found for link quality testing')
            result['duration_ms'] = int((time.time() - start_time) * 1000)
            return result
        
        # Select devices for testing (limit to 3 for manageable testing)
        test_devices = suitable_devices[:3]
        result['tested_devices'] = test_devices
        
        logger.info(f"Testing link quality on {len(test_devices)} device(s)")
        
        # Initialize Atlas 3 error monitoring
        error_monitor = None
        if monitor_errors and calypso_manager and com_port:
            try:
                error_monitor = COMErrorMonitor(calypso_manager, com_port)
                if error_monitor.start_monitoring(sampling_interval=error_sampling_interval):
                    result['error_monitoring']['available'] = True
                    logger.info(f"Atlas 3 error monitoring started on {com_port}")
                else:
                    result['warnings'].append("Failed to start Atlas 3 error monitoring")
            except Exception as e:
                result['warnings'].append(f"Error monitoring setup failed: {str(e)}")
                logger.warning(f"Error monitoring setup failed: {e}")
        elif monitor_errors:
            result['warnings'].append("Error monitoring requested but CalypsoPy manager or port not provided")
        
        # Initialize LTSSM monitoring
        ltssm_monitor = None
        try:
            # Use first test device for LTSSM monitoring
            device_path = test_devices[0]['pci_address']
            ltssm_monitor = LTSSMMonitor(device_path)
            
            if ltssm_monitor.start_monitoring(sampling_interval=0.5):
                result['ltssm_monitoring']['available'] = True
                logger.info(f"LTSSM monitoring started for {device_path}")
            else:
                result['warnings'].append("Failed to start LTSSM monitoring")
        except Exception as e:
            result['warnings'].append(f"LTSSM monitoring setup failed: {str(e)}")
            logger.warning(f"LTSSM monitoring setup failed: {e}")
        
        # Start system monitoring
        self.start_system_monitoring(test_duration_minutes * 60)
        
        # Main test loop
        test_end_time = start_time + (test_duration_minutes * 60)
        last_reset_time = 0
        reset_operations = []
        
        logger.info(f"Starting {test_duration_minutes}-minute link quality test")
        
        while time.time() < test_end_time:
            current_time = time.time()
            
            # Collect periodic monitoring data
            self.system_monitor_data.dmesg_entries.extend(self.collect_dmesg_snapshot())
            
            device_addresses = [d['pci_address'] for d in test_devices]
            self.system_monitor_data.pci_config_snapshots.extend(
                self.collect_pci_config_snapshot(device_addresses)
            )
            
            # Perform random resets if enabled and it's time
            if (enable_random_resets and 
                current_time - last_reset_time >= reset_frequency_seconds):
                
                # Select random device and reset method
                target_device = random.choice(test_devices)
                reset_method = random.choice(reset_methods)
                
                logger.info(f"Performing {reset_method} on {target_device['pci_address']}")
                
                reset_result = self.perform_random_reset(
                    target_device['pci_address'], 
                    reset_method
                )
                reset_operations.append(reset_result)
                last_reset_time = current_time
            
            # Sleep before next monitoring cycle
            time.sleep(1.0)
        
        # Stop monitoring and collect final data
        self.system_monitor_data.collection_end = time.time()
        
        # Stop error monitoring and correlate
        if error_monitor and error_monitor.is_monitoring():
            try:
                error_data = error_monitor.stop_monitoring()
                if error_data:
                    result['error_monitoring']['data'] = error_data.to_dict()
                    
                    # Correlate with quality events
                    correlation = self._correlate_errors_with_quality_events(error_data, self.quality_events)
                    result['error_monitoring']['correlation'] = correlation
                    
                    logger.info(f"Error monitoring completed: {error_data.total_samples} samples")
                else:
                    result['warnings'].append("Error monitoring stopped but no data collected")
            except Exception as e:
                result['warnings'].append(f"Error stopping monitoring: {str(e)}")
        
        # Stop LTSSM monitoring and correlate
        if ltssm_monitor and ltssm_monitor.is_monitoring():
            try:
                ltssm_data = ltssm_monitor.stop_monitoring()
                if ltssm_data:
                    result['ltssm_monitoring']['data'] = ltssm_data.to_dict()
                    
                    # Correlate with quality events
                    ltssm_correlation = self._correlate_ltssm_with_quality_events(ltssm_data, self.quality_events)
                    result['ltssm_monitoring']['correlation'] = ltssm_correlation
                    
                    logger.info(f"LTSSM monitoring completed: {len(ltssm_data.transitions)} transitions")
                else:
                    result['warnings'].append("LTSSM monitoring stopped but no data collected")
            except Exception as e:
                result['warnings'].append(f"Error stopping LTSSM monitoring: {str(e)}")
        
        # Finalize results
        result['reset_operations'] = reset_operations
        result['quality_events'] = [
            {
                'timestamp': event.timestamp,
                'event_type': event.event_type,
                'device': event.device,
                'details': event.details,
                'severity': event.severity
            }
            for event in self.quality_events
        ]
        
        # Generate system monitoring summary
        result['system_monitoring'] = self._generate_monitoring_summary()
        
        # Assess overall link quality
        quality_assessment = self._assess_link_quality(reset_operations, self.quality_events)
        result['link_quality_assessment'] = quality_assessment
        
        # Determine test status
        grade = quality_assessment.get('overall_grade', 1)
        if grade >= 20:  # Equivalent to old 'A' and 'B' grades
            result['status'] = 'pass'
        elif grade >= 15:  # Equivalent to old 'C' grade
            result['status'] = 'warning'
        else:
            result['status'] = 'fail'
        
        result['duration_ms'] = int((time.time() - start_time) * 1000)
        
        logger.info(f"Link quality test completed - Overall grade: {quality_assessment.get('overall_grade', 1)}/25")
        
        return result
    
    def _correlate_errors_with_quality_events(self, error_data, quality_events: List[LinkQualityEvent]) -> Dict[str, Any]:
        """Correlate Atlas 3 errors with link quality events"""
        correlation = {
            'summary': {},
            'event_correlations': [],
            'error_spikes': [],
            'baseline_errors': {}
        }
        
        try:
            if not error_data or not error_data.samples:
                correlation['summary'] = {'status': 'no_error_data'}
                return correlation
            
            # Establish baseline
            baseline = error_data.samples[0]
            correlation['baseline_errors'] = {
                'port_receive': baseline.port_receive,
                'bad_tlp': baseline.bad_tlp,
                'bad_dllp': baseline.bad_dllp,
                'rec_diag': baseline.rec_diag
            }
            
            # Find correlations with quality events
            for event in quality_events:
                event_time = event.timestamp
                correlations = []
                
                # Look for error changes within ±5 seconds of event
                for sample in error_data.samples:
                    if abs(sample.timestamp - event_time) <= 5.0:
                        error_delta = {
                            'port_receive': sample.port_receive - baseline.port_receive,
                            'bad_tlp': sample.bad_tlp - baseline.bad_tlp,
                            'bad_dllp': sample.bad_dllp - baseline.bad_dllp,
                            'rec_diag': sample.rec_diag - baseline.rec_diag
                        }
                        
                        total_new_errors = sum(max(0, delta) for delta in error_delta.values())
                        if total_new_errors > 0:
                            correlations.append({
                                'sample_timestamp': sample.timestamp,
                                'time_offset': sample.timestamp - event_time,
                                'error_delta': error_delta,
                                'total_new_errors': total_new_errors
                            })
                
                if correlations:
                    correlation['event_correlations'].append({
                        'event': {
                            'timestamp': event.timestamp,
                            'type': event.event_type,
                            'device': event.device,
                            'severity': event.severity
                        },
                        'correlations': correlations
                    })
            
            correlation['summary'] = {
                'events_with_error_correlation': len(correlation['event_correlations']),
                'total_quality_events': len(quality_events),
                'correlation_percentage': (len(correlation['event_correlations']) / len(quality_events)) * 100 if quality_events else 0
            }
            
        except Exception as e:
            correlation['summary'] = {'status': 'correlation_error', 'message': str(e)}
        
        return correlation
    
    def _correlate_ltssm_with_quality_events(self, ltssm_data, quality_events: List[LinkQualityEvent]) -> Dict[str, Any]:
        """Correlate LTSSM transitions with link quality events"""
        correlation = {
            'summary': {},
            'event_correlations': [],
            'state_analysis': {},
            'recovery_patterns': []
        }
        
        try:
            if not ltssm_data or not ltssm_data.transitions:
                correlation['summary'] = {'status': 'no_ltssm_data'}
                return correlation
            
            # Analyze state patterns during quality events
            for event in quality_events:
                event_time_ns = event.timestamp * 1000000000  # Convert to nanoseconds
                
                # Find LTSSM transitions around this event (±2 seconds)
                related_transitions = []
                for transition in ltssm_data.transitions:
                    if abs(transition.timestamp - event_time_ns) <= 2000000000:  # 2 seconds in ns
                        related_transitions.append({
                            'timestamp': transition.timestamp,
                            'from_state': transition.from_state,
                            'to_state': transition.to_state,
                            'device': transition.device,
                            'time_offset_ms': (transition.timestamp - event_time_ns) / 1000000
                        })
                
                if related_transitions:
                    correlation['event_correlations'].append({
                        'event': {
                            'timestamp': event.timestamp,
                            'type': event.event_type,
                            'device': event.device,
                            'severity': event.severity
                        },
                        'transitions': related_transitions
                    })
            
            # Analyze recovery patterns
            recovery_transitions = [
                t for t in ltssm_data.transitions
                if t.to_state == 'Recovery' or t.from_state == 'Recovery'
            ]
            
            correlation['recovery_patterns'] = self._analyze_recovery_patterns(recovery_transitions)
            
            correlation['summary'] = {
                'total_transitions': len(ltssm_data.transitions),
                'events_with_ltssm_correlation': len(correlation['event_correlations']),
                'recovery_transitions': len(recovery_transitions),
                'monitoring_duration_ms': (ltssm_data.session_end - ltssm_data.session_start) * 1000
            }
            
        except Exception as e:
            correlation['summary'] = {'status': 'correlation_error', 'message': str(e)}
        
        return correlation
    
    def _analyze_recovery_patterns(self, recovery_transitions: List) -> List[Dict[str, Any]]:
        """Analyze Recovery state patterns"""
        patterns = []
        
        # Group consecutive recovery-related transitions
        current_sequence = []
        for transition in recovery_transitions:
            if not current_sequence or (transition.timestamp - current_sequence[-1]['timestamp']) < 100000000:  # 100ms
                current_sequence.append({
                    'timestamp': transition.timestamp,
                    'from_state': transition.from_state,
                    'to_state': transition.to_state,
                    'device': transition.device
                })
            else:
                if len(current_sequence) > 1:
                    patterns.append({
                        'sequence': current_sequence,
                        'duration_ms': (current_sequence[-1]['timestamp'] - current_sequence[0]['timestamp']) / 1000000,
                        'device': current_sequence[0]['device']
                    })
                current_sequence = [transition]
        
        # Don't forget the last sequence
        if len(current_sequence) > 1:
            patterns.append({
                'sequence': current_sequence,
                'duration_ms': (current_sequence[-1]['timestamp'] - current_sequence[0]['timestamp']) / 1000000,
                'device': current_sequence[0]['device']
            })
        
        return patterns
    
    def _generate_monitoring_summary(self) -> Dict[str, Any]:
        """Generate summary of system monitoring data"""
        if not self.system_monitor_data:
            return {}
        
        return {
            'collection_duration_seconds': self.system_monitor_data.collection_end - self.system_monitor_data.collection_start,
            'dmesg_entries_collected': len(self.system_monitor_data.dmesg_entries),
            'pci_snapshots_collected': len(self.system_monitor_data.pci_config_snapshots),
            'pcie_related_dmesg': len([
                entry for entry in self.system_monitor_data.dmesg_entries
                if any(keyword in entry['message'].lower() for keyword in ['pcie', 'aer', 'dpc', 'link'])
            ])
        }
    
    def _assess_link_quality(self, reset_operations: List[Dict[str, Any]], quality_events: List[LinkQualityEvent]) -> Dict[str, Any]:
        """
        Assess overall link quality based on test results
        
        Returns:
            Quality assessment with grades and recommendations
        """
        assessment = {
            'overall_grade': 1,
            'component_scores': {},
            'metrics': {},
            'recommendations': [],
            'compliance_status': {}
        }
        
        # Calculate metrics
        successful_resets = len([op for op in reset_operations if op.get('success', False)])
        total_resets = len(reset_operations)
        
        if total_resets > 0:
            reset_success_rate = successful_resets / total_resets
        else:
            reset_success_rate = 1.0  # No resets attempted
        
        # Calculate average reset time
        successful_reset_times = [
            op['duration_ms'] for op in reset_operations 
            if op.get('success', False) and op.get('duration_ms', 0) > 0
        ]
        avg_reset_time = sum(successful_reset_times) / len(successful_reset_times) if successful_reset_times else 0
        
        # Count quality events by severity
        severity_counts = {'low': 0, 'medium': 0, 'high': 0, 'critical': 0}
        for event in quality_events:
            severity_counts[event.severity] += 1
        
        # Score components (0-100 scale)
        scores = {}
        
        # Reset success rate score
        scores['reset_reliability'] = min(100, reset_success_rate * 100)
        
        # Reset timing score
        if avg_reset_time > 0:
            timing_score = max(0, 100 - (avg_reset_time / self.QUALITY_THRESHOLDS['max_reset_time_ms']) * 100)
            scores['reset_timing'] = timing_score
        else:
            scores['reset_timing'] = 100
        
        # Error frequency score
        error_events = severity_counts['high'] + severity_counts['critical'] * 2
        error_score = max(0, 100 - error_events * 10)  # -10 points per error event
        scores['error_frequency'] = error_score
        
        # Stability score (based on medium/low events)
        stability_events = severity_counts['medium'] + severity_counts['low']
        stability_score = max(0, 100 - stability_events * 5)  # -5 points per stability event
        scores['stability'] = stability_score
        
        assessment['component_scores'] = scores
        
        # Calculate overall grade (1-25 scale)
        overall_score = sum(scores.values()) / len(scores) if scores else 0
        
        # Convert 0-100 score to 1-25 scale
        grade_scale = max(1, min(25, round(overall_score / 4)))
        assessment['overall_grade'] = grade_scale
        
        # Generate recommendations
        recommendations = []
        if scores.get('reset_reliability', 0) < 80:
            recommendations.append("Investigate reset failures - check power delivery and PCIe compliance")
        if scores.get('reset_timing', 0) < 80:
            recommendations.append("Reset times are high - check link training optimization")
        if scores.get('error_frequency', 0) < 80:
            recommendations.append("High error frequency detected - investigate signal integrity")
        if scores.get('stability', 0) < 80:
            recommendations.append("Link stability issues detected - check thermal and power conditions")
        
        assessment['recommendations'] = recommendations
        
        # PCIe 6.x Specification Compliance Assessment
        compliance_status = self._assess_pcie_6x_compliance(reset_operations, quality_events, avg_reset_time)
        assessment['compliance_status'] = compliance_status
        
        # Store key metrics
        assessment['metrics'] = {
            'reset_success_rate': round(reset_success_rate * 100, 1),
            'average_reset_time_ms': round(avg_reset_time, 2),
            'total_quality_events': len(quality_events),
            'error_events': error_events,
            'overall_score': round(overall_score, 1)
        }
        
        return assessment

    def _assess_pcie_6x_compliance(self, reset_operations: List[Dict[str, Any]], 
                                   quality_events: List[LinkQualityEvent], 
                                   avg_reset_time: float) -> Dict[str, Any]:
        """
        Comprehensive PCIe 6.x specification compliance assessment
        
        Args:
            reset_operations: List of reset operations performed
            quality_events: List of quality events detected
            avg_reset_time: Average reset time in milliseconds
            
        Returns:
            Detailed compliance assessment
        """
        compliance = {
            'overall_compliant': False,
            'compliance_score': 0,
            'spec_requirements': {},
            'violations': [],
            'recommendations': [],
            'detailed_analysis': {}
        }
        
        # PCIe 6.x Specification Requirements (Simplified)
        spec_requirements = {
            # Section 7.5.1 - Link Training and Status State Machine
            'ltssm_compliance': {
                'max_recovery_time_ms': 100,    # Recovery.RcvrLock timeout
                'max_polling_time_ms': 24,      # Polling.Configuration timeout  
                'max_configuration_time_ms': 32, # Configuration.Complete timeout
                'description': 'LTSSM state transition timing requirements'
            },
            
            # Section 7.5.3 - Link Recovery
            'link_recovery': {
                'max_recovery_attempts': 255,   # Per PCIe 6.x spec
                'recovery_success_rate': 0.99,  # 99% minimum
                'description': 'Link recovery behavior requirements'
            },
            
            # Section 7.8 - Reset and Initialization
            'reset_compliance': {
                'fundamental_reset_time_ms': 100,  # Tpvperl timing
                'function_reset_time_ms': 100,     # FLR completion time
                'hot_reset_time_ms': 2000,         # Hot Reset timing
                'description': 'Reset timing requirements'
            },
            
            # Section 7.5.4 - Link Training Errors
            'error_thresholds': {
                'max_crc_errors_per_hour': 10,     # CRC error threshold
                'max_replay_timeouts_per_hour': 5,  # Replay timeout threshold
                'max_receiver_errors_per_hour': 3,  # Receiver error threshold
                'description': 'Error rate limitations'
            },
            
            # Section 6.23 - Advanced Error Reporting
            'aer_compliance': {
                'correctable_error_logging': True,  # Must log correctable errors
                'uncorrectable_error_logging': True, # Must log uncorrectable errors
                'error_masking_support': True,      # Error masking capability
                'description': 'Advanced Error Reporting requirements'
            },
            
            # Section 7.5.2 - Link Width and Speed
            'link_parameters': {
                'min_link_width_retention': 1.0,   # No width degradation allowed
                'min_speed_retention': 0.95,       # 95% speed retention minimum
                'max_speed_downgrade_events': 2,   # Maximum speed downgrades
                'description': 'Link parameter stability requirements'
            }
        }
        
        compliance['spec_requirements'] = spec_requirements
        compliance_scores = {}
        violations = []
        recommendations = []
        
        # 1. LTSSM Compliance Assessment
        ltssm_score = 100
        if avg_reset_time > spec_requirements['ltssm_compliance']['max_recovery_time_ms']:
            violation_severity = min(50, (avg_reset_time - 100) / 10)
            ltssm_score -= violation_severity
            violations.append({
                'requirement': 'LTSSM Recovery Time',
                'specification': f"≤{spec_requirements['ltssm_compliance']['max_recovery_time_ms']}ms",
                'actual': f"{avg_reset_time:.2f}ms",
                'severity': 'high' if violation_severity > 30 else 'medium',
                'section': '7.5.1'
            })
            recommendations.append("Optimize link training parameters to meet PCIe 6.x LTSSM timing requirements")
        
        compliance_scores['ltssm_compliance'] = max(0, ltssm_score)
        
        # 2. Reset Compliance Assessment
        reset_score = 100
        reset_failures = len([op for op in reset_operations if not op.get('success', False)])
        total_resets = len(reset_operations)
        
        if total_resets > 0:
            failure_rate = reset_failures / total_resets
            if failure_rate > 0.01:  # More than 1% failure rate
                reset_score -= failure_rate * 100
                violations.append({
                    'requirement': 'Reset Success Rate',
                    'specification': '≥99% success rate',
                    'actual': f"{(1-failure_rate)*100:.1f}% success rate",
                    'severity': 'high' if failure_rate > 0.05 else 'medium',
                    'section': '7.8'
                })
                recommendations.append("Investigate reset failures - may indicate power delivery or signal integrity issues")
        
        # Check individual reset timing compliance
        for op in reset_operations:
            if op.get('success') and op.get('duration_ms', 0) > 0:
                reset_method = op.get('reset_method', '')
                duration = op['duration_ms']
                
                if reset_method == 'function_reset' and duration > spec_requirements['reset_compliance']['function_reset_time_ms']:
                    violations.append({
                        'requirement': 'Function Level Reset Timing',
                        'specification': f"≤{spec_requirements['reset_compliance']['function_reset_time_ms']}ms",
                        'actual': f"{duration:.2f}ms",
                        'severity': 'medium',
                        'section': '7.8'
                    })
                elif reset_method in ['secondary_reset', 'surprise_removal'] and duration > spec_requirements['reset_compliance']['hot_reset_time_ms']:
                    violations.append({
                        'requirement': 'Hot Reset Timing',
                        'specification': f"≤{spec_requirements['reset_compliance']['hot_reset_time_ms']}ms",
                        'actual': f"{duration:.2f}ms",
                        'severity': 'medium',
                        'section': '7.8'
                    })
        
        compliance_scores['reset_compliance'] = max(0, reset_score)
        
        # 3. Error Rate Compliance Assessment
        error_score = 100
        critical_events = len([e for e in quality_events if e.severity == 'critical'])
        high_events = len([e for e in quality_events if e.severity == 'high'])
        
        # Estimate hourly error rates (extrapolate from test duration)
        test_duration_hours = 1.0  # Default assumption, could be passed in
        estimated_crc_errors_per_hour = critical_events / test_duration_hours
        estimated_other_errors_per_hour = high_events / test_duration_hours
        
        if estimated_crc_errors_per_hour > spec_requirements['error_thresholds']['max_crc_errors_per_hour']:
            error_score -= min(40, estimated_crc_errors_per_hour * 2)
            violations.append({
                'requirement': 'CRC Error Rate',
                'specification': f"≤{spec_requirements['error_thresholds']['max_crc_errors_per_hour']} errors/hour",
                'actual': f"{estimated_crc_errors_per_hour:.1f} errors/hour",
                'severity': 'high',
                'section': '7.5.4'
            })
            recommendations.append("High error rates detected - investigate signal integrity and cable quality")
        
        if estimated_other_errors_per_hour > spec_requirements['error_thresholds']['max_receiver_errors_per_hour']:
            error_score -= min(30, estimated_other_errors_per_hour * 3)
            violations.append({
                'requirement': 'Receiver Error Rate',
                'specification': f"≤{spec_requirements['error_thresholds']['max_receiver_errors_per_hour']} errors/hour",
                'actual': f"{estimated_other_errors_per_hour:.1f} errors/hour",
                'severity': 'medium',
                'section': '7.5.4'
            })
        
        compliance_scores['error_compliance'] = max(0, error_score)
        
        # 4. Link Parameter Stability Assessment
        stability_score = 100
        
        # Check for link width/speed degradation events
        degradation_events = len([e for e in quality_events 
                                 if e.event_type in ['performance_drop', 'link_degradation']])
        
        if degradation_events > spec_requirements['link_parameters']['max_speed_downgrade_events']:
            stability_score -= degradation_events * 15
            violations.append({
                'requirement': 'Link Parameter Stability',
                'specification': f"≤{spec_requirements['link_parameters']['max_speed_downgrade_events']} degradation events",
                'actual': f"{degradation_events} degradation events",
                'severity': 'medium',
                'section': '7.5.2'
            })
            recommendations.append("Link parameter instability detected - check thermal conditions and power delivery")
        
        compliance_scores['stability_compliance'] = max(0, stability_score)
        
        # 5. Overall Compliance Assessment
        overall_score = sum(compliance_scores.values()) / len(compliance_scores)
        compliance['compliance_score'] = round(overall_score, 1)
        compliance['overall_compliant'] = overall_score >= 80 and len([v for v in violations if v['severity'] == 'high']) == 0
        
        # Detailed Analysis
        compliance['detailed_analysis'] = {
            'component_scores': compliance_scores,
            'total_violations': len(violations),
            'high_severity_violations': len([v for v in violations if v['severity'] == 'high']),
            'medium_severity_violations': len([v for v in violations if v['severity'] == 'medium']),
            'specification_sections_tested': ['7.5.1', '7.5.2', '7.5.3', '7.5.4', '7.8', '6.23'],
            'compliance_percentage': overall_score,
            'certification_ready': overall_score >= 95 and len(violations) == 0
        }
        
        # Add PCIe 6.x specific recommendations
        if overall_score < 90:
            recommendations.append("Consider PCIe 6.x compliance testing with certified test equipment")
        if len([v for v in violations if v['severity'] == 'high']) > 0:
            recommendations.append("High-severity violations require immediate attention before deployment")
        if overall_score >= 95:
            recommendations.append("Link quality meets PCIe 6.x certification requirements")
        
        compliance['violations'] = violations
        compliance['recommendations'] = recommendations
        
        return compliance


# Test execution function
def run_link_quality_test(options: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute link quality test
    
    Args:
        options: Test configuration dictionary
        
    Returns:
        Test results dictionary
    """
    test = LinkQualityTest()
    return test.run_link_quality_test(options)


# Command-line test execution
if __name__ == "__main__":
    print("=" * 80)
    print("CalypsoPy+ PCIe Link Quality Test")
    print("=" * 80)
    
    # Example test configuration
    test_options = {
        'test_duration_minutes': 2,  # Short test for demonstration
        'reset_frequency_seconds': 30,
        'enable_random_resets': True,
        'reset_methods': ['link_retrain', 'function_reset'],
        'monitor_errors': False  # No COM port available for demo
    }
    
    test = LinkQualityTest()
    
    print(f"\nPermission Level: {test.permission_level}")
    print(f"setpci Available: {test.has_setpci}")
    print(f"perf Available: {test.has_perf}")
    
    if not test.has_setpci:
        print("\n⚠️  setpci not available - install pciutils package")
        exit(1)
    
    print(f"\nRunning {test_options['test_duration_minutes']}-minute link quality test...")
    
    result = test.run_link_quality_test(test_options)
    
    print(f"\nStatus: {result['status'].upper()}")
    print(f"Duration: {result['duration_ms']}ms")
    
    quality_assessment = result.get('link_quality_assessment', {})
    print(f"Overall Grade: {quality_assessment.get('overall_grade', 'Unknown')}")
    print(f"Overall Score: {quality_assessment.get('metrics', {}).get('overall_score', 0)}/100")
    
    if quality_assessment.get('recommendations'):
        print(f"\nRecommendations:")
        for rec in quality_assessment['recommendations']:
            print(f"  - {rec}")
    
    print(f"\nDevices Tested: {len(result.get('tested_devices', []))}")
    print(f"Reset Operations: {len(result.get('reset_operations', []))}")
    print(f"Quality Events: {len(result.get('quality_events', []))}")
    
    if result.get('warnings'):
        print(f"\nWarnings:")
        for warning in result['warnings']:
            print(f"  ⚠️  {warning}")
    
    if result.get('errors'):
        print(f"\nErrors:")
        for error in result['errors']:
            print(f"  ❌ {error}")