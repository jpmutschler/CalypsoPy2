#!/usr/bin/env python3
"""
Atlas3Parser - Dedicated parsing engine for Atlas 3 Host Card commands
Professional command response parser with field extraction for each command type
"""

import re
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Union

logger = logging.getLogger(__name__)

class Atlas3Parser:
    """
    Professional parsing engine for Atlas 3 Host Card command responses.
    Each command has a dedicated parsing method that extracts structured data.
    """
    
    def __init__(self):
        """Initialize the Atlas3Parser"""
        self.last_raw_response = ""
        self.last_command = ""
        self.parse_timestamp = None
        
    def parse_command_response(self, command: str, raw_response: str) -> Dict[str, Any]:
        """
        Main entry point for parsing any Atlas 3 command response.
        
        Args:
            command: The command that was executed
            raw_response: The raw response from the device
            
        Returns:
            Dict containing parsed data with command-specific structure
        """
        self.last_raw_response = raw_response
        self.last_command = command.lower().strip()
        self.parse_timestamp = datetime.now()
        
        # Route to specific parser based on command
        if self.last_command == 'sysinfo':
            return self.parse_sysinfo(raw_response)
        elif self.last_command == 'showport':
            return self.parse_showport(raw_response)
        elif self.last_command.startswith('showmode'):
            return self.parse_showmode(raw_response)
        elif self.last_command.startswith('mr '):
            return self.parse_memory_read(raw_response, command)
        elif self.last_command.startswith('mw '):
            return self.parse_memory_write(raw_response, command)
        elif self.last_command.startswith('dr '):
            return self.parse_dump_register(raw_response, command)
        elif self.last_command.startswith('dp '):
            return self.parse_dump_port(raw_response, command)
        else:
            return self.parse_generic(raw_response, command)
    
    def parse_sysinfo(self, raw_response: str) -> Dict[str, Any]:
        """
        Parse the comprehensive sysinfo command response.
        
        The sysinfo command combines ver + lsd + spread + clk + showport + bist data.
        Extracts device information, thermal data, voltages, clock status, and port status.
        
        Returns:
            Dict with structured sysinfo data including device_info, thermal_data, 
            voltage_rails, power_consumption, clock_status, spread_status, port_summary, and bist_results
        """
        parsed = {
            'command': 'sysinfo',
            'success': True,
            'timestamp': self.parse_timestamp.isoformat(),
            'device_info': {},
            'thermal_data': {},
            'voltage_rails': [],
            'power_consumption': {},
            'clock_status': {},
            'spread_status': {},
            'port_summary': {},
            'bist_results': {},
            'raw_sections': {}
        }
        
        try:
            # Split response into sections by separator lines
            sections = self._split_into_sections(raw_response)
            parsed['raw_sections'] = sections
            
            # Parse VER section (Device Information)
            if 'ver' in sections:
                parsed['device_info'] = self._parse_ver_section(sections['ver'])
            
            # Parse LSD section (Live System Data - Thermal, Voltage, Power)
            if 'lsd' in sections:
                thermal, voltage, power = self._parse_lsd_section(sections['lsd'])
                parsed['thermal_data'] = thermal
                parsed['voltage_rails'] = voltage
                parsed['power_consumption'] = power
            
            # Parse SPREAD section (Spread Spectrum Status)
            if 'spread' in sections:
                parsed['spread_status'] = self._parse_spread_section(sections['spread'])
            
            # Parse CLK section (Clock Status)
            if 'clk' in sections:
                parsed['clock_status'] = self._parse_clk_section(sections['clk'])
            
            # Parse SHOWPORT section (Port Status Summary)
            if 'showport' in sections:
                parsed['port_summary'] = self._parse_showport_summary(sections['showport'])
            
            # Parse BIST section (Built-In Self Test Results)
            if 'bist' in sections:
                parsed['bist_results'] = self._parse_bist_section(sections['bist'])
                
        except Exception as e:
            logger.error(f"Error parsing sysinfo response: {e}")
            parsed['success'] = False
            parsed['error'] = str(e)
        
        return parsed
    
    def _split_into_sections(self, response: str) -> Dict[str, str]:
        """Split sysinfo response into ver, lsd, spread, clk, showport, and bist sections"""
        sections = {}
        lines = response.split('\n')
        current_section = None
        section_content = []
        
        for line in lines:
            line = line.strip()
            
            # Detect main section headers (command names)
            if line.lower() in ['ver', 'lsd', 'spread', 'clk', 'showport', 'bist']:
                # Save previous section before starting new one
                if current_section and section_content:
                    sections[current_section] = '\n'.join(section_content)
                    section_content = []
                current_section = line.lower()
                continue
            
            # Detect main section separators (80+ characters of =)
            if '=' in line and len(line) > 75:
                # Check if next non-empty line is a section name
                continue
            
            # Add content to current section (including sub-section separators)
            if current_section:
                section_content.append(line)
        
        # Save last section
        if current_section and section_content:
            sections[current_section] = '\n'.join(section_content)
        
        return sections
    
    def _parse_ver_section(self, ver_content: str) -> Dict[str, str]:
        """Parse the VER section for device information"""
        device_info = {}
        
        # Strip ANSI escape sequences first
        clean_content = re.sub(r'\x1b\[[0-9;]*m', '', ver_content)
        
        # Updated patterns for Unicode box drawing characters
        patterns = {
            'company': r'[║|]\s*Company\s*:\s*([^║|\r\n]+)',
            'model': r'[║|]\s*Model\s*:\s*([^║|\r\n]+)',
            'serial_number': r'[║|]\s*Serial No\.\s*:\s*([^║|\r\n]+)'
        }
        
        for field, pattern in patterns.items():
            match = re.search(pattern, clean_content, re.IGNORECASE)
            if match:
                device_info[field] = match.group(1).strip()
        
        # Extract MCU version and build time
        mcu_version_match = re.search(r'[║|]\s*Version\s*:\s*([0-9.]+)', clean_content, re.IGNORECASE)
        if mcu_version_match:
            device_info['mcu_version'] = mcu_version_match.group(1).strip()
        
        mcu_build_match = re.search(r'[║|]\s*Build Time\s*:\s*([^║|\r\n]+)', clean_content, re.IGNORECASE)
        if mcu_build_match:
            device_info['mcu_build_time'] = mcu_build_match.group(1).strip()
        
        # Extract SBR version - look for it specifically in SBR section
        lines = clean_content.split('\n')
        in_sbr_section = False
        for line in lines:
            if 'SBR Info' in line:
                in_sbr_section = True
            elif in_sbr_section and 'Version' in line:
                sbr_match = re.search(r'[║|]\s*Version\s*:\s*([0-9A-Fa-f]+)', line, re.IGNORECASE)
                if sbr_match:
                    device_info['sbr_version'] = sbr_match.group(1).strip()
                    break
        
        return device_info
    
    def _parse_lsd_section(self, lsd_content: str) -> tuple:
        """Parse the LSD section for thermal, voltage, and power data"""
        thermal_data = {}
        voltage_rails = []
        power_consumption = {}
        
        # Strip ANSI escape sequences first
        clean_content = re.sub(r'\x1b\[[0-9;]*m', '', lsd_content)
        lines = clean_content.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Switch Temperature - look for bullet point (•) or similar
            temp_match = re.search(r'[•·*]\s*Switch Temperature\s*:\s*(\d+)°C', line, re.IGNORECASE)
            if temp_match:
                thermal_data['switch_temperature'] = {
                    'value': int(temp_match.group(1)),
                    'unit': 'celsius',
                    'status': 'normal' if int(temp_match.group(1)) < 60 else 'warning'
                }
                continue
            
            # Switch Fan Speed
            fan_match = re.search(r'[•·*]\s*Switch Fan\s*:\s*(\d+)\s*RPM', line, re.IGNORECASE)
            if fan_match:
                thermal_data['fan_speed'] = {
                    'value': int(fan_match.group(1)),
                    'unit': 'rpm',
                    'status': 'normal' if int(fan_match.group(1)) > 3000 else 'warning'
                }
                continue
            
            # Voltage Rails
            voltage_match = re.search(r'[•·*]\s*([\d.]+)V\s+Voltage\s*:\s*([\d.]+)\s*V', line, re.IGNORECASE)
            if voltage_match:
                nominal_voltage = float(voltage_match.group(1))
                measured_voltage = float(voltage_match.group(2))
                
                rail = {
                    'rail_name': f"{nominal_voltage}V",
                    'nominal_voltage': nominal_voltage,
                    'measured_voltage_v': measured_voltage,
                    'measured_voltage_mv': int(measured_voltage * 1000),
                    'tolerance_percent': round(((measured_voltage - nominal_voltage) / nominal_voltage) * 100, 2),
                    'status': 'normal' if abs(measured_voltage - nominal_voltage) / nominal_voltage < 0.1 else 'warning'
                }
                voltage_rails.append(rail)
                continue
            
            # Power Voltage
            power_voltage_match = re.search(r'[•·*]\s*Power Voltage\s*:\s*([\d.]+)\s*V', line, re.IGNORECASE)
            if power_voltage_match:
                power_consumption['power_voltage'] = {
                    'value': float(power_voltage_match.group(1)),
                    'unit': 'V'
                }
                continue
            
            # Load Current
            current_match = re.search(r'[•·*]\s*Load Current\s*:\s*([\d.]+)\s*A', line, re.IGNORECASE)
            if current_match:
                current_a = float(current_match.group(1))
                power_consumption['load_current'] = {
                    'value': current_a,
                    'unit': 'A',
                    'current_ma': int(current_a * 1000)
                }
                continue
            
            # Load Power
            power_match = re.search(r'[•·*]\s*Load Power\s*:\s*([\d.]+)\s*W', line, re.IGNORECASE)
            if power_match:
                power_consumption['load_power'] = {
                    'value': float(power_match.group(1)),
                    'unit': 'W'
                }
                continue
        
        return thermal_data, voltage_rails, power_consumption
    
    def _parse_spread_section(self, spread_content: str) -> Dict[str, Any]:
        """Parse the SPREAD section for spread spectrum status"""
        spread_status = {}
        
        for line in spread_content.split('\n'):
            line = line.strip()
            if 'Spread status:' in line:
                status = line.split(':', 1)[1].strip()
                spread_status = {
                    'status': status.lower(),
                    'enabled': status.upper() == 'ON'
                }
                break
        
        return spread_status
    
    def _parse_clk_section(self, clk_content: str) -> Dict[str, Any]:
        """Parse the CLK section for clock output status"""
        clock_status = {
            'pcie_straddle_clock': False,
            'ext_mcio_clock': False,
            'int_mcio_clock': False
        }
        
        for line in clk_content.split('\n'):
            line = line.strip()
            if 'PCIe Straddle' in line and 'enable' in line:
                clock_status['pcie_straddle_clock'] = True
            elif 'EXT MCIO' in line and 'enable' in line:
                clock_status['ext_mcio_clock'] = True
            elif 'INT MCIO' in line and 'enable' in line:
                clock_status['int_mcio_clock'] = True
        
        return clock_status
    
    def _parse_bist_section(self, bist_content: str) -> Dict[str, Any]:
        """Parse the BIST section for built-in self test results"""
        bist_results = {
            'devices': [],
            'total_devices': 0,
            'passed_devices': 0,
            'failed_devices': 0
        }
        
        # Strip ANSI escape sequences first
        clean_content = re.sub(r'\x1b\[[0-9;]*m', '', bist_content)
        lines = clean_content.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line or 'Channel' in line or '---' in line:
                continue
            
            # Parse device entries - be more flexible with whitespace
            parts = re.split(r'\s+', line)
            if len(parts) >= 4:
                channel = parts[0]
                device = parts[1]
                address = parts[2]
                status = parts[3]
                
                # Clean status of any remaining artifacts
                status_clean = re.sub(r'[^A-Za-z0-9]', '', status)
                
                device_result = {
                    'channel': channel,
                    'device': device,
                    'address': address,
                    'status': status,
                    'passed': status_clean.upper() == 'OK'
                }
                
                bist_results['devices'].append(device_result)
                bist_results['total_devices'] += 1
                if device_result['passed']:
                    bist_results['passed_devices'] += 1
                else:
                    bist_results['failed_devices'] += 1
        
        return bist_results
    
    def _parse_showport_summary(self, showport_content: str) -> Dict[str, Any]:
        """Parse showport section for port status summary"""
        port_summary = {
            'atlas3_version': '',
            'upstream_ports': [],
            'ext_mcio_ports': [],
            'int_mcio_ports': [],
            'straddle_ports': [],
            'total_ports': 0,
            'active_ports': 0
        }
        
        # Strip ANSI escape sequences first
        clean_content = re.sub(r'\x1b\[[0-9;]*m', '', showport_content)
        lines = clean_content.split('\n')
        current_section = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Skip separator lines (lots of = characters) but not data lines with single =
            if '=' in line and len([c for c in line if c == '=']) > 5:
                continue
            
            # Extract Atlas3 version
            if 'Atlas3 chip ver:' in line:
                version_match = re.search(r'Atlas3 chip ver:\s*([A-Z0-9]+)', line)
                if version_match:
                    port_summary['atlas3_version'] = version_match.group(1)
                continue
            
            # Detect section headers
            if 'Upstream Ports' in line:
                current_section = 'upstream'
                continue
            elif 'EXT MCIO Ports' in line:
                current_section = 'ext_mcio'
                continue
            elif 'INT MCIO Ports' in line:
                current_section = 'int_mcio'
                continue
            elif 'Straddle Ports' in line:
                current_section = 'straddle'
                continue
            
            # Parse port entries - handle both detailed and simplified formats
            port_match = re.search(r'(\w+)\s*\|\s*Port\s*(\d+)\s*\|\s*Speed:\s*(\w+)\s*\|\s*Width:\s*(\d+)\s*\|\s*Max:\s*(\w+)\s*x(\d+)\s*\|\s*Status:\s*(\w+)', line)
            
            # Try simplified format if detailed format doesn't match
            if not port_match:
                # Format: "Port80 : speed 06, width 08, max_speed06, max_width08"
                simple_match = re.search(r'Port(\d+)\s*:\s*speed\s*(\d+),\s*width\s*(\d+),\s*max_speed(\d+),\s*max_width(\d+)', line)
                if simple_match:
                    port_number = int(simple_match.group(1))
                    speed_code = simple_match.group(2)
                    width_code = simple_match.group(3)
                    max_speed_code = simple_match.group(4)
                    max_width_code = simple_match.group(5)
                    
                    # Decode speed and width from numeric codes
                    speed_info = self._decode_pcie_speed(speed_code)
                    width_info = self._decode_pcie_width(width_code)
                    max_speed_info = self._decode_pcie_speed(max_speed_code)
                    max_width_info = self._decode_pcie_width(max_width_code)
                    
                    # Determine status based on speed/width patterns
                    if speed_info['generation'] == 'Gen1' and width_info['lanes'] == 0:
                        status = 'Idle'
                        is_active = False
                    elif width_info['lanes'] > 0 and speed_info['speed_gts'] > 0:
                        # Check if running below max capability (degraded)
                        if (speed_info['speed_gts'] < max_speed_info['speed_gts'] or 
                            width_info['lanes'] < max_width_info['lanes']):
                            status = 'Degraded'
                        else:
                            status = 'Active'
                        is_active = True
                    else:
                        status = 'Idle'
                        is_active = False
                    
                    port_data = {
                        'connector': f'Port{port_number}',
                        'port_number': port_number,
                        'current_speed': speed_info['generation'],
                        'current_width': width_info['lanes'],
                        'max_speed': max_speed_info['generation'],
                        'max_width': max_width_info['lanes'],
                        'status': status,
                        'is_active': is_active
                    }
                    
                    # Categorize by port number ranges
                    if 0 <= port_number <= 32:
                        port_summary['upstream_ports'].append(port_data)
                    elif 80 <= port_number <= 95:
                        port_summary['straddle_ports'].append(port_data)
                    elif 112 <= port_number <= 127:
                        port_summary['ext_mcio_ports'].append(port_data)
                    elif 128 <= port_number <= 143:
                        port_summary['int_mcio_ports'].append(port_data)
                    
                    port_summary['total_ports'] += 1
                    if port_data['is_active']:
                        port_summary['active_ports'] += 1
                        
            # Try parsing "Golden finger" line
            if 'Golden finger' in line or 'gold finger' in line:
                # Format: "Golden finger: speed 06, width 08, max_width = 16"
                gf_match = re.search(r'(?:Golden|gold)\s+finger:\s*speed\s*(\d+),\s*width\s*(\d+),\s*max_width\s*=\s*(\d+)', line, re.IGNORECASE)
                if gf_match:
                    speed_code = gf_match.group(1)
                    width_code = gf_match.group(2)
                    max_width = int(gf_match.group(3))
                    
                    # Decode speed and width from numeric codes
                    speed_info = self._decode_pcie_speed(speed_code)
                    width_info = self._decode_pcie_width(width_code)
                    
                    # Determine status based on speed/width patterns
                    if speed_info['generation'] == 'Gen1' and width_info['lanes'] == 0:
                        status = 'Idle'
                        is_active = False
                    elif width_info['lanes'] > 0 and speed_info['speed_gts'] > 0:
                        # Check if running below max capability (degraded)
                        if width_info['lanes'] < max_width:
                            status = 'Degraded'
                        else:
                            status = 'Active'
                        is_active = True
                    else:
                        status = 'Idle'
                        is_active = False
                    
                    port_data = {
                        'connector': 'GF',
                        'port_number': 32,
                        'current_speed': speed_info['generation'],
                        'current_width': width_info['lanes'],
                        'max_speed': speed_info['generation'],
                        'max_width': max_width,
                        'status': status,
                        'is_active': is_active
                    }
                    
                    port_summary['upstream_ports'].append(port_data)
                    port_summary['total_ports'] += 1
                    if port_data['is_active']:
                        port_summary['active_ports'] += 1
            
            # Handle detailed format if matched
            elif port_match:
                connector = port_match.group(1)
                port_number = int(port_match.group(2))
                speed = port_match.group(3)
                width = int(port_match.group(4))
                max_speed = port_match.group(5)
                max_width = int(port_match.group(6))
                status = port_match.group(7)
                
                port_data = {
                    'connector': connector,
                    'port_number': port_number,
                    'current_speed': speed,
                    'current_width': width,
                    'max_speed': max_speed,
                    'max_width': max_width,
                    'status': status,
                    'is_active': status.lower() != 'idle' and width > 0
                }
                
                if current_section == 'upstream':
                    port_summary['upstream_ports'].append(port_data)
                elif current_section == 'ext_mcio':
                    port_summary['ext_mcio_ports'].append(port_data)
                elif current_section == 'int_mcio':
                    port_summary['int_mcio_ports'].append(port_data)
                elif current_section == 'straddle':
                    port_summary['straddle_ports'].append(port_data)
                
                port_summary['total_ports'] += 1
                if port_data['is_active']:
                    port_summary['active_ports'] += 1
        
        return port_summary
    
    def _decode_pcie_speed(self, speed_code: str) -> Dict[str, Union[str, int]]:
        """Decode PCIe speed code to generation and GT/s"""
        speed_map = {
            '06': {'generation': 'Gen6', 'speed_gts': 64, 'speed_gbps': 64},
            '05': {'generation': 'Gen5', 'speed_gts': 32, 'speed_gbps': 32},
            '04': {'generation': 'Gen4', 'speed_gts': 16, 'speed_gbps': 16},
            '03': {'generation': 'Gen3', 'speed_gts': 8, 'speed_gbps': 8},
            '02': {'generation': 'Gen2', 'speed_gts': 5, 'speed_gbps': 5},
            '01': {'generation': 'Gen1', 'speed_gts': 2.5, 'speed_gbps': 2.5},
            '00': {'generation': 'No Link', 'speed_gts': 0, 'speed_gbps': 0}
        }
        return speed_map.get(speed_code, {'generation': f'Unknown ({speed_code})', 'speed_gts': 0, 'speed_gbps': 0})
    
    def _decode_pcie_width(self, width_code: str) -> Dict[str, Union[str, int]]:
        """Decode PCIe width code to lane configuration"""
        width_map = {
            '16': {'width': 'x16', 'lanes': 16},
            '08': {'width': 'x8', 'lanes': 8},
            '04': {'width': 'x4', 'lanes': 4},
            '02': {'width': 'x2', 'lanes': 2},
            '01': {'width': 'x1', 'lanes': 1},
            '00': {'width': 'No Link', 'lanes': 0}
        }
        return width_map.get(width_code, {'width': f'Unknown ({width_code})', 'lanes': 0})
    
    # Placeholder methods for other commands
    def parse_showport(self, raw_response: str) -> Dict[str, Any]:
        """
        Parse standalone showport command response.
        Maps ports to their physical locations on the Atlas 3 card.
        
        Physical Port Mapping:
        - Ports 0-32: Gold Finger (GF)
        - Ports 80-95: Straddle Mount
        - Ports 112-119: Upper Left MCIO (UL MCIO)
        - Ports 120-127: Lower Left MCIO (LL MCIO)
        - Ports 128-135: Upper Right MCIO (UR MCIO)
        - Ports 136-143: Lower Right MCIO (LR MCIO)
        """
        parsed = {
            'command': 'showport',
            'success': True,
            'timestamp': self.parse_timestamp.isoformat(),
            'atlas3_version': '',
            'port_groups': {
                'gold_finger': {'name': 'Gold Finger (GF)', 'ports': [], 'port_range': '0-32'},
                'straddle_mount': {'name': 'Straddle Mount', 'ports': [], 'port_range': '80-95'},
                'upper_left_mcio': {'name': 'Upper Left MCIO (UL)', 'ports': [], 'port_range': '112-119'},
                'lower_left_mcio': {'name': 'Lower Left MCIO (LL)', 'ports': [], 'port_range': '120-127'},
                'upper_right_mcio': {'name': 'Upper Right MCIO (UR)', 'ports': [], 'port_range': '128-135'},
                'lower_right_mcio': {'name': 'Lower Right MCIO (LR)', 'ports': [], 'port_range': '136-143'}
            },
            'summary': {
                'total_ports': 0,
                'active_ports': 0,
                'idle_ports': 0,
                'max_speed_detected': 'Gen1',
                'max_width_detected': 0
            },
            'raw_response': raw_response
        }
        
        try:
            # Strip ANSI escape sequences first
            clean_response = re.sub(r'\x1b\[[0-9;]*m', '', raw_response)
            lines = clean_response.split('\n')
            current_section = None
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                    
                # Skip separator lines (lots of = characters) but not data lines with single =
                if '=' in line and len([c for c in line if c == '=']) > 5:
                    continue
                
                # Extract Atlas3 version
                if 'Atlas3 chip ver:' in line:
                    version_match = re.search(r'Atlas3 chip ver:\s*([A-Z0-9]+)', line)
                    if version_match:
                        parsed['atlas3_version'] = version_match.group(1)
                    continue
                
                # Detect section headers
                if 'Upstream Ports' in line:
                    current_section = 'upstream'
                    continue
                elif 'EXT MCIO Ports' in line:
                    current_section = 'ext_mcio'
                    continue
                elif 'INT MCIO Ports' in line:
                    current_section = 'int_mcio'
                    continue
                elif 'Straddle Ports' in line:
                    current_section = 'straddle'
                    continue
                
                # Parse port entries - handle both detailed and simplified formats
                
                # Try detailed format first (from /temp/showport.txt)
                port_match = re.search(r'(\w+)\s*\|\s*Port\s*(\d+)\s*\|\s*Speed:\s*(\w+)\s*\|\s*Width:\s*(\d+)\s*\|\s*Max:\s*(\w+)\s*x(\d+)\s*\|\s*Status:\s*(\w+)', line)
                
                # Try simplified format (current hardware output)
                simple_match = re.search(r'Port(\d+)\s*:\s*speed\s*(\d+),\s*width\s*(\d+),\s*max_speed(\d+),\s*max_width(\d+)', line)
                
                # Try parsing "Golden finger" line
                gf_match = re.search(r'(?:Golden|gold)\s+finger:\s*speed\s*(\d+),\s*width\s*(\d+),\s*max_width\s*=\s*(\d+)', line, re.IGNORECASE)
                
                if port_match:
                    # Handle detailed format
                    connector = port_match.group(1)
                    port_number = int(port_match.group(2))
                    speed = port_match.group(3)
                    width = int(port_match.group(4))
                    max_speed = port_match.group(5)
                    max_width = int(port_match.group(6))
                    status = port_match.group(7)
                    
                    # Filter out ports with Gen1 & Width: 0 (no device connected)
                    # Only include status for these ports
                    is_connected = not (speed == 'Gen1' and width == 0)
                    
                    port_data = {
                        'connector': connector,
                        'port_number': port_number,
                        'current_speed': speed,
                        'current_width': width,
                        'max_speed': max_speed,
                        'max_width': max_width,
                        'status': status,
                        'is_active': status.lower() != 'idle' and width > 0,
                        'is_connected': is_connected,
                        'section': current_section,
                        'physical_location': self._get_physical_location(port_number)
                    }
                    
                    # Map to physical location groups
                    location_group = self._get_location_group(port_number)
                    if location_group:
                        parsed['port_groups'][location_group]['ports'].append(port_data)
                    
                    # Update summary statistics
                    parsed['summary']['total_ports'] += 1
                    if port_data['is_active']:
                        parsed['summary']['active_ports'] += 1
                    else:
                        parsed['summary']['idle_ports'] += 1
                    
                    # Track maximum speeds and widths detected
                    if self._compare_speed(speed, parsed['summary']['max_speed_detected']) > 0:
                        parsed['summary']['max_speed_detected'] = speed
                    
                    if max_width > parsed['summary']['max_width_detected']:
                        parsed['summary']['max_width_detected'] = max_width
                        
                elif simple_match:
                    # Handle simplified format
                    port_number = int(simple_match.group(1))
                    speed_code = simple_match.group(2)
                    width_code = simple_match.group(3)
                    max_speed_code = simple_match.group(4)
                    max_width_code = simple_match.group(5)
                    
                    # Decode speed and width from numeric codes
                    speed_info = self._decode_pcie_speed(speed_code)
                    width_info = self._decode_pcie_width(width_code)
                    max_speed_info = self._decode_pcie_speed(max_speed_code)
                    max_width_info = self._decode_pcie_width(max_width_code)
                    
                    # Determine status based on speed/width patterns
                    # If speed is Gen1 and width is 0, it's definitely Idle
                    # If speed > Gen1 and width > 0, it's likely Active or Degraded
                    if speed_info['generation'] == 'Gen1' and width_info['lanes'] == 0:
                        status = 'Idle'
                        is_active = False
                    elif width_info['lanes'] > 0 and speed_info['speed_gts'] > 0:
                        # Check if running below max capability (degraded)
                        if (speed_info['speed_gts'] < max_speed_info['speed_gts'] or 
                            width_info['lanes'] < max_width_info['lanes']):
                            status = 'Degraded'
                        else:
                            status = 'Active'
                        is_active = True
                    else:
                        status = 'Idle'
                        is_active = False
                    
                    port_data = {
                        'connector': f'Port{port_number}',
                        'port_number': port_number,
                        'current_speed': speed_info['generation'],
                        'current_width': width_info['lanes'],
                        'max_speed': max_speed_info['generation'],
                        'max_width': max_width_info['lanes'],
                        'status': status,
                        'is_active': is_active,
                        'is_connected': is_active,
                        'section': current_section,
                        'physical_location': self._get_physical_location(port_number)
                    }
                    
                    # Map to physical location groups
                    location_group = self._get_location_group(port_number)
                    if location_group:
                        parsed['port_groups'][location_group]['ports'].append(port_data)
                    
                    # Update summary statistics
                    parsed['summary']['total_ports'] += 1
                    if port_data['is_active']:
                        parsed['summary']['active_ports'] += 1
                    else:
                        parsed['summary']['idle_ports'] += 1
                    
                    # Track maximum speeds and widths detected
                    if self._compare_speed(speed_info['generation'], parsed['summary']['max_speed_detected']) > 0:
                        parsed['summary']['max_speed_detected'] = speed_info['generation']
                    
                    if max_width_info['lanes'] > parsed['summary']['max_width_detected']:
                        parsed['summary']['max_width_detected'] = max_width_info['lanes']
                        
                elif gf_match:
                    # Handle Golden finger line
                    speed_code = gf_match.group(1)
                    width_code = gf_match.group(2)
                    max_width = int(gf_match.group(3))
                    
                    # Decode speed and width from numeric codes
                    speed_info = self._decode_pcie_speed(speed_code)
                    width_info = self._decode_pcie_width(width_code)
                    
                    # Determine status based on speed/width patterns
                    if speed_info['generation'] == 'Gen1' and width_info['lanes'] == 0:
                        status = 'Idle'
                        is_active = False
                    elif width_info['lanes'] > 0 and speed_info['speed_gts'] > 0:
                        # Check if running below max capability (degraded)
                        if width_info['lanes'] < max_width:
                            status = 'Degraded'
                        else:
                            status = 'Active'
                        is_active = True
                    else:
                        status = 'Idle'
                        is_active = False
                    
                    # Gold finger is port 32 (upstream)
                    port_data = {
                        'connector': 'GF',
                        'port_number': 32,
                        'current_speed': speed_info['generation'],
                        'current_width': width_info['lanes'],
                        'max_speed': speed_info['generation'],
                        'max_width': max_width,
                        'status': status,
                        'is_active': is_active,
                        'is_connected': is_active,
                        'section': 'upstream',
                        'physical_location': self._get_physical_location(32)
                    }
                    
                    # Map to gold finger group
                    parsed['port_groups']['gold_finger']['ports'].append(port_data)
                    
                    # Update summary statistics
                    parsed['summary']['total_ports'] += 1
                    if port_data['is_active']:
                        parsed['summary']['active_ports'] += 1
                    else:
                        parsed['summary']['idle_ports'] += 1
                    
                    # Track maximum speeds and widths detected
                    if self._compare_speed(speed_info['generation'], parsed['summary']['max_speed_detected']) > 0:
                        parsed['summary']['max_speed_detected'] = speed_info['generation']
                    
                    if max_width > parsed['summary']['max_width_detected']:
                        parsed['summary']['max_width_detected'] = max_width
                        
        except Exception as e:
            logger.error(f"Error parsing showport response: {e}")
            parsed['success'] = False
            parsed['error'] = str(e)
        
        return parsed
    
    def _get_physical_location(self, port_number: int) -> str:
        """Get the physical location name for a port number"""
        if 0 <= port_number <= 32:
            return 'Gold Finger (GF)'
        elif 80 <= port_number <= 95:
            return 'Straddle Mount'
        elif 112 <= port_number <= 119:
            return 'Upper Left MCIO (UL)'
        elif 120 <= port_number <= 127:
            return 'Lower Left MCIO (LL)'
        elif 128 <= port_number <= 135:
            return 'Upper Right MCIO (UR)'
        elif 136 <= port_number <= 143:
            return 'Lower Right MCIO (LR)'
        else:
            return f'Unknown Location (Port {port_number})'
    
    def _get_location_group(self, port_number: int) -> str:
        """Get the location group key for a port number"""
        if 0 <= port_number <= 32:
            return 'gold_finger'
        elif 80 <= port_number <= 95:
            return 'straddle_mount'
        elif 112 <= port_number <= 119:
            return 'upper_left_mcio'
        elif 120 <= port_number <= 127:
            return 'lower_left_mcio'
        elif 128 <= port_number <= 135:
            return 'upper_right_mcio'
        elif 136 <= port_number <= 143:
            return 'lower_right_mcio'
        else:
            return None
    
    def _compare_speed(self, speed1: str, speed2: str) -> int:
        """Compare two PCIe speed strings. Returns 1 if speed1 > speed2, -1 if speed1 < speed2, 0 if equal"""
        speed_order = {'Gen1': 1, 'Gen2': 2, 'Gen3': 3, 'Gen4': 4, 'Gen5': 5, 'Gen6': 6}
        val1 = speed_order.get(speed1, 0)
        val2 = speed_order.get(speed2, 0)
        
        if val1 > val2:
            return 1
        elif val1 < val2:
            return -1
        else:
            return 0
    
    def parse_showmode(self, raw_response: str) -> Dict[str, Any]:
        """Parse showmode command for bifurcation status"""
        return {'command': 'showmode', 'success': True, 'data': 'Not implemented yet'}
    
    def parse_memory_read(self, raw_response: str, command: str) -> Dict[str, Any]:
        """Parse memory read (mr) command response"""
        return {'command': 'memory_read', 'success': True, 'data': 'Not implemented yet'}
    
    def parse_memory_write(self, raw_response: str, command: str) -> Dict[str, Any]:
        """Parse memory write (mw) command response"""
        return {'command': 'memory_write', 'success': True, 'data': 'Not implemented yet'}
    
    def parse_dump_register(self, raw_response: str, command: str) -> Dict[str, Any]:
        """Parse dump register (dr) command response"""
        return {'command': 'dump_register', 'success': True, 'data': 'Not implemented yet'}
    
    def parse_dump_port(self, raw_response: str, command: str) -> Dict[str, Any]:
        """Parse dump port (dp) command response"""
        return {'command': 'dump_port', 'success': True, 'data': 'Not implemented yet'}
    
    def parse_generic(self, raw_response: str, command: str) -> Dict[str, Any]:
        """Generic parser for unknown commands"""
        return {
            'command': command,
            'success': True,
            'raw_response': raw_response,
            'parsed': False,
            'message': f'No specific parser available for command: {command}'
        }