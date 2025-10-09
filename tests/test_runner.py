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
except ImportError:
    # Handle direct execution
    from pcie_discovery import PCIeDiscovery
    from nvme_discovery import NVMeDiscovery

logger = logging.getLogger(__name__)


@dataclass
class TestSuite:
    """Represents a test suite"""
    name: str
    description: str
    test_class: Any
    requires_root: bool = False
    requires_nvme_cli: bool = False


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
                requires_nvme_cli=False
            ),
            'nvme_discovery': TestSuite(
                name='NVMe Discovery',
                description='Discover and enumerate NVMe devices',
                test_class=NVMeDiscovery,
                requires_root=False,
                requires_nvme_cli=True
            ),
        }

        logger.info(f"Test Runner initialized with {len(self.test_suites)} test suites")

    def list_available_tests(self) -> List[Dict[str, Any]]:
        """Get list of available test suites with their requirements"""
        tests = []
        for suite_id, suite in self.test_suites.items():
            tests.append({
                'id': suite_id,
                'name': suite.name,
                'description': suite.description,
                'requires_root': suite.requires_root,
                'requires_nvme_cli': suite.requires_nvme_cli
            })
        return tests

    def run_test_suite(self, suite_id: str, progress_callback=None) -> Dict[str, Any]:
        """
        Run a single test suite

        Args:
            suite_id: ID of the test suite to run
            progress_callback: Optional callback function for progress updates

        Returns:
            Test results dictionary
        """
        if suite_id not in self.test_suites:
            return {
                'test_name': suite_id,
                'status': 'error',
                'errors': [f"Unknown test suite: {suite_id}"]
            }

        suite = self.test_suites[suite_id]
        logger.info(f"Running test suite: {suite.name}")

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

            result = test_instance.run_discovery_test()

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

    def run_all_tests(self, progress_callback=None) -> TestRunResult:
        """
        Run all available test suites

        Args:
            progress_callback: Optional callback for progress updates

        Returns:
            TestRunResult with all test results
        """
        run_id = datetime.now().strftime('%Y%m%d_%H%M%S')
        start_time = datetime.now()

        run_result = TestRunResult(
            run_id=run_id,
            start_time=start_time
        )

        logger.info(f"Starting test run {run_id}")

        # Run each test suite
        for suite_id in self.test_suites.keys():
            result = self.run_test_suite(suite_id, progress_callback)
            run_result.results[suite_id] = result
            run_result.suites_run.append(suite_id)

        # Calculate overall results
        run_result.end_time = datetime.now()
        run_result.total_duration_ms = int(
            (run_result.end_time - run_result.start_time).total_seconds() * 1000
        )

        # Determine overall status
        statuses = [r.get('status', 'unknown') for r in run_result.results.values()]
        if 'error' in statuses or 'fail' in statuses:
            run_result.overall_status = 'fail'
        elif 'warning' in statuses:
            run_result.overall_status = 'warning'
        elif all(s == 'pass' for s in statuses):
            run_result.overall_status = 'pass'
        else:
            run_result.overall_status = 'unknown'

        # Build summary
        run_result.summary = self._build_summary(run_result)

        logger.info(f"Test run {run_id} completed with status: {run_result.overall_status}")

        return run_result

    def _build_summary(self, run_result: TestRunResult) -> Dict[str, Any]:
        """Build summary statistics from test run"""
        summary = {
            'total_tests': len(run_result.suites_run),
            'passed': 0,
            'failed': 0,
            'warnings': 0,
            'errors': 0,
            'skipped': 0
        }

        for result in run_result.results.values():
            status = result.get('status', 'unknown')
            if status == 'pass':
                summary['passed'] += 1
            elif status == 'fail':
                summary['failed'] += 1
            elif status == 'warning':
                summary['warnings'] += 1
            elif status == 'error':
                summary['errors'] += 1
            elif status == 'skipped':
                summary['skipped'] += 1

        return summary

    def export_results(self, run_result: TestRunResult, format: str = 'json') -> str:
        """
        Export test results to string format

        Args:
            run_result: Test run results
            format: Export format ('json' or 'text')

        Returns:
            Formatted string
        """
        if format == 'json':
            return self._export_json(run_result)
        elif format == 'text':
            return self._export_text(run_result)
        else:
            raise ValueError(f"Unknown export format: {format}")

    def _export_json(self, run_result: TestRunResult) -> str:
        """Export results as JSON"""
        export_data = {
            'run_id': run_result.run_id,
            'start_time': run_result.start_time.isoformat(),
            'end_time': run_result.end_time.isoformat() if run_result.end_time else None,
            'total_duration_ms': run_result.total_duration_ms,
            'overall_status': run_result.overall_status,
            'summary': run_result.summary,
            'results': run_result.results
        }
        return json.dumps(export_data, indent=2)

    def _export_text(self, run_result: TestRunResult) -> str:
        """Export results as text report"""
        lines = []
        lines.append('=' * 80)
        lines.append('CalypsoPy+ PCIe/NVMe Test Report')
        lines.append('=' * 80)
        lines.append(f"Run ID: {run_result.run_id}")
        lines.append(f"Start Time: {run_result.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"Duration: {run_result.total_duration_ms}ms")
        lines.append(f"Overall Status: {run_result.overall_status.upper()}")
        lines.append('')
        lines.append('Summary:')
        lines.append(f"  Total Tests: {run_result.summary['total_tests']}")
        lines.append(f"  Passed: {run_result.summary['passed']}")
        lines.append(f"  Failed: {run_result.summary['failed']}")
        lines.append(f"  Warnings: {run_result.summary['warnings']}")
        lines.append(f"  Errors: {run_result.summary['errors']}")
        lines.append('')
        lines.append('=' * 80)
        lines.append('Test Results:')
        lines.append('=' * 80)

        for suite_id, result in run_result.results.items():
            lines.append('')
            lines.append(f"Test: {result.get('test_name', suite_id)}")
            lines.append(f"Status: {result.get('status', 'unknown').upper()}")
            lines.append(f"Duration: {result.get('duration_ms', 0)}ms")

            if 'summary' in result:
                lines.append('Summary:')
                for key, value in result['summary'].items():
                    lines.append(f"  {key}: {value}")

            if result.get('warnings'):
                lines.append('Warnings:')
                for warn in result['warnings']:
                    lines.append(f"  - {warn}")

            if result.get('errors'):
                lines.append('Errors:')
                for err in result['errors']:
                    lines.append(f"  - {err}")

            lines.append('-' * 80)

        lines.append('')
        lines.append('=' * 80)
        lines.append('End of Report')
        lines.append('=' * 80)

        return '\n'.join(lines)


if __name__ == '__main__':
    # Test the runner
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    runner = TestRunner()

    print("\nAvailable Test Suites:")
    for test in runner.list_available_tests():
        print(f"  - {test['name']}: {test['description']}")

    print("\nRunning all tests...\n")


    def progress_update(update):
        if update['status'] == 'running':
            print(f"  Running: {update['message']}")
        elif update['status'] == 'completed':
            result = update['result']
            print(f"  Completed: {result['test_name']} - {result['status'].upper()}")


    results = runner.run_all_tests(progress_callback=progress_update)

    print("\n" + "=" * 60)
    print("Test Run Complete")
    print("=" * 60)
    print(f"Overall Status: {results.overall_status.upper()}")
    print(f"Total Duration: {results.total_duration_ms}ms")
    print("\nExporting report...")

    report = runner.export_results(results, format='text')
    print(report)