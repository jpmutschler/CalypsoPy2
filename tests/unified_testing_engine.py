#!/usr/bin/env python3
"""
CalypsoPy+ Unified Testing Engine
A comprehensive, streamlined testing engine for PCIe/NVMe hardware validation

This unified engine handles:
- Command execution with proper subprocess management
- Real-time progress monitoring via SocketIO
- Integrated parsing for all Linux tools (lspci, setpci, fio, smartctl, etc.)
- Error counter correlation with Atlas 3 switch monitoring
- Thread-safe test orchestration and result management
- Atlas 3 downstream device filtering for safety
"""

import subprocess
import threading
import queue
import time
import json
import re
import os
import logging
from typing import Dict, List, Any, Optional, Callable, Union
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, Future
from enum import Enum
import asyncio

logger = logging.getLogger(__name__)


class TestStatus(Enum):
    """Test execution status"""
    PENDING = "pending"
    INITIALIZING = "initializing"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CommandType(Enum):
    """Types of Linux commands we support"""
    LSPCI = "lspci"
    SETPCI = "setpci"
    FIO = "fio"
    NVME_CLI = "nvme"
    SMARTCTL = "smartctl"
    DMESG = "dmesg"
    JOURNALCTL = "journalctl"
    SYSTEM = "system"
    CUSTOM = "custom"


@dataclass
class CommandExecution:
    """Represents a single command execution"""
    command: str
    command_type: CommandType
    timeout: int
    critical: bool
    device_specific: bool = False
    target_device: Optional[str] = None
    
    # Execution results
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    exit_code: Optional[int] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    parsed_result: Optional[Dict[str, Any]] = None
    
    @property
    def duration_ms(self) -> int:
        if self.start_time and self.end_time:
            return int((self.end_time - self.start_time).total_seconds() * 1000)
        return 0


@dataclass
class TestResult:
    """Comprehensive test result structure"""
    test_id: str
    test_name: str
    status: TestStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_ms: int = 0
    
    # Command execution data
    commands: List[CommandExecution] = field(default_factory=list)
    command_summary: Dict[str, Any] = field(default_factory=dict)
    
    # Parsed results from test-specific logic
    test_data: Dict[str, Any] = field(default_factory=dict)
    
    # Error monitoring data
    error_baseline: Optional[Dict[int, Dict[str, int]]] = None
    error_snapshots: List[Dict[str, Any]] = field(default_factory=list)
    error_analysis: Dict[str, Any] = field(default_factory=dict)
    
    # Summary and status
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    summary: str = ""


class LinuxToolParser:
    """Unified parser for all Linux command-line tools"""
    
    @staticmethod
    def parse_lspci_verbose(output: str) -> Dict[str, Any]:
        """Parse lspci -vvv output into structured data"""
        devices = {}
        current_device = None
        
        for line in output.split('\n'):
            line = line.strip()
            if not line:
                continue
            
            # Device identifier line (e.g., "00:00.0 Host bridge: Intel Corporation...")
            device_match = re.match(r'^([0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])\s+([^:]+):\s*(.+)', line)
            if device_match:
                bdf = device_match.group(1)
                device_type = device_match.group(2).strip()
                description = device_match.group(3).strip()
                
                current_device = {
                    'bdf': bdf,
                    'device_type': device_type,
                    'description': description,
                    'capabilities': {},
                    'registers': {},
                    'link_info': {}
                }
                devices[bdf] = current_device
                continue
            
            if current_device is None:
                continue
            
            # Parse various device properties
            if line.startswith('Subsystem:'):
                current_device['subsystem'] = line.replace('Subsystem:', '').strip()
            elif line.startswith('Kernel driver in use:'):
                current_device['driver'] = line.replace('Kernel driver in use:', '').strip()
            elif 'LnkCap:' in line:
                current_device['link_info']['capabilities'] = line
            elif 'LnkSta:' in line:
                current_device['link_info']['status'] = line
            elif 'LnkCtl:' in line:
                current_device['link_info']['control'] = line
        
        return {
            'devices': devices,
            'device_count': len(devices),
            'parse_timestamp': datetime.now().isoformat()
        }
    
    @staticmethod
    def parse_lspci_tree(output: str) -> Dict[str, Any]:
        """Parse lspci -t output into tree structure"""
        tree = {}
        lines = output.strip().split('\n')
        
        for line in lines:
            if '-[' in line:
                # Root bus or bridge
                match = re.search(r'-\[(\d+)\]', line)
                if match:
                    bus = match.group(1)
                    tree[f"bus_{bus}"] = {
                        'bus_number': bus,
                        'devices': [],
                        'children': []
                    }
        
        return {
            'topology': tree,
            'bus_count': len(tree),
            'parse_timestamp': datetime.now().isoformat()
        }
    
    @staticmethod
    def parse_fio_json(output: str) -> Dict[str, Any]:
        """Parse FIO JSON output"""
        try:
            fio_data = json.loads(output)
            
            # Extract key performance metrics
            jobs = fio_data.get('jobs', [])
            if not jobs:
                return {'error': 'No job data found in FIO output'}
            
            job = jobs[0]  # Assume single job for now
            
            read_data = job.get('read', {})
            write_data = job.get('write', {})
            
            return {
                'job_name': job.get('jobname', 'unknown'),
                'runtime_ms': job.get('elapsed', 0),
                'read_performance': {
                    'iops': read_data.get('iops', 0),
                    'bandwidth_kbps': read_data.get('bw', 0),
                    'latency_us': read_data.get('lat_ns', {}).get('mean', 0) / 1000
                },
                'write_performance': {
                    'iops': write_data.get('iops', 0),
                    'bandwidth_kbps': write_data.get('bw', 0),
                    'latency_us': write_data.get('lat_ns', {}).get('mean', 0) / 1000
                },
                'parse_timestamp': datetime.now().isoformat()
            }
        except json.JSONDecodeError as e:
            return {'error': f'Failed to parse FIO JSON: {str(e)}'}
    
    @staticmethod
    def parse_nvme_list(output: str) -> Dict[str, Any]:
        """Parse nvme list output"""
        devices = []
        lines = output.strip().split('\n')
        
        # Skip header lines
        data_lines = [line for line in lines if line.startswith('/dev/nvme')]
        
        for line in data_lines:
            parts = line.split()
            if len(parts) >= 3:
                device = {
                    'device_path': parts[0],
                    'namespace_id': parts[1] if len(parts) > 1 else '',
                    'model': ' '.join(parts[2:]) if len(parts) > 2 else ''
                }
                devices.append(device)
        
        return {
            'devices': devices,
            'device_count': len(devices),
            'parse_timestamp': datetime.now().isoformat()
        }
    
    @staticmethod
    def parse_error_counters(output: str) -> Dict[int, Dict[str, int]]:
        """Parse Atlas 3 switch error counter output"""
        port_errors = {}
        
        lines = output.strip().split('\n')
        for line in lines:
            if 'Port#' in line or line.strip() == '':
                continue
            
            parts = line.split()
            if len(parts) >= 7:
                try:
                    port_num = int(parts[0])
                    port_errors[port_num] = {
                        'PortRx': int(parts[1], 16),
                        'BadTLP': int(parts[2], 16),
                        'BadDLLP': int(parts[3], 16),
                        'RecDiag': int(parts[4], 16),
                        'LinkDown': int(parts[5], 16),
                        'FlitError': int(parts[6], 16)
                    }
                except (ValueError, IndexError):
                    continue
        
        return port_errors


class UnifiedTestingEngine:
    """
    Unified testing engine that properly handles all aspects of test execution
    """
    
    def __init__(self, com_manager=None, socket_io=None, max_workers: int = 8):
        """Initialize the unified testing engine"""
        self.com_manager = com_manager
        self.socket_io = socket_io
        self.max_workers = max_workers
        
        # Core execution management
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.active_tests: Dict[str, TestResult] = {}
        self.command_queue = queue.Queue()
        
        # Error monitoring
        self.error_monitoring_active = False
        self.error_baseline: Optional[Dict[int, Dict[str, int]]] = None
        
        # Atlas 3 device filtering
        self.atlas3_buses = self._discover_atlas3_buses()
        
        # Tool availability
        self.available_tools = self._check_tool_availability()
        
        # Parser instance
        self.parser = LinuxToolParser()
        
        logger.info(f"Unified Testing Engine initialized with {max_workers} workers")
        logger.info(f"Atlas 3 buses detected: {sorted(self.atlas3_buses)}")
        logger.info(f"Available tools: {list(self.available_tools.keys())}")
    
    def _discover_atlas3_buses(self) -> set:
        """Discover Atlas 3 downstream buses for device filtering"""
        atlas3_buses = set()
        
        try:
            result = subprocess.run(['lspci', '-nn'], capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                logger.warning("Failed to discover Atlas 3 buses")
                return atlas3_buses
            
            # Look for Atlas 3 devices (Broadcom 1000:c040)
            atlas3_bdfs = []
            for line in result.stdout.split('\n'):
                if '[1000:c040]' in line:
                    bdf_match = re.match(r'^([0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])', line)
                    if bdf_match:
                        atlas3_bdfs.append(bdf_match.group(1))
            
            # Get subordinate bus ranges for each Atlas 3 bridge
            for bdf in atlas3_bdfs:
                result = subprocess.run(['lspci', '-vvv', '-s', bdf], 
                                      capture_output=True, text=True, timeout=30)
                if result.returncode == 0:
                    bus_match = re.search(r'Bus:\s+primary=([0-9a-f]+),\s+secondary=([0-9a-f]+),\s+subordinate=([0-9a-f]+)',
                                        result.stdout)
                    if bus_match:
                        secondary = int(bus_match.group(2), 16)
                        subordinate = int(bus_match.group(3), 16)
                        atlas3_buses.update(range(secondary, subordinate + 1))
        
        except Exception as e:
            logger.error(f"Error discovering Atlas 3 buses: {e}")
        
        return atlas3_buses
    
    def _check_tool_availability(self) -> Dict[str, bool]:
        """Check availability of required Linux tools"""
        tools = {
            'lspci': ['lspci', '--version'],
            'setpci': ['setpci', '--version'],
            'fio': ['fio', '--version'],
            'nvme': ['nvme', 'version'],
            'smartctl': ['smartctl', '--version'],
            'dmesg': ['dmesg', '--version'],
            'journalctl': ['journalctl', '--version']
        }
        
        available = {}
        for tool, cmd in tools.items():
            try:
                result = subprocess.run(cmd, capture_output=True, timeout=5)
                available[tool] = result.returncode == 0
            except:
                available[tool] = False
        
        return available
    
    def is_device_atlas3_downstream(self, pci_address: str) -> bool:
        """Check if device is downstream of Atlas 3"""
        if not pci_address:
            return False
        
        # Extract bus number
        bus_str = pci_address.split(':')[1] if ':' in pci_address else pci_address.split(':')[0]
        try:
            bus_num = int(bus_str, 16)
            return bus_num in self.atlas3_buses
        except:
            return False
    
    def start_test(self, test_id: str, options: Dict[str, Any] = None) -> bool:
        """Start a test execution"""
        if test_id in self.active_tests:
            logger.warning(f"Test {test_id} is already running")
            return False
        
        # Create test result object
        test_result = TestResult(
            test_id=test_id,
            test_name=self._get_test_name(test_id),
            status=TestStatus.INITIALIZING,
            start_time=datetime.now()
        )
        
        self.active_tests[test_id] = test_result
        
        # Submit test execution to thread pool
        future = self.executor.submit(self._execute_test, test_id, options or {})
        
        logger.info(f"Started test: {test_id}")
        self._emit_progress(test_id, "Test started", {"status": "initializing"})
        
        return True
    
    def _get_test_name(self, test_id: str) -> str:
        """Get human-readable test name"""
        names = {
            'pcie_discovery': 'PCIe Topology Discovery',
            'nvme_discovery': 'NVMe Device Discovery',
            'link_training_time': 'Link Training Time Measurement',
            'link_retrain_count': 'Link Retrain Count Monitoring',
            'sequential_read_performance': 'Sequential Read Performance',
            'sequential_write_performance': 'Sequential Write Performance',
            'random_iops_performance': 'Random IOPS Performance',
            'link_quality': 'PCIe Link Quality Assessment'
        }
        return names.get(test_id, test_id.replace('_', ' ').title())
    
    def _execute_test(self, test_id: str, options: Dict[str, Any]):
        """Main test execution method"""
        test_result = self.active_tests[test_id]
        
        try:
            test_result.status = TestStatus.RUNNING
            self._emit_progress(test_id, "Initializing test", {"status": "running"})
            
            # Start error monitoring if supported
            if self.com_manager and test_id not in ['pcie_discovery', 'nvme_discovery']:
                self._start_error_monitoring(test_id)
            
            # Execute test-specific logic
            if test_id == 'pcie_discovery':
                self._execute_pcie_discovery(test_result, options)
            elif test_id == 'nvme_discovery':
                self._execute_nvme_discovery(test_result, options)
            elif test_id == 'link_training_time':
                self._execute_link_training_test(test_result, options)
            elif test_id == 'link_retrain_count':
                self._execute_link_retrain_test(test_result, options)
            elif test_id.endswith('_performance'):
                self._execute_performance_test(test_result, options)
            elif test_id == 'link_quality':
                self._execute_link_quality_test(test_result, options)
            else:
                raise ValueError(f"Unknown test type: {test_id}")
            
            # Finalize test
            test_result.status = TestStatus.COMPLETED
            test_result.end_time = datetime.now()
            test_result.duration_ms = test_result.end_time and int(
                (test_result.end_time - test_result.start_time).total_seconds() * 1000
            )
            
            self._generate_test_summary(test_result)
            
            logger.info(f"Test {test_id} completed successfully")
            self._emit_complete(test_id, test_result)
            
        except Exception as e:
            logger.error(f"Test {test_id} failed: {e}")
            test_result.status = TestStatus.FAILED
            test_result.errors.append(str(e))
            test_result.end_time = datetime.now()
            self._emit_error(test_id, str(e))
        
        finally:
            # Stop error monitoring
            if self.error_monitoring_active:
                self._stop_error_monitoring(test_id)
    
    def _execute_command(self, command: str, command_type: CommandType, timeout: int = 30, 
                        critical: bool = True, target_device: str = None) -> CommandExecution:
        """Execute a single command with proper error handling"""
        
        cmd_exec = CommandExecution(
            command=command,
            command_type=command_type,
            timeout=timeout,
            critical=critical,
            device_specific=target_device is not None,
            target_device=target_device,
            start_time=datetime.now()
        )
        
        logger.info(f"Executing {command_type.value} command: {command}")
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            cmd_exec.end_time = datetime.now()
            cmd_exec.exit_code = result.returncode
            cmd_exec.stdout = result.stdout
            cmd_exec.stderr = result.stderr
            
            # Parse output based on command type
            if result.returncode == 0 and result.stdout:
                cmd_exec.parsed_result = self._parse_command_output(command_type, result.stdout)
            
            logger.info(f"Command completed in {cmd_exec.duration_ms}ms with exit code {cmd_exec.exit_code}")
            
        except subprocess.TimeoutExpired:
            cmd_exec.end_time = datetime.now()
            cmd_exec.exit_code = -1
            cmd_exec.stderr = "Command timed out"
            logger.error(f"Command timed out: {command}")
            
        except Exception as e:
            cmd_exec.end_time = datetime.now()
            cmd_exec.exit_code = -2
            cmd_exec.stderr = str(e)
            logger.error(f"Command execution error: {e}")
        
        return cmd_exec
    
    def _parse_command_output(self, command_type: CommandType, output: str) -> Dict[str, Any]:
        """Parse command output based on type"""
        try:
            if command_type == CommandType.LSPCI:
                if '-vvv' in output[:100]:  # Check if verbose output
                    return self.parser.parse_lspci_verbose(output)
                elif '-t' in output[:50]:  # Tree format
                    return self.parser.parse_lspci_tree(output)
                else:
                    return {'raw_output': output}
            
            elif command_type == CommandType.FIO:
                return self.parser.parse_fio_json(output)
            
            elif command_type == CommandType.NVME_CLI:
                if 'list' in output[:100]:
                    return self.parser.parse_nvme_list(output)
                else:
                    return {'raw_output': output}
            
            else:
                return {'raw_output': output}
                
        except Exception as e:
            logger.error(f"Failed to parse {command_type.value} output: {e}")
            return {'parse_error': str(e), 'raw_output': output}
    
    def _execute_pcie_discovery(self, test_result: TestResult, options: Dict[str, Any]):
        """Execute PCIe Discovery test using the original PCIe Discovery class for compatibility"""
        self._emit_progress(test_result.test_id, "Initializing PCIe Discovery", {"phase": "initialization"})
        
        try:
            # Import and use the original PCIe Discovery class for proper parsing and compatibility
            from .pcie_discovery import PCIeDiscovery
            
            self._emit_progress(test_result.test_id, "Running PCIe topology discovery", {"phase": "discovery"})
            
            # Create PCIe Discovery instance and run the test
            pcie_discovery = PCIeDiscovery()
            discovery_result = pcie_discovery.run_discovery_test()
            
            self._emit_progress(test_result.test_id, "Processing PCIe discovery results", {"phase": "processing"})
            
            # Merge the original test result data into our unified result format
            test_result.test_data.update(discovery_result)
            
            # Log some basic statistics
            if 'topology' in discovery_result:
                topology = discovery_result['topology']
                bridge_count = len(topology.get('bridges', []))
                endpoint_count = len(topology.get('endpoints', []))
                atlas3_count = len(topology.get('atlas3_devices', []))
                
                logger.info(f"PCIe Discovery completed: {bridge_count} bridges, {endpoint_count} endpoints, {atlas3_count} Atlas 3 devices")
                
                if atlas3_count == 0:
                    test_result.warnings.append("No Atlas 3 devices found in PCIe topology")
                    
            # Copy any warnings or errors from the original test
            if 'warnings' in discovery_result:
                test_result.warnings.extend(discovery_result['warnings'])
            if 'errors' in discovery_result:
                test_result.errors.extend(discovery_result['errors'])
                
            self._emit_progress(test_result.test_id, "PCIe Discovery completed successfully", {"phase": "completed"})
            
        except ImportError as e:
            logger.error(f"Failed to import PCIeDiscovery class: {e}")
            test_result.errors.append(f"PCIe Discovery module not available: {str(e)}")
            raise RuntimeError(f"PCIe Discovery module not available: {str(e)}")
            
        except Exception as e:
            logger.error(f"PCIe Discovery test failed: {e}")
            test_result.errors.append(f"PCIe Discovery failed: {str(e)}")
            raise
    
    def _execute_nvme_discovery(self, test_result: TestResult, options: Dict[str, Any]):
        """Execute NVMe Discovery test using the original NVMe Discovery class for compatibility"""
        self._emit_progress(test_result.test_id, "Initializing NVMe Discovery", {"phase": "initialization"})
        
        try:
            # Import and use the original NVMe Discovery class for proper parsing and compatibility
            from .nvme_discovery import NVMeDiscovery
            
            self._emit_progress(test_result.test_id, "Running NVMe device discovery", {"phase": "discovery"})
            
            # Create NVMe Discovery instance and run the test
            nvme_discovery = NVMeDiscovery()
            discovery_result = nvme_discovery.run_discovery_test()
            
            self._emit_progress(test_result.test_id, "Processing NVMe discovery results", {"phase": "processing"})
            
            # Merge the original test result data into our unified result format
            test_result.test_data.update(discovery_result)
            
            # Log some basic statistics
            if 'controllers' in discovery_result:
                controller_count = len(discovery_result['controllers'])
                logger.info(f"NVMe Discovery completed: {controller_count} controllers found")
                
                if controller_count == 0:
                    test_result.warnings.append("No NVMe controllers found in system")
                    
            # Copy any warnings or errors from the original test
            if 'warnings' in discovery_result:
                test_result.warnings.extend(discovery_result['warnings'])
            if 'errors' in discovery_result:
                test_result.errors.extend(discovery_result['errors'])
                
            self._emit_progress(test_result.test_id, "NVMe Discovery completed successfully", {"phase": "completed"})
            
        except ImportError as e:
            logger.error(f"Failed to import NVMeDiscovery class: {e}")
            test_result.errors.append(f"NVMe Discovery module not available: {str(e)}")
            raise RuntimeError(f"NVMe Discovery module not available: {str(e)}")
            
        except Exception as e:
            logger.error(f"NVMe Discovery test failed: {e}")
            test_result.errors.append(f"NVMe Discovery failed: {str(e)}")
            raise
    
    def _is_nvme_atlas3_downstream(self, device_path: str) -> bool:
        """Check if NVMe device is Atlas 3 downstream"""
        try:
            # Get PCI address from NVMe device
            nvme_num = device_path.replace('/dev/nvme', '').replace('n1', '')
            sysfs_path = f'/sys/block/nvme{nvme_num}n1/device'
            
            if os.path.exists(sysfs_path):
                real_path = os.path.realpath(sysfs_path)
                # Extract PCI address from path
                pci_match = re.search(r'([0-9a-f]{4}:[0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])', real_path)
                if pci_match:
                    pci_address = pci_match.group(1)
                    return self.is_device_atlas3_downstream(pci_address)
        except:
            pass
        return False
    
    def _start_error_monitoring(self, test_id: str):
        """Start Atlas 3 error monitoring"""
        if not self.com_manager or not self.com_manager.is_connected():
            return
        
        try:
            # Reset counters
            self.com_manager.execute_command("counters-reset")
            time.sleep(1)
            
            # Get baseline
            response = self.com_manager.execute_command("counters")
            if response:
                self.error_baseline = self.parser.parse_error_counters(response)
                self.error_monitoring_active = True
                logger.info(f"Error monitoring started for test {test_id}")
        
        except Exception as e:
            logger.error(f"Failed to start error monitoring: {e}")
    
    def _stop_error_monitoring(self, test_id: str):
        """Stop error monitoring and capture final snapshot"""
        if not self.error_monitoring_active or not self.com_manager:
            return
        
        try:
            response = self.com_manager.execute_command("counters")
            if response and test_id in self.active_tests:
                final_errors = self.parser.parse_error_counters(response)
                test_result = self.active_tests[test_id]
                
                # Analyze error changes
                error_analysis = self._analyze_error_changes(self.error_baseline, final_errors)
                test_result.error_analysis = error_analysis
                test_result.error_baseline = self.error_baseline
                
                logger.info(f"Error monitoring stopped for test {test_id}")
        
        except Exception as e:
            logger.error(f"Failed to stop error monitoring: {e}")
        
        finally:
            self.error_monitoring_active = False
            self.error_baseline = None
    
    def _analyze_error_changes(self, baseline: Dict[int, Dict[str, int]], 
                             final: Dict[int, Dict[str, int]]) -> Dict[str, Any]:
        """Analyze error counter changes"""
        analysis = {
            'significant_increases': [],
            'total_errors_added': 0,
            'ports_with_errors': []
        }
        
        for port in final:
            if port in baseline:
                port_increases = {}
                for error_type in final[port]:
                    baseline_count = baseline[port].get(error_type, 0)
                    final_count = final[port][error_type]
                    increase = final_count - baseline_count
                    
                    if increase > 0:
                        port_increases[error_type] = increase
                        analysis['total_errors_added'] += increase
                        
                        if increase > 10:  # Significant threshold
                            analysis['significant_increases'].append({
                                'port': port,
                                'error_type': error_type,
                                'increase': increase,
                                'baseline': baseline_count,
                                'final': final_count
                            })
                
                if port_increases:
                    analysis['ports_with_errors'].append({
                        'port': port,
                        'errors': port_increases
                    })
        
        return analysis
    
    def _generate_test_summary(self, test_result: TestResult):
        """Generate human-readable test summary"""
        cmd_count = len(test_result.commands)
        successful_cmds = len([cmd for cmd in test_result.commands if cmd.exit_code == 0])
        
        summary_parts = [
            f"Executed {successful_cmds}/{cmd_count} commands successfully"
        ]
        
        if test_result.test_id == 'pcie_discovery':
            device_count = test_result.test_data.get('device_count', 0)
            atlas3_count = test_result.test_data.get('atlas3_device_count', 0)
            summary_parts.append(f"Discovered {device_count} PCIe devices ({atlas3_count} Atlas 3 downstream)")
        
        elif test_result.test_id == 'nvme_discovery':
            device_count = test_result.test_data.get('device_count', 0)
            atlas3_count = test_result.test_data.get('atlas3_device_count', 0)
            summary_parts.append(f"Discovered {device_count} NVMe devices ({atlas3_count} Atlas 3 downstream)")
        
        if test_result.error_analysis:
            total_errors = test_result.error_analysis.get('total_errors_added', 0)
            summary_parts.append(f"Switch errors: +{total_errors} total")
        
        duration_sec = test_result.duration_ms / 1000 if test_result.duration_ms else 0
        summary_parts.append(f"Completed in {duration_sec:.1f}s")
        
        test_result.summary = "; ".join(summary_parts)
    
    def _emit_progress(self, test_id: str, message: str, data: Dict[str, Any]):
        """Emit progress update via SocketIO"""
        if self.socket_io:
            try:
                self.socket_io.emit('test_progress', {
                    'test_id': test_id,
                    'message': message,
                    **data
                })
            except Exception as e:
                logger.error(f"Failed to emit progress: {e}")
    
    def _emit_complete(self, test_id: str, test_result: TestResult):
        """Emit test completion via SocketIO"""
        if self.socket_io:
            try:
                result_data = {
                    'test_id': test_id,
                    'test_name': test_result.test_name,
                    'status': test_result.status.value,
                    'start_time': test_result.start_time.isoformat(),
                    'end_time': test_result.end_time.isoformat() if test_result.end_time else None,
                    'duration_ms': test_result.duration_ms,
                    'summary': test_result.summary,
                    'warnings': test_result.warnings,
                    'errors': test_result.errors,
                    **test_result.test_data
                }
                
                self.socket_io.emit('test_complete', {
                    'test_id': test_id,
                    'result': result_data
                })
            except Exception as e:
                logger.error(f"Failed to emit completion: {e}")
    
    def _emit_error(self, test_id: str, error_message: str):
        """Emit test error via SocketIO"""
        if self.socket_io:
            try:
                self.socket_io.emit('test_error', {
                    'test_id': test_id,
                    'message': error_message
                })
            except Exception as e:
                logger.error(f"Failed to emit error: {e}")
    
    def get_test_status(self, test_id: str) -> Optional[Dict[str, Any]]:
        """Get current test status"""
        if test_id not in self.active_tests:
            return None
        
        test_result = self.active_tests[test_id]
        return {
            'test_id': test_id,
            'test_name': test_result.test_name,
            'status': test_result.status.value,
            'start_time': test_result.start_time.isoformat(),
            'commands_completed': len(test_result.commands),
            'current_phase': 'running'
        }
    
    def get_test_result(self, test_id: str) -> Optional[Dict[str, Any]]:
        """Get final test result"""
        if test_id not in self.active_tests:
            return None
        
        test_result = self.active_tests[test_id]
        if test_result.status not in [TestStatus.COMPLETED, TestStatus.FAILED]:
            return None
        
        return {
            'test_id': test_id,
            'test_name': test_result.test_name,
            'status': test_result.status.value,
            'start_time': test_result.start_time.isoformat(),
            'end_time': test_result.end_time.isoformat() if test_result.end_time else None,
            'duration_ms': test_result.duration_ms,
            'summary': test_result.summary,
            'warnings': test_result.warnings,
            'errors': test_result.errors,
            **test_result.test_data
        }
    
    def shutdown(self):
        """Shutdown the testing engine"""
        logger.info("Shutting down Unified Testing Engine...")
        self.executor.shutdown(wait=True, timeout=30)
        logger.info("Unified Testing Engine shutdown complete")


# Compatibility function for existing integration
def create_testing_engine(com_manager=None, socket_io=None) -> UnifiedTestingEngine:
    """Create and return a unified testing engine instance"""
    return UnifiedTestingEngine(com_manager=com_manager, socket_io=socket_io)