#!/usr/bin/env python3
"""
Sequential Read Performance Test for CalypsoPy+
Tests NVMe sequential read performance using fio with PCIe 6.x compliance validation
"""

import os
import time
import logging
import platform
from typing import Dict, List, Any, Optional, Callable
from datetime import datetime
from dataclasses import dataclass, field

try:
    from .fio_utilities import FioUtilities, FioJobConfig, FioResult
    from .nvme_smart_monitor import NVMeSMARTMonitor, SMARTData
except ImportError:
    from fio_utilities import FioUtilities, FioJobConfig, FioResult
    from nvme_smart_monitor import NVMeSMARTMonitor, SMARTData

logger = logging.getLogger(__name__)


@dataclass
class PCIe6ComplianceThresholds:
    """PCIe 6.x specification compliance thresholds for sequential read"""
    # Based on PCIe 6.0 specification for different lane configurations
    gen6_x16_min_throughput: float = 120000.0  # MB/s (theoretical ~126 GB/s)
    gen6_x8_min_throughput: float = 60000.0   # MB/s (theoretical ~63 GB/s)
    gen6_x4_min_throughput: float = 30000.0   # MB/s (theoretical ~31.5 GB/s)
    gen6_x2_min_throughput: float = 15000.0   # MB/s (theoretical ~15.75 GB/s)
    gen6_x1_min_throughput: float = 7500.0    # MB/s (theoretical ~7.87 GB/s)
    
    gen5_x16_min_throughput: float = 60000.0  # MB/s (theoretical ~63 GB/s)
    gen5_x8_min_throughput: float = 30000.0   # MB/s (theoretical ~31.5 GB/s)
    gen5_x4_min_throughput: float = 15000.0   # MB/s (theoretical ~15.75 GB/s)
    gen5_x2_min_throughput: float = 7500.0    # MB/s (theoretical ~7.87 GB/s)
    gen5_x1_min_throughput: float = 3750.0    # MB/s (theoretical ~3.93 GB/s)
    
    gen4_x16_min_throughput: float = 30000.0  # MB/s (theoretical ~31.5 GB/s)
    gen4_x8_min_throughput: float = 15000.0   # MB/s (theoretical ~15.75 GB/s)
    gen4_x4_min_throughput: float = 7500.0    # MB/s (theoretical ~7.87 GB/s)
    gen4_x2_min_throughput: float = 3750.0    # MB/s (theoretical ~3.93 GB/s)
    gen4_x1_min_throughput: float = 1875.0    # MB/s (theoretical ~1.97 GB/s)
    
    # Latency thresholds (microseconds)
    max_avg_latency_us: float = 1000.0        # 1ms max average latency
    max_p95_latency_us: float = 5000.0        # 5ms max 95th percentile
    max_p99_latency_us: float = 10000.0       # 10ms max 99th percentile
    
    # CPU utilization thresholds
    max_cpu_utilization: float = 80.0         # 80% max CPU usage


@dataclass
class SequentialReadTestResult:
    """Results from sequential read performance test"""
    test_name: str = "Sequential Read Performance"
    status: str = "unknown"  # pass, fail, warning, error
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None
    duration_seconds: float = 0.0
    
    # Test configuration
    device: str = ""
    device_info: Dict[str, Any] = field(default_factory=dict)
    block_size: str = "128k"
    queue_depth: int = 32
    runtime_seconds: int = 60
    
    # Performance metrics
    throughput_mbps: float = 0.0
    iops: float = 0.0
    avg_latency_us: float = 0.0
    p50_latency_us: float = 0.0
    p90_latency_us: float = 0.0
    p95_latency_us: float = 0.0
    p99_latency_us: float = 0.0
    cpu_utilization: float = 0.0
    
    # Compliance validation
    compliance_status: str = "unknown"  # compliant, non_compliant, unknown
    detected_pcie_gen: str = "unknown"
    detected_pcie_lanes: str = "unknown"
    expected_min_throughput: float = 0.0
    throughput_efficiency: float = 0.0  # Actual / Theoretical * 100
    
    # Validation results
    validations: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    
    # Raw test data
    fio_results: List[FioResult] = field(default_factory=list)
    raw_output: Dict[str, Any] = field(default_factory=dict)


class SequentialReadPerformanceTest:
    """
    Sequential Read Performance Test
    
    Tests NVMe sequential read performance and validates against PCIe 6.x specifications
    """

    def __init__(self):
        self.fio_utils = FioUtilities()
        self.compliance_thresholds = PCIe6ComplianceThresholds()
        self.test_id = None
        self.running = False
        
    def get_system_info(self) -> Dict[str, Any]:
        """Get system information for the test"""
        return {
            'platform': platform.platform(),
            'processor': platform.processor(),
            'architecture': platform.architecture(),
            'fio_available': self.fio_utils.has_fio,
            'fio_info': self.fio_utils.check_fio_availability() if self.fio_utils.has_fio else None
        }

    def detect_device_pcie_info(self, device_path: str, discovered_devices: List[Dict] = None) -> Dict[str, Any]:
        """
        Detect PCIe generation and lane configuration for device
        
        Args:
            device_path: Device path (e.g., '/dev/nvme0n1')
            discovered_devices: Previously discovered NVMe devices from discovery test
            
        Returns:
            Dictionary with PCIe information
        """
        pcie_info = {
            'generation': 'unknown',
            'lanes': 'unknown',
            'device_name': 'unknown',
            'vendor': 'unknown',
            'model': 'unknown'
        }
        
        # Extract device identifier from path (e.g., nvme0n1 -> nvme0)
        device_id = device_path.split('/')[-1]
        if device_id.endswith('n1'):
            device_id = device_id[:-2]  # Remove 'n1' suffix
            
        # Try to match with discovered devices
        if discovered_devices:
            for device in discovered_devices:
                device_name = device.get('device', '')
                if device_id in device_name or device_name in device_id:
                    pcie_info.update({
                        'device_name': device.get('device', 'unknown'),
                        'vendor': device.get('vendor', 'unknown'),
                        'model': device.get('model', 'unknown'),
                        'pci_address': device.get('pci_address', 'unknown')
                    })
                    
                    # Try to extract PCIe info from device data
                    if 'pcie_info' in device:
                        pcie_data = device['pcie_info']
                        pcie_info['generation'] = pcie_data.get('generation', 'unknown')
                        pcie_info['lanes'] = pcie_data.get('lanes', 'unknown')
                    break
        
        # If not found in discovered devices, try to detect from system
        if pcie_info['generation'] == 'unknown':
            try:
                # Try to read from sysfs (Linux)
                sysfs_path = f"/sys/block/{device_id.replace('/dev/', '')}"
                if os.path.exists(sysfs_path):
                    # This is a simplified detection - real implementation would parse lspci output
                    pcie_info['generation'] = 'Gen4'  # Default assumption
                    pcie_info['lanes'] = 'x4'  # Default assumption
            except Exception as e:
                logger.warning(f"Could not detect PCIe info for {device_path}: {str(e)}")
        
        return pcie_info

    def get_expected_throughput(self, pcie_gen: str, pcie_lanes: str) -> float:
        """Get expected minimum throughput based on PCIe configuration"""
        gen_key = pcie_gen.lower().replace('gen', 'gen')
        lanes_num = pcie_lanes.lower().replace('x', '')
        
        throughput_map = {
            'gen6': {
                '16': self.compliance_thresholds.gen6_x16_min_throughput,
                '8': self.compliance_thresholds.gen6_x8_min_throughput,
                '4': self.compliance_thresholds.gen6_x4_min_throughput,
                '2': self.compliance_thresholds.gen6_x2_min_throughput,
                '1': self.compliance_thresholds.gen6_x1_min_throughput,
            },
            'gen5': {
                '16': self.compliance_thresholds.gen5_x16_min_throughput,
                '8': self.compliance_thresholds.gen5_x8_min_throughput,
                '4': self.compliance_thresholds.gen5_x4_min_throughput,
                '2': self.compliance_thresholds.gen5_x2_min_throughput,
                '1': self.compliance_thresholds.gen5_x1_min_throughput,
            },
            'gen4': {
                '16': self.compliance_thresholds.gen4_x16_min_throughput,
                '8': self.compliance_thresholds.gen4_x8_min_throughput,
                '4': self.compliance_thresholds.gen4_x4_min_throughput,
                '2': self.compliance_thresholds.gen4_x2_min_throughput,
                '1': self.compliance_thresholds.gen4_x1_min_throughput,
            }
        }
        
        return throughput_map.get(gen_key, {}).get(lanes_num, 1000.0)  # Default 1GB/s minimum

    def validate_performance(self, result: SequentialReadTestResult) -> SequentialReadTestResult:
        """Validate performance against PCIe 6.x specifications"""
        validations = []
        
        # Throughput validation
        throughput_validation = {
            'metric': 'throughput',
            'actual': result.throughput_mbps,
            'expected_min': result.expected_min_throughput,
            'status': 'pass' if result.throughput_mbps >= result.expected_min_throughput else 'fail',
            'description': f'Sequential read throughput ({result.throughput_mbps:.1f} MB/s vs {result.expected_min_throughput:.1f} MB/s minimum)'
        }
        validations.append(throughput_validation)
        
        # Latency validations
        latency_validations = [
            {
                'metric': 'avg_latency',
                'actual': result.avg_latency_us,
                'expected_max': self.compliance_thresholds.max_avg_latency_us,
                'status': 'pass' if result.avg_latency_us <= self.compliance_thresholds.max_avg_latency_us else 'fail',
                'description': f'Average latency ({result.avg_latency_us:.1f} μs vs {self.compliance_thresholds.max_avg_latency_us:.1f} μs maximum)'
            },
            {
                'metric': 'p95_latency',
                'actual': result.p95_latency_us,
                'expected_max': self.compliance_thresholds.max_p95_latency_us,
                'status': 'pass' if result.p95_latency_us <= self.compliance_thresholds.max_p95_latency_us else 'fail',
                'description': f'95th percentile latency ({result.p95_latency_us:.1f} μs vs {self.compliance_thresholds.max_p95_latency_us:.1f} μs maximum)'
            },
            {
                'metric': 'p99_latency',
                'actual': result.p99_latency_us,
                'expected_max': self.compliance_thresholds.max_p99_latency_us,
                'status': 'pass' if result.p99_latency_us <= self.compliance_thresholds.max_p99_latency_us else 'fail',
                'description': f'99th percentile latency ({result.p99_latency_us:.1f} μs vs {self.compliance_thresholds.max_p99_latency_us:.1f} μs maximum)'
            }
        ]
        validations.extend(latency_validations)
        
        # CPU utilization validation
        cpu_validation = {
            'metric': 'cpu_utilization',
            'actual': result.cpu_utilization,
            'expected_max': self.compliance_thresholds.max_cpu_utilization,
            'status': 'pass' if result.cpu_utilization <= self.compliance_thresholds.max_cpu_utilization else 'warning',
            'description': f'CPU utilization ({result.cpu_utilization:.1f}% vs {self.compliance_thresholds.max_cpu_utilization:.1f}% recommended maximum)'
        }
        validations.append(cpu_validation)
        
        result.validations = validations
        
        # Determine overall compliance status
        failed_critical = sum(1 for v in validations if v['status'] == 'fail' and v['metric'] in ['throughput', 'avg_latency'])
        failed_any = sum(1 for v in validations if v['status'] == 'fail')
        warnings = sum(1 for v in validations if v['status'] == 'warning')
        
        if failed_critical > 0:
            result.compliance_status = 'non_compliant'
            result.status = 'fail'
        elif failed_any > 0:
            result.compliance_status = 'non_compliant'
            result.status = 'warning'
        elif warnings > 0:
            result.compliance_status = 'compliant'
            result.status = 'warning'
        else:
            result.compliance_status = 'compliant'
            result.status = 'pass'
            
        return result

    def run_performance_test(self, 
                           device: str,
                           runtime_seconds: int = 60,
                           block_size: str = "128k",
                           queue_depth: int = 32,
                           discovered_devices: List[Dict] = None,
                           progress_callback: Optional[Callable] = None,
                           real_time_callback: Optional[Callable] = None,
                           monitor_smart: bool = True,
                           smart_interval: float = 5.0) -> SequentialReadTestResult:
        """
        Run sequential read performance test
        
        Args:
            device: Device path (e.g., '/dev/nvme0n1')
            runtime_seconds: Test duration in seconds (user configurable)
            block_size: Block size for test (default: 128k)
            queue_depth: IO queue depth (default: 32)
            discovered_devices: Previously discovered NVMe devices
            progress_callback: Optional callback for progress updates
            real_time_callback: Optional callback for real-time metrics
            
        Returns:
            Test results with performance metrics and compliance validation
        """
        result = SequentialReadTestResult()
        result.device = device
        result.block_size = block_size
        result.queue_depth = queue_depth
        result.runtime_seconds = runtime_seconds
        result.start_time = datetime.now()
        
        self.running = True
        self.test_id = f"seq_read_{int(time.time())}"
        
        try:
            # Check fio availability
            if not self.fio_utils.has_fio:
                result.status = 'error'
                result.errors.append('fio not available on system')
                return result
            
            # Detect device PCIe information
            result.device_info = self.detect_device_pcie_info(device, discovered_devices)
            result.detected_pcie_gen = result.device_info.get('generation', 'unknown')
            result.detected_pcie_lanes = result.device_info.get('lanes', 'unknown')
            result.expected_min_throughput = self.get_expected_throughput(
                result.detected_pcie_gen, 
                result.detected_pcie_lanes
            )
            
            logger.info(f"Starting sequential read test on {device}")
            logger.info(f"Configuration: {block_size} blocks, QD={queue_depth}, runtime={runtime_seconds}s")
            logger.info(f"Detected PCIe: {result.detected_pcie_gen} {result.detected_pcie_lanes}")
            
            if progress_callback:
                progress_callback({
                    'status': 'running',
                    'message': f'Running sequential read test on {device}',
                    'device': device,
                    'test_id': self.test_id,
                    'runtime': runtime_seconds
                })
            
            # Create fio job
            job = self.fio_utils.create_sequential_read_job(
                block_size=block_size,
                runtime=runtime_seconds,
                queue_depth=queue_depth
            )
            
            # Run fio test
            fio_result = self.fio_utils.run_fio_test(
                device=device,
                jobs=[job],
                progress_callback=progress_callback,
                real_time_callback=real_time_callback
            )
            
            if not fio_result['success']:
                result.status = 'error'
                result.errors.append(f"fio test failed: {fio_result.get('error', 'Unknown error')}")
                return result
            
            # Parse fio results
            if fio_result['results']:
                fio_res = fio_result['results'][0]  # Get first (and only) job result
                result.fio_results = fio_result['results']
                
                # Extract performance metrics
                result.throughput_mbps = fio_res.read_bw
                result.iops = fio_res.read_iops
                result.avg_latency_us = fio_res.read_lat_mean
                result.p50_latency_us = fio_res.read_lat_p50
                result.p90_latency_us = fio_res.read_lat_p90
                result.p95_latency_us = fio_res.read_lat_p95
                result.p99_latency_us = fio_res.read_lat_p99
                result.cpu_utilization = fio_res.cpu_usr + fio_res.cpu_sys
                
                # Calculate efficiency
                if result.expected_min_throughput > 0:
                    result.throughput_efficiency = (result.throughput_mbps / result.expected_min_throughput) * 100
                
                result.raw_output = fio_result
                
                logger.info(f"Test completed: {result.throughput_mbps:.1f} MB/s, {result.iops:.0f} IOPS")
            else:
                result.status = 'error'
                result.errors.append('No fio results received')
                return result
            
            # Validate performance against PCIe 6.x specifications
            result = self.validate_performance(result)
            
            if progress_callback:
                progress_callback({
                    'status': 'completed',
                    'message': f'Sequential read test completed on {device}',
                    'device': device,
                    'test_id': self.test_id,
                    'result': result
                })
            
        except Exception as e:
            logger.error(f"Error during sequential read test: {str(e)}")
            result.status = 'error'
            result.errors.append(f"Test execution error: {str(e)}")
        
        finally:
            result.end_time = datetime.now()
            result.duration_seconds = (result.end_time - result.start_time).total_seconds()
            self.running = False
        
        return result

    def run_sequential_read_test(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Main test entry point for test runner integration
        
        Args:
            options: Test configuration options
            
        Returns:
            Test result dictionary
        """
        if options is None:
            options = {}
        
        # Extract configuration from options
        device = options.get('device', '/dev/nvme0n1')
        runtime_seconds = options.get('runtime_seconds', 60)  # User configurable
        block_size = options.get('block_size', '128k')
        queue_depth = options.get('queue_depth', 32)
        discovered_devices = options.get('discovered_devices', [])
        
        # Run the test
        result = self.run_performance_test(
            device=device,
            runtime_seconds=runtime_seconds,
            block_size=block_size,
            queue_depth=queue_depth,
            discovered_devices=discovered_devices
        )
        
        # Convert to dictionary format for test runner
        return {
            'test_name': result.test_name,
            'status': result.status,
            'start_time': result.start_time.isoformat(),
            'end_time': result.end_time.isoformat() if result.end_time else None,
            'duration_seconds': result.duration_seconds,
            'device': result.device,
            'device_info': result.device_info,
            'configuration': {
                'block_size': result.block_size,
                'queue_depth': result.queue_depth,
                'runtime_seconds': result.runtime_seconds
            },
            'performance_metrics': {
                'throughput_mbps': result.throughput_mbps,
                'iops': result.iops,
                'avg_latency_us': result.avg_latency_us,
                'p95_latency_us': result.p95_latency_us,
                'p99_latency_us': result.p99_latency_us,
                'cpu_utilization': result.cpu_utilization,
                'throughput_efficiency': result.throughput_efficiency
            },
            'compliance': {
                'status': result.compliance_status,
                'detected_pcie_gen': result.detected_pcie_gen,
                'detected_pcie_lanes': result.detected_pcie_lanes,
                'expected_min_throughput': result.expected_min_throughput,
                'validations': result.validations
            },
            'warnings': result.warnings,
            'errors': result.errors,
            'raw_data': result.raw_output
        }


# For direct execution
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    test = SequentialReadPerformanceTest()
    
    # Example test run
    print("=" * 80)
    print("CalypsoPy+ Sequential Read Performance Test")
    print("=" * 80)
    
    if not test.fio_utils.has_fio:
        print("❌ fio not available - cannot run performance tests")
        exit(1)
    
    # Test with user-configurable runtime
    runtime = input("Enter test runtime in seconds (default 30): ").strip()
    try:
        runtime = int(runtime) if runtime else 30
    except ValueError:
        runtime = 30
    
    device = input("Enter device path (default /dev/nvme0n1): ").strip()
    if not device:
        device = "/dev/nvme0n1"
    
    print(f"\nRunning {runtime}s sequential read test on {device}...")
    
    def progress_update(update):
        print(f"[{update.get('status', 'unknown').upper()}] {update.get('message', '')}")
    
    options = {
        'device': device,
        'runtime_seconds': runtime,
        'block_size': '128k',
        'queue_depth': 32
    }
    
    result = test.run_sequential_read_test(options)
    
    print("\n" + "=" * 80)
    print("Test Results")
    print("=" * 80)
    print(f"Status: {result['status'].upper()}")
    print(f"Throughput: {result['performance_metrics']['throughput_mbps']:.1f} MB/s")
    print(f"IOPS: {result['performance_metrics']['iops']:.0f}")
    print(f"Compliance: {result['compliance']['status'].upper()}")
    
    if result.get('errors'):
        print("\nErrors:")
        for error in result['errors']:
            print(f"  - {error}")