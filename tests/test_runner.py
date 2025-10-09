#!/usr/bin/env python3
"""
CalypsoPy+ Test Runner
Orchestrates and executes PCIe/NVMe test suites
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
except ImportError:
    # Handle direct execution
    from pcie_discovery import PCIeDiscovery
    from nvme_discovery import NVMeDiscovery
    from link_training_time import LinkTrainingTimeMeasurement

logger = logging.getLogger(__name__)


@dataclass
class TestSuite:
    """Represents a test suite"""
    name: str
    description: str
    test_class: Any
    requires_root: bool = False
    requires_nvme_cli: bool = False
    requires_nvme_devices: bool = False  # New: requires NVMe devices to be detected first


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
        }

        # Track if NVMe devices have been detected
        self.nvme_devices_detected = False
        self.last_nvme_discovery_result = None

        logger.info(f"Test Runner initialized with {len(self.test_suites)} test suites")

    def update_nvme_detection_status(self, nvme_result: Dict[str, Any]):
        """
        Update whether NVMe devices have been detected
        Called after NVMe discovery test completes
        """
        if nvme_result and nvme_result.get('status') in ['pass', 'warning']:
            controllers = nvme_result.get('controllers', [])
            self.nvme_devices_detected = len(controllers) > 0
            self.last_nvme_discovery_result = nvme_result
            logger.info(f"NVMe detection status updated: {len(controllers)} devices found")
        else:
            self.nvme_devices_detected = False
            logger.info("NVMe detection status updated: no devices found")

    def is_test_available(self, suite_id: str) -> tuple[bool, Optional[str]]:
        """
        Check if a test is available to run
        Returns (is_available, reason_if_not)
        """
        if suite_id not in self.test_suites:
            return False, f"Unknown test suite: {suite_id}"

        suite = self.test_suites[suite_id]

        # Check if test requires NVMe devices
        if suite.requires_nvme_devices and not self.nvme_devices_detected:
            return False, "NVMe devices must be detected first. Run NVMe Discovery test."

        return True, None

    def list_available_tests(self) -> List[Dict[str, Any]]:
        """Get list of available test suites with their requirements"""
        tests = []
        for suite_id, suite in self.test_suites.items():
            is_available, unavailable_reason = self.is_test_available(suite_id)

            tests.append({
                'id': suite_id,
                'name': suite.name,
                'description': suite.description,
                'requires_root': suite.requires_root,
                'requires_nvme_cli': suite.requires_nvme_cli,
                'requires_nvme_devices': suite.requires_nvme_devices,
                'is_available': is_available,
                'unavailable_reason': unavailable_reason
            })
        return tests

    def run_test_suite(self, suite_id: str, progress_callback=None, options=None) -> Dict[str, Any]:
        """
        Run a single test suite

        Args:
            suite_id: ID of the test suite to run
            progress_callback: Optional callback function for progress updates
            options: Optional test configuration dictionary (for link training, etc.)

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

            # Execute the appropriate test method
            # Check which method the test class has and call accordingly
            if hasattr(test_instance, 'run_measurement_test'):
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
        test_order = ['pcie_discovery', 'nvme_discovery', 'link_training_time']

        for suite_id in test_order:
            if suite_id not in self.test_suites:
                continue

            # Check if test is available
            is_available, reason = self.is_test_available(suite_id)

            if not is_available:
                logger.info(f"Skipping {suite_id}: {reason}")
                # Add a skipped result
                run_result.results[suite_id] = {
                    'test_name': self.test_suites[suite_id].name,
                    'status': 'skipped',
                    'reason': reason,
                    'timestamp': datetime.now().isoformat()
                }
                continue

            logger.info(f"Running test suite: {suite_id}")

            try:
                # Pass options to test (will be used if supported)
                result = self.run_test_suite(suite_id, progress_callback, options=options)
                run_result.results[suite_id] = result
                run_result.suites_run.append(suite_id)

            except Exception as e:
                logger.error(f"Error running {suite_id}: {e}")
                run_result.results[suite_id] = {
                    'test_name': self.test_suites[suite_id].name,
                    'status': 'error',
                    'errors': [str(e)]
                }

        # Calculate overall results
        end_time = datetime.now()
        run_result.end_time = end_time
        run_result.total_duration_ms = int((end_time - start_time).total_seconds() * 1000)

        # Determine overall status
        statuses = [r.get('status', 'unknown') for r in run_result.results.values()]

        if 'error' in statuses or 'fail' in statuses:
            run_result.overall_status = 'fail'
        elif 'warning' in statuses:
            run_result.overall_status = 'warning'
        elif all(s in ['pass', 'skipped'] for s in statuses):
            run_result.overall_status = 'pass'
        else:
            run_result.overall_status = 'unknown'

        # Generate summary
        run_result.summary = {
            'total_tests': len(self.test_suites),
            'tests_run': len(run_result.suites_run),
            'passed': sum(1 for r in run_result.results.values() if r.get('status') == 'pass'),
            'warnings': sum(1 for r in run_result.results.values() if r.get('status') == 'warning'),
            'failed': sum(1 for r in run_result.results.values() if r.get('status') in ['fail', 'error']),
            'skipped': sum(1 for r in run_result.results.values() if r.get('status') == 'skipped')
        }

        logger.info(f"Test run {run_id} completed: {run_result.overall_status}")

        return run_result


if __name__ == '__main__':
    # Test the runner
    logging.basicConfig(level=logging.INFO)

    runner = TestRunner()

    print("\n" + "=" * 60)
    print("Available Tests:")
    print("=" * 60)
    for test in runner.list_available_tests():
        avail = "✓" if test['is_available'] else "✗"
        print(f"{avail} {test['name']}: {test['description']}")
        if not test['is_available']:
            print(f"  Reason: {test['unavailable_reason']}")

    print("\n" + "=" * 60)
    print("Running All Tests:")
    print("=" * 60)

    result = runner.run_all_tests()

    print(f"\nRun ID: {result.run_id}")
    print(f"Overall Status: {result.overall_status}")
    print(f"Duration: {result.total_duration_ms}ms")
    print(f"\nSummary:")
    for key, value in result.summary.items():
        print(f"  {key}: {value}")