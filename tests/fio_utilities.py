#!/usr/bin/env python3
"""
FIO Utilities for CalypsoPy+ NVMe Performance Testing
Provides reusable fio benchmark functions for various performance tests
"""

import os
import json
import time
import logging
import subprocess
import threading
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
import tempfile
import shutil

logger = logging.getLogger(__name__)


@dataclass
class FioJobConfig:
    """Configuration for a single fio job"""
    name: str
    rw: str  # read, write, randread, randwrite, randrw
    bs: str  # Block size (e.g., "4k", "128k", "1M")
    iodepth: int = 32
    numjobs: int = 1
    runtime: int = 60  # seconds - user configurable
    size: Optional[str] = None  # "100%", "10G", etc.
    direct: bool = True
    sync: bool = False
    group_reporting: bool = True
    time_based: bool = True
    ramp_time: int = 5
    norandommap: bool = True
    ioengine: str = "libaio"
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FioResult:
    """Parsed fio test results"""
    job_name: str
    read_bw: float = 0.0  # MB/s
    read_iops: float = 0.0
    read_lat_mean: float = 0.0  # microseconds
    read_lat_p50: float = 0.0
    read_lat_p90: float = 0.0
    read_lat_p95: float = 0.0
    read_lat_p99: float = 0.0
    write_bw: float = 0.0  # MB/s
    write_iops: float = 0.0
    write_lat_mean: float = 0.0  # microseconds
    write_lat_p50: float = 0.0
    write_lat_p90: float = 0.0
    write_lat_p95: float = 0.0
    write_lat_p99: float = 0.0
    cpu_usr: float = 0.0  # CPU utilization %
    cpu_sys: float = 0.0
    test_duration: float = 0.0  # seconds
    raw_output: str = ""
    json_output: Dict[str, Any] = field(default_factory=dict)


class FioUtilities:
    """
    Utility class for running fio benchmarks on NVMe devices
    Provides reusable functions for performance testing
    """

    def __init__(self):
        self.fio_path = self._find_fio_executable()
        self.has_fio = self.fio_path is not None
        self.temp_dir = None
        self.running_tests = {}
        self.test_lock = threading.RLock()

    def _find_fio_executable(self) -> Optional[str]:
        """Find fio executable in system PATH"""
        try:
            # Try to find fio
            result = subprocess.run(['which', 'fio'], 
                                  capture_output=True, 
                                  text=True, 
                                  timeout=5)
            if result.returncode == 0:
                fio_path = result.stdout.strip()
                logger.info(f"Found fio at: {fio_path}")
                return fio_path
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

        # Try common locations
        common_paths = [
            '/usr/bin/fio',
            '/usr/local/bin/fio',
            '/bin/fio',
            'fio'  # Try in PATH
        ]

        for path in common_paths:
            if shutil.which(path):
                logger.info(f"Found fio at: {path}")
                return path

        logger.warning("fio executable not found in system PATH")
        return None

    def check_fio_availability(self) -> Dict[str, Any]:
        """Check if fio is available and get version info"""
        result = {
            'available': self.has_fio,
            'path': self.fio_path,
            'version': None,
            'capabilities': {}
        }

        if not self.has_fio:
            result['error'] = "fio executable not found"
            return result

        try:
            # Get fio version
            version_result = subprocess.run([self.fio_path, '--version'], 
                                          capture_output=True, 
                                          text=True, 
                                          timeout=10)
            if version_result.returncode == 0:
                result['version'] = version_result.stdout.strip()

            # Check for important capabilities
            help_result = subprocess.run([self.fio_path, '--help'], 
                                       capture_output=True, 
                                       text=True, 
                                       timeout=10)
            if help_result.returncode == 0:
                help_text = help_result.stdout
                result['capabilities'] = {
                    'json_output': '--output-format=json' in help_text,
                    'libaio': 'libaio' in help_text,
                    'io_uring': 'io_uring' in help_text,
                    'direct_io': '--direct' in help_text
                }

        except subprocess.TimeoutExpired:
            result['error'] = "fio command timeout"
        except Exception as e:
            result['error'] = f"Error checking fio: {str(e)}"

        return result

    def create_job_file(self, jobs: List[FioJobConfig], filename: Optional[str] = None) -> str:
        """Create a fio job file from job configurations"""
        if not filename:
            if not self.temp_dir:
                self.temp_dir = tempfile.mkdtemp(prefix='calypso_fio_')
            filename = os.path.join(self.temp_dir, f"test_{int(time.time())}.fio")

        job_content = "[global]\n"
        
        # Global settings
        job_content += "ioengine=libaio\n"
        job_content += "direct=1\n"
        job_content += "verify=0\n"
        job_content += "norandommap=1\n"
        job_content += "randrepeat=0\n"
        job_content += "group_reporting=1\n"
        job_content += "\n"

        # Individual jobs
        for job in jobs:
            job_content += f"[{job.name}]\n"
            job_content += f"rw={job.rw}\n"
            job_content += f"bs={job.bs}\n"
            job_content += f"iodepth={job.iodepth}\n"
            job_content += f"numjobs={job.numjobs}\n"
            job_content += f"runtime={job.runtime}\n"
            job_content += f"ramp_time={job.ramp_time}\n"
            
            if job.size:
                job_content += f"size={job.size}\n"
            if job.time_based:
                job_content += "time_based=1\n"
            if job.group_reporting:
                job_content += "group_reporting=1\n"

            # Add extra parameters
            for key, value in job.extra_params.items():
                job_content += f"{key}={value}\n"

            job_content += "\n"

        with open(filename, 'w') as f:
            f.write(job_content)

        logger.info(f"Created fio job file: {filename}")
        return filename

    def run_fio_test(self, 
                     device: str, 
                     job_config,  # Can be FioJobConfig or List[FioJobConfig]
                     progress_callback: Optional[Callable] = None,
                     real_time_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """
        Run fio test on specified device
        
        Args:
            device: Device path (e.g., '/dev/nvme0n1')
            jobs: List of fio job configurations
            progress_callback: Optional callback for progress updates
            real_time_callback: Optional callback for real-time metrics
            
        Returns:
            Test results with parsed metrics
        """
        if not self.has_fio:
            return {
                'success': False,
                'error': 'fio not available',
                'results': []
            }

        test_id = f"fio_test_{int(time.time())}"
        
        with self.test_lock:
            if device in self.running_tests:
                return {
                    'success': False,
                    'error': f'Test already running on {device}',
                    'results': []
                }
            
            self.running_tests[device] = test_id

        try:
            # Handle both single job config and list of job configs
            if isinstance(job_config, list):
                jobs = job_config
            else:
                jobs = [job_config]
                
            # Create job file
            job_file = self.create_job_file(jobs)
            
            # Add device to job file
            with open(job_file, 'a') as f:
                f.write(f"filename={device}\n")

            # Prepare fio command
            output_file = os.path.join(os.path.dirname(job_file), f"{test_id}_output.json")
            
            cmd = [
                self.fio_path,
                job_file,
                '--output-format=json',
                f'--output={output_file}'
            ]

            logger.info(f"Running fio test on {device}: {' '.join(cmd)}")

            if progress_callback:
                progress_callback({
                    'status': 'starting',
                    'message': f'Starting fio test on {device}',
                    'device': device,
                    'test_id': test_id
                })

            # Run fio test
            start_time = time.time()
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            # Monitor process for real-time updates
            if real_time_callback:
                monitor_thread = threading.Thread(
                    target=self._monitor_fio_process,
                    args=(process, device, real_time_callback, start_time, jobs[0].runtime if jobs else 60)
                )
                monitor_thread.daemon = True
                monitor_thread.start()

            # Wait for completion
            stdout, stderr = process.communicate()
            end_time = time.time()

            if process.returncode != 0:
                error_msg = f"fio test failed with return code {process.returncode}\nstderr: {stderr}"
                logger.error(error_msg)
                return {
                    'success': False,
                    'error': error_msg,
                    'results': []
                }

            # Parse results
            results = self._parse_fio_results(output_file, end_time - start_time)

            if progress_callback:
                progress_callback({
                    'status': 'completed',
                    'message': f'fio test completed on {device}',
                    'device': device,
                    'test_id': test_id,
                    'duration': end_time - start_time
                })

            return {
                'success': True,
                'device': device,
                'test_id': test_id,
                'duration': end_time - start_time,
                'results': results,
                'job_file': job_file,
                'output_file': output_file
            }

        except Exception as e:
            logger.error(f"Error running fio test: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'results': []
            }
        finally:
            # Cleanup running test
            with self.test_lock:
                if device in self.running_tests:
                    del self.running_tests[device]

    def _monitor_fio_process(self, 
                           process: subprocess.Popen, 
                           device: str,
                           callback: Callable,
                           start_time: float,
                           total_runtime: int = 60):
        """Monitor fio process for real-time updates"""
        try:
            while process.poll() is None:
                elapsed = time.time() - start_time
                progress_percent = min((elapsed / total_runtime) * 100, 100)
                
                # Send periodic updates
                callback({
                    'type': 'progress',
                    'device': device,
                    'elapsed_seconds': elapsed,
                    'total_runtime': total_runtime,
                    'progress_percent': progress_percent,
                    'status': 'running'
                })
                
                time.sleep(1.0)  # Update every second
                
        except Exception as e:
            logger.error(f"Error monitoring fio process: {str(e)}")

    def _parse_fio_results(self, output_file: str, duration: float) -> List[FioResult]:
        """Parse fio JSON output into structured results"""
        results = []
        
        try:
            with open(output_file, 'r') as f:
                fio_data = json.load(f)

            for job in fio_data.get('jobs', []):
                result = FioResult(
                    job_name=job.get('jobname', 'unknown'),
                    test_duration=duration,
                    json_output=job
                )

                # Parse read metrics
                read_data = job.get('read', {})
                if read_data:
                    result.read_bw = read_data.get('bw', 0) / 1024.0  # Convert KB/s to MB/s
                    result.read_iops = read_data.get('iops', 0)
                    
                    lat_data = read_data.get('lat_ns', {})
                    if lat_data:
                        result.read_lat_mean = lat_data.get('mean', 0) / 1000.0  # Convert ns to μs
                        
                    percentiles = read_data.get('clat_ns', {}).get('percentile', {})
                    if percentiles:
                        result.read_lat_p50 = percentiles.get('50.000000', 0) / 1000.0
                        result.read_lat_p90 = percentiles.get('90.000000', 0) / 1000.0
                        result.read_lat_p95 = percentiles.get('95.000000', 0) / 1000.0
                        result.read_lat_p99 = percentiles.get('99.000000', 0) / 1000.0

                # Parse write metrics
                write_data = job.get('write', {})
                if write_data:
                    result.write_bw = write_data.get('bw', 0) / 1024.0  # Convert KB/s to MB/s
                    result.write_iops = write_data.get('iops', 0)
                    
                    lat_data = write_data.get('lat_ns', {})
                    if lat_data:
                        result.write_lat_mean = lat_data.get('mean', 0) / 1000.0  # Convert ns to μs
                        
                    percentiles = write_data.get('clat_ns', {}).get('percentile', {})
                    if percentiles:
                        result.write_lat_p50 = percentiles.get('50.000000', 0) / 1000.0
                        result.write_lat_p90 = percentiles.get('90.000000', 0) / 1000.0
                        result.write_lat_p95 = percentiles.get('95.000000', 0) / 1000.0
                        result.write_lat_p99 = percentiles.get('99.000000', 0) / 1000.0

                # Parse CPU utilization
                usr_cpu = job.get('usr_cpu', 0)
                sys_cpu = job.get('sys_cpu', 0)
                result.cpu_usr = usr_cpu
                result.cpu_sys = sys_cpu

                results.append(result)

        except Exception as e:
            logger.error(f"Error parsing fio results: {str(e)}")

        return results

    def cleanup(self):
        """Clean up temporary files"""
        if self.temp_dir and os.path.exists(self.temp_dir):
            try:
                shutil.rmtree(self.temp_dir)
                logger.info(f"Cleaned up temporary directory: {self.temp_dir}")
            except Exception as e:
                logger.error(f"Error cleaning up temporary directory: {str(e)}")

    def create_sequential_read_job(self, 
                                 block_size: str = "128k",
                                 runtime: int = None,  # User configurable
                                 queue_depth: int = 32) -> FioJobConfig:
        """Create a sequential read job configuration"""
        if runtime is None:
            runtime = 60  # Default fallback
            
        return FioJobConfig(
            name="sequential_read",
            rw="read",
            bs=block_size,
            iodepth=queue_depth,
            runtime=runtime,
            time_based=True,
            extra_params={
                'invalidate': '1',
                'rwmixread': '100'
            }
        )

    def create_sequential_write_job(self, 
                                  block_size: str = "128k",
                                  runtime: int = None,  # User configurable
                                  queue_depth: int = 32) -> FioJobConfig:
        """Create a sequential write job configuration"""
        if runtime is None:
            runtime = 60  # Default fallback
            
        return FioJobConfig(
            name="sequential_write",
            rw="write",
            bs=block_size,
            iodepth=queue_depth,
            runtime=runtime,
            time_based=True,
            extra_params={
                'invalidate': '1'
            }
        )

    def create_random_read_job(self, 
                             block_size: str = "4k",
                             runtime: int = None,  # User configurable
                             queue_depth: int = 32) -> FioJobConfig:
        """Create a random read job configuration"""
        if runtime is None:
            runtime = 60  # Default fallback
            
        return FioJobConfig(
            name="random_read",
            rw="randread",
            bs=block_size,
            iodepth=queue_depth,
            runtime=runtime,
            time_based=True,
            extra_params={
                'invalidate': '1'
            }
        )

    def create_random_write_job(self, 
                              block_size: str = "4k",
                              runtime: int = None,  # User configurable
                              queue_depth: int = 32) -> FioJobConfig:
        """Create a random write job configuration"""
        if runtime is None:
            runtime = 60  # Default fallback
            
        return FioJobConfig(
            name="random_write",
            rw="randwrite",
            bs=block_size,
            iodepth=queue_depth,
            runtime=runtime,
            time_based=True,
            extra_params={
                'invalidate': '1'
            }
        )
    
    def create_random_iops_job(self, 
                             workload_type: str = "randread",
                             block_size: str = "4k",
                             runtime: int = None,
                             queue_depth: int = 64,
                             read_write_ratio: str = "100:0") -> FioJobConfig:
        """
        Create a random IOPS job configuration
        
        Args:
            workload_type: 'randread', 'randwrite', or 'randrw'
            block_size: Block size (e.g., '4k', '8k')
            runtime: Test duration in seconds
            queue_depth: IO queue depth
            read_write_ratio: For mixed workloads, format "read:write" (e.g., "70:30")
        """
        if runtime is None:
            runtime = 60  # Default fallback
            
        extra_params = {
            'invalidate': '1',
            'randrepeat': '0'  # Don't repeat random pattern
        }
        
        # Handle mixed read/write workloads
        if workload_type == "randrw":
            # Parse read/write ratio
            try:
                read_pct, write_pct = map(int, read_write_ratio.split(':'))
                if read_pct + write_pct != 100:
                    # Normalize to 100%
                    total = read_pct + write_pct
                    read_pct = int((read_pct / total) * 100)
                    write_pct = 100 - read_pct
                    
                extra_params['rwmixread'] = str(read_pct)
            except (ValueError, ZeroDivisionError):
                # Default to 70% read, 30% write
                extra_params['rwmixread'] = '70'
                
        return FioJobConfig(
            name=f"random_iops_{workload_type}",
            rw=workload_type,
            bs=block_size,
            iodepth=queue_depth,
            runtime=runtime,
            time_based=True,
            extra_params=extra_params
        )

    def __del__(self):
        """Cleanup on destruction"""
        self.cleanup()