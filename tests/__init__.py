"""
CalypsoPy+ PCIe/NVMe Testing Module
Comprehensive PCIe/NVMe testing suite

This module provides comprehensive testing capabilities for:
- PCIe topology discovery and validation
- NVMe device enumeration and health monitoring
- Link training time measurement and LTSSM tracking
- Link retrain count monitoring and PCIe 6.x compliance validation
- Sequential read performance testing with fio
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
    "link_retrain_count",
    "sequential_read_performance",  # NEW: Sequential Read Performance test
    "sequential_write_performance", # NEW: Sequential Write Performance test
    "random_iops_performance",      # NEW: Random IOPS Performance test
    "nvme_namespace_validation",    # NEW: NVMe Namespace Validation test
    "nvme_command_set_validation",  # NEW: NVMe Command Set Validation test
    "nvme_identify_validation",     # NEW: NVMe Identify Structure Validation test
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


# Import main test classes for external use
try:
    from .pcie_discovery import PCIeDiscovery, NVMeDiscovery as PCIeNVMeDiscovery
    from .nvme_discovery import NVMeDiscovery
    from .link_training_time import LinkTrainingTimeMeasurement
    from .link_retrain_count import LinkRetrainCount
    from .link_quality import LinkQualityTest
    from .sequential_read_performance import SequentialReadPerformanceTest
    from .sequential_write_performance import SequentialWritePerformanceTest
    from .random_iops_performance import RandomIOPSPerformanceTest
    from .namespace_validation import NamespaceValidationTest
    from .command_set_validation import CommandSetValidationTest
    from .identify_structure_validation import IdentifyStructureValidationTest
    from .fio_utilities import FioUtilities
    from .results_exporter import ResultsExporter
    from .test_runner import TestRunner, TestSuite, TestRunResult
    
    # Export main classes
    __all__ = [
        'PCIeDiscovery',
        'NVMeDiscovery', 
        'LinkTrainingTimeMeasurement',
        'LinkRetrainCount',
        'LinkQualityTest',
        'SequentialReadPerformanceTest',
        'SequentialWritePerformanceTest',
        'RandomIOPSPerformanceTest',
        'NamespaceValidationTest',
        'CommandSetValidationTest',
        'IdentifyStructureValidationTest',
        'FioUtilities',
        'ResultsExporter',
        'TestRunner',
        'TestSuite', 
        'TestRunResult',
        'TestStatus',
        'PermissionLevel',
        'get_permission_level',
        'get_module_info',
        'SUPPORTED_TESTS',
        'TEST_SUITE_VERSION'
    ]
    
except ImportError as e:
    # In case some modules are missing during development
    __all__ = [
        'TestStatus',
        'PermissionLevel', 
        'get_permission_level',
        'get_module_info',
        'SUPPORTED_TESTS',
        'TEST_SUITE_VERSION'
    ]