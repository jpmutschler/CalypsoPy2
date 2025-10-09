"""
CalypsoPy+ PCIe/NVMe Testing Module
Phase 1: Link Quality & NVMe Discovery Tests

This module provides comprehensive testing capabilities for:
- PCIe topology discovery and validation
- NVMe device enumeration and health monitoring
- Link training time measurement and LTSSM tracking
- Atlas 3 switch configuration verification
"""

__version__ = "1.1.0"
__author__ = "Serial Cables, Inc."

# Test suite version
TEST_SUITE_VERSION = "1.1.0"

# Supported test categories
SUPPORTED_TESTS = [
    "pcie_discovery",
    "nvme_discovery",
    "link_training_time",  # NEW: Added link training time measurement
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
        'author': __author__,
        'supported_tests': SUPPORTED_TESTS,
        'modules_available': _MODULES_AVAILABLE,
        'permission_level': get_permission_level()
    }


# Import test modules (for convenience)
# These imports are optional - the module works without them
_MODULES_AVAILABLE = False

try:
    from .pcie_discovery import PCIeDiscovery
    from .nvme_discovery import NVMeDiscovery
    from .link_training_time import LinkTrainingTimeMeasurement
    from .test_runner import TestRunner, TestSuite, TestRunResult

    # Mark modules as successfully imported
    _MODULES_AVAILABLE = True

except ImportError as e:
    # Module imports failed - log for debugging
    import logging
    logging.warning(f"Some test modules could not be imported: {e}")

    # Define placeholder None values to avoid NameError
    PCIeDiscovery = None
    NVMeDiscovery = None
    LinkTrainingTimeMeasurement = None
    TestRunner = None
    TestSuite = None
    TestRunResult = None


# Export commonly used classes
# These are always defined, even if imports fail (set to None)
__all__ = [
    # Status and permission classes
    'TestStatus',
    'PermissionLevel',
    'get_permission_level',

    # Version info
    'TEST_SUITE_VERSION',
    'SUPPORTED_TESTS',

    # Test modules (may be None if imports failed)
    'PCIeDiscovery',
    'NVMeDiscovery',
    'LinkTrainingTimeMeasurement',
    'TestRunner',
    'TestSuite',
    'TestRunResult',

    # Utility functions
    'get_module_info',
]


# Module initialization log
import logging
logger = logging.getLogger(__name__)
logger.info(f"CalypsoPy+ Testing Module v{__version__} initialized")
logger.info(f"Supported tests: {', '.join(SUPPORTED_TESTS)}")
logger.info(f"Permission level: {get_permission_level()}")

if _MODULES_AVAILABLE:
    logger.info("✅ All test modules successfully imported")
else:
    logger.warning("⚠️ Some test modules failed to import - check dependencies")