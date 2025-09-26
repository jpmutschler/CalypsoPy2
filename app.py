#!/usr/bin/env python3
"""
CalypsoPy+ by Serial Cables
Professional Serial Communication Interface for Hardware Development
Clean version with working port detection
"""

import json
import logging
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional, Any
import serial
import serial.tools.list_ports
from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO, emit
import re
from collections import deque
import hashlib
import os
from FWUpdate import FirmwareUpdater

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
    """Simple caching system"""
    def __init__(self, max_size: int = 1000, ttl_seconds: int = 600):
        self.cache = {}
        self.access_times = {}
        self.max_size = max_size
        self.ttl = ttl_seconds
        self.lock = threading.RLock()

    def _generate_key(self, command: str, port: str, dashboard: str = "general") -> str:
        return hashlib.md5(f"{dashboard}:{port}:{command}".encode()).hexdigest()

    def get(self, command: str, port: str, dashboard: str = "general") -> Optional[Dict]:
        with self.lock:
            key = self._generate_key(command, port, dashboard)
            if key not in self.cache:
                return None

            if time.time() - self.access_times[key] > self.ttl:
                del self.cache[key]
                del self.access_times[key]
                return None

            self.access_times[key] = time.time()
            return self.cache[key]

    def set(self, command: str, port: str, response: Dict, dashboard: str = "general"):
        with self.lock:
            key = self._generate_key(command, port, dashboard)

            if len(self.cache) >= self.max_size:
                oldest_key = min(self.access_times.keys(), key=lambda k: self.access_times[k])
                del self.cache[oldest_key]
                del self.access_times[oldest_key]

            self.cache[key] = response
            self.access_times[key] = time.time()

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            return {
                'size': len(self.cache),
                'max_size': self.max_size
            }


class HardwareResponseParser:
    """Simple response parser"""
    @staticmethod
    def parse_response(raw_response: str, command: str = "", dashboard: str = "general") -> Dict[str, Any]:
        parsed_data = {
            'raw': raw_response.strip(),
            'timestamp': datetime.now().isoformat(),
            'command': command,
            'dashboard': dashboard,
            'parsed': {},
            'type': 'text',
            'status': 'success'
        }

        if dashboard == 'bifurcation' and 'showmode' in command.lower():
            mode_match = re.search(r'SBR\s+mode:\s*(\d+)', raw_response, re.IGNORECASE)
            if mode_match:
                mode = int(mode_match.group(1))
                parsed_data['parsed'] = {'sbr_mode': mode}
                parsed_data['type'] = 'showmode_response'

        return parsed_data


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
        dashboards = ['device_info', 'link_status', 'bifurcation', 'i2c', 'advanced', 'resets', 'firmware']
        for dashboard in dashboards:
            self.dashboard_states[dashboard] = {
                'last_update': None,
                'cached_data': {},
                'command_count': 0
            }

    def list_ports(self) -> List[Dict[str, str]]:
        """List available serial ports using working method from debug tool"""
        ports = []

        logger.info("Starting port scan using working method...")

        try:
            detected_ports = serial.tools.list_ports.comports()
            logger.info(f"Raw port scan found {len(detected_ports)} ports")

            for port in detected_ports:
                logger.info(f"Processing port: {port.device}")

                port_info = {
                    'device': port.device,
                    'description': port.description or 'Unknown Device',
                    'hwid': port.hwid or 'Unknown',
                    'manufacturer': getattr(port, 'manufacturer', 'Unknown'),
                    'product': getattr(port, 'product', 'Unknown'),
                    'serial_number': getattr(port, 'serial_number', 'Unknown')
                }

                # Simple device type detection
                desc_lower = port_info['description'].lower()
                if any(keyword in desc_lower for keyword in ['arduino', 'nano', 'uno']):
                    port_info['device_type'] = 'Arduino'
                    port_info['icon'] = '🔧'
                elif any(keyword in desc_lower for keyword in ['esp32', 'esp8266']):
                    port_info['device_type'] = 'ESP Development Board'
                    port_info['icon'] = '📡'
                elif any(keyword in desc_lower for keyword in ['ftdi', 'cp210', 'ch340', 'usb']):
                    port_info['device_type'] = 'USB Serial Adapter'
                    port_info['icon'] = '🔌'
                else:
                    port_info['device_type'] = 'Serial Device'
                    port_info['icon'] = '⚡'

                ports.append(port_info)
                logger.info(f"Added port: {port.device} - {port_info['description']}")

        except Exception as e:
            logger.error(f"Error in port detection: {str(e)}")

        logger.info(f"Port scan complete: {len(ports)} ports found")
        return ports

    def connect(self, port: str, baudrate: int = 115200, timeout: float = 2.0) -> Dict[str, Any]:
        """Connect to hardware device"""
        with self.connection_lock:
            if port in self.connections:
                return {'success': True, 'message': f'Already connected to {port}'}

            try:
                ser = serial.Serial(
                    port=port,
                    baudrate=115200,
                    timeout=2.0,
                    parity=serial.PARITY_NONE,
                    stopbits=serial.STOPBITS_ONE,
                    bytesize=serial.EIGHTBITS,
                    rtscts=False,
                    dsrdtr=False,
                    xonxoff=False
                )

                self.connections[port] = ser
                self.command_history[port] = deque(maxlen=self.max_history)

                logger.info(f"Connected to {port} with standard settings (115200-8-N-1)")
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
                logger.error(f"Failed to connect to {port}: {str(e)}")
                return {'success': False, 'message': f'Connection failed: {str(e)}'}

    def execute_command(self, port: str, command: str, dashboard: str = "general", use_cache: bool = True) -> Dict[str, Any]:
        """Execute hardware command"""
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

                # Handle special bifurcation commands (simulation for development)
                if dashboard == 'bifurcation' or command.lower() in ['showmode', 'getconfig', 'checkstatus']:
                    raw_response = self._simulate_bifurcation_response(command)
                else:
                    ser.reset_input_buffer()
                    ser.reset_output_buffer()

                    command_bytes = (command + '\r\n').encode('utf-8')
                    ser.write(command_bytes)
                    ser.flush()

                    response_parts = []
                    last_activity = time.time()

                    while time.time() - start_time < ser.timeout * 2:
                        if ser.in_waiting:
                            chunk = ser.read(ser.in_waiting).decode('utf-8', errors='ignore')
                            response_parts.append(chunk)
                            last_activity = time.time()

                            full_response = ''.join(response_parts)
                            if any(term in full_response.lower() for term in ['ok\r', 'error\r', 'done\r']):
                                break
                        else:
                            if time.time() - last_activity > 0.5:
                                break
                            time.sleep(0.01)

                    raw_response = ''.join(response_parts).strip()

                response_time = (time.time() - start_time) * 1000

                if not raw_response:
                    return {'success': False, 'message': 'No response received from device'}

                parsed_data = HardwareResponseParser.parse_response(raw_response, command, dashboard)

                result = {
                    'success': True,
                    'data': parsed_data,
                    'response_time_ms': round(response_time, 2),
                    'from_cache': False,
                    'dashboard': dashboard
                }

                if use_cache and parsed_data['status'] == 'success':
                    self.cache.set(command, port, result, dashboard)

                if port in self.command_history:
                    self.command_history[port].append({
                        'timestamp': parsed_data['timestamp'],
                        'command': command,
                        'dashboard': dashboard,
                        'response_time_ms': response_time,
                        'success': True,
                        'response': raw_response[:200] + '...' if len(raw_response) > 200 else raw_response
                    })

                if dashboard in self.dashboard_states:
                    self.dashboard_states[dashboard]['last_update'] = datetime.now().isoformat()
                    self.dashboard_states[dashboard]['command_count'] += 1

                return result

            except Exception as e:
                error_msg = f"Command execution error: {str(e)}"
                logger.error(f"Error executing '{command}' on {port}: {error_msg}")
                return {'success': False, 'message': error_msg}

    def _simulate_bifurcation_response(self, command: str) -> str:
        """Simulate bifurcation command responses"""
        command_lower = command.lower().strip()

        if command_lower == 'showmode':
            return "SBR mode: 1"
        elif command_lower == 'getconfig':
            return "PCIe Configuration:\nGolden Finger: X16(SSC)\nStraddle PCIE: X16(CC)\nLeft MCIO: X8(CC)\nRight MCIO: X8(CC)"
        elif command_lower == 'checkstatus':
            return "Bifurcation Status: Active\nMode: 1\nErrors: 0"
        else:
            return f"Command '{command}' executed successfully"

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

                logger.info(f"Disconnected from {port}")
                return {'success': True, 'message': f'Disconnected from {port}'}

            except Exception as e:
                logger.error(f"Error disconnecting from {port}: {str(e)}")
                return {'success': False, 'message': f'Disconnect error: {str(e)}'}

    def get_system_status(self) -> Dict[str, Any]:
        """Get system status"""
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
app.static_folder = 'static'
app.static_url_path = '/static'

socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# Global manager instance
calypso_manager = CalypsoPyManager()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/ports')
def list_ports():
    try:
        ports = calypso_manager.list_ports()
        logger.info(f"API /api/ports called, returning {len(ports)} ports")
        return jsonify(ports)
    except Exception as e:
        logger.error(f"Error in /api/ports: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/status')
def system_status():
    return jsonify(calypso_manager.get_system_status())


@socketio.on('connect')
def handle_connect():
    emit('system_status', calypso_manager.get_system_status())
    logger.info("Client connected")


@socketio.on('connect_device')
def handle_connect_device(data):
    port = data.get('port')
    result = calypso_manager.connect(port)
    emit('connection_result', result)
    if result['success']:
        socketio.emit('system_status', calypso_manager.get_system_status())


@socketio.on('disconnect_device')
def handle_disconnect_device(data):
    port = data.get('port')
    result = calypso_manager.disconnect(port)
    emit('disconnection_result', result)
    socketio.emit('system_status', calypso_manager.get_system_status())


@socketio.on('execute_command')
def handle_execute_command(data):
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

    if dashboard == 'bifurcation':
        logger.info(f"Bifurcation command: '{command}'")

    result = calypso_manager.execute_command(port, command, dashboard, use_cache)
    result['dashboard'] = dashboard
    emit('command_result', result)


@socketio.on('get_dashboard_data')
def handle_get_dashboard_data(data):
    dashboard = data.get('dashboard', 'device_info')
    port = data.get('port')

    if not port:
        emit('dashboard_data', {'success': False, 'message': 'Port required'})
        return

    dashboard_state = calypso_manager.dashboard_states.get(dashboard, {})
    command_history = list(calypso_manager.command_history.get(port, []))

    dashboard_history = [
        cmd for cmd in command_history
        if cmd.get('dashboard') == dashboard
    ]

    emit('dashboard_data', {
        'success': True,
        'dashboard': dashboard,
        'state': dashboard_state,
        'history': dashboard_history[-20:],
        'port': port
    })

@socketio.on('firmware_update')
def handle_firmware_update(data):
    port = data.get('port')
    target = data.get('target')  # 'mcu' or 'sbr'
    file_data = data.get('file_data')  # Base64 encoded

    if not all([port, target, file_data]):
        emit('firmware_update_result', {
            'success': False,
            'message': 'Missing required parameters'
        })
        return

    # Decode file data
    import base64
    try:
        file_bytes = base64.b64decode(file_data)
    except Exception as e:
        emit('firmware_update_result', {
            'success': False,
            'message': f'Invalid file data: {str(e)}'
        })
        return

    # Create updater if not exists
    if not hasattr(calypso_manager, 'firmware_updater'):
        calypso_manager.firmware_updater = FirmwareUpdater(calypso_manager)

    # Progress callback
    def progress_callback(info):
        socketio.emit('firmware_progress', {
            'port': port,
            'target': target,
            **info
        })

    # Perform update in background thread
    def do_update():
        if target == 'mcu':
            result = calypso_manager.firmware_updater.update_firmware(
                port, 'mcu', file_bytes, progress_callback
            )
        elif target == 'sbr':
            result = calypso_manager.firmware_updater.update_sbr_both(
                port, file_bytes, progress_callback
            )
        else:
            result = {'success': False, 'message': 'Invalid target'}

        socketio.emit('firmware_update_result', result)

    threading.Thread(target=do_update).start()


@socketio.on('cancel_firmware_update')
def handle_cancel_firmware_update(data):
    port = data.get('port')

    if hasattr(calypso_manager, 'firmware_updater'):
        success = calypso_manager.firmware_updater.cancel_transfer(port)
        emit('firmware_cancel_result', {
            'success': success,
            'port': port
        })


@socketio.on('clear_cache')
def handle_clear_cache(data):
    dashboard = data.get('dashboard', 'all')
    if dashboard == 'all':
        calypso_manager.cache = CalypsoPyCache()

    emit('cache_cleared', {
        'success': True,
        'message': f'Cache cleared for {dashboard}',
        'dashboard': dashboard
    })


if __name__ == '__main__':
    os.makedirs('logs', exist_ok=True)

    print("🚀 CalypsoPy+ by Serial Cables")
    print("Professional Hardware Development Interface")
    print("=" * 50)
    print("🌐 Web Interface: http://localhost:5000")
    print("📊 Dashboards: Device Info, Link Status, Bifurcation, I2C/I3C, Advanced, Resets, Firmware")
    print("🔀 Bifurcation: PCIe lane configuration monitoring and control")
    print("=" * 50)

    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=False,
        use_reloader=False
    )