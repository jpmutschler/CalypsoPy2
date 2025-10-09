/**
 * CalypsoPy+ Testing Dashboard
 * File: static/js/testing.js
 * 
 * PCIe/NVMe testing interface for Atlas 3 validation
 * Enhanced with popup results window and multi-format export
 */

class TestingDashboard {
    constructor() {
        this.currentTest = null;
        this.testResults = {};
        this.testHistory = [];
        this.isRunning = false;
        this.resultsWindow = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadAvailableTests();
        console.log('✅ Testing Dashboard initialized');
    }

    bindEvents() {
        // Test execution buttons
        const runPCIeBtn = document.getElementById('runPCIeDiscovery');
        const runNVMeBtn = document.getElementById('runNVMeDiscovery');
        const runAllBtn = document.getElementById('runAllTests');
        const exportTestsBtn = document.getElementById('exportTestResults');
        const clearTestHistoryBtn = document.getElementById('clearTestHistory');

        if (runPCIeBtn) {
            runPCIeBtn.addEventListener('click', () => this.runTest('pcie_discovery'));
        }

        if (runNVMeBtn) {
            runNVMeBtn.addEventListener('click', () => this.runTest('nvme_discovery'));
        }

        if (runAllBtn) {
            runAllBtn.addEventListener('click', () => this.runAllTests());
        }

        if (exportTestsBtn) {
            exportTestsBtn.addEventListener('click', () => this.showExportDialog());
        }

        if (clearTestHistoryBtn) {
            clearTestHistoryBtn.addEventListener('click', () => this.clearHistory());
        }
    }

    async loadAvailableTests() {
        try {
            const response = await fetch('/api/tests/available');
            if (response.ok) {
                const tests = await response.json();
                this.updateTestCards(tests);
            }
        } catch (error) {
            console.error('Failed to load available tests:', error);
        }
    }

    updateTestCards(tests) {
        // Update test requirement badges based on system capabilities
        tests.forEach(test => {
            const card = document.querySelector(`[data-test-id="${test.id}"]`);
            if (card) {
                if (test.requires_root && !test.has_permission) {
                    const badge = document.createElement('span');
                    badge.className = 'requirement-badge warning';
                    badge.textContent = 'Requires sudo';
                    card.querySelector('.test-card-header').appendChild(badge);
                }
                if (test.requires_nvme_cli && !test.has_nvme_cli) {
                    const badge = document.createElement('span');
                    badge.className = 'requirement-badge error';
                    badge.textContent = 'Requires nvme-cli';
                    card.querySelector('.test-card-header').appendChild(badge);
                }
            }
        });
    }

    async runTest(testId) {
        if (this.isRunning) {
            showNotification('Test already running', 'warning');
            return;
        }

        if (!currentPort) {
            showNotification('Please connect to Atlas 3 device first', 'error');
            return;
        }

        this.isRunning = true;
        this.currentTest = testId;
        this.updateTestStatus(testId, 'running');

        try {
            const response = await fetch('/api/tests/run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    test_id: testId,
                    port: currentPort
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.handleTestResult(testId, result);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error(`Test ${testId} failed:`, error);
            this.handleTestError(testId, error.message);
        } finally {
            this.isRunning = false;
            this.currentTest = null;
        }
    }

    async runAllTests() {
        if (this.isRunning) {
            showNotification('Tests already running', 'warning');
            return;
        }

        if (!currentPort) {
            showNotification('Please connect to Atlas 3 device first', 'error');
            return;
        }

        this.isRunning = true;
        this.updateAllTestsStatus('running');

        try {
            const response = await fetch('/api/tests/run_all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    port: currentPort
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.handleAllTestsResult(result);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('All tests failed:', error);
            showNotification('Test execution failed: ' + error.message, 'error');
        } finally {
            this.isRunning = false;
        }
    }

    updateTestStatus(testId, status) {
        const statusIndicator = document.getElementById(`${testId}Status`);
        const runButton = document.querySelector(`[data-test-id="${testId}"] .btn-test-run`);

        if (statusIndicator) {
            statusIndicator.className = `test-status ${status}`;
            statusIndicator.textContent = this.getStatusText(status);
        }

        if (runButton) {
            runButton.disabled = (status === 'running');
            if (status === 'running') {
                runButton.innerHTML = '<span class="loading"></span> Running...';
            } else {
                runButton.innerHTML = '<span>▶️</span> Run Test';
            }
        }
    }

    updateAllTestsStatus(status) {
        const allBtn = document.getElementById('runAllTests');
        if (allBtn) {
            allBtn.disabled = (status === 'running');
            if (status === 'running') {
                allBtn.innerHTML = '<span class="loading"></span> Running All Tests...';
            } else {
                allBtn.innerHTML = '<span>▶️</span> Run All Tests';
            }
        }
    }

    getStatusText(status) {
        const statusMap = {
            'running': '⏳ Running',
            'pass': '✅ Passed',
            'fail': '❌ Failed',
            'warning': '⚠️ Warning',
            'error': '🔥 Error',
            'idle': '⏸️ Idle'
        };
        return statusMap[status] || '❓ Unknown';
    }

    handleTestResult(testId, result) {
        this.testResults[testId] = result;
        this.testHistory.push({
            timestamp: new Date().toISOString(),
            test_id: testId,
            result: result
        });

        this.updateTestStatus(testId, result.status);
        this.displayTestResults(testId, result);

        // Generate topology visualization for PCIe Discovery
        if (testId === 'pcie_discovery' && result.topology && window.topologyVisualizer) {
            topologyVisualizer.generate(result.topology, 'topologyVisualization');
        }

        // Open results in new window
        this.openResultsWindow(testId, result);

        const statusText = this.getStatusText(result.status);
        showNotification(`${result.test_name}: ${statusText}`,
                        result.status === 'pass' ? 'success' :
                        result.status === 'warning' ? 'warning' : 'error');
    }

    handleTestError(testId, errorMessage) {
        const result = {
            test_name: testId,
            status: 'error',
            errors: [errorMessage],
            warnings: [],
            duration_ms: 0
        };

        this.testResults[testId] = result;
        this.updateTestStatus(testId, 'error');
        this.displayTestResults(testId, result);
        showNotification(`Test failed: ${errorMessage}`, 'error');
    }

    handleAllTestsResult(runResult) {
        Object.entries(runResult.results).forEach(([testId, result]) => {
            this.handleTestResult(testId, result);
        });

        this.updateAllTestsStatus('idle');
        this.displayOverallResults(runResult);

        showNotification(
            `All tests complete: ${runResult.overall_status.toUpperCase()}`,
            runResult.overall_status === 'pass' ? 'success' :
            runResult.overall_status === 'warning' ? 'warning' : 'error'
        );
    }

    openResultsWindow(testId, result) {
        // Create or reuse results window
        const windowName = 'CalypsoPyTestResults';
        const windowFeatures = 'width=1000,height=800,scrollbars=yes,resizable=yes';

        this.resultsWindow = window.open('', windowName, windowFeatures);

        if (this.resultsWindow) {
            this.resultsWindow.document.write(this.generateResultsHTML(testId, result));
            this.resultsWindow.document.close();
            this.resultsWindow.focus();
        }
    }

    generateResultsHTML(testId, result) {
        const timestamp = new Date().toLocaleString();

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CalypsoPy+ Test Results - ${result.test_name}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f5f5f5;
            padding: 20px;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #790000 0%, #a10000 100%);
            color: white;
            padding: 30px;
        }
        
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        
        .header .meta {
            font-size: 14px;
            opacity: 0.9;
        }
        
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 14px;
            margin-top: 15px;
        }
        
        .status-badge.pass {
            background: #22c55e;
            color: white;
        }
        
        .status-badge.warning {
            background: #f59e0b;
            color: white;
        }
        
        .status-badge.fail, .status-badge.error {
            background: #ef4444;
            color: white;
        }
        
        .content {
            padding: 30px;
        }
        
        .section {
            margin-bottom: 30px;
        }
        
        .section h2 {
            font-size: 20px;
            color: #790000;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e5e5e5;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .summary-item {
            background: #f9f9f9;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #790000;
        }
        
        .summary-item .label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
        }
        
        .summary-item .value {
            font-size: 20px;
            font-weight: 700;
            color: #333;
        }
        
        .topology-tree, .controllers-list {
            background: #f9f9f9;
            padding: 20px;
            border-radius: 8px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 13px;
        }
        
        .topology-tree .device {
            margin: 8px 0;
            padding: 8px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #790000;
        }
        
        .controller-card {
            background: white;
            border: 2px solid #e5e5e5;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }
        
        .controller-card .controller-name {
            font-size: 16px;
            font-weight: 700;
            color: #790000;
            margin-bottom: 10px;
        }
        
        .controller-card .detail {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .controller-card .detail:last-child {
            border-bottom: none;
        }
        
        .warnings, .errors {
            background: rgba(251, 191, 36, 0.1);
            border-left: 4px solid #f59e0b;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
        }
        
        .errors {
            background: rgba(239, 68, 68, 0.1);
            border-left-color: #ef4444;
        }
        
        .warnings h3, .errors h3 {
            font-size: 16px;
            margin-bottom: 10px;
            color: #f59e0b;
        }
        
        .errors h3 {
            color: #ef4444;
        }
        
        .warnings ul, .errors ul {
            list-style: none;
            padding-left: 0;
        }
        
        .warnings li, .errors li {
            padding: 5px 0;
        }
        
        .warnings li:before {
            content: "⚠️ ";
            margin-right: 8px;
        }
        
        .errors li:before {
            content: "❌ ";
            margin-right: 8px;
        }
        
        .export-buttons {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s ease;
        }
        
        .btn-primary {
            background: #790000;
            color: white;
        }
        
        .btn-primary:hover {
            background: #a10000;
        }
        
        .btn-secondary {
            background: white;
            color: #790000;
            border: 2px solid #790000;
        }
        
        .btn-secondary:hover {
            background: #790000;
            color: white;
        }
        
        @media print {
            .export-buttons {
                display: none;
            }
            body {
                background: white;
                padding: 0;
            }
            .container {
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="export-buttons">
        <button class="btn btn-secondary" onclick="window.print()">🖨️ Print/PDF</button>
        <button class="btn btn-primary" onclick="exportToCSV()">📊 Export CSV</button>
    </div>

    <div class="container">
        <div class="header">
            <h1>CalypsoPy+ Test Results</h1>
            <div class="meta">
                <strong>${result.test_name}</strong> | 
                Generated: ${timestamp} | 
                Duration: ${result.duration_ms}ms |
                Port: ${currentPort || 'Unknown'}
            </div>
            <div class="status-badge ${result.status}">${result.status.toUpperCase()}</div>
        </div>

        <div class="content">
            ${this.generateResultsSections(result)}
        </div>
    </div>

    <script>
        function exportToCSV() {
            ${this.generateCSVExportScript(result)}
        }
    </script>
</body>
</html>
        `;
    }

    generateResultsSections(result) {
        let html = '';

        // Summary Section
        if (result.summary && Object.keys(result.summary).length > 0) {
            html += '<div class="section">';
            html += '<h2>Summary</h2>';
            html += '<div class="summary-grid">';
            for (const [key, value] of Object.entries(result.summary)) {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                html += `
                    <div class="summary-item">
                        <div class="label">${label}</div>
                        <div class="value">${value}</div>
                    </div>
                `;
            }
            html += '</div>';
            html += '</div>';
        }

        // Topology Section (PCIe Discovery)
        if (result.topology) {
            html += '<div class="section">';
            html += '<h2>PCIe Topology</h2>';
            html += '<div class="topology-tree">';

            if (result.topology.root_bridge) {
                const rb = result.topology.root_bridge;
                html += '<div class="device">';
                html += `<strong>Root Bridge:</strong> ${rb.bdf}<br>`;
                if (rb.link_speed) html += `Speed: ${rb.link_speed} `;
                if (rb.link_width) html += `Width: ${rb.link_width}<br>`;
                if (rb.driver) html += `Driver: ${rb.driver}`;
                html += '</div>';
            }

            if (result.topology.downstream_ports && result.topology.downstream_ports.length > 0) {
                html += `<br><strong>Downstream Ports (${result.topology.downstream_ports.length}):</strong><br>`;
                result.topology.downstream_ports.forEach(port => {
                    html += '<div class="device">';
                    html += `${port.bdf}`;
                    if (port.link_speed) html += ` - ${port.link_speed}`;
                    if (port.link_width) html += ` ${port.link_width}`;
                    html += '</div>';
                });
            }

            if (result.topology.nvme_devices && result.topology.nvme_devices.length > 0) {
                html += `<br><strong>NVMe Devices (${result.topology.nvme_devices.length}):</strong><br>`;
                result.topology.nvme_devices.forEach(dev => {
                    html += '<div class="device">';
                    html += `${dev.bdf} - ${dev.name}`;
                    if (dev.driver) html += ` (${dev.driver})`;
                    html += '</div>';
                });
            }

            html += '</div>';
            html += '</div>';
        }

        // Controllers Section (NVMe Discovery)
        if (result.controllers && result.controllers.length > 0) {
            html += '<div class="section">';
            html += '<h2>NVMe Controllers</h2>';
            html += '<div class="controllers-list">';

            result.controllers.forEach(ctrl => {
                html += '<div class="controller-card">';
                html += `<div class="controller-name">${ctrl.device}</div>`;
                html += `<div class="detail"><span>Model:</span><span>${ctrl.model}</span></div>`;
                html += `<div class="detail"><span>Serial:</span><span>${ctrl.serial}</span></div>`;
                html += `<div class="detail"><span>Firmware:</span><span>${ctrl.firmware}</span></div>`;
                html += `<div class="detail"><span>PCI Address:</span><span>${ctrl.pci_address}</span></div>`;
                html += `<div class="detail"><span>Capacity:</span><span>${ctrl.total_capacity_gb.toFixed(2)} GB</span></div>`;
                html += `<div class="detail"><span>Namespaces:</span><span>${ctrl.namespace_count}</span></div>`;

                if (ctrl.temperature_c !== undefined) {
                    const tempStyle = ctrl.temperature_c > 70 ? 'color: #ef4444; font-weight: 700;' : '';
                    html += `<div class="detail"><span>Temperature:</span><span style="${tempStyle}">${ctrl.temperature_c}°C</span></div>`;
                }

                if (ctrl.percentage_used !== undefined) {
                    html += `<div class="detail"><span>Used:</span><span>${ctrl.percentage_used}%</span></div>`;
                }

                if (ctrl.available_spare_pct !== undefined) {
                    html += `<div class="detail"><span>Spare:</span><span>${ctrl.available_spare_pct}%</span></div>`;
                }

                html += '</div>';
            });

            html += '</div>';
            html += '</div>';
        }

        // Atlas 3 Buses (if present)
        if (result.atlas3_buses && result.atlas3_buses.length > 0) {
            html += '<div class="section">';
            html += '<h2>Atlas 3 Bus Configuration</h2>';
            html += '<div class="topology-tree">';
            html += `<div class="device">Downstream Buses: ${result.atlas3_buses.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}</div>`;
            html += '</div>';
            html += '</div>';
        }

        // Warnings
        if (result.warnings && result.warnings.length > 0) {
            html += '<div class="section">';
            html += '<div class="warnings">';
            html += '<h3>Warnings</h3>';
            html += '<ul>';
            result.warnings.forEach(warn => {
                html += `<li>${warn}</li>`;
            });
            html += '</ul>';
            html += '</div>';
            html += '</div>';
        }

        // Errors
        if (result.errors && result.errors.length > 0) {
            html += '<div class="section">';
            html += '<div class="errors">';
            html += '<h3>Errors</h3>';
            html += '<ul>';
            result.errors.forEach(err => {
                html += `<li>${err}</li>`;
            });
            html += '</ul>';
            html += '</div>';
            html += '</div>';
        }

        return html;
    }

    generateCSVExportScript(result) {
        return `
            const csvData = [];
            csvData.push(['CalypsoPy+ Test Results']);
            csvData.push(['Test Name', '${result.test_name}']);
            csvData.push(['Status', '${result.status}']);
            csvData.push(['Duration (ms)', '${result.duration_ms}']);
            csvData.push(['Timestamp', '${result.timestamp}']);
            csvData.push([]);

            // Summary
            if (${JSON.stringify(result.summary)}) {
                csvData.push(['Summary']);
                const summary = ${JSON.stringify(result.summary)};
                for (const [key, value] of Object.entries(summary)) {
                    csvData.push([key, value]);
                }
                csvData.push([]);
            }

            // Controllers
            if (${JSON.stringify(result.controllers)}) {
                csvData.push(['NVMe Controllers']);
                csvData.push(['Device', 'Model', 'Serial', 'Firmware', 'PCI Address', 'Capacity (GB)', 'Temp (C)', 'Used (%)', 'Spare (%)']);
                const controllers = ${JSON.stringify(result.controllers)};
                controllers.forEach(ctrl => {
                    csvData.push([
                        ctrl.device,
                        ctrl.model,
                        ctrl.serial,
                        ctrl.firmware,
                        ctrl.pci_address,
                        ctrl.total_capacity_gb.toFixed(2),
                        ctrl.temperature_c || 'N/A',
                        ctrl.percentage_used || 'N/A',
                        ctrl.available_spare_pct || 'N/A'
                    ]);
                });
                csvData.push([]);
            }

            // Create CSV content
            const csvContent = csvData.map(row => row.join(',')).join('\\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'CalypsoPy_TestResults_' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.csv';
            link.click();
        `;
    }

    displayTestResults(testId, result) {
        const resultsContainer = document.getElementById(`${testId}Results`);
        if (!resultsContainer) return;

        let html = '<div class="test-result-panel">';
        html += `<div class="test-result-inline">`;
        html += `<strong>${result.test_name}</strong> - ${result.status.toUpperCase()} (${result.duration_ms}ms)`;
        html += `<button class="btn btn-sm" onclick="testingDashboard.openResultsWindow('${testId}', testingDashboard.testResults['${testId}'])">🔍 View Details</button>`;
        html += `</div>`;
        html += '</div>';

        resultsContainer.innerHTML = html;
    }

    displayOverallResults(runResult) {
        const overallContainer = document.getElementById('overallTestResults');
        if (!overallContainer) return;

        let html = '<div class="overall-results">';
        html += `<h3>Test Run: ${runResult.run_id}</h3>`;
        html += `<div class="overall-status ${runResult.overall_status}">${runResult.overall_status.toUpperCase()}</div>`;
        html += `<div class="overall-duration">Total Duration: ${runResult.total_duration_ms}ms</div>`;

        html += '<div class="overall-summary">';
        html += `<span class="summary-stat">Total: ${runResult.summary.total_tests}</span>`;
        html += `<span class="summary-stat pass">Passed: ${runResult.summary.passed}</span>`;
        html += `<span class="summary-stat fail">Failed: ${runResult.summary.failed}</span>`;
        html += `<span class="summary-stat warning">Warnings: ${runResult.summary.warnings}</span>`;
        html += '</div>';

        html += '</div>';
        overallContainer.innerHTML = html;
    }

    showExportDialog() {
        if (Object.keys(this.testResults).length === 0) {
            showNotification('No test results to export', 'warning');
            return;
        }

        // Simple export - open results window for latest test
        const latestTestId = Object.keys(this.testResults)[Object.keys(this.testResults).length - 1];
        const latestResult = this.testResults[latestTestId];
        this.openResultsWindow(latestTestId, latestResult);

        showNotification('Results opened in new window. Use Print/PDF or Export CSV buttons.', 'info');
    }

    clearHistory() {
        if (confirm('Clear all test history? This cannot be undone.')) {
            this.testHistory = [];
            this.testResults = {};

            // Clear all result displays
            document.querySelectorAll('[id$="Results"]').forEach(container => {
                container.innerHTML = '<p class="no-results">No test results yet. Run a test to see results here.</p>';
            });

            // Reset status indicators
            document.querySelectorAll('.test-status').forEach(status => {
                status.className = 'test-status idle';
                status.textContent = '⏸️ Idle';
            });

            const overallContainer = document.getElementById('overallTestResults');
            if (overallContainer) {
                overallContainer.innerHTML = '<p class="no-results">No test runs completed yet.</p>';
            }

            showNotification('Test history cleared', 'info');
        }
    }
}

// Global instance
let testingDashboard = null;

// Initialize when dashboard is activated
function initializeTestingDashboard() {
    if (!testingDashboard) {
        testingDashboard = new TestingDashboard();
        console.log('Testing Dashboard instance created');
    }
    return testingDashboard;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (document.getElementById('testing-dashboard')) {
            initializeTestingDashboard();
        }
    });
} else {
    if (document.getElementById('testing-dashboard')) {
        initializeTestingDashboard();
    }
}

// Export to global scope
if (typeof window !== 'undefined') {
    window.TestingDashboard = TestingDashboard;
    window.testingDashboard = testingDashboard;
    window.initializeTestingDashboard = initializeTestingDashboard;
}

console.log('✅ Testing Dashboard JavaScript loaded successfully');