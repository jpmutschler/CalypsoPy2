# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CalypsoPy+ is a professional PCIe hardware development interface built with Flask/SocketIO. It provides a web-based dashboard for interfacing with Serial Cables Gen6 PCIe Atlas 3 Host Cards through serial communication, featuring real-time hardware monitoring, firmware updates, and comprehensive testing capabilities.

## Architecture

### Core Components

- **app.py**: Main Flask application with SocketIO for real-time communication
  - `CalypsoPyManager`: Handles serial connections and command execution
  - `HardwareResponseParser`: Parses device responses (showport, bifurcation, etc.)
  - Dashboard system with specialized handlers for different hardware functions
  
- **FWUpdate.py**: XMODEM-based firmware update system
  - `XmodemTransfer`: XMODEM protocol implementation
  - `FirmwareUpdater`: Manages firmware updates for MCU, SBR0, SBR1 targets

- **start.py**: Quick-start script with dependency checking and server initialization

- **tests/**: Comprehensive PCIe testing framework
  - `test_runner.py`: Test orchestration and management
  - `pcie_discovery.py`: Atlas 3 PCIe switch topology discovery
  - `nvme_discovery.py`: NVMe device enumeration
  - `link_training_time.py`: LTSSM state transition measurement
  - `link_retrain_count.py`: PCIe link retrain monitoring
  - `sequential_read_performance.py`: Sequential read performance testing
  - `sequential_write_performance.py`: Sequential write performance testing
  - `random_iops_performance.py`: Random IOPS performance testing
  - `fio_utilities.py`: FIO benchmarking utilities
  - `results_exporter.py`: Test results export functionality

### Frontend Architecture

- **templates/index.html**: Single-page web application with dashboard system
- **static/js/**: Modular JavaScript components
  - `app.js`: Main application logic and SocketIO handling
  - `FWUpdater.js`: Firmware update interface
  - `device_filtering.js`: Reusable Atlas 3 downstream device filtering utilities
  - `advanced.js`, `registers.js`, etc.: Dashboard-specific functionality
  - `sequential_read_performance.js`: Sequential read test UI
  - `sequential_write_performance.js`: Sequential write test UI
  - `random_iops_performance.js`: Random IOPS test UI
  - `testing.js`: Test dashboard orchestration
- **static/css/styles.css**: Comprehensive styling system

## Development Commands

### Running the Application

```bash
# Quick start (recommended for development)
python start.py

# Direct execution
python app.py

# Install dependencies manually if needed
pip install -r requirements.txt
```

### Testing

```bash
# Run test suite directly
python tests/test_runner.py

# Run individual tests
python tests/pcie_discovery.py
python tests/nvme_discovery.py
python tests/link_training_time.py
python tests/link_retrain_count.py
```

### Dependencies

Core requirements are in `requirements.txt`:
- Flask==3.0.0 (web framework)
- Flask-SocketIO==5.3.6 (real-time communication)
- pyserial==3.5 (serial communication)
- eventlet==0.33.3 (async support)

## Hardware Interface Patterns

### Serial Communication
- Standard settings: 115200-8-N-1, 2s timeout
- Command format: `{command}\r\n`
- Response parsing through `HardwareResponseParser`
- Caching system for repeated commands

### Dashboard System
Each dashboard has specialized command handling:
- **Link Status**: `showport` command parsing for PCIe port states
- **Bifurcation**: SBR mode configuration (`showmode`, `getconfig`)
- **Registers**: Memory read/write/dump commands (`mr`, `mw`, `dr`, `dp`)
- **Firmware**: XMODEM-based updates with progress tracking

### Testing Framework
- **Discovery Phase**: PCIe topology → NVMe devices
- **Measurement Phase**: Link training timing and retrain counting
- **Device Filtering**: All tests automatically filter to only test Atlas 3 downstream endpoint devices
  - Bridges and switches are excluded for system stability
  - The Atlas 3 switch itself is never tested directly
  - Only endpoint devices downstream of Atlas 3 are tested
  - Filtering is enforced and cannot be disabled for safety
- **Performance Testing**: Sequential read/write and random IOPS with PCIe 6.x compliance validation
- Tests are conditional based on previous discovery results
- Root privileges required for some tests (setpci, direct hardware access)
- FIO required for performance benchmarking tests

## Key File Locations

- Main server: `app.py:718` (CalypsoPyManager instantiation)
- SocketIO handlers: `app.py:742-1008`
- Hardware parsing: `app.py:115-244` (HardwareResponseParser)
- Firmware updates: `FWUpdate.py:227-368` (FirmwareUpdater)
- Test orchestration: `tests/test_runner.py:54-324`

## Development Notes

- Server runs on `0.0.0.0:5000` for network access
- WebSocket communication for real-time updates
- Simulated responses available for development without hardware
- Extensive logging to `logs/calypso_py.log`
- Thread-safe operations with connection locks

## Safety Features

- **Atlas 3 Downstream-Only Testing**: All PCIe/NVMe tests are restricted to endpoint devices downstream of the Atlas 3 switch
- **Automatic Device Filtering**: Bridges, switches, and the Atlas 3 itself are automatically excluded from testing
- **Non-Disableable Safety**: Device filtering checkboxes are permanently enabled for system stability
- **Device Exclusion Display**: UI clearly shows which devices are excluded and why
- Make sure to update the __init__.py file to adjust for newly added Python scripts
- Update Readme.md and the User's Manual with all new changes