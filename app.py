#!/usr/bin/env python3
"""
CalypsoPy+ by Serial Cables
Professional Serial Communication Interface for Hardware Development
Updated with Showport Command Parser
"""

import json
import logging
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional, Any
import serial
import serial.tools.list_ports
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import re
from collections import deque
import hashlib
import os
import sys

# Add tests directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tests'))

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

try:
    from tests.test_runner import TestRunner
    from tests.pcie_discovery import PCIeDiscovery
    from tests.nvme_discovery import NVMeDiscovery
    TESTING_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Testing modules not available: {e}")
    TESTING_AVAILABLE = False

# Initialize test runner (add near other global instances)
if TESTING_AVAILABLE:
    test_runner = TestRunner()
    logger.info("Test Runner initialized")


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

try:
    from tests.test_runner import TestRunner
    from tests.pcie_discovery import PCIeDiscovery
    from tests.nvme_discovery import NVMeDiscovery
    TESTING_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Testing modules not available: {e}")
    TESTING_AVAILABLE = False

# Initialize test runner (add near other global instances)
if TESTING_AVAILABLE:
    test_runner = TestRunner()
    logger.info("Test Runner initialized")

class HardwareResponseParser:
    """Enhanced response parser with showport support"""

    @staticmethod
    def parse_showport_response(raw_response: str) -> Dict[str, Any]:
        """Parse the showport command output"""
        parsed_data = {
            'ports': [],
            'golden_finger': None,
            'upstream_ports': []
        }

        lines = raw_response.strip().split('\n')
        current_section = None

        for line in lines:
            line = line.strip()

            # Detect section headers
            if 'Port Slot' in line or '----' in line:
                continue
            elif 'Port Upstream' in line:
                current_section = 'upstream'
                continue
            elif line.startswith('Golden finger:'):
                current_section = 'golden_finger'
                # Parse golden finger
                match = re.search(r'speed\s+(\d+),\s+width\s+(\d+),\s+max_width\s*=\s*(\d+)', line)
                if match:
                    speed_code = match.group(1)
                    width_code = match.group(2)
                    max_width = match.group(3)

                    parsed_data['golden_finger'] = {
                        'speed': HardwareResponseParser._parse_speed(speed_code),
                        'speed_code': speed_code,
                        'width': HardwareResponseParser._parse_width(width_code),
                        'width_code': width_code,
                        'max_width': HardwareResponseParser._parse_width(max_width),
                        'max_width_code': max_width
                    }
                continue

            # Parse port entries
            port_match = re.match(r'Port(\d+):\s+speed\s+(\d+),\s+width\s+(\d+),\s+max_speed(\d+),\s+max_width(\d+)',
                                  line)
            if port_match:
                port_num = port_match.group(1)
                speed_code = port_match.group(2)
                width_code = port_match.group(3)
                max_speed_code = port_match.group(4)
                max_width_code = port_match.group(5)

                port_data = {
                    'port_number': port_num,
                    'speed': HardwareResponseParser._parse_speed(speed_code),
                    'speed_code': speed_code,
                    'width': HardwareResponseParser._parse_width(width_code),
                    'width_code': width_code,
                    'max_speed': HardwareResponseParser._parse_speed(max_speed_code),
                    'max_speed_code': max_speed_code,
                    'max_width': HardwareResponseParser._parse_width(max_width_code),
                    'max_width_code': max_width_code,
                    'is_connected': speed_code != '00' and width_code != '00'
                }

                if current_section == 'upstream':
                    parsed_data['upstream_ports'].append(port_data)
                else:
                    parsed_data['ports'].append(port_data)

        return parsed_data

    @staticmethod
    def _parse_speed(speed_code: str) -> str:
        """Convert speed code to generation string"""
        speed_map = {
            '06': 'Gen6',
            '05': 'Gen5',
            '04': 'Gen4',
            '03': 'Gen3',
            '02': 'Gen2',
            '01': 'Gen1',
            '00': 'No Link'
        }
        return speed_map.get(speed_code, f'Unknown ({speed_code})')

    @staticmethod
    def _parse_width(width_code: str) -> str:
        """Convert width code to lane configuration string"""
        width_map = {
            '16': 'x16',
            '08': 'x8',
            '04': 'x4',
            '02': 'x2',
            '01': 'x1',
            '00': 'No Link'
        }
        return width_map.get(width_code, f'Unknown ({width_code})')

    @staticmethod
    def parse_response(raw_response: str, command: str = "", dashboard: str = "general") -> Dict[str, Any]:
        """Main response parser with enhanced handling"""
        parsed_data = {
            'raw': raw_response.strip(),
            'timestamp': datetime.now().isoformat(),
            'command': command,
            'dashboard': dashboard,
            'parsed': {},
            'type': 'text',
            'status': 'success'
        }

        # Handle showport command
        if command.lower() == 'showport' or dashboard == 'link_status':
            showport_data = HardwareResponseParser.parse_showport_response(raw_response)
            parsed_data['parsed'] = showport_data
            parsed_data['type'] = 'showport_response'
            return parsed_data

        # Handle bifurcation showmode command
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
        """List available serial ports"""
        ports = []
        logger.info("Starting port scan...")

        try:
            detected_ports = serial.tools.list_ports.comports()
            logger.info(f"Raw port scan found {len(detected_ports)} ports")

            for port in detected_ports:
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

    def execute_command(self, port: str, command: str, dashboard: str = "general", use_cache: bool = True) -> Dict[
        str, Any]:
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

                # Handle special commands (simulation for development without hardware)
                if dashboard == 'bifurcation' or command.lower() in ['showmode', 'getconfig', 'checkstatus']:
                    raw_response = self._simulate_bifurcation_response(command)
                elif command.lower() == 'showport':
                    raw_response = self._simulate_showport_response()
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
                            if any(term in full_response.lower() for term in ['ok\r', 'error\r', 'done\r', 'cmd>']):
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

    def _simulate_showport_response(self) -> str:
        """Simulate showport command response for development"""
        return """Cmd>showport
Port Slot----------------------------------------------------------------------
--------------------

Port80 : speed 06, width 08, max_speed06, max_width08
Port112: speed 06, width 08, max_speed06, max_width16
Port128: speed 06, width 08, max_speed06, max_width16
Port Upstream------------------------------------------------------------------
----------------------------

Golden finger: speed 06, width 08, max_width = 16
Cmd>"""

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

    logger.info(f"Executing command '{command}' on dashboard '{dashboard}'")

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


# Testing API Routes
@app.route('/api/tests/available')
def list_available_tests():
    """List available test suites with system capability checks"""
    if not TESTING_AVAILABLE:
        return jsonify({'error': 'Testing modules not available'}), 503

    try:
        tests = test_runner.list_available_tests()

        # Add system capability checks
        pcie_discovery = PCIeDiscovery()
        nvme_discovery = NVMeDiscovery()

        for test in tests:
            if test['id'] == 'pcie_discovery':
                test['has_permission'] = pcie_discovery.has_root or pcie_discovery.has_sudo
                test['permission_level'] = pcie_discovery.permission_level
            elif test['id'] == 'nvme_discovery':
                test['has_permission'] = nvme_discovery.has_root or nvme_discovery.has_sudo
                test['has_nvme_cli'] = nvme_discovery.has_nvme_cli
                test[
                    'permission_level'] = 'root' if nvme_discovery.has_root else 'sudo' if nvme_discovery.has_sudo else 'user'

        return jsonify(tests)
    except Exception as e:
        logger.error(f"Error listing tests: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tests/run', methods=['POST'])
def run_single_test():
    """Run a single test suite"""
    if not TESTING_AVAILABLE:
        return jsonify({'error': 'Testing modules not available'}), 503

    try:
        data = request.get_json()
        test_id = data.get('test_id')
        port = data.get('port')

        if not test_id:
            return jsonify({'error': 'test_id required'}), 400

        logger.info(f"Running test: {test_id} (port: {port})")

        # Run test
        result = test_runner.run_test_suite(test_id)

        return jsonify(result)

    except Exception as e:
        logger.error(f"Error running test: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tests/run_all', methods=['POST'])
def run_all_tests():
    """Run all available test suites"""
    if not TESTING_AVAILABLE:
        return jsonify({'error': 'Testing modules not available'}), 503

    try:
        data = request.get_json()
        port = data.get('port')

        logger.info(f"Running all tests (port: {port})")

        # Run all tests
        run_result = test_runner.run_all_tests()

        # Convert dataclass to dict for JSON serialization
        result_dict = {
            'run_id': run_result.run_id,
            'start_time': run_result.start_time.isoformat(),
            'end_time': run_result.end_time.isoformat() if run_result.end_time else None,
            'total_duration_ms': run_result.total_duration_ms,
            'overall_status': run_result.overall_status,
            'summary': run_result.summary,
            'results': run_result.results
        }

        return jsonify(result_dict)

    except Exception as e:
        logger.error(f"Error running all tests: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/tests/export/<run_id>')
def export_test_results(run_id):
    """Export test results as downloadable report"""
    if not TESTING_AVAILABLE:
        return jsonify({'error': 'Testing modules not available'}), 503

    try:
        # This would retrieve from a results cache/database
        # For now, return error as we don't persist results
        return jsonify({'error': 'Result export not yet implemented'}), 501

    except Exception as e:
        logger.error(f"Error exporting results: {e}")
        return jsonify({'error': str(e)}), 500


# WebSocket handlers for real-time test progress
@socketio.on('run_test')
def handle_run_test(data):
    """WebSocket handler for running tests with progress updates"""
    if not TESTING_AVAILABLE:
        emit('test_error', {'message': 'Testing modules not available'})
        return

    test_id = data.get('test_id')
    port = data.get('port')

    if not test_id:
        emit('test_error', {'message': 'test_id required'})
        return

    logger.info(f"WebSocket: Running test {test_id}")

    # Progress callback
    def progress_callback(update):
        emit('test_progress', update)

    try:
        # Run test with progress updates
        result = test_runner.run_test_suite(test_id, progress_callback=progress_callback)
        emit('test_complete', result)

    except Exception as e:
        logger.error(f"WebSocket test error: {e}")
        emit('test_error', {'message': str(e)})


@socketio.on('run_all_tests')
def handle_run_all_tests(data):
    """WebSocket handler for running all tests with progress updates"""
    if not TESTING_AVAILABLE:
        emit('test_error', {'message': 'Testing modules not available'})
        return

    port = data.get('port')
    logger.info(f"WebSocket: Running all tests")

    # Progress callback
    def progress_callback(update):
        emit('test_progress', update)

    try:
        # Run all tests with progress updates
        run_result = test_runner.run_all_tests(progress_callback=progress_callback)

        # Convert to dict
        result_dict = {
            'run_id': run_result.run_id,
            'start_time': run_result.start_time.isoformat(),
            'end_time': run_result.end_time.isoformat() if run_result.end_time else None,
            'total_duration_ms': run_result.total_duration_ms,
            'overall_status': run_result.overall_status,
            'summary': run_result.summary,
            'results': run_result.results
        }

        emit('all_tests_complete', result_dict)

    except Exception as e:
        logger.error(f"WebSocket all tests error: {e}")
        emit('test_error', {'message': str(e)})

if __name__ == '__main__':
    os.makedirs('logs', exist_ok=True)

    print("🚀 CalypsoPy+ by Serial Cables")
    print("Serial Cables Gen6 PCIe Atlas 3 Host Card Development Interface")
    print("=" * 50)
    print("🌐 Web Interface: http://localhost:5000")
    print("📊 Dashboards: Device Info, Link Status, Bifurcation, I2C/I3C, Advanced, Resets, Firmware")
    print("📡 Link Status: PCIe port monitoring with showport command")
    print("=" * 50)

    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=False,
        use_reloader=False
    )