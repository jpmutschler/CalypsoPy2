#!/usr/bin/env python3
"""
CalypsoPy+ Sequential Write Performance Test
NVMe sequential write performance testing with PCIe 6.x compliance validation
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
class PCIe6WriteComplianceThresholds:
    """PCIe 6.x compliance thresholds for sequential write performance"""
    # PCIe 6.0 theoretical maximums (MB/s) for different configurations
    gen6_x1_max: float = 7500.0      # ~7.5 GB/s theoretical
    gen6_x2_max: float = 15000.0     # ~15 GB/s theoretical  
    gen6_x4_max: float = 30000.0     # ~30 GB/s theoretical
    gen6_x8_max: float = 60000.0     # ~60 GB/s theoretical
    gen6_x16_max: float = 120000.0   # ~120 GB/s theoretical
    
    # Expected minimum efficiency percentages for writes (typically lower than reads)
    min_efficiency_gen6: float = 65.0    # 65% minimum for Gen 6
    min_efficiency_gen5: float = 70.0    # 70% minimum for Gen 5
    min_efficiency_gen4: float = 75.0    # 75% minimum for Gen 4
    
    # Write-specific thresholds
    max_write_latency_us: float = 5000.0  # 5ms max write latency
    max_p99_latency_us: float = 20000.0   # 20ms max 99th percentile
    max_cpu_utilization: float = 85.0     # 85% max CPU during writes


@dataclass 
class SequentialWriteTestResult:
    """Results from sequential write performance test"""
    test_name: str = "Sequential Write Performance"
    status: str = "unknown"
    device: str = ""
    
    # Performance metrics
    throughput_mbps: float = 0.0
    iops: float = 0.0
    avg_latency_us: float = 0.0
    p95_latency_us: float = 0.0
    p99_latency_us: float = 0.0
    cpu_utilization: float = 0.0
    
    # Test configuration
    block_size: str = "128k"
    queue_depth: int = 32
    runtime_seconds: int = 60
    
    # PCIe compliance
    compliance_status: str = "unknown"
    detected_pcie_gen: str = "unknown"
    detected_pcie_lanes: int = 0
    expected_min_throughput: float = 0.0
    throughput_efficiency: float = 0.0
    
    # Validation results
    validations: List[Dict[str, Any]] = field(default_factory=list)
    
    # Test metadata
    duration_seconds: float = 0.0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


class SequentialWritePerformanceTest:
    """
    Sequential Write Performance Test for NVMe devices
    Tests sequential write throughput, latency, and PCIe 6.x compliance
    """

    def __init__(self):
        self.fio_utils = FioUtilities()
        self.compliance_thresholds = PCIe6WriteComplianceThresholds()
        self.is_running = False
        self.stop_requested = False
        
        logger.info("Sequential Write Performance test initialized")

    def run_sequential_write_test(self, options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Main entry point for test runner integration
        """
        if options is None:
            options = {}
            
        device = options.get('device', '/dev/nvme0n1')
        runtime_seconds = options.get('runtime_seconds', 60)
        block_size = options.get('block_size', '128k')
        queue_depth = options.get('queue_depth', 32)
        discovered_devices = options.get('discovered_devices', [])
        
        # Run the performance test
        result = self.run_performance_test(
            device=device,
            runtime_seconds=runtime_seconds,
            block_size=block_size,
            queue_depth=queue_depth,
            discovered_devices=discovered_devices
        )
        
        # Convert to dict format expected by test runner
        return {
            'test_name': result.test_name,
            'status': result.status,
            'device': result.device,
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
            'configuration': {
                'block_size': result.block_size,
                'queue_depth': result.queue_depth,
                'runtime_seconds': result.runtime_seconds
            },
            'duration_seconds': result.duration_seconds,
            'warnings': result.warnings,
            'errors': result.errors
        }

    def run_performance_test(self, 
                           device: str,
                           runtime_seconds: int = 60,
                           block_size: str = "128k",
                           queue_depth: int = 32,
                           discovered_devices: List[Dict] = None,
                           progress_callback: Optional[Callable] = None,
                           real_time_callback: Optional[Callable] = None,
                           monitor_smart: bool = True,
                           smart_interval: float = 5.0) -> SequentialWriteTestResult:
        """
        Run sequential write performance test with real-time monitoring
        """
        start_time = time.time()
        self.is_running = True
        self.stop_requested = False
        
        result = SequentialWriteTestResult(
            device=device,
            block_size=block_size,
            queue_depth=queue_depth,
            runtime_seconds=runtime_seconds
        )
        
        try:
            logger.info(f"Starting sequential write test on {device} for {runtime_seconds}s")
            
            if progress_callback:
                progress_callback({
                    'stage': 'starting',
                    'message': 'Initializing sequential write test...',
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
                    'message': 'Configuring sequential write test...',
                    'progress': 10
                })
            
            # Create fio job configuration for sequential writes
            job_config = self.fio_utils.create_sequential_write_job(
                block_size=block_size,
                runtime=runtime_seconds,
                queue_depth=queue_depth
            )
            
            if progress_callback:
                progress_callback({
                    'stage': 'running',
                    'message': f'Running sequential write test on {device}...',
                    'progress': 20
                })
            
            # Initialize NVMe SMART monitoring if requested
            smart_monitor = None
            if monitor_smart:
                try:
                    smart_monitor = NVMeSMARTMonitor(device)
                    if smart_monitor.start_monitoring(sampling_interval=smart_interval):
                        logger.info(f"NVMe SMART monitoring started for {device}")
                    else:
                        result.warnings.append("Failed to start NVMe SMART monitoring")
                except Exception as e:
                    result.warnings.append(f"SMART monitoring setup failed: {str(e)}")
                    logger.warning(f"SMART monitoring setup failed: {e}")

            # Start real-time monitoring thread if callback provided
            monitoring_thread = None
            if real_time_callback:
                monitoring_thread = threading.Thread(
                    target=self._real_time_monitor,
                    args=(device, runtime_seconds, real_time_callback),
                    daemon=True
                )
                monitoring_thread.start()
            
            # Run fio test
            fio_test_result = self.fio_utils.run_fio_test(device, job_config)
            
            if progress_callback:
                progress_callback({
                    'stage': 'analyzing',
                    'message': 'Analyzing test results...',
                    'progress': 90
                })
            
            if fio_test_result and fio_test_result.get('success') and fio_test_result.get('results'):
                fio_result = fio_test_result['results'][0]  # Get first result
                # Extract performance metrics
                result.throughput_mbps = fio_result.write_bw
                result.iops = fio_result.write_iops
                result.avg_latency_us = fio_result.write_lat_mean
                result.p95_latency_us = fio_result.write_lat_p95
                result.p99_latency_us = fio_result.write_lat_p99
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
                    
                logger.info(f"Sequential write test completed: {result.throughput_mbps:.1f} MB/s")
                
            else:
                result.status = "error"
                result.errors.append("fio test execution failed")
                logger.error("fio test execution failed")
            
            if progress_callback:
                progress_callback({
                    'stage': 'complete',
                    'message': 'Sequential write test completed',
                    'progress': 100
                })
                
        except Exception as e:
            logger.error(f"Sequential write test failed: {e}")
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

    def _validate_pcie_compliance(self, result: SequentialWriteTestResult):
        """Validate performance against PCIe 6.x specifications"""
        thresholds = self.compliance_thresholds
        validations = []
        
        # Determine expected throughput based on PCIe configuration
        if result.detected_pcie_gen == "Gen6":
            if result.detected_pcie_lanes >= 16:
                max_throughput = thresholds.gen6_x16_max
                min_efficiency = thresholds.min_efficiency_gen6
            elif result.detected_pcie_lanes >= 8:
                max_throughput = thresholds.gen6_x8_max
                min_efficiency = thresholds.min_efficiency_gen6
            elif result.detected_pcie_lanes >= 4:
                max_throughput = thresholds.gen6_x4_max
                min_efficiency = thresholds.min_efficiency_gen6
            elif result.detected_pcie_lanes >= 2:
                max_throughput = thresholds.gen6_x2_max
                min_efficiency = thresholds.min_efficiency_gen6
            else:
                max_throughput = thresholds.gen6_x1_max
                min_efficiency = thresholds.min_efficiency_gen6
        else:
            # Conservative estimates for older generations
            max_throughput = 6000.0  # Assume PCIe 4.0 x4 for fallback
            min_efficiency = thresholds.min_efficiency_gen4
        
        result.expected_min_throughput = max_throughput * (min_efficiency / 100.0)
        result.throughput_efficiency = (result.throughput_mbps / max_throughput) * 100.0
        
        # Throughput validation
        if result.throughput_mbps >= result.expected_min_throughput:
            validations.append({
                'test': 'throughput_efficiency',
                'status': 'pass',
                'value': result.throughput_efficiency,
                'threshold': min_efficiency,
                'message': f'Write throughput efficiency: {result.throughput_efficiency:.1f}% (>= {min_efficiency:.1f}%)'
            })
        else:
            validations.append({
                'test': 'throughput_efficiency', 
                'status': 'fail',
                'value': result.throughput_efficiency,
                'threshold': min_efficiency,
                'message': f'Write throughput efficiency: {result.throughput_efficiency:.1f}% (< {min_efficiency:.1f}%)'
            })
            result.errors.append(f"Write throughput below PCIe 6.x minimum: {result.throughput_mbps:.1f} MB/s < {result.expected_min_throughput:.1f} MB/s")
        
        # Latency validation (writes typically have higher latency than reads)
        if result.avg_latency_us <= thresholds.max_write_latency_us:
            validations.append({
                'test': 'average_latency',
                'status': 'pass', 
                'value': result.avg_latency_us,
                'threshold': thresholds.max_write_latency_us,
                'message': f'Average write latency: {result.avg_latency_us:.1f}μs (<= {thresholds.max_write_latency_us:.1f}μs)'
            })
        else:
            validations.append({
                'test': 'average_latency',
                'status': 'fail',
                'value': result.avg_latency_us, 
                'threshold': thresholds.max_write_latency_us,
                'message': f'Average write latency: {result.avg_latency_us:.1f}μs (> {thresholds.max_write_latency_us:.1f}μs)'
            })
            result.errors.append(f"Average write latency exceeds threshold: {result.avg_latency_us:.1f}μs > {thresholds.max_write_latency_us:.1f}μs")
        
        # P99 latency validation
        if result.p99_latency_us <= thresholds.max_p99_latency_us:
            validations.append({
                'test': 'p99_latency',
                'status': 'pass',
                'value': result.p99_latency_us,
                'threshold': thresholds.max_p99_latency_us,
                'message': f'99th percentile latency: {result.p99_latency_us:.1f}μs (<= {thresholds.max_p99_latency_us:.1f}μs)'
            })
        else:
            validations.append({
                'test': 'p99_latency',
                'status': 'warning',
                'value': result.p99_latency_us,
                'threshold': thresholds.max_p99_latency_us,
                'message': f'99th percentile latency: {result.p99_latency_us:.1f}μs (> {thresholds.max_p99_latency_us:.1f}μs)'
            })
            result.warnings.append(f"High 99th percentile write latency: {result.p99_latency_us:.1f}μs")
        
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
            result.warnings.append(f"High CPU utilization during writes: {result.cpu_utilization:.1f}%")
        
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

    def _real_time_monitor(self, device: str, duration: int, callback: Callable):
        """Monitor performance metrics in real-time during test execution"""
        start_time = time.time()
        
        while self.is_running and not self.stop_requested:
            elapsed = time.time() - start_time
            if elapsed >= duration:
                break
                
            try:
                # Simulate real-time metrics (in a real implementation, you'd read from /proc/diskstats, iostat, etc.)
                metrics = {
                    'timestamp': time.time(),
                    'elapsed_seconds': elapsed,
                    'throughput_mbps': 1500 + (elapsed % 10) * 50,  # Simulated fluctuation
                    'latency_us': 2000 + (elapsed % 5) * 100,       # Simulated write latency
                    'cpu_usage': 15 + (elapsed % 3) * 5,            # Simulated CPU usage
                    'progress_percent': min((elapsed / duration) * 100, 100)
                }
                
                callback(metrics)
                
            except Exception as e:
                logger.warning(f"Real-time monitoring error: {e}")
            
            time.sleep(1)  # Update every second

    def stop_test(self):
        """Request test termination"""
        self.stop_requested = True
        logger.info("Sequential write test stop requested")


if __name__ == '__main__':
    # Test the sequential write performance module
    logging.basicConfig(level=logging.INFO)
    
    test = SequentialWritePerformanceTest()
    
    # Run a sample test
    result = test.run_performance_test(
        device='/dev/nvme0n1',
        runtime_seconds=30,
        block_size='128k',
        queue_depth=32
    )
    
    print(f"\n{'=' * 60}")
    print(f"Sequential Write Performance Test Results")
    print(f"{'=' * 60}")
    print(f"Status: {result.status.upper()}")
    print(f"Device: {result.device}")
    print(f"Throughput: {result.throughput_mbps:.1f} MB/s")
    print(f"IOPS: {result.iops:.0f}")
    print(f"Average Latency: {result.avg_latency_us:.1f} μs")
    print(f"95th Percentile Latency: {result.p95_latency_us:.1f} μs")
    print(f"99th Percentile Latency: {result.p99_latency_us:.1f} μs")
    print(f"CPU Utilization: {result.cpu_utilization:.1f}%")
    print(f"PCIe Compliance: {result.compliance_status}")
    print(f"Duration: {result.duration_seconds:.1f}s")
    
    if result.warnings:
        print(f"\nWarnings:")
        for warning in result.warnings:
            print(f"  - {warning}")
    
    if result.errors:
        print(f"\nErrors:")
        for error in result.errors:
            print(f"  - {error}")