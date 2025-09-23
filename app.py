#!/usr/bin/env python3
"""
CalypsoPy+ by Serial Cables
Professional Serial Communication Interface for Hardware Development
"""

import asyncio
import json
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import serial
import serial.tools.list_ports
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from functools import lru_cache
import re
from collections import deque
import hashlib
import subprocess
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/calypso_py.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class CalypsoPyCache:
    """Advanced caching system optimized for hardware development workflows"""

    def __init__(self, max_size: int = 2000, ttl_seconds: int = 600):
        self.cache = {}
        self.access_times = {}
        self.command_stats = {}
        self.max_size = max_size
        self.ttl = ttl_seconds
        self.lock = threading.RLock()

    def _generate_key(self, command: str, port: str, dashboard: str = "general") -> str:
        """Generate cache key with dashboard context"""
        return hashlib.md5(f"{dashboard}:{port}:{command}".encode()).hexdigest()

    def get(self, command: str, port: str, dashboard: str = "general") -> Optional[Dict]:
        """Retrieve cached response with dashboard awareness"""
        with self.lock:
            key = self._generate_key(command, port, dashboard)
            if key not in self.cache:
                return None

            # Check TTL with different expiration for different dashboards
            ttl = self.ttl
            if dashboard in ['device_info', 'firmware']:
                ttl = 3600  # Longer cache for device info and firmware
            elif dashboard in ['link_status', 'i2c']:
                ttl = 60  # Shorter cache for dynamic data

            if time.time() - self.access_times[key] > ttl:
                del self.cache[key]
                del self.access_times[key]
                return None

            self.access_times[key] = time.time()
            return self.cache[key]

    def set(self, command: str, port: str, response: Dict, dashboard: str = "general"):
        """Cache response with dashboard context"""
        with self.lock:
            key = self._generate_key(command, port, dashboard)

            # Update command statistics
            if command not in self.command_stats:
                self.command_stats[command] = {'count': 0, 'avg_response_time': 0}

            # Implement LRU eviction
            if len(self.cache) >= self.max_size:
                oldest_key = min(self.access_times.keys(),
                                 key=lambda k: self.access_times[k])
                del self.cache[oldest_key]
                del self.access_times[oldest_key]

            self.cache[key] = response
            self.access_times[key] = time.time()

    def get_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        with self.lock:
            return {
                'size': len(self.cache),
                'max_size': self.max_size,
                'hit_rate': getattr(self, '_hit_rate', 0),
                'command_stats': dict(list(self.command_stats.items())[:10])  # Top 10
            }


class HardwareResponseParser:
    """Specialized parser for hardware development responses"""

    @staticmethod
    def parse_response(raw_response: str, command: str = "", dashboard: str = "general") -> Dict[str, Any]:
        """Parse hardware responses with dashboard-specific parsing"""
        parsed_data = {
            'raw': raw_response.strip(),
            'timestamp': datetime.now().isoformat(),
            'command': command,
            'dashboard': dashboard,
            'parsed': {},
            'type': 'unknown',
            'status': 'success'
        }

        clean_response = re.sub(r'[\r\n\x00-\x1f\x7f-\x9f]', ' ', raw_response).strip()

        # Dashboard-specific parsing
        if dashboard == 'device_info':
            return HardwareResponseParser._parse_device_info(clean_response, parsed_data)
        elif dashboard == 'link_status':
            return HardwareResponseParser._parse_link_status(clean_response, parsed_data)
        elif dashboard == 'port_config':
            return HardwareResponseParser._parse_port_config(clean_response, parsed_data)
        elif dashboard == 'i2c':
            return HardwareResponseParser._parse_i2c_response(clean_response, parsed_data)
        elif dashboard == 'advanced':
            return HardwareResponseParser._parse_advanced(clean_response, parsed_data)
        elif dashboard == 'resets':
            return HardwareResponseParser._parse_reset_response(clean_response, parsed_data)
        elif dashboard == 'firmware':
            return HardwareResponseParser._parse_firmware_response(clean_response, parsed_data)

        # General parsing fallback
        return HardwareResponseParser._parse_general(clean_response, parsed_data)

    @staticmethod
    def _parse_device_info(response: str, parsed_data: Dict) -> Dict:
        """Parse device information responses including sysinfo"""
        # Check if this is a sysinfo response
        if 'sysinfo' in response.lower() or any(
                keyword in response for keyword in ['s/n', 'company', 'model', 'version', 'thermal', 'voltage']):
            parsed_data['type'] = 'sysinfo'
            parsed_data['parsed'] = HardwareResponseParser._parse_sysinfo_structure(response)
            return parsed_data

        # Standard device info patterns
        info_patterns = {
            'model': r'(?:model|device|part)[:\s]+([A-Za-z0-9\-_]+)',
            'version': r'(?:version|ver|fw)[:\s]+([0-9\.]+)',
            'serial': r'(?:serial|sn)[:\s]+([A-Za-z0-9]+)',
            'manufacturer': r'(?:mfg|manufacturer)[:\s]+([A-Za-z\s]+)',
            'revision': r'(?:rev|revision)[:\s]+([A-Za-z0-9\.]+)'
        }

        device_info = {}
        for key, pattern in info_patterns.items():
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                device_info[key] = match.group(1).strip()

        parsed_data['parsed'] = device_info
        parsed_data['type'] = 'device_info'
        return parsed_data

    @staticmethod
    def _parse_sysinfo_structure(response: str) -> Dict:
        """Parse structured sysinfo command output"""
        sysinfo_data = {
            'hardware': {},
            'thermal': {},
            'voltages': [],
            'current': {},
            'ports': [],
            'errors': []
        }

        lines = response.split('\n')
        current_section = None

        for line in lines:
            line = line.strip()
            if not line or line.startswith('=') or line.startswith('-'):
                continue

            # Detect sections
            if 'ver' in line.lower() or 's/n' in line:
                current_section = 'hardware'
            elif 'thermal' in line.lower():
                current_section = 'thermal'
            elif 'voltage' in line.lower():
                current_section = 'voltages'
            elif 'current' in line.lower():
                current_section = 'current'
            elif 'port' in line.lower():
                current_section = 'ports'
            elif 'error' in line.lower():
                current_section = 'errors'

            # Parse based on current section
            if current_section == 'hardware':
                if 's/n' in line:
                    match = re.search(r's/n\s*:\s*([A-Za-z0-9]+)', line)
                    if match:
                        sysinfo_data['hardware']['serial'] = match.group(1)
                elif 'company' in line:
                    match = re.search(r'company\s*:\s*(.+)', line)
                    if match:
                        sysinfo_data['hardware']['company'] = match.group(1).strip()
                elif 'model' in line:
                    match = re.search(r'model\s*:\s*(.+)', line)
                    if match:
                        sysinfo_data['hardware']['model'] = match.group(1).strip()
                elif 'version' in line:
                    match = re.search(r'version\s*:\s*([0-9\.]+)', line)
                    if match:
                        sysinfo_data['hardware']['version'] = match.group(1)
                elif 'sdk' in line.lower():
                    match = re.search(r'sdk.*:\s*(.+)', line)
                    if match:
                        sysinfo_data['hardware']['sdk_version'] = match.group(1).strip()

            elif current_section == 'thermal':
                if 'temperature' in line:
                    match = re.search(r'(\d+)\s*degree', line)
                    if match:
                        sysinfo_data['thermal']['board_temperature'] = int(match.group(1))
                elif 'fan' in line:
                    match = re.search(r'(\d+)\s*rpm', line)
                    if match:
                        sysinfo_data['thermal']['fan_speed'] = int(match.group(1))

            elif current_section == 'voltages':
                voltage_match = re.search(r'(\d+\.?\d*v?)\s+voltage\s*:\s*(\d+)\s*mv', line, re.IGNORECASE)
                if voltage_match:
                    rail = voltage_match.group(1)
                    voltage = int(voltage_match.group(2))
                    sysinfo_data['voltages'].append({
                        'rail': rail.upper() if rail.endswith('V') else rail.upper() + 'V',
                        'voltage': voltage,
                        'unit': 'mV',
                        'status': 'normal'  # Could be enhanced with actual status parsing
                    })

            elif current_section == 'current':
                current_match = re.search(r'(\d+)\s*ma', line, re.IGNORECASE)
                if current_match:
                    sysinfo_data['current']['board_current'] = int(current_match.group(1))

            elif current_section == 'ports':
                port_match = re.search(r'(port\d+):\s*(.+)', line, re.IGNORECASE)
                if port_match:
                    sysinfo_data['ports'].append({
                        'name': port_match.group(1).title(),
                        'specs': port_match.group(2)
                    })

            elif current_section == 'errors':
                error_match = re.search(r'(\d+\.?\d*v?)\s+.*error\s*:\s*(\d+)', line, re.IGNORECASE)
                if error_match:
                    sysinfo_data['errors'].append({
                        'type': error_match.group(1).upper(),
                        'count': int(error_match.group(2))
                    })

        return sysinfo_data

    @staticmethod
    def _parse_link_status(response: str, parsed_data: Dict) -> Dict:
        """Parse link/connection status responses"""
        status_patterns = {
            'link_up': r'(?:link|connection)[:\s]*(up|down|active|inactive)',
            'speed': r'(?:speed|rate)[:\s]*([0-9]+)\s*([kmg]?bps|hz)?',
            'errors': r'(?:error|err)[:\s]*([0-9]+)',
            'packets': r'(?:packet|pkt)[:\s]*([0-9]+)',
            'signal_strength': r'(?:signal|rssi)[:\s]*(-?[0-9]+)',
        }

        link_info = {}
        for key, pattern in status_patterns.items():
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                link_info[key] = match.group(1).strip()

        parsed_data['parsed'] = link_info
        parsed_data['type'] = 'link_status'
        return parsed_data

    @staticmethod
    def _parse_port_config(response: str, parsed_data: Dict) -> Dict:
        """Parse port configuration responses"""
        config_patterns = {
            'baudrate': r'(?:baud|rate)[:\s]*([0-9]+)',
            'parity': r'(?:parity)[:\s]*(none|odd|even)',
            'data_bits': r'(?:data|bits)[:\s]*([5-8])',
            'stop_bits': r'(?:stop)[:\s]*([12])',
            'flow_control': r'(?:flow|rts|cts)[:\s]*(on|off|enabled|disabled)'
        }

        port_config = {}
        for key, pattern in config_patterns.items():
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                port_config[key] = match.group(1).strip()

        parsed_data['parsed'] = port_config
        parsed_data['type'] = 'port_config'
        return parsed_data

    @staticmethod
    def _parse_i2c_response(response: str, parsed_data: Dict) -> Dict:
        """Parse I2C/I3C communication responses"""
        # I2C address pattern
        addr_match = re.search(r'(?:addr|address)[:\s]*0?x?([0-9a-f]+)', response, re.IGNORECASE)

        # Data pattern (hex bytes)
        data_match = re.findall(r'(?:0x)?([0-9a-f]{2})', response, re.IGNORECASE)

        i2c_data = {}
        if addr_match:
            i2c_data['address'] = f"0x{addr_match.group(1).upper()}"

        if data_match:
            i2c_data['data'] = [f"0x{byte.upper()}" for byte in data_match]
            i2c_data['data_length'] = len(data_match)

        # Check for ACK/NACK
        if re.search(r'\back\b', response, re.IGNORECASE):
            i2c_data['status'] = 'ACK'
        elif re.search(r'\bnack\b', response, re.IGNORECASE):
            i2c_data['status'] = 'NACK'

        parsed_data['parsed'] = i2c_data
        parsed_data['type'] = 'i2c_response'
        return parsed_data

    @staticmethod
    def _parse_advanced(response: str, parsed_data: Dict) -> Dict:
        """Parse advanced diagnostic responses"""
        # Look for register values
        reg_matches = re.findall(r'(?:reg|register)[:\s]*([0-9a-f]+)[:\s]*([0-9a-f]+)', response, re.IGNORECASE)

        advanced_data = {}
        if reg_matches:
            advanced_data['registers'] = {}
            for reg, value in reg_matches:
                advanced_data['registers'][f"0x{reg.upper()}"] = f"0x{value.upper()}"

        # Look for diagnostic values
        diag_patterns = {
            'temperature': r'(?:temp|temperature)[:\s]*([0-9\.\-]+)',
            'voltage': r'(?:volt|voltage)[:\s]*([0-9\.]+)',
            'current': r'(?:current|amp)[:\s]*([0-9\.]+)'
        }

        for key, pattern in diag_patterns.items():
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                advanced_data[key] = float(match.group(1))

        parsed_data['parsed'] = advanced_data
        parsed_data['type'] = 'advanced_diagnostics'
        return parsed_data

    @staticmethod
    def _parse_reset_response(response: str, parsed_data: Dict) -> Dict:
        """Parse reset operation responses"""
        reset_data = {}

        if re.search(r'reset.*complete|reset.*ok', response, re.IGNORECASE):
            reset_data['status'] = 'completed'
        elif re.search(r'reset.*fail|reset.*error', response, re.IGNORECASE):
            reset_data['status'] = 'failed'
            parsed_data['status'] = 'error'
        elif re.search(r'reset.*progress|resetting', response, re.IGNORECASE):
            reset_data['status'] = 'in_progress'

        # Extract reset type if available
        reset_type_match = re.search(r'(soft|hard|factory|system)\s*reset', response, re.IGNORECASE)
        if reset_type_match:
            reset_data['type'] = reset_type_match.group(1).lower()

        parsed_data['parsed'] = reset_data
        parsed_data['type'] = 'reset_response'
        return parsed_data

    @staticmethod
    def _parse_firmware_response(response: str, parsed_data: Dict) -> Dict:
        """Parse firmware update responses"""
        fw_data = {}

        # Progress percentage
        progress_match = re.search(r'([0-9]+)\s*%', response)
        if progress_match:
            fw_data['progress'] = int(progress_match.group(1))

        # Firmware version
        version_match = re.search(r'(?:fw|firmware)[:\s]*v?([0-9\.]+)', response, re.IGNORECASE)
        if version_match:
            fw_data['version'] = version_match.group(1)

        # Status keywords
        if re.search(r'update.*complete|upgrade.*complete', response, re.IGNORECASE):
            fw_data['status'] = 'completed'
        elif re.search(r'update.*fail|upgrade.*fail', response, re.IGNORECASE):
            fw_data['status'] = 'failed'
            parsed_data['status'] = 'error'
        elif re.search(r'update.*progress|upgrading', response, re.IGNORECASE):
            fw_data['status'] = 'in_progress'

        parsed_data['parsed'] = fw_data
        parsed_data['type'] = 'firmware_response'
        return parsed_data

    @staticmethod
    def _parse_general(response: str, parsed_data: Dict) -> Dict:
        """General parsing for unspecified responses"""
        # Try JSON first
        try:
            json_data = json.loads(response)
            parsed_data['parsed'] = json_data
            parsed_data['type'] = 'json'
            return parsed_data
        except (json.JSONDecodeError, ValueError):
            pass

        # Key-value pairs
        kv_pattern = r'([A-Za-z_][A-Za-z0-9_]*)[=:]([^\s,;]+)'
        kv_matches = re.findall(kv_pattern, response)
        if kv_matches:
            kv_dict = {}
            for key, value in kv_matches:
                # Type conversion
                if value.lower() in ['true', 'false']:
                    kv_dict[key] = value.lower() == 'true'
                elif value.replace('.', '').replace('-', '').isdigit():
                    kv_dict[key] = float(value) if '.' in value else int(value)
                else:
                    kv_dict[key] = value

            parsed_data['parsed'] = kv_dict
            parsed_data['type'] = 'key_value'
            return parsed_data

        # Default to plain text
        parsed_data['parsed'] = {'text': response}
        parsed_data['type'] = 'text'
        return parsed_data

    @staticmethod
    def _parse_link_status(response: str, parsed_data: Dict) -> Dict:
        """Parse link/connection status responses including showport"""

        # Check if this is a showport response
        if 'showport' in response.lower() or 'port slot' in response.lower():
            parsed_data['type'] = 'showport'
            parsed_data['parsed'] = HardwareResponseParser._parse_showport_structure(response)
            return parsed_data

        # Standard link status patterns (existing code)
        status_patterns = {
            'link_up': r'(?:link|connection)[:\s]*(up|down|active|inactive)',
            'speed': r'(?:speed|rate)[:\s]*([0-9]+)\s*([kmg]?bps|hz)?',
            'errors': r'(?:error|err)[:\s]*([0-9]+)',
            'packets': r'(?:packet|pkt)[:\s]*([0-9]+)',
            'signal_strength': r'(?:signal|rssi)[:\s]*(-?[0-9]+)',
        }

        link_info = {}
        for key, pattern in status_patterns.items():
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                link_info[key] = match.group(1).strip()

        parsed_data['parsed'] = link_info
        parsed_data['type'] = 'link_status'
        return parsed_data

    @staticmethod
    def _parse_showport_structure(response: str) -> Dict:
        """Parse structured showport command output"""
        showport_data = {
            'ports': [],
            'upstream': None,
            'golden_finger': None,
            'total_ports': 0,
            'connected_ports': 0
        }

        lines = response.split('\n')
        current_section = None

        for line in lines:
            line = line.strip()
            if not line or '-' in line[:20]:  # Skip divider lines
                continue

            # Detect sections
            if 'port slot' in line.lower():
                current_section = 'ports'
                continue
            elif 'port upstream' in line.lower():
                current_section = 'upstream'
                continue
            elif 'golden finger' in line.lower():
                current_section = 'golden_finger'
                continue

            # Parse based on current section
            if current_section == 'ports' and ':' in line:
                port_info = HardwareResponseParser._parse_port_line(line)
                if port_info:
                    showport_data['ports'].append(port_info)

            elif current_section == 'upstream' and ':' in line:
                showport_data['upstream'] = HardwareResponseParser._parse_port_line(line)

            elif current_section == 'golden_finger' and ':' in line:
                showport_data['golden_finger'] = HardwareResponseParser._parse_golden_finger_line(line)

        # Calculate summary statistics
        showport_data['total_ports'] = len(showport_data['ports'])
        showport_data['connected_ports'] = len([p for p in showport_data['ports'] if p.get('connected', False)])

        return showport_data

    @staticmethod
    def _parse_port_line(line: str) -> Dict:
        """Parse individual port line from showport output"""
        # Example: "Port80: speed 06, width 08, max_speed06, max_width08"
        port_match = re.match(r'^(Port\d+|Port\s+Upstream):\s*(.+)$', line, re.IGNORECASE)
        if not port_match:
            return None

        port_name = port_match.group(1).strip()
        specs = port_match.group(2)

        # Extract values using regex
        speed_match = re.search(r'speed\s+(\d+)', specs, re.IGNORECASE)
        width_match = re.search(r'width\s+(\d+)', specs, re.IGNORECASE)
        max_speed_match = re.search(r'max_speed\s*(\d+)', specs, re.IGNORECASE)
        max_width_match = re.search(r'max_width\s*(\d+)', specs, re.IGNORECASE)

        speed = int(speed_match.group(1)) if speed_match else 0
        width = int(width_match.group(1)) if width_match else 0
        max_speed = int(max_speed_match.group(1)) if max_speed_match else 0
        max_width = int(max_width_match.group(1)) if max_width_match else 0

        # Determine connection status and generation
        connected = speed > 1
        generation = HardwareResponseParser._get_generation_from_speed(speed)
        width_display = HardwareResponseParser._get_width_display(width)
        max_width_display = HardwareResponseParser._get_width_display(max_width)

        return {
            'name': port_name,
            'speed': speed,
            'width': width,
            'max_speed': max_speed,
            'max_width': max_width,
            'connected': connected,
            'generation': generation,
            'width_display': width_display,
            'max_width_display': max_width_display
        }

    @staticmethod
    def _parse_golden_finger_line(line: str) -> Dict:
        """Parse golden finger line from showport output"""
        # Example: "Golden finger: speed 06, width 08, max_width = 16"
        specs = line.split(':', 1)[1] if ':' in line else line

        speed_match = re.search(r'speed\s+(\d+)', specs, re.IGNORECASE)
        width_match = re.search(r'width\s+(\d+)', specs, re.IGNORECASE)
        max_width_match = re.search(r'max_width\s*=?\s*(\d+)', specs, re.IGNORECASE)

        speed = int(speed_match.group(1)) if speed_match else 0
        width = int(width_match.group(1)) if width_match else 0
        max_width = int(max_width_match.group(1)) if max_width_match else 0

        generation = HardwareResponseParser._get_generation_from_speed(speed)
        width_display = HardwareResponseParser._get_width_display(width)
        max_width_display = HardwareResponseParser._get_width_display(max_width)

        return {
            'speed': speed,
            'width': width,
            'max_width': max_width,
            'generation': generation,
            'width_display': width_display,
            'max_width_display': max_width_display
        }

    @staticmethod
    def _get_generation_from_speed(speed: int) -> Dict:
        """Convert speed code to generation information"""
        if speed == 6:
            return {'text': 'Gen6', 'class': 'gen6'}
        elif speed == 5:
            return {'text': 'Gen5', 'class': 'gen5'}
        elif speed == 4:
            return {'text': 'Gen4', 'class': 'gen4'}
        elif speed == 1:
            return {'text': 'No Connection', 'class': 'no-connection'}
        else:
            return {'text': 'Unknown', 'class': 'no-connection'}

    @staticmethod
    def _get_width_display(width: int) -> str:
        """Convert width code to display string"""
        if width == 2:
            return 'x2'
        elif width == 4:
            return 'x4'
        elif width == 8:
            return 'x8'
        elif width == 16:
            return 'x16'
        elif width > 0:
            return f'x{width}'
        else:
            return '--'

class CalypsoPyManager:
    """Main manager for CalypsoPy+ hardware interface"""

    def __init__(self):
        self.connections: Dict[str, serial.Serial] = {}
        self.connection_lock = threading.RLock()
        self.cache = CalypsoPyCache()
        self.command_history: Dict[str, deque] = {}
        self.dashboard_states: Dict[str, Dict] = {}
        self.max_history = 200

        # Initialize dashboard states
        dashboards = ['device_info', 'link_status', 'port_config', 'i2c', 'advanced', 'resets', 'firmware']
        for dashboard in dashboards:
            self.dashboard_states[dashboard] = {
                'last_update': None,
                'cached_data': {},
                'command_count': 0
            }

    def list_ports(self) -> List[Dict[str, str]]:
        """List available serial ports with enhanced detection"""
        ports = []
        for port in serial.tools.list_ports.comports():
            port_info = {
                'device': port.device,
                'description': port.description or 'Unknown Device',
                'hwid': port.hwid or 'Unknown',
                'manufacturer': getattr(port, 'manufacturer', 'Unknown'),
                'product': getattr(port, 'product', 'Unknown'),
                'serial_number': getattr(port, 'serial_number', 'Unknown')
            }

            # Enhanced device detection
            desc_lower = port_info['description'].lower()
            if any(keyword in desc_lower for keyword in ['arduino', 'nano', 'uno']):
                port_info['device_type'] = 'Arduino'
                port_info['icon'] = '🔧'
            elif any(keyword in desc_lower for keyword in ['esp32', 'esp8266']):
                port_info['device_type'] = 'ESP Development Board'
                port_info['icon'] = '📡'
            elif any(keyword in desc_lower for keyword in ['ftdi', 'cp210', 'ch340']):
                port_info['device_type'] = 'USB Serial Adapter'
                port_info['icon'] = '🔌'
            else:
                port_info['device_type'] = 'Serial Device'
                port_info['icon'] = '⚡'

            ports.append(port_info)
        return ports

    def connect(self, port: str, baudrate: int = 115200, timeout: float = 2.0) -> Dict[str, Any]:
        """Connect to hardware device with CalypsoPy+ standard settings"""
        with self.connection_lock:
            if port in self.connections:
                return {'success': True, 'message': f'Already connected to {port}'}

            try:
                # CalypsoPy+ Standard Serial Settings:
                # Baud Rate: 115,200 bps
                # Data Bits: 8
                # Parity: None
                # Stop Bits: 1
                # Flow Control: None
                # Timeout: 2.0 seconds

                ser = serial.Serial(
                    port=port,
                    baudrate=115200,  # Fixed: 115,200 bps
                    timeout=2.0,  # Fixed: 2.0 seconds
                    parity=serial.PARITY_NONE,  # Fixed: None
                    stopbits=serial.STOPBITS_ONE,  # Fixed: 1 bit
                    bytesize=serial.EIGHTBITS,  # Fixed: 8 bits
                    rtscts=False,  # Fixed: No RTS/CTS flow control
                    dsrdtr=False,  # Fixed: No DSR/DTR flow control
                    xonxoff=False  # Fixed: No XON/XOFF flow control
                )

                self.connections[port] = ser
                self.command_history[port] = deque(maxlen=self.max_history)

                logger.info(f"CalypsoPy+: Connected to {port} with standard settings (115200-8-N-1)")
                return {
                    'success': True,
                    'message': f'Connected to {port}',
                    'connection_info': {
                        'port': port,
                        'baudrate': 115200,
                        'databits': 8,
                        'parity': 'None',
                        'stopbits': 1,
                        'flowcontrol': 'None',
                        'timeout': 2.0,
                        'timestamp': datetime.now().isoformat()
                    }
                }

            except serial.SerialException as e:
                logger.error(f"CalypsoPy+: Failed to connect to {port}: {str(e)}")
                return {'success': False, 'message': f'Connection failed: {str(e)}'}

    def execute_command(self, port: str, command: str, dashboard: str = "general", use_cache: bool = True) -> Dict[
        str, Any]:
        """Execute hardware command with dashboard context"""
        # Check cache first
        if use_cache:
            cached_response = self.cache.get(command, port, dashboard)
            if cached_response:
                cached_response['from_cache'] = True
                return cached_response

        with self.connection_lock:
            if port not in self.connections:
                return {'success': False, 'message': f'Port {port} not connected'}

            try:
                ser = self.connections[port]
                start_time = time.time()

                # Clear buffers
                ser.reset_input_buffer()
                ser.reset_output_buffer()

                # Send command
                command_bytes = (command + '\r\n').encode('utf-8')
                ser.write(command_bytes)
                ser.flush()

                # Read response with intelligent timeout
                response_parts = []
                last_activity = time.time()

                while time.time() - start_time < ser.timeout * 2:
                    if ser.in_waiting:
                        chunk = ser.read(ser.in_waiting).decode('utf-8', errors='ignore')
                        response_parts.append(chunk)
                        last_activity = time.time()

                        # Check for completion markers
                        full_response = ''.join(response_parts)
                        if any(term in full_response.lower() for term in
                               ['ok\r', 'error\r', 'done\r', '>\r', '#\r', 'complete\r']):
                            break
                    else:
                        # No new data, check if we should continue waiting
                        if time.time() - last_activity > 0.5:  # 500ms silence
                            break
                        time.sleep(0.01)

                raw_response = ''.join(response_parts).strip()
                response_time = (time.time() - start_time) * 1000  # ms

                if not raw_response:
                    return {'success': False, 'message': 'No response received from device'}

                # Parse response with dashboard context
                parsed_data = HardwareResponseParser.parse_response(raw_response, command, dashboard)

                result = {
                    'success': True,
                    'data': parsed_data,
                    'response_time_ms': round(response_time, 2),
                    'from_cache': False,
                    'dashboard': dashboard
                }

                # Cache successful responses
                if use_cache and parsed_data['status'] == 'success':
                    self.cache.set(command, port, result, dashboard)

                # Update command history
                if port in self.command_history:
                    self.command_history[port].append({
                        'timestamp': parsed_data['timestamp'],
                        'command': command,
                        'dashboard': dashboard,
                        'response_time_ms': response_time,
                        'success': True,
                        'response': raw_response[:200] + '...' if len(raw_response) > 200 else raw_response
                    })

                # Update dashboard state
                if dashboard in self.dashboard_states:
                    self.dashboard_states[dashboard]['last_update'] = datetime.now().isoformat()
                    self.dashboard_states[dashboard]['command_count'] += 1

                return result

            except Exception as e:
                error_msg = f"Command execution error: {str(e)}"
                logger.error(f"CalypsoPy+: Error executing '{command}' on {port}: {error_msg}")

                # Add to history even for errors
                if port in self.command_history:
                    self.command_history[port].append({
                        'timestamp': datetime.now().isoformat(),
                        'command': command,
                        'dashboard': dashboard,
                        'success': False,
                        'error': error_msg
                    })

                return {'success': False, 'message': error_msg}

    def disconnect(self, port: str) -> Dict[str, Any]:
        """Disconnect from hardware device"""
        with self.connection_lock:
            if port not in self.connections:
                return {'success': False, 'message': f'Port {port} not connected'}

            try:
                self.connections[port].close()
                del self.connections[port]
                if port in self.command_history:
                    del self.command_history[port]

                logger.info(f"CalypsoPy+: Disconnected from {port}")
                return {'success': True, 'message': f'Disconnected from {port}'}

            except Exception as e:
                logger.error(f"CalypsoPy+: Error disconnecting from {port}: {str(e)}")
                return {'success': False, 'message': f'Disconnect error: {str(e)}'}

    def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status"""
        with self.connection_lock:
            connected_ports = {}
            for port, ser in self.connections.items():
                connected_ports[port] = {
                    'connected': ser.is_open if ser else False,
                    'baudrate': ser.baudrate if ser else None,
                    'timeout': ser.timeout if ser else None,
                    'command_count': len(self.command_history.get(port, []))
                }

            return {
                'connected_ports': connected_ports,
                'dashboard_states': self.dashboard_states,
                'cache_stats': self.cache.get_stats(),
                'system_info': {
                    'version': '1.0.0',
                    'uptime': time.time(),
                    'total_commands': sum(len(hist) for hist in self.command_history.values())
                }
            }


# Flask application setup
app = Flask(__name__)
app.config['SECRET_KEY'] = 'calypso-py-plus-secret-key'

# Configure static files
app.static_folder = 'static'
app.static_url_path = '/static'

socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# Global CalypsoPy+ manager instance
calypso_manager = CalypsoPyManager()


@app.route('/')
def index():
    """Serve CalypsoPy+ main interface"""
    return render_template('index.html')


@app.route('/api/ports')
def list_ports():
    """API endpoint for available ports"""
    return jsonify(calypso_manager.list_ports())


@app.route('/api/status')
def system_status():
    """API endpoint for system status"""
    return jsonify(calypso_manager.get_system_status())


@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('system_status', calypso_manager.get_system_status())
    logger.info("CalypsoPy+: Client connected")


@socketio.on('connect_device')
def handle_connect_device(data):
    """Handle device connection request with CalypsoPy+ standard settings"""
    port = data.get('port')

    # Use CalypsoPy+ standard settings regardless of client parameters
    result = calypso_manager.connect(port)
    emit('connection_result', result)

    if result['success']:
        socketio.emit('system_status', calypso_manager.get_system_status())


@socketio.on('disconnect_device')
def handle_disconnect_device(data):
    """Handle device disconnection request"""
    port = data.get('port')
    result = calypso_manager.disconnect(port)
    emit('disconnection_result', result)
    socketio.emit('system_status', calypso_manager.get_system_status())


@socketio.on('execute_command')
def handle_execute_command(data):
    """Handle command execution request"""
    port = data.get('port')
    command = data.get('command')
    dashboard = data.get('dashboard', 'general')
    use_cache = data.get('use_cache', True)

    if not port or not command:
        emit('command_result', {
            'success': False,
            'message': 'Port and command are required'
        })
        return

    result = calypso_manager.execute_command(port, command, dashboard, use_cache)
    emit('command_result', result)


@socketio.on('get_dashboard_data')
def handle_get_dashboard_data(data):
    """Handle dashboard data request"""
    dashboard = data.get('dashboard', 'device_info')
    port = data.get('port')

    if not port:
        emit('dashboard_data', {'success': False, 'message': 'Port required'})
        return

    dashboard_state = calypso_manager.dashboard_states.get(dashboard, {})
    command_history = list(calypso_manager.command_history.get(port, []))

    # Filter history by dashboard
    dashboard_history = [
        cmd for cmd in command_history
        if cmd.get('dashboard') == dashboard
    ]

    emit('dashboard_data', {
        'success': True,
        'dashboard': dashboard,
        'state': dashboard_state,
        'history': dashboard_history[-20:],  # Last 20 commands
        'port': port
    })


@socketio.on('clear_cache')
def handle_clear_cache(data):
    """Handle cache clearing request"""
    dashboard = data.get('dashboard', 'all')
    if dashboard == 'all':
        calypso_manager.cache = CalypsoPyCache()

    emit('cache_cleared', {
        'success': True,
        'message': f'Cache cleared for {dashboard}',
        'dashboard': dashboard
    })


if __name__ == '__main__':
    # Ensure logs directory exists
    os.makedirs('logs', exist_ok=True)

    print("🚀 CalypsoPy+ by Serial Cables")
    print("Professional Hardware Development Interface")
    print("=" * 50)
    print(f"🌐 Web Interface: http://localhost:5000")
    print(f"📊 Dashboards: Device Info, Link Status, Port Config, I2C/I3C, Advanced, Resets, Firmware")
    print("=" * 50)

    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=False,
        use_reloader=False
    )