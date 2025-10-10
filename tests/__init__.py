"""
CalypsoPy+ PCIe/NVMe Testing Module
Phase 1: Link Quality & NVMe Discovery Tests

This module provides comprehensive testing capabilities for:
- PCIe topology discovery and validation
- NVMe device enumeration and health monitoring
- Link training time measurement and LTSSM tracking
- Link retrain count monitoring and PCIe 6.x compliance validation
- Atlas 3 switch configuration verification
"""

__version__ = "1.2.0"
__author__ = "Serial Cables, Inc."

# Test suite version
TEST_SUITE_VERSION = "1.2.0"

# Supported test categories
SUPPORTED_TESTS = [
    "pcie_discovery",
    "nvme_discovery",
    "link_training_time",
    "link_retrain_count",  # NEW: Link Retrain Count test
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
    try:
        if os.geteuid() == 0:
            return PermissionLevel.ROOT
    except AttributeError:
        # Windows doesn't have geteuid
        pass

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


def get_module_info():
    """
    Get information about the testing module

    Returns:
        dict: Module information including version, available tests, etc.
    """
    return {
        'version': __version__,
        'test_suite_version': TEST_SUITE_VERSION,
        'supported_tests': SUPPORTED_TESTS,
        'permission_level': get_permission_level()
    }