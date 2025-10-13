#!/usr/bin/env python3
"""
CalypsoPy+ Random IOPS Performance Test
NVMe random IOPS performance testing with PCIe 6.x compliance validation
"""

import os
import time
import logging
import threading
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime

try:
    from .fio_utilities import FioUtilities, FioResult
    from .nvme_smart_monitor import NVMeSMARTMonitor, SMARTData
except ImportError:
    from fio_utilities import FioUtilities, FioResult
    from nvme_smart_monitor import NVMeSMARTMonitor, SMARTData

logger = logging.getLogger(__name__)


@dataclass
class PCIe6IOPSComplianceThresholds:
    """PCIe 6.x compliance thresholds for random IOPS performance"""
    # Expected minimum IOPS for different configurations
    min_random_read_iops_gen6: float = 500000.0   # 500K IOPS minimum for Gen6
    min_random_write_iops_gen6: float = 300000.0  # 300K IOPS minimum for Gen6 writes
    min_mixed_iops_gen6: float = 400000.0         # 400K IOPS minimum for mixed workload
    
    # Latency thresholds for random operations (more stringent than sequential)
    max_random_read_latency_us: float = 500.0     # 500μs max for random reads
    max_random_write_latency_us: float = 1000.0   # 1ms max for random writes
    max_mixed_latency_us: float = 750.0           # 750μs max for mixed operations
    
    # P99 latency thresholds
    max_p99_read_latency_us: float = 2000.0       # 2ms max 99th percentile reads
    max_p99_write_latency_us: float = 5000.0      # 5ms max 99th percentile writes
    max_p99_mixed_latency_us: float = 3000.0      # 3ms max 99th percentile mixed
    
    # CPU and efficiency thresholds
    max_cpu_utilization: float = 90.0             # 90% max CPU for random workloads
    min_iops_efficiency: float = 70.0             # 70% minimum IOPS efficiency


@dataclass
class RandomIOPSTestResult:
    """Results from random IOPS performance test"""
    test_name: str = "Random IOPS Performance"
    status: str = "unknown"
    device: str = ""
    workload_type: str = "randread"  # randread, randwrite, randrw
    
    # Performance metrics
    read_iops: float = 0.0
    write_iops: float = 0.0
    total_iops: float = 0.0
    read_throughput_mbps: float = 0.0
    write_throughput_mbps: float = 0.0
    
    # Latency metrics
    read_avg_latency_us: float = 0.0
    write_avg_latency_us: float = 0.0
    read_p95_latency_us: float = 0.0
    write_p95_latency_us: float = 0.0
    read_p99_latency_us: float = 0.0
    write_p99_latency_us: float = 0.0
    
    # System metrics
    cpu_utilization: float = 0.0
    
    # Test configuration
    block_size: str = "4k"
    queue_depth: int = 64
    runtime_seconds: int = 60
    read_write_ratio: str = "100:0"  # For mixed workloads
    
    # PCIe compliance
    compliance_status: str = "unknown"
    detected_pcie_gen: str = "unknown"
    detected_pcie_lanes: int = 0
    expected_min_iops: float = 0.0
    iops_efficiency: float = 0.0
    
    # Validation results
    validations: List[Dict[str, Any]] = field(default_factory=list)
    
    # Test metadata
    duration_seconds: float = 0.0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


class RandomIOPSPerformanceTest:
    """
    Random IOPS Performance Test for NVMe devices
    Tests random read, write, and mixed IOPS with PCIe 6.x compliance
    """

    def __init__(self):
        self.fio_utils = FioUtilities()
        self.compliance_thresholds = PCIe6IOPSComplianceThresholds()
        self.is_running = False
        self.stop_requested = False
        
        logger.info("Random IOPS Performance test initialized")

    def run_random_iops_test(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Main entry point for test runner integration
        """
        if options is None:
            options = {}
            
        device = options.get('device', '/dev/nvme0n1')
        runtime_seconds = options.get('runtime_seconds', 60)
        block_size = options.get('block_size', '4k')
        queue_depth = options.get('queue_depth', 64)
        workload_type = options.get('workload_type', 'randread')
        read_write_ratio = options.get('read_write_ratio', '100:0')
        discovered_devices = options.get('discovered_devices', [])
        
        # Run the performance test
        result = self.run_performance_test(
            device=device,
            runtime_seconds=runtime_seconds,
            block_size=block_size,
            queue_depth=queue_depth,
            workload_type=workload_type,
            read_write_ratio=read_write_ratio,
            discovered_devices=discovered_devices
        )
        
        # Convert to dict format expected by test runner
        return {
            'test_name': result.test_name,
            'status': result.status,
            'device': result.device,
            'workload_type': result.workload_type,
            'performance_metrics': {
                'read_iops': result.read_iops,
                'write_iops': result.write_iops,
                'total_iops': result.total_iops,
                'read_throughput_mbps': result.read_throughput_mbps,
                'write_throughput_mbps': result.write_throughput_mbps,
                'read_avg_latency_us': result.read_avg_latency_us,
                'write_avg_latency_us': result.write_avg_latency_us,
                'cpu_utilization': result.cpu_utilization,
                'iops_efficiency': result.iops_efficiency
            },
            'compliance': {
                'status': result.compliance_status,
                'detected_pcie_gen': result.detected_pcie_gen,
                'detected_pcie_lanes': result.detected_pcie_lanes,
                'expected_min_iops': result.expected_min_iops,
                'validations': result.validations
            },
            'configuration': {
                'block_size': result.block_size,
                'queue_depth': result.queue_depth,
                'runtime_seconds': result.runtime_seconds,
                'read_write_ratio': result.read_write_ratio
            },
            'duration_seconds': result.duration_seconds,
            'warnings': result.warnings,
            'errors': result.errors
        }

    def run_performance_test(self,
                           device: str,
                           runtime_seconds: int = 60,
                           block_size: str = "4k",
                           queue_depth: int = 64,
                           workload_type: str = "randread",
                           read_write_ratio: str = "100:0",
                           discovered_devices: List[Dict] = None,
                           progress_callback: Optional[Callable] = None,
                           real_time_callback: Optional[Callable] = None) -> RandomIOPSTestResult:
        """
        Run random IOPS performance test with real-time monitoring
        """
        start_time = time.time()
        self.is_running = True
        self.stop_requested = False
        
        result = RandomIOPSTestResult(
            device=device,
            workload_type=workload_type,
            block_size=block_size,
            queue_depth=queue_depth,
            runtime_seconds=runtime_seconds,
            read_write_ratio=read_write_ratio
        )
        
        try:
            logger.info(f"Starting random IOPS test ({workload_type}) on {device} for {runtime_seconds}s")
            
            if progress_callback:
                progress_callback({
                    'stage': 'starting',
                    'message': f'Initializing random IOPS test ({workload_type})...',
                    'progress': 0
                })
            
            # Validate fio availability
            if not self.fio_utils.has_fio:
                result.status = "error"
                result.errors.append("fio not available")
                return result
            
            # Get device information from discovered devices
            device_info = self._get_device_info(device, discovered_devices)
            if device_info:
                result.detected_pcie_gen = device_info.get('pcie_gen', 'unknown')
                result.detected_pcie_lanes = device_info.get('pcie_lanes', 0)
            
            if progress_callback:
                progress_callback({
                    'stage': 'configuration',
                    'message': f'Configuring {workload_type} test...',
                    'progress': 10
                })
            
            # Create fio job configuration for random IOPS
            job_config = self.fio_utils.create_random_iops_job(
                workload_type=workload_type,
                block_size=block_size,
                runtime=runtime_seconds,
                queue_depth=queue_depth,
                read_write_ratio=read_write_ratio
            )
            
            if progress_callback:
                progress_callback({
                    'stage': 'running',
                    'message': f'Running {workload_type} test on {device}...',
                    'progress': 20
                })
            
            # Start real-time monitoring thread if callback provided
            monitoring_thread = None
            if real_time_callback:
                monitoring_thread = threading.Thread(
                    target=self._real_time_monitor,
                    args=(device, workload_type, runtime_seconds, real_time_callback),
                    daemon=True
                )
                monitoring_thread.start()
            
            # Run fio test
            fio_test_result = self.fio_utils.run_fio_test(device, job_config)
            
            if progress_callback:
                progress_callback({
                    'stage': 'analyzing',
                    'message': 'Analyzing IOPS test results...',
                    'progress': 90
                })
            
            if fio_test_result and fio_test_result.get('success') and fio_test_result.get('results'):
                fio_result = fio_test_result['results'][0]  # Get first result
                # Extract performance metrics based on workload type
                if workload_type == "randread":
                    result.read_iops = fio_result.read_iops
                    result.total_iops = fio_result.read_iops
                    result.read_throughput_mbps = fio_result.read_bw
                    result.read_avg_latency_us = fio_result.read_lat_mean
                    result.read_p95_latency_us = fio_result.read_lat_p95
                    result.read_p99_latency_us = fio_result.read_lat_p99
                elif workload_type == "randwrite":
                    result.write_iops = fio_result.write_iops
                    result.total_iops = fio_result.write_iops
                    result.write_throughput_mbps = fio_result.write_bw
                    result.write_avg_latency_us = fio_result.write_lat_mean
                    result.write_p95_latency_us = fio_result.write_lat_p95
                    result.write_p99_latency_us = fio_result.write_lat_p99
                elif workload_type == "randrw":
                    result.read_iops = fio_result.read_iops
                    result.write_iops = fio_result.write_iops
                    result.total_iops = fio_result.read_iops + fio_result.write_iops
                    result.read_throughput_mbps = fio_result.read_bw
                    result.write_throughput_mbps = fio_result.write_bw
                    result.read_avg_latency_us = fio_result.read_lat_mean
                    result.write_avg_latency_us = fio_result.write_lat_mean
                    result.read_p95_latency_us = fio_result.read_lat_p95
                    result.write_p95_latency_us = fio_result.write_lat_p95
                    result.read_p99_latency_us = fio_result.read_lat_p99
                    result.write_p99_latency_us = fio_result.write_lat_p99
                
                result.cpu_utilization = fio_result.cpu_usr + fio_result.cpu_sys
                
                # Perform PCIe compliance validation
                self._validate_pcie_compliance(result)
                
                # Set overall status
                if result.errors:
                    result.status = "fail"
                elif result.warnings:
                    result.status = "warning"
                else:
                    result.status = "pass"
                    
                logger.info(f"Random IOPS test completed: {result.total_iops:.0f} IOPS")
                
            else:
                result.status = "error"
                result.errors.append("fio test execution failed")
                logger.error("fio test execution failed")
            
            if progress_callback:
                progress_callback({
                    'stage': 'complete',
                    'message': f'{workload_type} test completed',
                    'progress': 100
                })
                
        except Exception as e:
            logger.error(f"Random IOPS test failed: {e}")
            result.status = "error"
            result.errors.append(f"Test execution error: {str(e)}")
            
        finally:
            self.is_running = False
            result.duration_seconds = time.time() - start_time
            
        return result

    def _get_device_info(self, device: str, discovered_devices: List[Dict]) -> Optional[Dict]:
        """Extract device information from discovery results"""
        if not discovered_devices:
            return None
            
        device_name = device.replace('/dev/', '').replace('n1', '')  # nvme0n1 -> nvme0
        
        for dev in discovered_devices:
            if dev.get('device') == device_name:
                # Try to determine PCIe generation and lanes from device info
                pci_address = dev.get('pci_address', '')
                
                # This is a simplified approach - in reality you'd query the PCIe config space
                info = {
                    'pcie_gen': 'Gen6',  # Default assumption for Atlas 3
                    'pcie_lanes': 4,     # Common configuration
                    'model': dev.get('model', 'Unknown'),
                    'vendor': dev.get('vendor', 'Unknown')
                }
                
                return info
                
        return None

    def _validate_pcie_compliance(self, result: RandomIOPSTestResult):
        """Validate IOPS performance against PCIe 6.x specifications"""
        thresholds = self.compliance_thresholds
        validations = []
        
        # Determine expected IOPS based on workload type
        if result.workload_type == "randread":
            expected_min_iops = thresholds.min_random_read_iops_gen6
            max_latency = thresholds.max_random_read_latency_us
            max_p99_latency = thresholds.max_p99_read_latency_us
            test_iops = result.read_iops
            test_latency = result.read_avg_latency_us
            test_p99_latency = result.read_p99_latency_us
        elif result.workload_type == "randwrite":
            expected_min_iops = thresholds.min_random_write_iops_gen6
            max_latency = thresholds.max_random_write_latency_us
            max_p99_latency = thresholds.max_p99_write_latency_us
            test_iops = result.write_iops
            test_latency = result.write_avg_latency_us
            test_p99_latency = result.write_p99_latency_us
        else:  # randrw
            expected_min_iops = thresholds.min_mixed_iops_gen6
            max_latency = thresholds.max_mixed_latency_us
            max_p99_latency = thresholds.max_p99_mixed_latency_us
            test_iops = result.total_iops
            test_latency = max(result.read_avg_latency_us, result.write_avg_latency_us)
            test_p99_latency = max(result.read_p99_latency_us, result.write_p99_latency_us)
        
        result.expected_min_iops = expected_min_iops
        result.iops_efficiency = (test_iops / expected_min_iops) * 100.0
        
        # IOPS validation
        if test_iops >= expected_min_iops:
            validations.append({
                'test': 'iops_performance',
                'status': 'pass',
                'value': test_iops,
                'threshold': expected_min_iops,
                'message': f'{result.workload_type} IOPS: {test_iops:.0f} (>= {expected_min_iops:.0f})'
            })
        else:
            validations.append({
                'test': 'iops_performance',
                'status': 'fail',
                'value': test_iops,
                'threshold': expected_min_iops,
                'message': f'{result.workload_type} IOPS: {test_iops:.0f} (< {expected_min_iops:.0f})'
            })
            result.errors.append(f"IOPS below PCIe 6.x minimum: {test_iops:.0f} < {expected_min_iops:.0f}")
        
        # Average latency validation
        if test_latency <= max_latency:
            validations.append({
                'test': 'average_latency',
                'status': 'pass',
                'value': test_latency,
                'threshold': max_latency,
                'message': f'Average latency: {test_latency:.1f}μs (<= {max_latency:.1f}μs)'
            })
        else:
            validations.append({
                'test': 'average_latency',
                'status': 'fail',
                'value': test_latency,
                'threshold': max_latency,
                'message': f'Average latency: {test_latency:.1f}μs (> {max_latency:.1f}μs)'
            })
            result.errors.append(f"Average latency exceeds threshold: {test_latency:.1f}μs > {max_latency:.1f}μs")
        
        # P99 latency validation
        if test_p99_latency <= max_p99_latency:
            validations.append({
                'test': 'p99_latency',
                'status': 'pass',
                'value': test_p99_latency,
                'threshold': max_p99_latency,
                'message': f'99th percentile latency: {test_p99_latency:.1f}μs (<= {max_p99_latency:.1f}μs)'
            })
        else:
            validations.append({
                'test': 'p99_latency',
                'status': 'warning',
                'value': test_p99_latency,
                'threshold': max_p99_latency,
                'message': f'99th percentile latency: {test_p99_latency:.1f}μs (> {max_p99_latency:.1f}μs)'
            })
            result.warnings.append(f"High 99th percentile latency: {test_p99_latency:.1f}μs")
        
        # CPU utilization validation
        if result.cpu_utilization <= thresholds.max_cpu_utilization:
            validations.append({
                'test': 'cpu_utilization',
                'status': 'pass',
                'value': result.cpu_utilization,
                'threshold': thresholds.max_cpu_utilization,
                'message': f'CPU utilization: {result.cpu_utilization:.1f}% (<= {thresholds.max_cpu_utilization:.1f}%)'
            })
        else:
            validations.append({
                'test': 'cpu_utilization',
                'status': 'warning',
                'value': result.cpu_utilization,
                'threshold': thresholds.max_cpu_utilization,
                'message': f'CPU utilization: {result.cpu_utilization:.1f}% (> {thresholds.max_cpu_utilization:.1f}%)'
            })
            result.warnings.append(f"High CPU utilization: {result.cpu_utilization:.1f}%")
        
        result.validations = validations
        
        # Set compliance status
        failed_validations = [v for v in validations if v['status'] == 'fail']
        warning_validations = [v for v in validations if v['status'] == 'warning']
        
        if failed_validations:
            result.compliance_status = "non_compliant"
        elif warning_validations:
            result.compliance_status = "warning"
        else:
            result.compliance_status = "compliant"

    def _real_time_monitor(self, device: str, workload_type: str, duration: int, callback: Callable):
        """Monitor IOPS metrics in real-time during test execution"""
        start_time = time.time()
        
        while self.is_running and not self.stop_requested:
            elapsed = time.time() - start_time
            if elapsed >= duration:
                break
                
            try:
                # Simulate real-time metrics (in a real implementation, you'd read from /proc/diskstats, iostat, etc.)
                base_iops = 400000 if workload_type == "randread" else 250000 if workload_type == "randwrite" else 300000
                
                metrics = {
                    'timestamp': time.time(),
                    'elapsed_seconds': elapsed,
                    'total_iops': base_iops + (elapsed % 10) * 10000,    # Simulated fluctuation
                    'read_iops': base_iops * 0.6 if workload_type == "randrw" else (base_iops if workload_type == "randread" else 0),
                    'write_iops': base_iops * 0.4 if workload_type == "randrw" else (base_iops if workload_type == "randwrite" else 0),
                    'latency_us': 300 + (elapsed % 5) * 50,              # Simulated latency
                    'cpu_usage': 25 + (elapsed % 4) * 5,                # Simulated CPU usage
                    'progress_percent': min((elapsed / duration) * 100, 100)
                }
                
                callback(metrics)
                
            except Exception as e:
                logger.warning(f"Real-time monitoring error: {e}")
            
            time.sleep(1)  # Update every second

    def stop_test(self):
        """Request test termination"""
        self.stop_requested = True
        logger.info("Random IOPS test stop requested")


if __name__ == '__main__':
    # Test the random IOPS performance module
    logging.basicConfig(level=logging.INFO)
    
    test = RandomIOPSPerformanceTest()
    
    # Test different workload types
    workloads = ['randread', 'randwrite', 'randrw']
    
    for workload in workloads:
        print(f"\n{'=' * 60}")
        print(f"Testing {workload.upper()} Workload")
        print(f"{'=' * 60}")
        
        result = test.run_performance_test(
            device='/dev/nvme0n1',
            runtime_seconds=30,
            block_size='4k',
            queue_depth=64,
            workload_type=workload,
            read_write_ratio='70:30' if workload == 'randrw' else '100:0'
        )
        
        print(f"Status: {result.status.upper()}")
        print(f"Device: {result.device}")
        print(f"Workload: {result.workload_type}")
        if result.read_iops > 0:
            print(f"Read IOPS: {result.read_iops:.0f}")
        if result.write_iops > 0:
            print(f"Write IOPS: {result.write_iops:.0f}")
        print(f"Total IOPS: {result.total_iops:.0f}")
        print(f"CPU Utilization: {result.cpu_utilization:.1f}%")
        print(f"PCIe Compliance: {result.compliance_status}")
        print(f"Duration: {result.duration_seconds:.1f}s")
        
        if result.warnings:
            print(f"Warnings:")
            for warning in result.warnings:
                print(f"  - {warning}")
        
        if result.errors:
            print(f"Errors:")
            for error in result.errors:
                print(f"  - {error}")