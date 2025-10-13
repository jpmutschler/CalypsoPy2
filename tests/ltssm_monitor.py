#!/usr/bin/env python3
"""
LTSSM (Link Training and Status State Machine) Monitor for CalypsoPy+
Tracks PCIe link state transitions using lspci, setpci, dmesg, and sysfs
"""

import re
import os
import time
import logging
import subprocess
import threading
from typing import Dict, List, Any, Optional, Callable, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class LTSSMState(Enum):
    """PCIe LTSSM States according to PCIe specification"""
    DETECT_QUIET = "Detect.Quiet"
    DETECT_ACTIVE = "Detect.Active"
    POLLING_ACTIVE = "Polling.Active"
    POLLING_COMPLIANCE = "Polling.Compliance"
    POLLING_CONFIG = "Polling.Configuration"
    CONFIG_LINKWIDTH_START = "Configuration.Linkwidth.Start"
    CONFIG_LINKWIDTH_ACCEPT = "Configuration.Linkwidth.Accept"
    CONFIG_LANENUM_WAIT = "Configuration.Lanenum.Wait"
    CONFIG_LANENUM_ACCEPT = "Configuration.Lanenum.Accept"
    CONFIG_COMPLETE = "Configuration.Complete"
    CONFIG_IDLE = "Configuration.Idle"
    RECOVERY_RCVR_LOCK = "Recovery.RcvrLock"
    RECOVERY_RCVR_CFG = "Recovery.RcvrCfg"
    RECOVERY_IDLE = "Recovery.Idle"
    L0 = "L0"
    L0S = "L0s"
    L1_IDLE = "L1.Idle"
    L1_CONFIG = "L1.Configuration"
    L2_IDLE = "L2.Idle"
    L2_WAKE = "L2.Wake"
    DISABLED = "Disabled"
    LOOPBACK_MASTER = "Loopback.Master"
    LOOPBACK_SLAVE = "Loopback.Slave"
    HOT_RESET = "Hot.Reset"
    UNKNOWN = "Unknown"


@dataclass
class LTSSMTransition:
    """Represents a single LTSSM state transition"""
    timestamp: float
    device: str
    source: str  # 'dmesg', 'sysfs', 'setpci', 'lspci'
    from_state: LTSSMState
    to_state: LTSSMState
    duration_us: Optional[float] = None
    raw_data: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp,
            'device': self.device,
            'source': self.source,
            'from_state': self.from_state.value,
            'to_state': self.to_state.value,
            'duration_us': self.duration_us,
            'raw_data': self.raw_data
        }


@dataclass
class LTSSMSessionResult:
    """Results from LTSSM monitoring session"""
    device_path: str
    session_start: float
    session_end: float
    transitions: List[LTSSMTransition] = field(default_factory=list)
    current_state: Optional[LTSSMState] = None
    sampling_interval: float = 1.0
    total_samples: int = 0
    monitoring_successful: bool = False
    
    def get_state_statistics(self) -> Dict[str, Any]:
        """Calculate LTSSM state statistics"""
        if not self.transitions:
            return {}
        
        # Count transitions per state
        state_counts = {}
        state_durations = {}
        
        for transition in self.transitions:
            from_state = transition.from_state.value
            to_state = transition.to_state.value
            
            # Count transitions
            state_counts[from_state] = state_counts.get(from_state, 0) + 1
            
            # Track durations if available
            if transition.duration_us:
                if from_state not in state_durations:
                    state_durations[from_state] = []
                state_durations[from_state].append(transition.duration_us)
        
        # Calculate average durations
        avg_durations = {}
        for state, durations in state_durations.items():
            avg_durations[state] = sum(durations) / len(durations)
        
        return {
            'total_transitions': len(self.transitions),
            'unique_states_visited': len(state_counts),
            'state_transition_counts': state_counts,
            'state_average_durations_us': avg_durations,
            'monitoring_duration': self.session_end - self.session_start
        }
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'device_path': self.device_path,
            'session_start': self.session_start,
            'session_end': self.session_end,
            'duration_seconds': self.session_end - self.session_start,
            'total_samples': self.total_samples,
            'sampling_interval': self.sampling_interval,
            'monitoring_successful': self.monitoring_successful,
            'current_state': self.current_state.value if self.current_state else None,
            'transitions': [t.to_dict() for t in self.transitions],
            'statistics': self.get_state_statistics(),
            'chart_data': self._prepare_chart_data()
        }
    
    def _prepare_chart_data(self) -> Dict[str, Any]:
        """Prepare data for frontend charting"""
        if not self.transitions:
            return {
                'timestamps': [],
                'states': [],
                'state_ids': [],
                'transition_sources': []
            }
        
        # Create state timeline
        timestamps = []
        states = []
        state_ids = []
        sources = []
        
        for transition in self.transitions:
            timestamps.append(transition.timestamp)
            states.append(transition.to_state.value)
            state_ids.append(list(LTSSMState).index(transition.to_state))
            sources.append(transition.source)
        
        return {
            'timestamps': timestamps,
            'states': states,
            'state_ids': state_ids,
            'transition_sources': sources,
            'relative_timestamps': [(t - timestamps[0]) for t in timestamps] if timestamps else []
        }


class LTSSMMonitor:
    """
    LTSSM State Monitor for PCIe Devices
    
    Tracks PCIe LTSSM state transitions using multiple sources:
    - dmesg: Kernel log messages about state changes
    - sysfs: PCIe device status files
    - setpci: Direct PCIe register reads
    - lspci: PCIe configuration space
    """
    
    # PCIe register offsets
    LINK_STATUS_OFFSET = 0x12  # Link Status register in PCIe capability
    LINK_CONTROL_OFFSET = 0x10  # Link Control register
    
    # Link Status register bit definitions
    LINK_STATUS_TRAINING = 0x800  # Bit 11: Link Training
    LINK_STATUS_SPEED_MASK = 0xF  # Bits 0-3: Current Link Speed
    LINK_STATUS_WIDTH_MASK = 0x3F0  # Bits 4-9: Negotiated Link Width
    
    def __init__(self, device_path: str):
        """
        Initialize LTSSM monitor for specific PCIe device
        
        Args:
            device_path: PCIe device path (e.g., '0000:01:00.0' or '/dev/nvme0n1')
        """
        self.device_path = device_path
        self.pci_address = self._normalize_pci_address(device_path)
        self.monitoring = False
        self.monitor_thread = None
        self.result = None
        self.real_time_callback = None
        self.sampling_interval = 1.0
        
        # Check tool availability
        self.has_root = self._check_root_access()
        self.has_sudo = self._check_sudo_access()
        self.has_setpci = self._check_setpci_available()
        self.has_lspci = self._check_lspci_available()
        
        # Find PCIe capability offset
        self.pcie_cap_offset = self._find_pcie_capability()
        
        logger.info(f"LTSSM Monitor initialized for {device_path} (PCI: {self.pci_address})")
    
    def _normalize_pci_address(self, device_path: str) -> str:
        """Convert device path to PCI address format"""
        if device_path.startswith('/dev/nvme'):
            # Convert NVMe device to PCI address
            device_name = device_path.split('/')[-1].rstrip('0123456789')  # nvme0n1 -> nvme0
            try:
                result = subprocess.run(
                    ['readlink', '-f', f'/sys/class/nvme/{device_name}/device'],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    # Extract PCI address from path
                    match = re.search(r'(\d{4}:\d{2}:\d{2}\.\d)', result.stdout)
                    if match:
                        return match.group(1)
            except:
                pass
        elif ':' in device_path and '.' in device_path:
            # Already a PCI address
            return device_path
            
        return device_path
    
    def _check_root_access(self) -> bool:
        """Check if running as root"""
        try:
            import os
            return os.geteuid() == 0
        except:
            return False
    
    def _check_sudo_access(self) -> bool:
        """Check if sudo is available"""
        try:
            result = subprocess.run(['sudo', '-n', 'true'], capture_output=True, timeout=2)
            return result.returncode == 0
        except:
            return False
    
    def _check_setpci_available(self) -> bool:
        """Check if setpci command is available"""
        try:
            result = subprocess.run(['which', 'setpci'], capture_output=True, timeout=2)
            return result.returncode == 0
        except:
            return False
    
    def _check_lspci_available(self) -> bool:
        """Check if lspci command is available"""
        try:
            result = subprocess.run(['which', 'lspci'], capture_output=True, timeout=2)
            return result.returncode == 0
        except:
            return False
    
    def _run_command(self, cmd: List[str], use_sudo: bool = False, timeout: int = 5) -> Optional[str]:
        """Run a command and return output"""
        if use_sudo and self.has_sudo and not self.has_root:
            cmd = ['sudo'] + cmd
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            if result.returncode == 0:
                return result.stdout.strip()
        except:
            pass
        return None
    
    def _find_pcie_capability(self) -> Optional[int]:
        """Find PCIe capability structure offset"""
        if not self.has_setpci or not self.pci_address:
            return None
        
        # Read capability pointer
        cap_ptr_output = self._run_command(
            ['setpci', '-s', self.pci_address, '0x34.b'],
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
        for _ in range(48):  # Prevent infinite loops
            if current_offset == 0 or current_offset == 0xFF:
                break
            
            cap_data = self._run_command(
                ['setpci', '-s', self.pci_address, f'{current_offset:#x}.l'],
                use_sudo=True
            )
            
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
    
    def query_ltssm_state_dmesg(self) -> List[LTSSMTransition]:
        """Query LTSSM state from kernel dmesg logs"""
        transitions = []
        
        dmesg_output = self._run_command(['dmesg', '-T'])
        if not dmesg_output:
            return transitions
        
        # Patterns for LTSSM state transitions in dmesg
        patterns = [
            r'\[(\d+\.\d+)\].*pci.*(\d{4}:\d{2}:\d{2}\.\d).*LTSSM.*(\w+).*->.*(\w+)',
            r'\[(\d+\.\d+)\].*(\d{4}:\d{2}:\d{2}\.\d).*link.*training.*state.*(\w+).*->.*(\w+)',
            r'\[(\d+\.\d+)\].*(\d{4}:\d{2}:\d{2}\.\d).*state.*transition.*(\w+).*to.*(\w+)',
        ]
        
        for line in dmesg_output.split('\n'):
            for pattern in patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match and (len(match.groups()) >= 4):
                    try:
                        timestamp = float(match.group(1))
                        device = match.group(2)
                        from_state_str = match.group(3)
                        to_state_str = match.group(4)
                        
                        # Filter for our device if specified
                        if self.pci_address and device != self.pci_address:
                            continue
                        
                        from_state = self._parse_ltssm_state(from_state_str)
                        to_state = self._parse_ltssm_state(to_state_str)
                        
                        transition = LTSSMTransition(
                            timestamp=timestamp,
                            device=device,
                            source='dmesg',
                            from_state=from_state,
                            to_state=to_state,
                            raw_data=line.strip()
                        )
                        transitions.append(transition)
                    except Exception as e:
                        logger.debug(f"Error parsing dmesg line: {e}")
        
        return transitions
    
    def query_ltssm_state_sysfs(self) -> Optional[LTSSMState]:
        """Query current LTSSM state from sysfs"""
        if not self.pci_address:
            return None
        
        # Try various sysfs paths for LTSSM state
        sysfs_paths = [
            f'/sys/bus/pci/devices/{self.pci_address}/link_state',
            f'/sys/bus/pci/devices/{self.pci_address}/ltssm_state',
            f'/sys/bus/pci/devices/{self.pci_address}/current_link_state',
        ]
        
        for path in sysfs_paths:
            try:
                with open(path, 'r') as f:
                    state_str = f.read().strip()
                    return self._parse_ltssm_state(state_str)
            except (FileNotFoundError, PermissionError):
                continue
        
        return None
    
    def query_ltssm_state_setpci(self) -> Optional[Dict[str, Any]]:
        """Query link status using setpci"""
        if not self.has_setpci or not self.pcie_cap_offset or not self.pci_address:
            return None
        
        # Read Link Status register
        link_status_offset = self.pcie_cap_offset + self.LINK_STATUS_OFFSET
        output = self._run_command(
            ['setpci', '-s', self.pci_address, f'{link_status_offset:#x}.w'],
            use_sudo=True
        )
        
        if not output:
            return None
        
        try:
            link_status = int(output, 16)
            
            # Parse link status fields
            is_training = bool(link_status & self.LINK_STATUS_TRAINING)
            link_speed = link_status & self.LINK_STATUS_SPEED_MASK
            link_width = (link_status & self.LINK_STATUS_WIDTH_MASK) >> 4
            
            # Infer LTSSM state from link status
            if is_training:
                state = LTSSMState.POLLING_ACTIVE  # Likely in training
            else:
                state = LTSSMState.L0  # Likely operational
            
            return {
                'ltssm_state': state,
                'link_training': is_training,
                'link_speed': link_speed,
                'link_width': link_width,
                'raw_value': link_status
            }
        except ValueError:
            return None
    
    def query_ltssm_state_lspci(self) -> Optional[Dict[str, Any]]:
        """Query link status using lspci"""
        if not self.has_lspci or not self.pci_address:
            return None
        
        output = self._run_command(['lspci', '-vvv', '-s', self.pci_address])
        if not output:
            return None
        
        # Parse lspci output for link status
        link_info = {}
        for line in output.split('\n'):
            if 'LnkSta:' in line:
                # Parse link status line
                # Example: LnkSta: Speed 8GT/s, Width x4, TrErr- Train- SlotClk+ DLActive+ BWMgmt- ABWMgmt-
                if 'Train+' in line:
                    link_info['training'] = True
                    link_info['ltssm_state'] = LTSSMState.POLLING_ACTIVE
                elif 'Train-' in line:
                    link_info['training'] = False
                    link_info['ltssm_state'] = LTSSMState.L0
                
                # Extract speed and width
                speed_match = re.search(r'Speed\s+([0-9.]+)GT/s', line)
                if speed_match:
                    link_info['speed_gts'] = float(speed_match.group(1))
                
                width_match = re.search(r'Width\s+x(\d+)', line)
                if width_match:
                    link_info['width'] = int(width_match.group(1))
                
                break
        
        return link_info if link_info else None
    
    def _parse_ltssm_state(self, state_str: str) -> LTSSMState:
        """Parse LTSSM state string to enum"""
        state_lower = state_str.lower().replace(' ', '_').replace('.', '_')
        
        # Common state mappings
        state_mappings = {
            'detect': LTSSMState.DETECT_QUIET,
            'detect_quiet': LTSSMState.DETECT_QUIET,
            'detect_active': LTSSMState.DETECT_ACTIVE,
            'polling': LTSSMState.POLLING_ACTIVE,
            'polling_active': LTSSMState.POLLING_ACTIVE,
            'polling_compliance': LTSSMState.POLLING_COMPLIANCE,
            'config': LTSSMState.CONFIG_LINKWIDTH_START,
            'configuration': LTSSMState.CONFIG_LINKWIDTH_START,
            'recovery': LTSSMState.RECOVERY_RCVR_LOCK,
            'l0': LTSSMState.L0,
            'l0s': LTSSMState.L0S,
            'l1': LTSSMState.L1_IDLE,
            'l2': LTSSMState.L2_IDLE,
            'disabled': LTSSMState.DISABLED,
            'loopback': LTSSMState.LOOPBACK_MASTER,
            'hot_reset': LTSSMState.HOT_RESET,
            'training': LTSSMState.POLLING_ACTIVE,
            'up': LTSSMState.L0,
            'down': LTSSMState.DETECT_QUIET
        }
        
        return state_mappings.get(state_lower, LTSSMState.UNKNOWN)
    
    def start_monitoring(self, 
                        sampling_interval: float = 1.0,
                        real_time_callback: Optional[Callable] = None) -> bool:
        """
        Start monitoring LTSSM states in background thread
        
        Args:
            sampling_interval: Time between samples in seconds
            real_time_callback: Optional callback for real-time updates
            
        Returns:
            True if monitoring started successfully
        """
        if self.monitoring:
            logger.warning("LTSSM monitoring already active")
            return False
        
        self.sampling_interval = sampling_interval
        self.real_time_callback = real_time_callback
        self.monitoring = True
        
        # Initialize result
        self.result = LTSSMSessionResult(
            device_path=self.device_path,
            session_start=time.time(),
            session_end=0,
            sampling_interval=sampling_interval
        )
        
        # Get initial state
        initial_state = self._get_current_state()
        if initial_state:
            self.result.current_state = initial_state
            logger.info(f"LTSSM monitoring started for {self.device_path}: {initial_state.value}")
        else:
            logger.warning("Could not determine initial LTSSM state")
        
        # Start monitoring thread
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True
        )
        self.monitor_thread.start()
        
        return True
    
    def stop_monitoring(self) -> Optional[LTSSMSessionResult]:
        """
        Stop monitoring and return results
        
        Returns:
            LTSSMSessionResult with monitoring data
        """
        if not self.monitoring:
            logger.warning("LTSSM monitoring not active")
            return None
        
        logger.info("Stopping LTSSM monitoring...")
        self.monitoring = False
        
        # Wait for thread to finish
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=10.0)
        
        if self.result:
            self.result.session_end = time.time()
            self.result.monitoring_successful = True
            
            # Get final state
            final_state = self._get_current_state()
            if final_state:
                self.result.current_state = final_state
            
            # Add any additional dmesg transitions since monitoring started
            dmesg_transitions = self.query_ltssm_state_dmesg()
            for transition in dmesg_transitions:
                if transition.timestamp >= self.result.session_start:
                    self.result.transitions.append(transition)
            
            # Sort transitions by timestamp
            self.result.transitions.sort(key=lambda t: t.timestamp)
            
            logger.info(f"LTSSM monitoring stopped. Duration: {self.result.session_end - self.result.session_start:.1f}s, "
                       f"Transitions: {len(self.result.transitions)}")
        
        return self.result
    
    def _get_current_state(self) -> Optional[LTSSMState]:
        """Get current LTSSM state using all available methods"""
        # Try sysfs first (fastest)
        state = self.query_ltssm_state_sysfs()
        if state and state != LTSSMState.UNKNOWN:
            return state
        
        # Try setpci
        setpci_info = self.query_ltssm_state_setpci()
        if setpci_info and 'ltssm_state' in setpci_info:
            return setpci_info['ltssm_state']
        
        # Try lspci
        lspci_info = self.query_ltssm_state_lspci()
        if lspci_info and 'ltssm_state' in lspci_info:
            return lspci_info['ltssm_state']
        
        return None
    
    def _monitor_loop(self):
        """Background monitoring loop"""
        logger.debug("LTSSM monitoring loop started")
        prev_state = self.result.current_state
        
        while self.monitoring:
            try:
                # Query current state
                current_state = self._get_current_state()
                
                if current_state and current_state != prev_state:
                    # State transition detected
                    transition = LTSSMTransition(
                        timestamp=time.time(),
                        device=self.pci_address or self.device_path,
                        source='monitor',
                        from_state=prev_state or LTSSMState.UNKNOWN,
                        to_state=current_state
                    )
                    
                    if self.result:
                        self.result.transitions.append(transition)
                        self.result.current_state = current_state
                        self.result.total_samples += 1
                    
                    # Call real-time callback if provided
                    if self.real_time_callback:
                        try:
                            self.real_time_callback(transition)
                        except Exception as e:
                            logger.warning(f"Real-time callback error: {e}")
                    
                    prev_state = current_state
                
                # Sleep for sampling interval
                time.sleep(self.sampling_interval)
                
            except Exception as e:
                logger.error(f"Error in LTSSM monitoring loop: {e}")
                time.sleep(self.sampling_interval)
        
        logger.debug("LTSSM monitoring loop ended")
    
    def is_monitoring(self) -> bool:
        """Check if monitoring is active"""
        return self.monitoring
    
    def get_current_state(self) -> Optional[LTSSMState]:
        """Get current LTSSM state without starting monitoring"""
        return self._get_current_state()


if __name__ == '__main__':
    # Test the LTSSM monitoring functionality
    logging.basicConfig(level=logging.INFO)
    
    print("Testing LTSSM Monitor")
    print("=" * 50)
    
    # Test with a mock device
    monitor = LTSSMMonitor('0000:01:00.0')
    
    print(f"Device: {monitor.device_path}")
    print(f"PCI Address: {monitor.pci_address}")
    print(f"PCIe Capability Offset: {monitor.pcie_cap_offset:#x}" if monitor.pcie_cap_offset else "PCIe Capability: Not found")
    print(f"Tool availability: setpci={monitor.has_setpci}, lspci={monitor.has_lspci}")
    print(f"Permissions: root={monitor.has_root}, sudo={monitor.has_sudo}")
    
    # Test current state detection
    current_state = monitor.get_current_state()
    if current_state:
        print(f"Current LTSSM State: {current_state.value}")
    else:
        print("Current LTSSM State: Could not determine")
    
    # Test dmesg parsing
    dmesg_transitions = monitor.query_ltssm_state_dmesg()
    print(f"LTSSM transitions from dmesg: {len(dmesg_transitions)}")
    
    print(f"\nLTSSM Monitor test completed")