"""
CalypsoPy+ PCIe/NVMe Testing Module
Phase 1: Link Quality & NVMe Discovery Tests

This module provides comprehensive testing capabilities for:
- PCIe topology discovery and validation
- NVMe device enumeration and health monitoring
- Atlas 3 switch configuration verification
"""

__version__ = "1.0.0"
__author__ = "Serial Cables, Inc."

# Test suite version
TEST_SUITE_VERSION = "1.0.0"

# Supported test categories
SUPPORTED_TESTS = [
    "pcie_discovery",
    "nvme_discovery",
    "link_quality",
    "error_correlation"
]


# Test result statuses
class TestStatus:
    """Test execution status codes"""
    PASS = "pass"
    FAIL = "fail"
    WARNING = "warning"
    SKIPPED = "skipped"
    ERROR = "error"
    RUNNING = "running"
    IDLE = "idle"


# Permission levels
class PermissionLevel:
    """System permission levels for test execution"""
    ROOT = "root"  # Full access
    SUDO = "sudo"  # Sudo access available
    USER = "user"  # Regular user (read-only)
    UNKNOWN = "unknown"  # Unable to determine


def get_permission_level():
    """
    Determine current user permission level

    Returns:
        PermissionLevel enum value
    """
    import os
    import subprocess

    # Check if running as root
    if os.geteuid() == 0:
        return PermissionLevel.ROOT

    # Check if sudo is available
    try:
        result = subprocess.run(
            ['sudo', '-n', 'true'],
            capture_output=True,
            timeout=1
        )
        if result.returncode == 0:
            return PermissionLevel.SUDO
    except:
        pass

    return PermissionLevel.USER


# Export commonly used classes
__all__ = [
    'TestStatus',
    'PermissionLevel',
    'get_permission_level',
    'TEST_SUITE_VERSION',
    'SUPPORTED_TESTS'
]