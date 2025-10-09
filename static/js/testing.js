/**
 * CalypsoPy+ Testing Dashboard - Enhanced Version
 * File: static/js/testing.js
 *
 * Features:
 * - Collapsible test tiles
 * - Separate results window
 * - Export and print functionality
 */

class TestingDashboard {
    constructor() {
        this.currentTest = null;
        this.testResults = {};
        this.testHistory = [];
        this.isRunning = false;
        this.resultsWindowElement = null;
        this.collapsedStates = {}; // Track which tests are collapsed
        this.init();
    }

    init() {
        this.createResultsWindow();
        this.bindEvents();
        this.loadAvailableTests();
        this.initializeCollapsibleStates();
        console.log('✅ Testing Dashboard initialized');
    }

    initializeCollapsibleStates() {
        // Initialize all test cards as expanded by default
        const testCards = document.querySelectorAll('.test-card');
        testCards.forEach(card => {
            const testId = card.getAttribute('data-test-id');
            if (testId) {
                this.collapsedStates[testId] = false;
                this.addCollapseToggle(card, testId);
            }
        });
    }

    addCollapseToggle(card, testId) {
        const header = card.querySelector('.test-card-header');
        if (!header) return;

        // Add collapse toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'test-collapse-toggle';
        toggleBtn.innerHTML = '▼';
        toggleBtn.title = 'Collapse/Expand';
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleTestCard(testId);
        };

        // Make the entire header clickable for collapse/expand
        header.style.cursor = 'pointer';
        header.onclick = (e) => {
            // Don't toggle if clicking on buttons
            if (e.target.closest('button') && !e.target.closest('.test-collapse-toggle')) {
                return;
            }
            this.toggleTestCard(testId);
        };

        // Insert toggle button at the end of header
        const headerLeft = header.querySelector('.card-title') || header.firstElementChild;
        if (headerLeft) {
            headerLeft.parentNode.insertBefore(toggleBtn, headerLeft.nextSibling);
        }

        // Add short description for collapsed state
        const description = card.querySelector('.test-description');
        if (description && headerLeft) {
            const shortDesc = document.createElement('span');
            shortDesc.className = 'test-short-description';
            shortDesc.textContent = description.textContent.substring(0, 80) + '...';
            headerLeft.appendChild(shortDesc);
        }

        // Add compact run button to header for collapsed state
        const runButton = card.querySelector('.btn-test-run');
        if (runButton && header) {
            const compactRunBtn = document.createElement('button');
            compactRunBtn.className = 'btn btn-primary btn-test-run-compact test-run-btn-collapsed';
            compactRunBtn.innerHTML = '<span>▶️</span> Run';
            compactRunBtn.onclick = (e) => {
                e.stopPropagation();
                this.runTest(testId);
            };
            header.appendChild(compactRunBtn);
        }
    }

    toggleTestCard(testId) {
        const card = document.querySelector(`[data-test-id="${testId}"]`);
        if (!card) return;

        this.collapsedStates[testId] = !this.collapsedStates[testId];

        if (this.collapsedStates[testId]) {
            card.classList.add('collapsed');
        } else {
            card.classList.remove('collapsed');
        }

        console.log(`Test card ${testId} ${this.collapsedStates[testId] ? 'collapsed' : 'expanded'}`);
    }

    createResultsWindow() {
        // Create modal window for test results
        const modalHTML = `
            <div id="testResultsWindow" class="test-results-window">
                <div class="results-window-content">
                    <div class="results-window-header">
                        <div class="results-window-title">
                            <div class="results-window-icon">📊</div>
                            <div class="results-window-title-text">
                                <h2 id="resultsWindowTestName">Test Results</h2>
                                <p id="resultsWindowTestTime">-</p>
                            </div>
                        </div>
                        <div class="results-window-actions">
                            <button class="btn-export-results" onclick="testingDashboard.exportResultsAsJSON()">
                                <span>💾</span> Export JSON
                            </button>
                            <button class="btn-print-results" onclick="testingDashboard.printResults()">
                                <span>🖨️</span> Print
                            </button>
                            <button class="btn-close-results" onclick="testingDashboard.closeResultsWindow()">
                                <span>✕</span> Close
                            </button>
                        </div>
                    </div>
                    <div class="results-window-body" id="resultsWindowBody">
                        <!-- Results content will be inserted here -->
                    </div>
                </div>
            </div>
        `;

        // Insert at end of body
        const div = document.createElement('div');
        div.innerHTML = modalHTML;
        document.body.appendChild(div.firstElementChild);

        this.resultsWindowElement = document.getElementById('testResultsWindow');

        // Close on background click
        this.resultsWindowElement.addEventListener('click', (e) => {
            if (e.target === this.resultsWindowElement) {
                this.closeResultsWindow();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.resultsWindowElement.classList.contains('active')) {
                this.closeResultsWindow();
            }
        });
    }

    bindEvents() {
        // Test execution buttons
        const runAllBtn = document.getElementById('runAllTests');
        const exportTestsBtn = document.getElementById('exportTestResults');
        const clearTestHistoryBtn = document.getElementById('clearTestHistory');

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
        const runButtons = document.querySelectorAll(`[data-test-id="${testId}"] .btn-test-run, [data-test-id="${testId}"] .btn-test-run-compact`);

        if (statusIndicator) {
            statusIndicator.className = `test-status ${status}`;
            statusIndicator.textContent = this.getStatusText(status);
        }

        runButtons.forEach(btn => {
            if (btn) {
                btn.disabled = (status === 'running');
                if (status === 'running') {
                    btn.innerHTML = '<span class="loading"></span> Running...';
                } else {
                    btn.innerHTML = btn.classList.contains('btn-test-run-compact') ?
                        '<span>▶️</span> Run' : '<span>▶️</span> Run Test';
                }
            }
        });
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

        // Open results in new window instead of inline display
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
        this.openResultsWindow(testId, result);
        showNotification(`Test failed: ${errorMessage}`, 'error');
    }

    handleAllTestsResult(runResult) {
        Object.entries(runResult.results).forEach(([testId, result]) => {
            this.handleTestResult(testId, result);
        });

        this.updateAllTestsStatus('idle');

        // Show summary in results window
        this.openAllTestsResultsWindow(runResult);

        showNotification(
            `All tests complete: ${runResult.overall_status.toUpperCase()}`,
            runResult.overall_status === 'pass' ? 'success' :
            runResult.overall_status === 'warning' ? 'warning' : 'error'
        );
    }

    openResultsWindow(testId, result) {
        if (!this.resultsWindowElement) return;

        // Set window title
        document.getElementById('resultsWindowTestName').textContent = result.test_name || testId;
        document.getElementById('resultsWindowTestTime').textContent =
            `Duration: ${result.duration_ms}ms | Status: ${result.status.toUpperCase()}`;

        // Generate results HTML
        const resultsBody = document.getElementById('resultsWindowBody');
        resultsBody.innerHTML = this.generateResultsHTML(testId, result);

        // Show window
        this.resultsWindowElement.classList.add('active');

        // Generate topology visualization if PCIe test
        if (testId === 'pcie_discovery' && result.topology && window.topologyVisualizer) {
            setTimeout(() => {
                const topoContainer = document.getElementById('resultsTopologyVisualization');
                if (topoContainer) {
                    topologyVisualizer.generate(result.topology, 'resultsTopologyVisualization');
                }
            }, 100);
        }
    }

    openAllTestsResultsWindow(runResult) {
        if (!this.resultsWindowElement) return;

        document.getElementById('resultsWindowTestName').textContent = 'All Tests Summary';
        document.getElementById('resultsWindowTestTime').textContent =
            `Total Duration: ${runResult.total_duration_ms}ms | Overall: ${runResult.overall_status.toUpperCase()}`;

        const resultsBody = document.getElementById('resultsWindowBody');
        resultsBody.innerHTML = this.generateAllTestsResultsHTML(runResult);

        this.resultsWindowElement.classList.add('active');
    }

    generateResultsHTML(testId, result) {
        let html = '<div class="test-results-content">';

        // Summary header
        html += '<div class="results-summary-header">';
        html += '<div class="results-summary-status">';
        html += `<div class="results-status-badge ${result.status}">${result.status.toUpperCase()}</div>`;
        html += '</div>';
        html += '<div class="results-summary-stats">';
        html += `<div class="results-stat-item">`;
        html += `<span class="results-stat-value">${result.duration_ms}</span>`;
        html += `<span class="results-stat-label">Duration (ms)</span>`;
        html += `</div>`;
        if (result.warnings) {
            html += `<div class="results-stat-item">`;
            html += `<span class="results-stat-value">${result.warnings.length}</span>`;
            html += `<span class="results-stat-label">Warnings</span>`;
            html += `</div>`;
        }
        if (result.errors) {
            html += `<div class="results-stat-item">`;
            html += `<span class="results-stat-value">${result.errors.length}</span>`;
            html += `<span class="results-stat-label">Errors</span>`;
            html += `</div>`;
        }
        html += '</div>'; // results-summary-stats
        html += '</div>'; // results-summary-header

        // Test-specific content
        if (testId === 'pcie_discovery') {
            html += this.generatePCIeResultsHTML(result);
        } else if (testId === 'nvme_discovery') {
            html += this.generateNVMeResultsHTML(result);
        } else {
            html += this.generateGenericResultsHTML(result);
        }

        // Warnings section
        if (result.warnings && result.warnings.length > 0) {
            html += '<div class="results-section">';
            html += '<h3>⚠️ Warnings</h3>';
            html += '<ul class="results-warnings-list">';
            result.warnings.forEach(warning => {
                html += `<li>${warning}</li>`;
            });
            html += '</ul>';
            html += '</div>';
        }

        // Errors section
        if (result.errors && result.errors.length > 0) {
            html += '<div class="results-section">';
            html += '<h3>❌ Errors</h3>';
            html += '<ul class="results-errors-list">';
            result.errors.forEach(error => {
                html += `<li>${error}</li>`;
            });
            html += '</ul>';
            html += '</div>';
        }

        html += '</div>'; // test-results-content
        return html;
    }

    generatePCIeResultsHTML(result) {
        let html = '';

        if (result.topology) {
            const topo = result.topology;

            // Root Bridge section
            if (topo.root_bridge) {
                html += '<div class="results-section">';
                html += '<h3>🔌 Root Bridge</h3>';
                html += '<div class="results-detail-grid">';
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Device</div>`;
                html += `<div class="results-detail-value">${topo.root_bridge.bdf || 'N/A'}</div>`;
                html += `</div>`;
                if (topo.root_bridge.link_speed) {
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">Link Speed</div>`;
                    html += `<div class="results-detail-value">${topo.root_bridge.link_speed}</div>`;
                    html += `</div>`;
                }
                if (topo.root_bridge.link_width) {
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">Link Width</div>`;
                    html += `<div class="results-detail-value">${topo.root_bridge.link_width}</div>`;
                    html += `</div>`;
                }
                html += '</div>';
                html += '</div>';
            }

            // Downstream Ports section
            if (topo.downstream_ports && topo.downstream_ports.length > 0) {
                html += '<div class="results-section">';
                html += `<h3>🔽 Downstream Ports (${topo.downstream_ports.length})</h3>`;
                html += '<div class="results-detail-grid">';
                topo.downstream_ports.forEach((port, index) => {
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">Port ${index + 1}</div>`;
                    html += `<div class="results-detail-value">${port.bdf}`;
                    if (port.link_speed) html += ` - ${port.link_speed}`;
                    if (port.link_width) html += ` ${port.link_width}`;
                    html += `</div>`;
                    html += `</div>`;
                });
                html += '</div>';
                html += '</div>';
            }

            // NVMe Devices section
            if (topo.nvme_devices && topo.nvme_devices.length > 0) {
                html += '<div class="results-section">';
                html += `<h3>💾 NVMe Devices (${topo.nvme_devices.length})</h3>`;
                html += '<div class="results-detail-grid">';
                topo.nvme_devices.forEach(dev => {
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">${dev.name || 'Device'}</div>`;
                    html += `<div class="results-detail-value">${dev.bdf}`;
                    if (dev.driver) html += ` (${dev.driver})`;
                    html += `</div>`;
                    html += `</div>`;
                });
                html += '</div>';
                html += '</div>';
            }

            // Topology Visualization
            html += '<div class="results-section">';
            html += '<h3>📊 Topology Diagram</h3>';
            html += '<div id="resultsTopologyVisualization" style="background: #f8fafc; border-radius: 10px; padding: 20px; min-height: 400px;"></div>';
            html += '</div>';
        }

        return html;
    }

    generateNVMeResultsHTML(result) {
        let html = '';

        if (result.controllers && result.controllers.length > 0) {
            html += '<div class="results-section">';
            html += `<h3>💾 NVMe Controllers (${result.controllers.length})</h3>`;

            result.controllers.forEach(ctrl => {
                html += '<div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 15px; border: 2px solid var(--border-gray);">';
                html += `<h4 style="margin: 0 0 15px 0; color: var(--dark-black);">${ctrl.device}</h4>`;
                html += '<div class="results-detail-grid">';
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Model</div>`;
                html += `<div class="results-detail-value">${ctrl.model}</div>`;
                html += `</div>`;
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Serial</div>`;
                html += `<div class="results-detail-value">${ctrl.serial}</div>`;
                html += `</div>`;
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Firmware</div>`;
                html += `<div class="results-detail-value">${ctrl.firmware}</div>`;
                html += `</div>`;
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">PCI Address</div>`;
                html += `<div class="results-detail-value">${ctrl.pci_address}</div>`;
                html += `</div>`;
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Capacity</div>`;
                html += `<div class="results-detail-value">${ctrl.total_capacity_gb.toFixed(2)} GB</div>`;
                html += `</div>`;
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Namespaces</div>`;
                html += `<div class="results-detail-value">${ctrl.namespace_count}</div>`;
                html += `</div>`;

                if (ctrl.temperature_c !== undefined) {
                    const tempColor = ctrl.temperature_c > 70 ? '#ef4444' : ctrl.temperature_c > 50 ? '#f59e0b' : '#22c55e';
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">Temperature</div>`;
                    html += `<div class="results-detail-value" style="color: ${tempColor};">${ctrl.temperature_c}°C</div>`;
                    html += `</div>`;
                }

                if (ctrl.spare_percent !== undefined) {
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">Spare</div>`;
                    html += `<div class="results-detail-value">${ctrl.spare_percent}%</div>`;
                    html += `</div>`;
                }

                html += '</div>'; // results-detail-grid
                html += '</div>'; // controller card
            });

            html += '</div>';
        }

        return html;
    }

    generateGenericResultsHTML(result) {
        let html = '';

        if (result.summary) {
            html += '<div class="results-section">';
            html += '<h3>📋 Summary</h3>';
            html += '<div class="results-detail-grid">';
            Object.entries(result.summary).forEach(([key, value]) => {
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">${key.replace(/_/g, ' ').toUpperCase()}</div>`;
                html += `<div class="results-detail-value">${value}</div>`;
                html += `</div>`;
            });
            html += '</div>';
            html += '</div>';
        }

        return html;
    }

    generateAllTestsResultsHTML(runResult) {
        let html = '<div class="test-results-content">';

        // Overall Summary
        html += '<div class="results-summary-header">';
        html += '<div class="results-summary-status">';
        html += `<div class="results-status-badge ${runResult.overall_status}">${runResult.overall_status.toUpperCase()}</div>`;
        html += '</div>';
        html += '<div class="results-summary-stats">';
        html += `<div class="results-stat-item">`;
        html += `<span class="results-stat-value">${runResult.summary.total_tests}</span>`;
        html += `<span class="results-stat-label">Total Tests</span>`;
        html += `</div>`;
        html += `<div class="results-stat-item">`;
        html += `<span class="results-stat-value">${runResult.summary.passed}</span>`;
        html += `<span class="results-stat-label">Passed</span>`;
        html += `</div>`;
        html += `<div class="results-stat-item">`;
        html += `<span class="results-stat-value">${runResult.summary.failed}</span>`;
        html += `<span class="results-stat-label">Failed</span>`;
        html += `</div>`;
        html += `<div class="results-stat-item">`;
        html += `<span class="results-stat-value">${runResult.summary.warnings}</span>`;
        html += `<span class="results-stat-label">Warnings</span>`;
        html += `</div>`;
        html += `<div class="results-stat-item">`;
        html += `<span class="results-stat-value">${runResult.total_duration_ms}</span>`;
        html += `<span class="results-stat-label">Duration (ms)</span>`;
        html += `</div>`;
        html += '</div>';
        html += '</div>';

        // Individual Test Results
        html += '<div class="results-section">';
        html += '<h3>📊 Individual Test Results</h3>';

        Object.entries(runResult.results).forEach(([testId, result]) => {
            html += `<div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 15px; border-left: 4px solid ${
                result.status === 'pass' ? '#22c55e' : 
                result.status === 'warning' ? '#f59e0b' : '#ef4444'
            };">`;
            html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">`;
            html += `<h4 style="margin: 0; color: var(--dark-black);">${result.test_name || testId}</h4>`;
            html += `<span class="results-status-badge ${result.status}">${result.status.toUpperCase()}</span>`;
            html += `</div>`;
            html += `<p style="color: var(--secondary-gray); font-size: 13px; margin: 0;">Duration: ${result.duration_ms}ms</p>`;

            if (result.warnings && result.warnings.length > 0) {
                html += `<p style="color: #f59e0b; font-size: 13px; margin: 5px 0 0 0;">⚠️ ${result.warnings.length} warning(s)</p>`;
            }
            if (result.errors && result.errors.length > 0) {
                html += `<p style="color: #ef4444; font-size: 13px; margin: 5px 0 0 0;">❌ ${result.errors.length} error(s)</p>`;
            }

            html += `</div>`;
        });

        html += '</div>';
        html += '</div>';

        return html;
    }

    closeResultsWindow() {
        if (this.resultsWindowElement) {
            this.resultsWindowElement.classList.remove('active');
        }
    }

    exportResultsAsJSON() {
        const testName = document.getElementById('resultsWindowTestName').textContent;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Get current test results
        const exportData = {
            test_name: testName,
            timestamp: new Date().toISOString(),
            results: this.testResults,
            history: this.testHistory
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `calypso_test_results_${timestamp}.json`;
        link.click();

        URL.revokeObjectURL(url);
        showNotification('Results exported as JSON', 'success');
    }

    printResults() {
        window.print();
    }

    showExportDialog() {
        if (Object.keys(this.testResults).length === 0) {
            showNotification('No test results to export', 'warning');
            return;
        }

        // Export all results
        this.exportResultsAsJSON();
    }

    clearHistory() {
        if (confirm('Clear all test history? This cannot be undone.')) {
            this.testHistory = [];
            this.testResults = {};

            // Reset status indicators
            document.querySelectorAll('.test-status').forEach(status => {
                status.className = 'test-status idle';
                status.textContent = '⏸️ Idle';
            });

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