#!/usr/bin/env python3
"""
CalypsoPy+ Test Runner
Orchestrates and executes PCIe/NVMe test suites
Updated with Link Retrain Count test
"""

import logging
import json
from typing import Dict, List, Any, Optional
from datetime import datetime
from dataclasses import dataclass, field

# Import test modules
try:
    from .pcie_discovery import PCIeDiscovery
    from .nvme_discovery import NVMeDiscovery
    from .link_training_time import LinkTrainingTimeMeasurement
    from .link_retrain_count import LinkRetrainCount
    from .link_quality import LinkQualityTest
    from .sequential_read_performance import SequentialReadPerformanceTest
    from .sequential_write_performance import SequentialWritePerformanceTest
    from .random_iops_performance import RandomIOPSPerformanceTest
    from .namespace_validation import NamespaceValidator
    from .command_set_validation import CommandSetValidator
    from .identify_structure_validation import IdentifyStructureValidator
except ImportError:
    # Handle direct execution
    from pcie_discovery import PCIeDiscovery
    from nvme_discovery import NVMeDiscovery
    from link_training_time import LinkTrainingTimeMeasurement
    from link_retrain_count import LinkRetrainCount
    from link_quality import LinkQualityTest
    from sequential_read_performance import SequentialReadPerformanceTest
    from sequential_write_performance import SequentialWritePerformanceTest
    from random_iops_performance import RandomIOPSPerformanceTest
    from namespace_validation import NamespaceValidator
    from command_set_validation import CommandSetValidator
    from identify_structure_validation import IdentifyStructureValidator

logger = logging.getLogger(__name__)


@dataclass
class TestSuite:
    """Represents a test suite"""
    name: str
    description: str
    test_class: Any
    requires_root: bool = False
    requires_nvme_cli: bool = False
    requires_nvme_devices: bool = False  # Requires NVMe devices to be detected first
    requires_fio: bool = False  # Requires fio for performance testing


@dataclass
class TestRunResult:
    """Results from a complete test run"""
    run_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    total_duration_ms: int = 0
    suites_run: List[str] = field(default_factory=list)
    results: Dict[str, Any] = field(default_factory=dict)
    overall_status: str = 'unknown'
    summary: Dict[str, Any] = field(default_factory=dict)


class TestRunner:
    """
    Orchestrates PCIe/NVMe test execution
    Manages test suites and results
    """

    def __init__(self):
        self.test_suites = {
            'pcie_discovery': TestSuite(
                name='PCIe Discovery',
                description='Discover and validate Atlas 3 PCIe switch topology',
                test_class=PCIeDiscovery,
                requires_root=False,
                requires_nvme_cli=False,
                requires_nvme_devices=False
            ),
            'nvme_discovery': TestSuite(
                name='NVMe Discovery',
                description='Discover and enumerate NVMe devices',
                test_class=NVMeDiscovery,
                requires_root=False,
                requires_nvme_cli=True,
                requires_nvme_devices=False
            ),
            'link_training_time': TestSuite(
                name='Link Training Time Measurement',
                description='Track LTSSM state transitions and measure link training times from kernel logs',
                test_class=LinkTrainingTimeMeasurement,
                requires_root=False,
                requires_nvme_cli=False,
                requires_nvme_devices=True  # Only enabled after NVMe discovery
            ),
            'link_retrain_count': TestSuite(
                name='Link Retrain Count',
                description='Monitor PCIe Link Control register for retrain attempts and validate against PCIe 6.x spec',
                test_class=LinkRetrainCount,
                requires_root=True,
                requires_nvme_cli=False,
                requires_nvme_devices=True  # Only enabled after NVMe discovery
            ),
            'link_quality': TestSuite(
                name='PCIe Link Quality Assessment',
                description='Comprehensive link quality test with random resets, LTSSM monitoring, and error correlation with PCIe 6.x compliance validation',
                test_class=LinkQualityTest,
                requires_root=True,
                requires_nvme_cli=False,
                requires_nvme_devices=True  # Requires discovery tests to be completed first
            ),
            'sequential_read_performance': TestSuite(
                name='Sequential Read Performance',
                description='Measure NVMe sequential read performance using fio with PCIe 6.x compliance validation',
                test_class=SequentialReadPerformanceTest,
                requires_root=False,
                requires_nvme_cli=False,
                requires_nvme_devices=True,  # Only enabled after NVMe discovery
                requires_fio=True  # Requires fio for performance testing
            ),
            'sequential_write_performance': TestSuite(
                name='Sequential Write Performance',
                description='Measure NVMe sequential write performance using fio with PCIe 6.x compliance validation',
                test_class=SequentialWritePerformanceTest,
                requires_root=False,
                requires_nvme_cli=False,
                requires_nvme_devices=True,  # Only enabled after NVMe discovery
                requires_fio=True  # Requires fio for performance testing
            ),
            'random_iops_performance': TestSuite(
                name='Random IOPS Performance',
                description='Measure NVMe random IOPS performance using fio with PCIe 6.x compliance validation',
                test_class=RandomIOPSPerformanceTest,
                requires_root=False,
                requires_nvme_cli=False,
                requires_nvme_devices=True,  # Only enabled after NVMe discovery
                requires_fio=True  # Requires fio for performance testing
            ),
            'nvme_namespace_validation': TestSuite(
                name='NVMe Namespace Validation',
                description='Validate NVMe namespace configuration and capacity allocation against NVMe 2.x Base Specification',
                test_class=NamespaceValidator,
                requires_root=False,
                requires_nvme_cli=True,
                requires_nvme_devices=True  # Only enabled after NVMe discovery
            ),
            'nvme_command_set_validation': TestSuite(
                name='NVMe Command Set Validation',
                description='Test NVMe administrative and I/O command set compliance per NVMe 2.x specification',
                test_class=CommandSetValidator,
                requires_root=False,
                requires_nvme_cli=True,
                requires_nvme_devices=True  # Only enabled after NVMe discovery
            ),
            'nvme_identify_validation': TestSuite(
                name='NVMe Identify Structure Validation',
                description='Verify NVMe Identify Controller and Namespace structures for NVMe 2.x spec compliance',
                test_class=IdentifyStructureValidator,
                requires_root=False,
                requires_nvme_cli=True,
                requires_nvme_devices=True  # Only enabled after NVMe discovery
            ),
        }

        # Track if NVMe devices have been detected
        self.nvme_devices_detected = False
        self.discovered_nvme_devices = []

    def update_nvme_detection_status(self, nvme_test_result: Dict[str, Any]):
        """
        Update NVMe device detection status after NVMe discovery test

        Args:
            nvme_test_result: Result from NVMe discovery test
        """
        if nvme_test_result.get('status') in ['pass', 'warning']:
            controllers = nvme_test_result.get('controllers', [])
            if controllers:
                self.nvme_devices_detected = True
                self.discovered_nvme_devices = controllers
                logger.info(f"NVMe detection updated: {len(controllers)} devices detected")
            else:
                self.nvme_devices_detected = False
                self.discovered_nvme_devices = []
        else:
            self.nvme_devices_detected = False
            self.discovered_nvme_devices = []

    def is_test_available(self, suite_id: str) -> tuple[bool, str]:
        """
        Check if a test is available to run

        Args:
            suite_id: Test suite identifier

        Returns:
            Tuple of (is_available, reason_if_not_available)
        """
        if suite_id not in self.test_suites:
            return False, f"Unknown test: {suite_id}"

        suite = self.test_suites[suite_id]

        # Check if NVMe devices required but not detected
        if suite.requires_nvme_devices and not self.nvme_devices_detected:
            return False, "NVMe devices must be detected first. Run NVMe Discovery test."

        # Check if fio is required but not available
        if suite.requires_fio:
            try:
                from .fio_utilities import FioUtilities
                fio_utils = FioUtilities()
                if not fio_utils.has_fio:
                    return False, "fio not available. Install fio for performance testing."
            except ImportError:
                return False, "fio utilities module not available."

        return True, ""

    def list_available_tests(self) -> List[Dict[str, Any]]:
        """
        List all available test suites with their requirements

        Returns:
            List of test suite information
        """
        tests = []
        for suite_id, suite in self.test_suites.items():
            is_available, reason = self.is_test_available(suite_id)

            tests.append({
                'id': suite_id,
                'name': suite.name,
                'description': suite.description,
                'requires_root': suite.requires_root,
                'requires_nvme_cli': suite.requires_nvme_cli,
                'requires_nvme_devices': suite.requires_nvme_devices,
                'requires_fio': suite.requires_fio,
                'available': is_available,
                'unavailable_reason': reason if not is_available else None
            })

        return tests

    def run_test_suite(self, suite_id: str, progress_callback=None, options=None) -> Dict[str, Any]:
        """
        Run a single test suite

        Args:
            suite_id: Test suite identifier
            progress_callback: Optional callback for progress updates
            options: Optional test-specific options

        Returns:
            Test results dictionary
        """
        if suite_id not in self.test_suites:
            return {
                'test_name': suite_id,
                'status': 'error',
                'errors': [f"Unknown test suite: {suite_id}"]
            }

        # Check if test is available
        is_available, reason = self.is_test_available(suite_id)
        if not is_available:
            return {
                'test_name': self.test_suites[suite_id].name,
                'status': 'error',
                'errors': [reason]
            }

        suite = self.test_suites[suite_id]
        logger.info(f"Running test suite: {suite.name}")

        # Log options if provided
        if options:
            logger.info(f"Test options: {options}")

        try:
            # Instantiate test class
            test_instance = suite.test_class()

            # Run test
            if progress_callback:
                progress_callback({
                    'suite': suite_id,
                    'status': 'running',
                    'message': f'Executing {suite.name}...'
                })

            # Pass discovered NVMe devices to tests that need them
            if suite.requires_nvme_devices and self.discovered_nvme_devices:
                if options is None:
                    options = {}
                options['discovered_devices'] = self.discovered_nvme_devices

            # Execute the appropriate test method
            if hasattr(test_instance, 'run_retrain_test'):
                # Link Retrain Count test
                result = test_instance.run_retrain_test(options or {})
            elif hasattr(test_instance, 'run_link_quality_test'):
                # Link Quality test
                result = test_instance.run_link_quality_test(options or {})
            elif hasattr(test_instance, 'run_sequential_read_test'):
                # Sequential Read Performance test
                result = test_instance.run_sequential_read_test(options or {})
            elif hasattr(test_instance, 'run_sequential_write_test'):
                # Sequential Write Performance test
                result = test_instance.run_sequential_write_test(options or {})
            elif hasattr(test_instance, 'run_random_iops_test'):
                # Random IOPS Performance test
                result = test_instance.run_random_iops_test(options or {})
            elif hasattr(test_instance, 'validate_namespace'):
                # Namespace Validation test
                result = test_instance.validate_namespace(options or {})
            elif hasattr(test_instance, 'validate_command_set'):
                # Command Set Validation test
                result = test_instance.validate_command_set(options or {})
            elif hasattr(test_instance, 'validate_identify_structures'):
                # Identify Structure Validation test
                result = test_instance.validate_identify_structures(options or {})
            elif hasattr(test_instance, 'run_measurement_test'):
                # For tests that support options (like link_training_time)
                result = test_instance.run_measurement_test(options=options)
            elif hasattr(test_instance, 'run_discovery_test'):
                # For discovery tests that don't use options
                result = test_instance.run_discovery_test()
            else:
                raise AttributeError(f"Test class has no recognized run method")

            # Update NVMe detection status if this was NVMe discovery
            if suite_id == 'nvme_discovery':
                self.update_nvme_detection_status(result)

            if progress_callback:
                progress_callback({
                    'suite': suite_id,
                    'status': 'completed',
                    'result': result
                })

            return result

        except Exception as e:
            logger.error(f"Error running test suite {suite_id}: {e}")
            return {
                'test_name': suite.name,
                'status': 'error',
                'errors': [f"Exception during test execution: {str(e)}"]
            }

    def run_all_tests(self, progress_callback=None, options=None) -> TestRunResult:
        """
        Run all available test suites

        Args:
            progress_callback: Optional callback for progress updates
            options: Optional test options (will be passed to all tests)

        Returns:
            TestRunResult with all test results
        """
        run_id = datetime.now().strftime('%Y%m%d_%H%M%S')
        start_time = datetime.now()

        logger.info(f"Starting test run {run_id}")
        if options:
            logger.info(f"Test options: {options}")

        run_result = TestRunResult(
            run_id=run_id,
            start_time=start_time
        )

        # Run tests in order: PCIe Discovery, NVMe Discovery, then conditional tests
        test_order = ['pcie_discovery', 'nvme_discovery', 'link_training_time', 'link_retrain_count', 'link_quality', 'nvme_namespace_validation', 'nvme_command_set_validation', 'nvme_identify_validation', 'sequential_read_performance', 'sequential_write_performance', 'random_iops_performance']

        for suite_id in test_order:
            if suite_id not in self.test_suites:
                continue

            # Check availability
            is_available, reason = self.is_test_available(suite_id)
            if not is_available:
                logger.info(f"Skipping {suite_id}: {reason}")
                continue

            # Run test
            result = self.run_test_suite(suite_id, progress_callback, options)
            run_result.results[suite_id] = result
            run_result.suites_run.append(suite_id)

        # Calculate summary
        run_result.end_time = datetime.now()
        run_result.total_duration_ms = int(
            (run_result.end_time - run_result.start_time).total_seconds() * 1000
        )

        # Count pass/fail/warning
        passed = sum(1 for r in run_result.results.values() if r.get('status') == 'pass')
        failed = sum(1 for r in run_result.results.values() if r.get('status') == 'fail')
        warnings = sum(1 for r in run_result.results.values() if r.get('status') == 'warning')
        errors = sum(1 for r in run_result.results.values() if r.get('status') == 'error')

        run_result.summary = {
            'total': len(run_result.suites_run),
            'passed': passed,
            'failed': failed,
            'warnings': warnings,
            'errors': errors
        }

        # Determine overall status
        if errors > 0 or failed > 0:
            run_result.overall_status = 'fail'
        elif warnings > 0:
            run_result.overall_status = 'warning'
        else:
            run_result.overall_status = 'pass'

        logger.info(f"Test run {run_id} completed: {run_result.overall_status}")

        return run_result


# Command-line test execution
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("=" * 80)
    print("CalypsoPy+ Test Runner")
    print("=" * 80)

    runner = TestRunner()

    # List available tests
    print("\nAvailable Tests:")
    for test in runner.list_available_tests():
        status = "✓ Available" if test['available'] else f"✗ Unavailable: {test['unavailable_reason']}"
        print(f"  {test['id']}: {test['name']} - {status}")

    # Run all tests
    print("\n" + "=" * 80)
    print("Running All Tests")
    print("=" * 80)

    def progress_update(update):
        status = update.get('status', 'unknown')
        message = update.get('message', '')
        print(f"[{status.upper()}] {message}")

    run_result = runner.run_all_tests(progress_callback=progress_update)

    print("\n" + "=" * 80)
    print("Test Run Complete")
    print("=" * 80)
    print(f"Overall Status: {run_result.overall_status.upper()}")
    print(f"Duration: {run_result.total_duration_ms}ms")
    print(f"Summary: {run_result.summary}")