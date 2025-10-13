#!/usr/bin/env python3
"""
NVMe SMART Monitoring for CalypsoPy+ Performance Tests
Tracks temperature, error counters, and health metrics during testing
"""

import json
import time
import logging
import subprocess
import threading
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class SMARTData:
    """NVMe SMART data snapshot"""
    timestamp: float
    temperature_celsius: int = 0
    temperature_sensors: Dict[str, int] = field(default_factory=dict)
    critical_warning: int = 0
    available_spare: int = 100
    available_spare_threshold: int = 10
    percentage_used: int = 0
    data_units_read: int = 0
    data_units_written: int = 0
    host_read_commands: int = 0
    host_write_commands: int = 0
    controller_busy_time: int = 0
    power_cycles: int = 0
    power_on_hours: int = 0
    unsafe_shutdowns: int = 0
    media_errors: int = 0
    num_err_log_entries: int = 0
    warning_temp_time: int = 0
    critical_comp_time: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp,
            'temperature_celsius': self.temperature_celsius,
            'temperature_sensors': self.temperature_sensors,
            'critical_warning': self.critical_warning,
            'available_spare': self.available_spare,
            'available_spare_threshold': self.available_spare_threshold,
            'percentage_used': self.percentage_used,
            'data_units_read': self.data_units_read,
            'data_units_written': self.data_units_written,
            'host_read_commands': self.host_read_commands,
            'host_write_commands': self.host_write_commands,
            'controller_busy_time': self.controller_busy_time,
            'power_cycles': self.power_cycles,
            'power_on_hours': self.power_on_hours,
            'unsafe_shutdowns': self.unsafe_shutdowns,
            'media_errors': self.media_errors,
            'num_err_log_entries': self.num_err_log_entries,
            'warning_temp_time': self.warning_temp_time,
            'critical_comp_time': self.critical_comp_time
        }


@dataclass 
class SMARTMonitoringResult:
    """Results from SMART monitoring session"""
    device_path: str
    session_start: float
    session_end: float
    samples: List[SMARTData] = field(default_factory=list)
    initial_smart: Optional[SMARTData] = None
    final_smart: Optional[SMARTData] = None
    sampling_interval: float = 5.0
    total_samples: int = 0
    monitoring_successful: bool = False
    
    def calculate_deltas(self):
        """Calculate changes in SMART counters during test"""
        if not self.initial_smart or not self.final_smart:
            return None
            
        return {
            'data_units_read': self.final_smart.data_units_read - self.initial_smart.data_units_read,
            'data_units_written': self.final_smart.data_units_written - self.initial_smart.data_units_written,
            'host_read_commands': self.final_smart.host_read_commands - self.initial_smart.host_read_commands,
            'host_write_commands': self.final_smart.host_write_commands - self.initial_smart.host_write_commands,
            'media_errors': self.final_smart.media_errors - self.initial_smart.media_errors,
            'num_err_log_entries': self.final_smart.num_err_log_entries - self.initial_smart.num_err_log_entries,
            'unsafe_shutdowns': self.final_smart.unsafe_shutdowns - self.initial_smart.unsafe_shutdowns,
            'controller_busy_time': self.final_smart.controller_busy_time - self.initial_smart.controller_busy_time
        }
    
    def get_temperature_stats(self) -> Dict[str, float]:
        """Calculate temperature statistics"""
        if not self.samples:
            return {}
            
        temps = [sample.temperature_celsius for sample in self.samples if sample.temperature_celsius > 0]
        if not temps:
            return {}
            
        return {
            'min_temp_celsius': min(temps),
            'max_temp_celsius': max(temps),
            'avg_temp_celsius': sum(temps) / len(temps),
            'temp_range_celsius': max(temps) - min(temps)
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
            'initial_smart': self.initial_smart.to_dict() if self.initial_smart else None,
            'final_smart': self.final_smart.to_dict() if self.final_smart else None,
            'smart_deltas': self.calculate_deltas(),
            'temperature_stats': self.get_temperature_stats(),
            'samples': [sample.to_dict() for sample in self.samples],
            'chart_data': self._prepare_chart_data()
        }
    
    def _prepare_chart_data(self) -> Dict[str, Any]:
        """Prepare data optimized for frontend charting"""
        if not self.samples:
            return {
                'timestamps': [],
                'temperature': [],
                'available_spare': [],
                'percentage_used': [],
                'media_errors': [],
                'relative_timestamps': []
            }
        
        # Extract time series data
        timestamps = [sample.timestamp for sample in self.samples]
        temperature = [sample.temperature_celsius for sample in self.samples]
        available_spare = [sample.available_spare for sample in self.samples]
        percentage_used = [sample.percentage_used for sample in self.samples]
        media_errors = [sample.media_errors for sample in self.samples]
        
        return {
            'timestamps': timestamps,
            'temperature': temperature,
            'available_spare': available_spare,
            'percentage_used': percentage_used,
            'media_errors': media_errors,
            'relative_timestamps': [(t - timestamps[0]) for t in timestamps] if timestamps else []
        }


class NVMeSMARTMonitor:
    """
    NVMe SMART Monitor for Performance Tests
    
    Tracks NVMe device health and temperature during performance testing
    using nvme-cli to query SMART data at regular intervals.
    """
    
    def __init__(self, device_path: str):
        """
        Initialize SMART monitor for specific NVMe device
        
        Args:
            device_path: Path to NVMe device (e.g., /dev/nvme0n1)
        """
        self.device_path = device_path
        self.nvme_device = self._get_nvme_device_path(device_path)
        self.monitoring = False
        self.monitor_thread = None
        self.result = None
        self.real_time_callback = None
        self.sampling_interval = 5.0  # Default 5 seconds
        
        # Check nvme-cli availability
        self.nvme_available = self._check_nvme_cli()
        
        logger.info(f"NVMe SMART Monitor initialized for {device_path} (nvme device: {self.nvme_device})")
    
    def _get_nvme_device_path(self, device_path: str) -> str:
        """Convert device path to nvme device path for SMART queries"""
        # Convert /dev/nvme0n1 -> /dev/nvme0 for SMART data
        if 'nvme' in device_path:
            # Extract base device (remove partition number)
            import re
            match = re.match(r'(/dev/nvme\d+)', device_path)
            if match:
                return match.group(1)
        return device_path
    
    def _check_nvme_cli(self) -> bool:
        """Check if nvme-cli is available"""
        try:
            result = subprocess.run(
                ['nvme', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("nvme-cli not available - SMART monitoring disabled")
            return False
    
    def query_smart_data(self) -> Optional[SMARTData]:
        """
        Query current SMART data from NVMe device
        
        Returns:
            SMARTData object or None if query failed
        """
        if not self.nvme_available:
            return None
            
        try:
            # Query SMART data in JSON format
            result = subprocess.run(
                ['nvme', 'smart-log', self.nvme_device, '--output-format=json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.warning(f"nvme smart-log failed: {result.stderr}")
                return None
            
            # Parse JSON response
            smart_json = json.loads(result.stdout)
            
            # Extract temperature data
            temperature_celsius = 0
            temperature_sensors = {}
            
            # Try different temperature field names
            if 'temperature' in smart_json:
                temperature_celsius = smart_json['temperature']
            elif 'temperature_sensor_1' in smart_json:
                temperature_celsius = smart_json['temperature_sensor_1']
                
            # Extract additional temperature sensors
            for i in range(1, 9):  # NVMe supports up to 8 temperature sensors
                temp_key = f'temperature_sensor_{i}'
                if temp_key in smart_json and smart_json[temp_key] > 0:
                    temperature_sensors[f'sensor_{i}'] = smart_json[temp_key]
            
            # Create SMART data object
            smart_data = SMARTData(
                timestamp=time.time(),
                temperature_celsius=temperature_celsius,
                temperature_sensors=temperature_sensors,
                critical_warning=smart_json.get('critical_warning', 0),
                available_spare=smart_json.get('available_spare', 100),
                available_spare_threshold=smart_json.get('available_spare_threshold', 10),
                percentage_used=smart_json.get('percentage_used', 0),
                data_units_read=smart_json.get('data_units_read', 0),
                data_units_written=smart_json.get('data_units_written', 0),
                host_read_commands=smart_json.get('host_read_commands', 0),
                host_write_commands=smart_json.get('host_write_commands', 0),
                controller_busy_time=smart_json.get('controller_busy_time', 0),
                power_cycles=smart_json.get('power_cycles', 0),
                power_on_hours=smart_json.get('power_on_hours', 0),
                unsafe_shutdowns=smart_json.get('unsafe_shutdowns', 0),
                media_errors=smart_json.get('media_errors', 0),
                num_err_log_entries=smart_json.get('num_err_log_entries', 0),
                warning_temp_time=smart_json.get('warning_temp_time', 0),
                critical_comp_time=smart_json.get('critical_comp_time', 0)
            )
            
            logger.debug(f"SMART data queried: Temp={temperature_celsius}°C, "
                        f"Spare={smart_data.available_spare}%, "
                        f"Used={smart_data.percentage_used}%, "
                        f"Errors={smart_data.media_errors}")
            
            return smart_data
            
        except subprocess.TimeoutExpired:
            logger.warning("SMART query timeout")
            return None
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse SMART JSON: {e}")
            return None
        except Exception as e:
            logger.error(f"SMART query error: {e}")
            return None
    
    def start_monitoring(self, 
                        sampling_interval: float = 5.0,
                        real_time_callback: Optional[Callable] = None) -> bool:
        """
        Start monitoring SMART data in background thread
        
        Args:
            sampling_interval: Time between samples in seconds
            real_time_callback: Optional callback for real-time updates
            
        Returns:
            True if monitoring started successfully
        """
        if self.monitoring:
            logger.warning("SMART monitoring already active")
            return False
        
        if not self.nvme_available:
            logger.error("Cannot start SMART monitoring: nvme-cli not available")
            return False
        
        self.sampling_interval = sampling_interval
        self.real_time_callback = real_time_callback
        self.monitoring = True
        
        # Initialize result
        self.result = SMARTMonitoringResult(
            device_path=self.device_path,
            session_start=time.time(),
            session_end=0,
            sampling_interval=sampling_interval
        )
        
        # Get initial SMART data
        initial_smart = self.query_smart_data()
        if initial_smart:
            self.result.initial_smart = initial_smart
            self.result.samples.append(initial_smart)
            logger.info(f"SMART monitoring started for {self.device_path}: "
                       f"Temp={initial_smart.temperature_celsius}°C, "
                       f"Spare={initial_smart.available_spare}%")
        else:
            logger.warning("Could not get initial SMART data")
        
        # Start monitoring thread
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True
        )
        self.monitor_thread.start()
        
        return True
    
    def stop_monitoring(self) -> Optional[SMARTMonitoringResult]:
        """
        Stop monitoring and return results
        
        Returns:
            SMARTMonitoringResult with monitoring data
        """
        if not self.monitoring:
            logger.warning("SMART monitoring not active")
            return None
        
        logger.info("Stopping SMART monitoring...")
        self.monitoring = False
        
        # Wait for thread to finish
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=10.0)
        
        if self.result:
            self.result.session_end = time.time()
            self.result.total_samples = len(self.result.samples)
            
            # Get final SMART data
            final_smart = self.query_smart_data()
            if final_smart:
                self.result.final_smart = final_smart
                self.result.samples.append(final_smart)
                self.result.total_samples += 1
            
            self.result.monitoring_successful = True
            
            # Log summary
            temp_stats = self.result.get_temperature_stats()
            smart_deltas = self.result.calculate_deltas()
            
            logger.info(f"SMART monitoring stopped. Duration: {self.result.session_end - self.result.session_start:.1f}s, "
                       f"Samples: {self.result.total_samples}")
            
            if temp_stats:
                logger.info(f"Temperature range: {temp_stats.get('min_temp_celsius', 0):.1f}°C - "
                           f"{temp_stats.get('max_temp_celsius', 0):.1f}°C")
            
            if smart_deltas:
                logger.info(f"Data written: {smart_deltas.get('data_units_written', 0)} units, "
                           f"Media errors: +{smart_deltas.get('media_errors', 0)}")
        
        return self.result
    
    def _monitor_loop(self):
        """Background monitoring loop"""
        logger.debug("SMART monitoring loop started")
        
        while self.monitoring:
            try:
                # Query current SMART data
                smart_data = self.query_smart_data()
                if smart_data and self.result:
                    self.result.samples.append(smart_data)
                    
                    # Call real-time callback if provided
                    if self.real_time_callback:
                        try:
                            self.real_time_callback(smart_data)
                        except Exception as e:
                            logger.warning(f"Real-time callback error: {e}")
                
                # Sleep for sampling interval
                time.sleep(self.sampling_interval)
                
            except Exception as e:
                logger.error(f"Error in SMART monitoring loop: {e}")
                time.sleep(self.sampling_interval)
        
        logger.debug("SMART monitoring loop ended")
    
    def is_monitoring(self) -> bool:
        """Check if monitoring is active"""
        return self.monitoring
    
    def get_current_smart(self) -> Optional[SMARTData]:
        """Get current SMART data without starting monitoring"""
        return self.query_smart_data()


def simulate_smart_data() -> SMARTData:
    """
    Simulate SMART data for development/testing without actual NVMe device
    
    Returns:
        Simulated SMARTData object
    """
    import random
    
    # Simulate realistic NVMe temperatures and wear
    base_temp = random.randint(35, 65)  # Typical NVMe operating temperature
    
    return SMARTData(
        timestamp=time.time(),
        temperature_celsius=base_temp,
        temperature_sensors={'sensor_1': base_temp, 'sensor_2': base_temp + 2},
        critical_warning=0,
        available_spare=random.randint(98, 100),
        available_spare_threshold=10,
        percentage_used=random.randint(1, 15),
        data_units_read=random.randint(1000000, 10000000),
        data_units_written=random.randint(500000, 5000000),
        host_read_commands=random.randint(10000000, 100000000),
        host_write_commands=random.randint(5000000, 50000000),
        controller_busy_time=random.randint(1000, 10000),
        power_cycles=random.randint(100, 1000),
        power_on_hours=random.randint(1000, 10000),
        unsafe_shutdowns=random.randint(0, 5),
        media_errors=random.randint(0, 2),
        num_err_log_entries=random.randint(0, 3),
        warning_temp_time=0,
        critical_comp_time=0
    )


if __name__ == '__main__':
    # Test the SMART monitoring functionality
    logging.basicConfig(level=logging.INFO)
    
    print("Testing NVMe SMART Monitor")
    print("=" * 50)
    
    # Test with a mock device
    monitor = NVMeSMARTMonitor('/dev/nvme0n1')
    
    if monitor.nvme_available:
        print("nvme-cli is available")
        
        # Test single query
        smart_data = monitor.query_smart_data()
        if smart_data:
            print(f"Current temperature: {smart_data.temperature_celsius}°C")
            print(f"Available spare: {smart_data.available_spare}%")
            print(f"Percentage used: {smart_data.percentage_used}%")
            print(f"Media errors: {smart_data.media_errors}")
        else:
            print("Could not query SMART data")
    else:
        print("nvme-cli not available - testing with simulated data")
        
        # Test with simulated data
        sim_data = simulate_smart_data()
        print(f"Simulated temperature: {sim_data.temperature_celsius}°C")
        print(f"Simulated spare: {sim_data.available_spare}%")
        print(f"Simulated wear: {sim_data.percentage_used}%")
    
    print(f"\nNVMe SMART Monitor test completed")