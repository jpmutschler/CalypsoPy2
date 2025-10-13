# CalypsoPy+ Setup Guide

## Quick Start

The fastest way to get started:

```bash
# Clone or download the repository
git clone <repository-url>
cd CalypsoPy+

# Run the quick start script
python start.py
```

The `start.py` script will:
- Check and install required dependencies
- Create necessary directories
- Verify file structure
- Start the server on http://0.0.0.0:5000

## Manual Installation

### 1. Basic Requirements

Install core Python dependencies:

```bash
pip install -r requirements.txt
```

### 2. Development Environment (Optional)

For development and enhanced features:

```bash
pip install -r requirements-dev.txt
```

### 3. System Utilities (For Full Testing Capabilities)

#### Linux/Ubuntu
```bash
sudo apt update
sudo apt install pciutils nvme-cli fio
```

#### Windows (via Administrator PowerShell)
```powershell
# Install Chocolatey first: https://chocolatey.org/install
choco install pciutils nvme-cli fio
```

#### macOS
```bash
# Install Homebrew first: https://brew.sh
brew install pciutils nvme-cli fio
```

## Dependency Overview

### Core Dependencies (requirements.txt)
- **Flask 3.0.0**: Web framework
- **Flask-SocketIO 5.3.6**: Real-time WebSocket communication
- **pyserial 3.5**: Serial port communication
- **eventlet 0.33.3**: Async networking library
- **xmodem 0.4.6**: Firmware update protocol

### Optional Dependencies
- **matplotlib**: Performance chart generation
- **reportlab**: PDF report generation
- **fio**: Disk I/O benchmarking (system utility)
- **nvme-cli**: NVMe device management (system utility)
- **pciutils**: PCIe device utilities (system utility)

## Running the Application

### Option 1: Quick Start (Recommended)
```bash
python start.py
```

### Option 2: Direct Execution
```bash
python app.py
```

### Option 3: Production Deployment
```bash
# Using gunicorn (install first: pip install gunicorn)
gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 app:app
```

## Verification

### Check Python Dependencies
```bash
pip list | grep -E "Flask|socketio|serial|eventlet"
```

### Check System Utilities
```bash
# Check if PCIe utilities are installed
which lspci

# Check if NVMe CLI is installed
nvme --version

# Check if fio is installed
fio --version
```

### Test Connection
1. Open browser to http://localhost:5000
2. Check the connection status indicator
3. Verify all dashboards load correctly

## Troubleshooting

### Missing Dependencies
If you see import errors, ensure all requirements are installed:
```bash
pip install --upgrade -r requirements.txt
```

### Permission Issues
Some PCIe tests require elevated privileges:
```bash
# Linux/macOS
sudo python app.py

# Windows
# Run PowerShell as Administrator
```

### Port Already in Use
If port 5000 is occupied:
```bash
# Find process using port 5000
netstat -an | grep 5000

# Or change port in app.py
socketio.run(app, host='0.0.0.0', port=5001)  # Use different port
```

### Serial Port Access

#### Linux
Add user to dialout group:
```bash
sudo usermod -a -G dialout $USER
# Log out and back in for changes to take effect
```

#### Windows
- Ensure COM port drivers are installed
- Check Device Manager for port availability

#### macOS
```bash
# List available serial ports
ls /dev/tty.*
```

## Feature Availability Matrix

| Feature | Basic Install | +Dev Dependencies | +System Utils |
|---------|--------------|-------------------|---------------|
| Web Interface | ✅ | ✅ | ✅ |
| Serial Communication | ✅ | ✅ | ✅ |
| Real-time Updates | ✅ | ✅ | ✅ |
| Firmware Updates | ✅ | ✅ | ✅ |
| Basic Testing | ✅ | ✅ | ✅ |
| PDF Reports | ❌ | ✅ | ✅ |
| Performance Charts | ❌ | ✅ | ✅ |
| PCIe Discovery | ❌ | ❌ | ✅ |
| NVMe Testing | ❌ | ❌ | ✅ |
| FIO Benchmarks | ❌ | ❌ | ✅ |

## Security Notes

1. **Network Access**: By default, the server binds to 0.0.0.0:5000, making it accessible on all network interfaces. For local-only access, change to 127.0.0.1:5000.

2. **Device Filtering**: All PCIe/NVMe tests automatically filter to only test Atlas 3 downstream endpoint devices for system safety.

3. **Serial Access**: Ensure only trusted devices are connected to serial ports.

## Support

For issues or questions:
1. Check CLAUDE.md for architecture details
2. Review tests/README.md for testing documentation
3. Examine logs in logs/calypso_py.log
4. Report issues at the project repository