# CalypsoPy+ Test Suite Documentation

## Overview

The CalypsoPy+ test suite provides comprehensive PCIe and NVMe testing capabilities for Atlas 3 PCIe switch validation. All tests are designed with safety as the primary concern, ensuring system stability during test execution.

## Critical Safety Policy: Atlas 3 Downstream-Only Testing

**ALL TESTS IN THIS SUITE AUTOMATICALLY FILTER DEVICES TO ONLY TEST ENDPOINT DEVICES DOWNSTREAM OF THE ATLAS 3 SWITCH**

### Device Filtering Rules

1. **Automatic Exclusion of System-Critical Components**:
   - Atlas 3 switch itself is NEVER tested directly
   - PCIe bridges are automatically excluded
   - PCIe switches are automatically excluded
   - Only endpoint devices (NVMe SSDs, GPUs, etc.) are tested

2. **Non-Disableable Safety Features**:
   - Device filtering is permanently enabled in all tests
   - UI checkboxes for filtering are disabled and checked by default
   - This ensures tests cannot accidentally affect system components

3. **Transparent Exclusion Reporting**:
   - All excluded devices are clearly displayed in the UI
   - Each exclusion includes a reason (e.g., "Atlas 3 switch - excluded for stability")
   - Users can see exactly which devices are being protected

## Test Categories

### Discovery Tests
- **PCIe Discovery**: Identifies Atlas 3 topology and downstream devices
- **NVMe Discovery**: Enumerates NVMe controllers downstream of Atlas 3

### Link Quality & Training Tests
- **Link Training Time**: Measures LTSSM transitions (downstream endpoints only)
- **Link Retrain Count**: Monitors retrain events (downstream endpoints only)
- **Link Quality Assessment**: Comprehensive quality testing (downstream endpoints only)

### Performance Tests
- **Sequential Read**: Tests read throughput (downstream NVMe only)
- **Sequential Write**: Tests write throughput (downstream NVMe only)  
- **Random IOPS**: Tests random I/O performance (downstream NVMe only)

## Required Dependencies

```bash
# Core testing utilities
sudo apt install pciutils    # PCIe device management
sudo apt install nvme-cli    # NVMe device control
sudo apt install fio         # Performance benchmarking
```

## Running Tests

### Command Line
```bash
# Run all tests (automatically filters to downstream endpoints)
python tests/test_runner.py

# Run individual test (filtering is automatic)
python tests/link_training_time.py
python tests/sequential_read_performance.py
```

### Web Interface
1. Navigate to PCIe/NVMe Testing dashboard
2. Device filtering is pre-configured and visible
3. Select test parameters (filtering cannot be disabled)
4. Run tests with confidence that system components are protected

## Device Filtering Implementation

### JavaScript Utility Module
The `static/js/device_filtering.js` module provides:
- `filterAtlas3DownstreamEndpoints()` - Core filtering logic
- `isDeviceDownstreamOf()` - Topology validation
- `updateDeviceSelect()` - UI device list population
- `displayExcludedDevices()` - Exclusion reporting

### Python Test Integration
Each test module includes filtering logic:
```python
# Example from link_training_time.py
def filter_endpoint_devices(devices):
    """Filter to only Atlas 3 downstream endpoints"""
    filtered = []
    for device in devices:
        if is_endpoint(device) and is_downstream_of_atlas3(device):
            filtered.append(device)
    return filtered
```

## Test Safety Guarantees

1. **System Stability**: Tests never affect the host system's PCIe root complex
2. **Atlas 3 Protection**: The Atlas 3 switch configuration is never modified during tests
3. **Bridge Safety**: PCIe bridges remain untouched to prevent topology changes
4. **Downstream Focus**: All testing targets only devices that can be safely reset/tested

## Configuration Files

### Test Options Format
```json
{
    "device_filtering": {
        "enabled": true,           // Always true, cannot be changed
        "filter_endpoints_only": true,  // Always true
        "exclude_bridges": true,    // Always true
        "exclude_switches": true,   // Always true
        "exclude_atlas3": true      // Always true
    },
    "target_devices": "downstream_endpoints_only"
}
```

## Troubleshooting

### No Devices Available for Testing
- Ensure devices are connected downstream of Atlas 3
- Run PCIe Discovery first to identify topology
- Check that devices are endpoints, not bridges/switches

### Test Refuses to Run
- Verify target device is downstream of Atlas 3
- Confirm device is an endpoint (not bridge/switch)
- Check test requirements (root privileges, nvme-cli, fio)

## Development Guidelines

When adding new tests:
1. **Always import device filtering utilities**
2. **Apply filtering before any device operations**
3. **Display excluded devices in UI for transparency**
4. **Make filtering non-disableable in UI controls**
5. **Document filtering in test descriptions**

Example test structure:
```python
class NewPCIeTest:
    def run_test(self, options):
        # Get all devices
        devices = self.discover_devices()
        
        # MANDATORY: Filter to downstream endpoints only
        filtered = self.filter_downstream_endpoints(devices)
        excluded = self.get_excluded_devices(devices, filtered)
        
        # Log exclusions for transparency
        self.log_excluded_devices(excluded)
        
        # Proceed with testing filtered devices only
        for device in filtered:
            self.test_device(device)
```

## Contact & Support

For questions about device filtering or test safety:
- Review CLAUDE.md for architecture details
- Check device_filtering.js for implementation
- Ensure Atlas 3 is properly configured

Remember: **Safety First** - All tests protect system stability by design.