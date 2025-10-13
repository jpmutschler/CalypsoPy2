#!/usr/bin/env python3
"""
CalypsoPy+ COM Error Monitor
Monitors COM device error counters during PCIe tests
"""

import re
import time
import logging
import threading
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class ErrorCounters:
    """PCIe error counter snapshot"""
    timestamp: float
    port_receive: int = 0
    bad_tlp: int = 0
    bad_dllp: int = 0
    rec_diag: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp,
            'port_receive': self.port_receive,
            'bad_tlp': self.bad_tlp,
            'bad_dllp': self.bad_dllp,
            'rec_diag': self.rec_diag
        }


@dataclass
class ErrorMonitorResult:
    """Results from error monitoring session"""
    session_start: float
    session_end: float
    samples: List[ErrorCounters] = field(default_factory=list)
    initial_counters: Optional[ErrorCounters] = None
    final_counters: Optional[ErrorCounters] = None
    error_deltas: Optional[Dict[str, int]] = None
    sampling_interval: float = 1.0
    total_samples: int = 0
    
    def calculate_deltas(self):
        """Calculate error counter differences"""
        if self.initial_counters and self.final_counters:
            self.error_deltas = {
                'port_receive': self.final_counters.port_receive - self.initial_counters.port_receive,
                'bad_tlp': self.final_counters.bad_tlp - self.initial_counters.bad_tlp,
                'bad_dllp': self.final_counters.bad_dllp - self.initial_counters.bad_dllp,
                'rec_diag': self.final_counters.rec_diag - self.initial_counters.rec_diag
            }
        
    def to_dict(self) -> Dict[str, Any]:
        # Calculate additional statistics for charting
        chart_data = self._prepare_chart_data()
        
        return {
            'session_start': self.session_start,
            'session_end': self.session_end,
            'duration_seconds': self.session_end - self.session_start,
            'total_samples': self.total_samples,
            'sampling_interval': self.sampling_interval,
            'initial_counters': self.initial_counters.to_dict() if self.initial_counters else None,
            'final_counters': self.final_counters.to_dict() if self.final_counters else None,
            'error_deltas': self.error_deltas,
            'samples': [sample.to_dict() for sample in self.samples],
            'chart_data': chart_data,
            'metadata': {
                'error_types': ['port_receive', 'bad_tlp', 'bad_dllp', 'rec_diag'],
                'error_descriptions': {
                    'port_receive': 'Port Receive Errors',
                    'bad_tlp': 'Bad Transaction Layer Packet Errors',
                    'bad_dllp': 'Bad Data Link Layer Packet Errors', 
                    'rec_diag': 'Recovery Diagnostic Errors'
                },
                'monitoring_source': 'Atlas 3 Switch via COM',
                'has_error_activity': sum(abs(delta) for delta in (self.error_deltas or {}).values()) > 0
            }
        }
    
    def _prepare_chart_data(self) -> Dict[str, Any]:
        """Prepare data optimized for frontend charting"""
        if not self.samples:
            return {
                'timestamps': [],
                'port_receive': [],
                'bad_tlp': [],
                'bad_dllp': [],
                'rec_diag': [],
                'cumulative_errors': []
            }
        
        # Extract time series data
        timestamps = [sample.timestamp for sample in self.samples]
        port_receive = [sample.port_receive for sample in self.samples]
        bad_tlp = [sample.bad_tlp for sample in self.samples]
        bad_dllp = [sample.bad_dllp for sample in self.samples]
        rec_diag = [sample.rec_diag for sample in self.samples]
        
        # Calculate cumulative errors for trend visualization
        cumulative_errors = []
        for sample in self.samples:
            total = sample.port_receive + sample.bad_tlp + sample.bad_dllp + sample.rec_diag
            cumulative_errors.append(total)
        
        return {
            'timestamps': timestamps,
            'port_receive': port_receive,
            'bad_tlp': bad_tlp,
            'bad_dllp': bad_dllp,
            'rec_diag': rec_diag,
            'cumulative_errors': cumulative_errors,
            'relative_timestamps': [(t - timestamps[0]) for t in timestamps] if timestamps else []
        }


class COMErrorMonitor:
    """
    Monitor Atlas 3 Switch PCIe Link Training Error Counters
    
    Queries the Atlas 3 Switch via COM device using the 'error' command to get
    PCIe link training error counters between Atlas 3 and target devices:
    - Port Receive: Port receive errors
    - BadTLP: Bad Transaction Layer Packet errors  
    - BadDLLP: Bad Data Link Layer Packet errors
    - RecDiag: Recovery diagnostic errors
    
    These errors occur during PCIe link training and operation between
    the Atlas 3 switch and downstream devices.
    """
    
    def __init__(self, calypso_manager=None, port: Optional[str] = None):
        """
        Initialize COM error monitor
        
        Args:
            calypso_manager: CalypsoPyManager instance for COM communication
            port: COM port to use (optional if manager has active connection)
        """
        self.calypso_manager = calypso_manager
        self.port = port
        self.monitoring = False
        self.monitor_thread = None
        self.result = None
        self.real_time_callback = None
        self.sampling_interval = 1.0  # Default 1 second
        
        logger.info("COM Error Monitor initialized")
    
    def parse_error_response(self, response: str) -> Optional[ErrorCounters]:
        """
        Parse error command response to extract error counters
        
        Expected format variations:
        - "Port Receive: 123, BadTLP: 456, BadDLLP: 789, RecDiag: 012"
        - "PortRx=123 BadTLP=456 BadDLLP=789 RecDiag=012"
        - Multi-line format with individual error lines
        
        Args:
            response: Raw response from 'error' command
            
        Returns:
            ErrorCounters object or None if parsing failed
        """
        if not response:
            return None
            
        try:
            # Initialize counters
            counters = ErrorCounters(timestamp=time.time())
            
            # Try multiple parsing patterns
            response_lower = response.lower()
            
            # Pattern 1: "Port Receive: 123, BadTLP: 456, ..."
            patterns = [
                r'port\s*receive[:\s=]+(\d+)',
                r'portrx[:\s=]+(\d+)',
                r'port_rx[:\s=]+(\d+)',
                r'rx_errors?[:\s=]+(\d+)'
            ]
            
            for pattern in patterns:
                match = re.search(pattern, response_lower)
                if match:
                    counters.port_receive = int(match.group(1))
                    break
            
            # Pattern 2: BadTLP
            patterns = [
                r'bad\s*tlp[:\s=]+(\d+)',
                r'badtlp[:\s=]+(\d+)',
                r'tlp\s*errors?[:\s=]+(\d+)'
            ]
            
            for pattern in patterns:
                match = re.search(pattern, response_lower)
                if match:
                    counters.bad_tlp = int(match.group(1))
                    break
            
            # Pattern 3: BadDLLP
            patterns = [
                r'bad\s*dllp[:\s=]+(\d+)',
                r'baddllp[:\s=]+(\d+)',
                r'dllp\s*errors?[:\s=]+(\d+)'
            ]
            
            for pattern in patterns:
                match = re.search(pattern, response_lower)
                if match:
                    counters.bad_dllp = int(match.group(1))
                    break
            
            # Pattern 4: RecDiag
            patterns = [
                r'rec\s*diag[:\s=]+(\d+)',
                r'recdiag[:\s=]+(\d+)',
                r'recovery\s*diagnostic[:\s=]+(\d+)',
                r'diag\s*errors?[:\s=]+(\d+)'
            ]
            
            for pattern in patterns:
                match = re.search(pattern, response_lower)
                if match:
                    counters.rec_diag = int(match.group(1))
                    break
            
            logger.debug(f"Parsed error counters: RX={counters.port_receive}, "
                        f"BadTLP={counters.bad_tlp}, BadDLLP={counters.bad_dllp}, "
                        f"RecDiag={counters.rec_diag}")
            
            return counters
            
        except Exception as e:
            logger.warning(f"Failed to parse error response: {e}")
            logger.debug(f"Raw response was: {response}")
            return None
    
    def query_error_counters(self) -> Optional[ErrorCounters]:
        """
        Query current error counters from COM device
        
        Returns:
            ErrorCounters object or None if query failed
        """
        if not self.calypso_manager or not self.port:
            logger.warning("No CalypsoPy manager or port configured")
            return None
        
        try:
            # Execute 'error' command
            result = self.calypso_manager.execute_command(
                port=self.port,
                command='error',
                dashboard='error_monitor',
                use_cache=False  # Always get fresh data
            )
            
            if not result.get('success'):
                logger.warning(f"Error command failed: {result.get('message', 'Unknown error')}")
                return None
            
            raw_response = result.get('data', {}).get('raw', '')
            return self.parse_error_response(raw_response)
            
        except Exception as e:
            logger.error(f"Failed to query error counters: {e}")
            return None
    
    def start_monitoring(self, 
                        sampling_interval: float = 1.0,
                        real_time_callback: Optional[Callable] = None) -> bool:
        """
        Start monitoring error counters in background thread
        
        Args:
            sampling_interval: Time between samples in seconds
            real_time_callback: Optional callback for real-time updates
            
        Returns:
            True if monitoring started successfully
        """
        if self.monitoring:
            logger.warning("Error monitoring already active")
            return False
        
        if not self.calypso_manager or not self.port:
            logger.error("Cannot start monitoring: no CalypsoPy manager or port")
            return False
        
        self.sampling_interval = sampling_interval
        self.real_time_callback = real_time_callback
        self.monitoring = True
        
        # Initialize result
        self.result = ErrorMonitorResult(
            session_start=time.time(),
            session_end=0,
            sampling_interval=sampling_interval
        )
        
        # Get initial counters
        initial_counters = self.query_error_counters()
        if initial_counters:
            self.result.initial_counters = initial_counters
            self.result.samples.append(initial_counters)
            logger.info(f"Error monitoring started with initial counters: "
                       f"RX={initial_counters.port_receive}, BadTLP={initial_counters.bad_tlp}, "
                       f"BadDLLP={initial_counters.bad_dllp}, RecDiag={initial_counters.rec_diag}")
        else:
            logger.warning("Could not get initial error counters")
        
        # Start monitoring thread
        self.monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True
        )
        self.monitor_thread.start()
        
        return True
    
    def stop_monitoring(self) -> Optional[ErrorMonitorResult]:
        """
        Stop monitoring and return results
        
        Returns:
            ErrorMonitorResult with monitoring data
        """
        if not self.monitoring:
            logger.warning("Error monitoring not active")
            return None
        
        logger.info("Stopping error monitoring...")
        self.monitoring = False
        
        # Wait for thread to finish
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5.0)
        
        if self.result:
            self.result.session_end = time.time()
            self.result.total_samples = len(self.result.samples)
            
            # Get final counters
            final_counters = self.query_error_counters()
            if final_counters:
                self.result.final_counters = final_counters
                self.result.samples.append(final_counters)
                self.result.total_samples += 1
            
            # Calculate deltas
            self.result.calculate_deltas()
            
            logger.info(f"Error monitoring stopped. Duration: {self.result.session_end - self.result.session_start:.1f}s, "
                       f"Samples: {self.result.total_samples}")
            
            if self.result.error_deltas:
                logger.info(f"Error counter changes: {self.result.error_deltas}")
        
        return self.result
    
    def _monitor_loop(self):
        """Background monitoring loop"""
        logger.debug("Error monitoring loop started")
        
        while self.monitoring:
            try:
                # Query current counters
                counters = self.query_error_counters()
                if counters and self.result:
                    self.result.samples.append(counters)
                    
                    # Call real-time callback if provided
                    if self.real_time_callback:
                        try:
                            self.real_time_callback(counters)
                        except Exception as e:
                            logger.warning(f"Real-time callback error: {e}")
                
                # Sleep for sampling interval
                time.sleep(self.sampling_interval)
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                time.sleep(self.sampling_interval)
        
        logger.debug("Error monitoring loop ended")
    
    def is_monitoring(self) -> bool:
        """Check if monitoring is active"""
        return self.monitoring
    
    def get_current_counters(self) -> Optional[ErrorCounters]:
        """Get current error counters without starting monitoring"""
        return self.query_error_counters()


def simulate_error_response() -> str:
    """
    Simulate an error command response for development/testing
    
    Returns:
        Simulated error response string
    """
    import random
    
    # Simulate some error counters with occasional increments
    base_port_rx = random.randint(0, 50)
    base_bad_tlp = random.randint(0, 10)
    base_bad_dllp = random.randint(0, 5)
    base_rec_diag = random.randint(0, 20)
    
    return f"Port Receive: {base_port_rx}, BadTLP: {base_bad_tlp}, BadDLLP: {base_bad_dllp}, RecDiag: {base_rec_diag}"


if __name__ == '__main__':
    # Test the error monitoring functionality
    logging.basicConfig(level=logging.INFO)
    
    print("Testing COM Error Monitor")
    print("=" * 50)
    
    # Test parsing
    monitor = COMErrorMonitor()
    
    test_responses = [
        "Port Receive: 123, BadTLP: 456, BadDLLP: 789, RecDiag: 012",
        "PortRx=42 BadTLP=7 BadDLLP=3 RecDiag=15",
        "Port_Rx: 0\nBadTLP: 1\nBadDLLP: 0\nRecDiag: 5",
        simulate_error_response()
    ]
    
    print("Testing response parsing:")
    for i, response in enumerate(test_responses):
        print(f"\nTest {i+1}: {response}")
        counters = monitor.parse_error_response(response)
        if counters:
            print(f"  Parsed: RX={counters.port_receive}, BadTLP={counters.bad_tlp}, "
                  f"BadDLLP={counters.bad_dllp}, RecDiag={counters.rec_diag}")
        else:
            print("  Failed to parse")
    
    print(f"\nCOM Error Monitor test completed")