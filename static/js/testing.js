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
        this.currentCategory = 'link-quality';
        this.init();
    }

    init() {
        this.createResultsWindow();
        this.bindEvents();
        this.loadAvailableTests();
        this.initializeCollapsibleStates();
        this.initializeCategoryFilter();
        console.log('✅ Testing Dashboard initialized');
    }

    initializeCollapsibleStates() {
	    const testCards = document.querySelectorAll('.test-card');
	    testCards.forEach(card => {
	        const testId = card.getAttribute('data-test-id');
	        if (testId) {
	            // Default tests start expanded, categorized tests start collapsed
	            const isDefault = card.getAttribute('data-default') === 'true';
	            const isCompact = card.classList.contains('test-card-compact');
	            const isPlaceholder = card.getAttribute('data-placeholder') === 'true';

	            // Set collapsed state: compact cards start collapsed, default cards start expanded
	            this.collapsedStates[testId] = isCompact ? true : false;

	            // Only add collapse toggle to non-compact cards (default tests)
	            if (!isCompact) {
	                this.addCollapseToggle(card, testId);
	            }

	            // Set initial collapsed state for compact cards
	            if (isCompact && this.collapsedStates[testId]) {
	                card.classList.add('collapsed');
	            }

	            // Add click handler to compact card headers
	            if (isCompact) {
	                const header = card.querySelector('.card-header');
	                if (header) {
	                    // Make header clickable for all compact cards
	                    header.style.cursor = isPlaceholder ? 'pointer' : 'pointer';

	                    header.onclick = (e) => {
	                        // Don't toggle if clicking on buttons
	                        if (e.target.closest('button')) {
	                            return;
	                        }
	                        this.toggleCompactCard(testId);
	                    };
	                }
	            }
	        }
	    });
	}

	toggleCompactCard(testId) {
	    const card = document.querySelector(`[data-test-id="${testId}"]`);
	    if (!card) return;

	    // Toggle collapsed state
	    this.collapsedStates[testId] = !this.collapsedStates[testId];

	    if (this.collapsedStates[testId]) {
	        card.classList.add('collapsed');
	    } else {
	        card.classList.remove('collapsed');
	    }

	    console.log(`Compact test card ${testId} ${this.collapsedStates[testId] ? 'collapsed' : 'expanded'}`);
	}

	initializeCategoryFilter() {
	    console.log('Initializing category filter...');
	    // Set Link Quality & Training as the default category
        this.filterByCategory('link-quality');
	}

    filterByCategory(category) {
	    console.log(`Filtering tests by category: ${category}`);
	    this.currentCategory = category;

	    // Update active state on category links
	    document.querySelectorAll('.category-link').forEach(link => {
	        if (link.getAttribute('data-category') === category) {
	            link.classList.add('active');
	        } else {
	            link.classList.remove('active');
	        }
	    });

	    // Filter test cards - only show tests matching the selected category
        const testCards = document.querySelectorAll('.test-card[data-category]');

        testCards.forEach(card => {
	        const cardCategory = card.getAttribute('data-category');

	        if (cardCategory === category) {
	            card.classList.remove('hidden');
	        } else {
	            card.classList.add('hidden');
	        }
	    });

	    // Check if any tests are visible in this category
	    this.checkEmptyCategory(category);

	    // Scroll to categorized tests section
        const categorizedGrid = document.getElementById('categorizedTestsGrid');
	    if (categorizedGrid) {
            categorizedGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    checkEmptyCategory(category) {
	    const categorizedGrid = document.getElementById('categorizedTestsGrid');
	    if (!categorizedGrid) return;

	    // Remove existing empty state message
	    const existingEmptyState = categorizedGrid.querySelector('.category-empty-state');
	    if (existingEmptyState) {
	        existingEmptyState.remove();
	    }

	    // Check if any tests are visible
	    const visibleTests = categorizedGrid.querySelectorAll('.test-card:not(.hidden)');

	    if (visibleTests.length === 0) {
	        const emptyState = document.createElement('div');
	        emptyState.className = 'category-empty-state';
	        emptyState.innerHTML = `
	            <div class="category-empty-state-icon">📋</div>
	            <p><strong>No tests available in this category</strong></p>
	            <p>Tests for this category are coming soon or may require additional configuration.</p>
	        `;
	        categorizedGrid.appendChild(emptyState);
	    }
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

    runTest(testId) {
        const status = document.getElementById(`${testId}Status`);
        const testCard = document.querySelector(`[data-test-id="${testId}"]`);

        if (status) {
            status.className = 'test-status running';
            status.textContent = '🔄 Running...';
        }

        this.addConsoleEntry('info', `Starting ${testId} test...`);

        // Prepare test options
        let options = {};

        // Check if this is link training test and gather config
        if (testId === 'link_training_time') {
            const deviceSelect = document.getElementById('linkTrainingDeviceSelect');
            const triggerReset = document.getElementById('linkTrainingTriggerReset');
            const triggerHotplug = document.getElementById('linkTrainingTriggerHotplug');

            options = {
                selected_device: deviceSelect?.value || null,
                trigger_reset: triggerReset?.checked || false,
                trigger_hotplug: triggerHotplug?.checked || false,
                wait_time: 3
            };

            console.log('Link Training options:', options);
        }

        // Send test request with options
        fetch('/api/tests/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                test_id: testId,
                port: globalSerialPort,
                options: options
            })
        })
            .then(response => response.json())
            .then(result => {
                this.handleTestComplete(testId, result);
            })
            .catch(error => {
                console.error(`Test ${testId} error:`, error);
                this.addConsoleEntry('error', `Test failed: ${error.message}`);

                if (status) {
                    status.className = 'test-status error';
                    status.textContent = '❌ Error';
                }
            });
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
	                // Restore button text based on button type
	                const isCompact = btn.classList.contains('btn-test-run-compact');
	                btn.innerHTML = isCompact ? '<span>▶️</span> Run' : '<span>▶️</span> Run Test';
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
        if (testId === 'link_training_time') {
            html = this.generateLinkTrainingResultsHTML(result);

            // Render chart after DOM is updated
            setTimeout(() => {
                this.renderLinkTrainingTimeChart(result);
            }, 100);
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

    updateTestAvailability() {
		    fetch('/api/tests/available')
		        .then(response => response.json())
		        .then(tests => {
		            tests.forEach(test => {
		                const testCard = document.querySelector(`[data-test-id="${test.id}"]`);
		                if (!testCard) return;

		                const runBtn = testCard.querySelector('.btn-test-run');
		                const requirementNote = testCard.querySelector('.test-requirement-note');
		                const configSection = testCard.querySelector('.test-config-section');

		                if (test.requires_nvme_devices) {
		                    if (test.is_available) {
		                        // Enable the test
		                        if (runBtn) runBtn.disabled = false;
		                        if (requirementNote) requirementNote.style.display = 'none';
		                        if (configSection) configSection.style.display = 'block';

		                        // Populate device selection for link training
		                        if (test.id === 'link_training_time') {
		                            this.populateLinkTrainingDevices();
		                        }
		                    } else {
		                        // Disable the test
		                        if (runBtn) runBtn.disabled = true;
		                        if (requirementNote) {
		                            requirementNote.style.display = 'block';
		                            requirementNote.innerHTML = `<strong>⚠️ Requirement:</strong> ${test.unavailable_reason}`;
		                        }
		                        if (configSection) configSection.style.display = 'none';
		                    }
		                }
		            });
		        })
		        .catch(error => {
		            console.error('Error updating test availability:', error);
		        });
		}
    populateLinkTrainingDevices() {
    fetch('/api/tests/link_training/devices')
        .then(response => response.json())
        .then(devices => {
            const select = document.getElementById('linkTrainingDeviceSelect');
            if (!select) return;

            // Clear existing options except "All Devices"
            select.innerHTML = '<option value="">All Devices</option>';

            // Add device options
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.pci_address;
                option.textContent = `${device.device} (${device.pci_address}) - ${device.model}`;
                select.appendChild(option);
            });

            console.log(`Populated ${devices.length} devices for link training`);
        })
        .catch(error => {
            console.error('Error loading link training devices:', error);
        });
}
	/**
	 * Generate HTML for Link Training Time results
	 */
	generateLinkTrainingResultsHTML(result) {
	    let html = '<div class="test-results-content">';

	    // Summary header
	    html += '<div class="results-summary-header">';
	    html += '<div class="results-summary-status">';
	    html += `<div class="results-status-badge ${result.status}">${result.status.toUpperCase()}</div>`;
	    html += '</div>';
	    html += '<div class="results-summary-stats">';

	    if (result.summary) {
	        html += `<div class="results-stat-item">`;
	        html += `<span class="results-stat-value">${result.summary.total_events || 0}</span>`;
	        html += `<span class="results-stat-label">Total Events</span>`;
	        html += `</div>`;

	        html += `<div class="results-stat-item">`;
	        html += `<span class="results-stat-value">${result.summary.devices_monitored || 0}</span>`;
	        html += `<span class="results-stat-label">Devices Monitored</span>`;
	        html += `</div>`;

	        html += `<div class="results-stat-item">`;
	        html += `<span class="results-stat-value">${result.summary.training_sequences_detected || 0}</span>`;
	        html += `<span class="results-stat-label">Training Sequences</span>`;
	        html += `</div>`;

	        if (result.summary.overall_avg_training_time_ms) {
	            html += `<div class="results-stat-item">`;
	            html += `<span class="results-stat-value">${result.summary.overall_avg_training_time_ms}ms</span>`;
	            html += `<span class="results-stat-label">Avg Training Time</span>`;
	            html += `</div>`;
	        }
	    }

	    html += '</div>'; // results-summary-stats
	    html += '</div>'; // results-summary-header

	    // Per-Device Statistics
	    if (result.statistics && result.statistics.devices && result.statistics.devices.length > 0) {
	        html += '<div class="results-section">';
	        html += '<h3>📊 Device Training Statistics</h3>';

	        result.statistics.devices.forEach(device => {
	            html += '<div class="device-training-card">';
	            html += `<h4>${device.device}</h4>`;

	            html += '<div class="results-detail-grid">';

	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Total Events</div>`;
	            html += `<div class="results-detail-value">${device.total_events}</div>`;
	            html += `</div>`;

	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Training Sequences</div>`;
	            html += `<div class="results-detail-value">${device.training_sequences}</div>`;
	            html += `</div>`;

	            if (device.avg_training_time_ms) {
	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Avg Training Time</div>`;
	                html += `<div class="results-detail-value">${device.avg_training_time_ms}ms</div>`;
	                html += `</div>`;

	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Min Training Time</div>`;
	                html += `<div class="results-detail-value">${device.min_training_time_ms}ms</div>`;
	                html += `</div>`;

	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Max Training Time</div>`;
	                html += `<div class="results-detail-value">${device.max_training_time_ms}ms</div>`;
	                html += `</div>`;
	            }

	            html += '</div>'; // results-detail-grid

	            // Event Type Breakdown
	            if (device.event_counts && Object.keys(device.event_counts).length > 0) {
	                html += '<div class="event-type-breakdown">';
	                html += '<h5>Event Type Breakdown</h5>';
	                html += '<div class="event-type-grid">';

	                const eventTypeLabels = {
	                    'state_transition': 'State Transitions',
	                    'link_up': 'Link Up',
	                    'link_down': 'Link Down',
	                    'speed_change': 'Speed Changes',
	                    'width_change': 'Width Changes',
	                    'training_error': 'Training Errors',
	                    'retrain': 'Retrains',
	                    'other': 'Other'
	                };

	                Object.entries(device.event_counts).forEach(([type, count]) => {
	                    html += `<div class="event-type-item">`;
	                    html += `<span class="event-type-label">${eventTypeLabels[type] || type}</span>`;
	                    html += `<span class="event-type-count">${count}</span>`;
	                    html += `</div>`;
	                });

	                html += '</div>'; // event-type-grid
	                html += '</div>'; // event-type-breakdown
	            }

	            html += '</div>'; // device-training-card
	        });

	        html += '</div>'; // results-section
	    }

	    // Training Time Chart
	    if (result.statistics && result.statistics.training_sequences && result.statistics.training_sequences.length > 0) {
	        html += '<div class="results-section">';
	        html += '<h3>📈 Training Time Timeline</h3>';
	        html += `<div id="linkTrainingTimeChart" style="width: 100%; height: 400px;"></div>`;
	        html += '</div>';
	    }

	    // Event Timeline
	    if (result.events && result.events.length > 0) {
	        html += '<div class="results-section">';
	        html += '<h3>📝 Event Timeline</h3>';
	        html += '<div class="event-timeline-container">';

	        // Limit to most recent 50 events for display
	        const displayEvents = result.events.slice(-50);

	        displayEvents.forEach(event => {
	            const eventTypeClass = event.event_type.replace(/_/g, '-');
	            html += `<div class="event-timeline-item ${eventTypeClass}">`;
	            html += `<div class="event-timeline-time">${event.timestamp.toFixed(3)}s</div>`;
	            html += `<div class="event-timeline-device">${event.device}</div>`;
	            html += `<div class="event-timeline-type">${event.event_type.replace(/_/g, ' ').toUpperCase()}</div>`;
	            html += `<div class="event-timeline-message">${event.raw_message}</div>`;
	            html += `</div>`;
	        });

	        if (result.events.length > 50) {
	            html += `<div class="event-timeline-note">Showing most recent 50 of ${result.events.length} events</div>`;
	        }

	        html += '</div>'; // event-timeline-container
	        html += '</div>'; // results-section
	    }

	    // System Information
	    html += '<div class="results-section">';
	    html += '<h3>ℹ️ System Information</h3>';
	    html += '<div class="results-detail-grid">';

	    html += `<div class="results-detail-item">`;
	    html += `<div class="results-detail-label">Permission Level</div>`;
	    html += `<div class="results-detail-value">${result.permission_level || 'unknown'}</div>`;
	    html += `</div>`;

	    html += `<div class="results-detail-item">`;
	    html += `<div class="results-detail-label">Test Duration</div>`;
	    html += `<div class="results-detail-value">${result.duration_ms}ms</div>`;
	    html += `</div>`;

	    if (result.statistics && result.statistics.time_range) {
	        html += `<div class="results-detail-item">`;
	        html += `<div class="results-detail-label">Log Time Range</div>`;
	        html += `<div class="results-detail-value">${result.statistics.time_range.duration_seconds.toFixed(2)}s</div>`;
	        html += `</div>`;
	    }

	    html += '</div>'; // results-detail-grid
	    html += '</div>'; // results-section

	    // Warnings
	    if (result.warnings && result.warnings.length > 0) {
	        html += '<div class="results-section warning-section">';
	        html += '<h3>⚠️ Warnings</h3>';
	        html += '<ul class="results-warning-list">';
	        result.warnings.forEach(warning => {
	            html += `<li>${warning}</li>`;
	        });
	        html += '</ul>';
	        html += '</div>';
	    }

	    // Errors
	    if (result.errors && result.errors.length > 0) {
	        html += '<div class="results-section error-section">';
	        html += '<h3>❌ Errors</h3>';
	        html += '<ul class="results-error-list">';
	        result.errors.forEach(error => {
	            html += `<li>${error}</li>`;
	        });
	        html += '</ul>';
	        html += '</div>';
	    }

	    html += '</div>'; // test-results-content
	    return html;
	}

	/**
	 * Render Link Training Time Chart
	 */
	renderLinkTrainingTimeChart(result) {
	    const chartContainer = document.getElementById('linkTrainingTimeChart');
	    if (!chartContainer) return;

	    const sequences = result.statistics.training_sequences;
	    if (!sequences || sequences.length === 0) return;

	    // Prepare chart data
	    const chartData = sequences.map((seq, index) => ({
	        sequence: `#${index + 1}`,
	        device: seq.device,
	        duration: seq.duration_ms,
	        start: seq.start_time
	    }));

	    // Create simple bar chart using HTML/CSS
	    let chartHTML = '<div class="training-time-chart">';

	    // Find max duration for scaling
	    const maxDuration = Math.max(...chartData.map(d => d.duration));

	    chartData.forEach(data => {
	        const barWidth = (data.duration / maxDuration) * 100;
	        const color = data.duration < 50 ? '#22c55e' :
	                     data.duration < 100 ? '#f59e0b' : '#ef4444';

	        chartHTML += '<div class="chart-bar-container">';
	        chartHTML += `<div class="chart-bar-label">${data.sequence} (${data.device})</div>`;
	        chartHTML += '<div class="chart-bar-track">';
	        chartHTML += `<div class="chart-bar-fill" style="width: ${barWidth}%; background-color: ${color};"></div>`;
	        chartHTML += `<span class="chart-bar-value">${data.duration}ms</span>`;
	        chartHTML += '</div>';
	        chartHTML += '</div>';
	    });

	    chartHTML += '</div>';

	    chartContainer.innerHTML = chartHTML;
	}

	/**
	 * Export Link Training results
	 */
	exportLinkTrainingResults(result) {
	    const timestamp = new Date().toLocaleString();
	    const filename = `CalypsoPy_LinkTraining_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

	    let reportContent = '';
	    reportContent += '='.repeat(80) + '\n';
	    reportContent += 'CalypsoPy+ Link Training Time Measurement Report\n';
	    reportContent += 'Generated by Serial Cables Professional Interface\n';
	    reportContent += '='.repeat(80) + '\n';
	    reportContent += `Report Generated: ${timestamp}\n`;
	    reportContent += `Test Status: ${result.status.toUpperCase()}\n`;
	    reportContent += `Test Duration: ${result.duration_ms}ms\n`;
	    reportContent += `Permission Level: ${result.permission_level}\n`;
	    reportContent += '\n';

	    // Summary
	    if (result.summary) {
	        reportContent += 'SUMMARY\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += `Total Events: ${result.summary.total_events || 0}\n`;
	        reportContent += `Devices Monitored: ${result.summary.devices_monitored || 0}\n`;
	        reportContent += `Training Sequences Detected: ${result.summary.training_sequences_detected || 0}\n`;
	        if (result.summary.overall_avg_training_time_ms) {
	            reportContent += `Overall Average Training Time: ${result.summary.overall_avg_training_time_ms}ms\n`;
	        }
	        if (result.summary.time_range_seconds) {
	            reportContent += `Log Time Range: ${result.summary.time_range_seconds}s\n`;
	        }
	        reportContent += '\n';
	    }

	    // Per-Device Statistics
	    if (result.statistics && result.statistics.devices) {
	        reportContent += 'DEVICE TRAINING STATISTICS\n';
	        reportContent += '='.repeat(80) + '\n\n';

	        result.statistics.devices.forEach(device => {
	            reportContent += `Device: ${device.device}\n`;
	            reportContent += '-'.repeat(80) + '\n';
	            reportContent += `Total Events: ${device.total_events}\n`;
	            reportContent += `Training Sequences: ${device.training_sequences}\n`;

	            if (device.avg_training_time_ms) {
	                reportContent += `Average Training Time: ${device.avg_training_time_ms}ms\n`;
	                reportContent += `Min Training Time: ${device.min_training_time_ms}ms\n`;
	                reportContent += `Max Training Time: ${device.max_training_time_ms}ms\n`;
	            }

	            if (device.event_counts) {
	                reportContent += '\nEvent Type Breakdown:\n';
	                Object.entries(device.event_counts).forEach(([type, count]) => {
	                    reportContent += `  ${type}: ${count}\n`;
	                });
	            }

	            reportContent += '\n';
	        });
	    }

	    // Training Sequences
	    if (result.statistics && result.statistics.training_sequences && result.statistics.training_sequences.length > 0) {
	        reportContent += 'TRAINING SEQUENCES\n';
	        reportContent += '='.repeat(80) + '\n';
	        reportContent += String.prototype.padEnd.call('Seq#', 8);
	        reportContent += String.prototype.padEnd.call('Device', 20);
	        reportContent += String.prototype.padEnd.call('Start Time', 15);
	        reportContent += String.prototype.padEnd.call('End Time', 15);
	        reportContent += 'Duration (ms)\n';
	        reportContent += '-'.repeat(80) + '\n';

	        result.statistics.training_sequences.forEach((seq, index) => {
	            reportContent += String.prototype.padEnd.call(`#${index + 1}`, 8);
	            reportContent += String.prototype.padEnd.call(seq.device, 20);
	            reportContent += String.prototype.padEnd.call(seq.start_time.toFixed(3), 15);
	            reportContent += String.prototype.padEnd.call(seq.end_time.toFixed(3), 15);
	            reportContent += `${seq.duration_ms}\n`;
	        });
	        reportContent += '\n';
	    }

	    // Warnings
	    if (result.warnings && result.warnings.length > 0) {
	        reportContent += 'WARNINGS\n';
	        reportContent += '-'.repeat(80) + '\n';
	        result.warnings.forEach(warning => {
	            reportContent += `- ${warning}\n`;
	        });
	        reportContent += '\n';
	    }

	    // Errors
	    if (result.errors && result.errors.length > 0) {
	        reportContent += 'ERRORS\n';
	        reportContent += '-'.repeat(80) + '\n';
	        result.errors.forEach(error => {
	            reportContent += `- ${error}\n`;
	        });
	        reportContent += '\n';
	    }

	    reportContent += '='.repeat(80) + '\n';
	    reportContent += 'End of Link Training Report\n';
	    reportContent += 'Visit: https://serial-cables.com for more information\n';
	    reportContent += '='.repeat(80) + '\n';

	    // Download the report
	    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
	    const url = window.URL.createObjectURL(blob);
	    const downloadLink = document.createElement('a');
	    downloadLink.href = url;
	    downloadLink.download = filename;
	    downloadLink.style.display = 'none';
	    document.body.appendChild(downloadLink);
	    downloadLink.click();
	    document.body.removeChild(downloadLink);
	    window.URL.revokeObjectURL(url);

	    showNotification(`Link training results exported: ${filename}`, 'success');
	}

    /**
	 * Initialize Link Retrain Count Test
	 */
	initializeLinkRetrainTest() {
	    console.log('Initializing Link Retrain Count test...');

	    const requirementNote = document.getElementById('linkRetrainRequirement');
	    const configSection = document.getElementById('linkRetrainConfig');
	    const runButton = document.getElementById('runLinkRetrainBtn');
	    const deviceSelect = document.getElementById('linkRetrainDeviceSelect');

	    // Check if NVMe devices are available
	    if (this.nvmeDevicesDetected) {
	        if (requirementNote) requirementNote.style.display = 'none';
	        if (configSection) configSection.style.display = 'block';
	        if (runButton) runButton.disabled = false;

	        // Load available devices
	        this.loadLinkRetrainDevices();
	    } else {
	        if (requirementNote) requirementNote.style.display = 'block';
	        if (configSection) configSection.style.display = 'none';
	        if (runButton) runButton.disabled = true;
	    }
	}

	/**
	 * Load available devices for Link Retrain test
	 */
	async loadLinkRetrainDevices() {
	    try {
	        const response = await fetch('/api/tests/link_retrain/devices');
	        const devices = await response.json();

	        const deviceSelect = document.getElementById('linkRetrainDeviceSelect');
	        if (!deviceSelect) return;

	        // Clear existing options except "All Devices"
	        deviceSelect.innerHTML = '<option value="">All Devices</option>';

	        // Add device options
	        devices.forEach(device => {
	            const option = document.createElement('option');
	            option.value = device.pci_address;
	            option.textContent = `${device.device} - ${device.model} (${device.pci_address})`;
	            deviceSelect.appendChild(option);
	        });

	        console.log(`Loaded ${devices.length} devices for link retrain test`);
	    } catch (error) {
	        console.error('Error loading link retrain devices:', error);
	    }
	}

	/**
	 * Get Link Retrain test options from UI
	 */
	getLinkRetrainTestOptions() {
	    const selectedDevice = document.getElementById('linkRetrainDeviceSelect')?.value || '';
	    const numRetrains = parseInt(document.getElementById('linkRetrainNumRetrains')?.value || '5');
	    const delayMs = parseInt(document.getElementById('linkRetrainDelay')?.value || '100');
	    const showTiming = document.getElementById('linkRetrainShowTiming')?.checked || true;
	    const checkCompliance = document.getElementById('linkRetrainCheckCompliance')?.checked || true;

	    const options = {
	        num_retrains: numRetrains,
	        delay_between_ms: delayMs,
	        show_timing: showTiming,
	        check_compliance: checkCompliance
	    };

	    // Add specific device if selected
	    if (selectedDevice) {
	        options.pci_address = selectedDevice;
	    }

	    return options;
	}

	/**
	 * Render Link Retrain Count test results
	 */
	renderLinkRetrainResults(result) {
	    let html = '<div class="test-results-content">';

	    // Summary Section
	    html += '<div class="results-section">';
	    html += '<h3>📊 Test Summary</h3>';
	    html += '<div class="results-stat-grid">';

	    html += `<div class="results-stat-item">`;
	    html += `<span class="results-stat-value">${result.summary.total_devices || 0}</span>`;
	    html += `<span class="results-stat-label">Devices Tested</span>`;
	    html += `</div>`;

	    html += `<div class="results-stat-item">`;
	    html += `<span class="results-stat-value">${result.summary.total_retrains || 0}</span>`;
	    html += `<span class="results-stat-label">Total Retrains</span>`;
	    html += `</div>`;

	    html += `<div class="results-stat-item">`;
	    html += `<span class="results-stat-value" style="color: #22c55e;">${result.summary.successful_retrains || 0}</span>`;
	    html += `<span class="results-stat-label">Successful</span>`;
	    html += `</div>`;

	    html += `<div class="results-stat-item">`;
	    html += `<span class="results-stat-value" style="color: #ef4444;">${result.summary.failed_retrains || 0}</span>`;
	    html += `<span class="results-stat-label">Failed</span>`;
	    html += `</div>`;

	    html += `<div class="results-stat-item">`;
	    html += `<span class="results-stat-value">${result.summary.success_rate || 0}%</span>`;
	    html += `<span class="results-stat-label">Success Rate</span>`;
	    html += `</div>`;

	    html += '</div>'; // results-stat-grid
	    html += '</div>'; // results-section

	    // Overall Statistics
	    if (result.statistics) {
	        html += '<div class="results-section">';
	        html += '<h3>📈 Overall Statistics</h3>';
	        html += '<div class="results-detail-grid">';

	        html += `<div class="results-detail-item">`;
	        html += `<div class="results-detail-label">Average Retrain Time</div>`;
	        html += `<div class="results-detail-value">${result.statistics.avg_retrain_time_ms}ms</div>`;
	        html += `</div>`;

	        html += `<div class="results-detail-item">`;
	        html += `<div class="results-detail-label">Min Retrain Time</div>`;
	        html += `<div class="results-detail-value">${result.statistics.min_retrain_time_ms}ms</div>`;
	        html += `</div>`;

	        html += `<div class="results-detail-item">`;
	        html += `<div class="results-detail-label">Max Retrain Time</div>`;
	        html += `<div class="results-detail-value">${result.statistics.max_retrain_time_ms}ms</div>`;
	        html += `</div>`;

	        html += `<div class="results-detail-item">`;
	        html += `<div class="results-detail-label">Std Deviation</div>`;
	        html += `<div class="results-detail-value">${result.statistics.std_dev_ms}ms</div>`;
	        html += `</div>`;

	        html += '</div>'; // results-detail-grid
	        html += '</div>'; // results-section
	    }

	    // PCIe 6.x Compliance
	    if (result.compliance) {
	        html += '<div class="results-section">';
	        html += '<h3>✅ PCIe 6.x Compliance</h3>';
	        html += '<div class="results-detail-grid">';

	        const complianceColor = result.compliance.compliant ? '#22c55e' : '#ef4444';
	        const complianceText = result.compliance.compliant ? 'COMPLIANT' : 'NON-COMPLIANT';

	        html += `<div class="results-detail-item">`;
	        html += `<div class="results-detail-label">Compliance Status</div>`;
	        html += `<div class="results-detail-value" style="color: ${complianceColor}; font-weight: 700;">${complianceText}</div>`;
	        html += `</div>`;

	        html += `<div class="results-detail-item">`;
	        html += `<div class="results-detail-label">Specification Version</div>`;
	        html += `<div class="results-detail-value">${result.compliance.spec_version}</div>`;
	        html += `</div>`;

	        html += `<div class="results-detail-item">`;
	        html += `<div class="results-detail-label">Max Retrain Time Limit</div>`;
	        html += `<div class="results-detail-value">${result.compliance.max_retrain_time_ms}ms</div>`;
	        html += `</div>`;

	        html += '</div>'; // results-detail-grid

	        // Compliance Issues
	        if (result.compliance.issues && result.compliance.issues.length > 0) {
	            html += '<div style="margin-top: 15px;">';
	            html += '<h5 style="color: #ef4444; font-size: 14px; font-weight: 700; margin-bottom: 10px;">⚠️ Compliance Issues</h5>';
	            html += '<ul style="margin: 0; padding-left: 20px; color: #ef4444;">';
	            result.compliance.issues.forEach(issue => {
	                html += `<li style="margin-bottom: 8px;">${issue}</li>`;
	            });
	            html += '</ul>';
	            html += '</div>';
	        }

	        html += '</div>'; // results-section
	    }

	    // Per-Device Results
	    if (result.devices && result.devices.length > 0) {
	        html += '<div class="results-section">';
	        html += '<h3>🔧 Per-Device Results</h3>';

	        result.devices.forEach(device => {
	            html += '<div class="device-training-card">';
	            html += `<h4>${device.name} (${device.pci_address})</h4>`;

	            // Device Statistics
	            html += '<div class="results-detail-grid">';

	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Total Retrains</div>`;
	            html += `<div class="results-detail-value">${device.statistics.total}</div>`;
	            html += `</div>`;

	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Successful</div>`;
	            html += `<div class="results-detail-value" style="color: #22c55e;">${device.statistics.successful}</div>`;
	            html += `</div>`;

	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Failed</div>`;
	            html += `<div class="results-detail-value" style="color: #ef4444;">${device.statistics.failed}</div>`;
	            html += `</div>`;

	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Timeouts</div>`;
	            html += `<div class="results-detail-value" style="color: #f59e0b;">${device.statistics.timeouts}</div>`;
	            html += `</div>`;

	            if (device.statistics.avg_time_ms > 0) {
	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Avg Time</div>`;
	                html += `<div class="results-detail-value">${device.statistics.avg_time_ms}ms</div>`;
	                html += `</div>`;

	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Min Time</div>`;
	                html += `<div class="results-detail-value">${device.statistics.min_time_ms}ms</div>`;
	                html += `</div>`;

	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Max Time</div>`;
	                html += `<div class="results-detail-value">${device.statistics.max_time_ms}ms</div>`;
	                html += `</div>`;
	            }

	            html += '</div>'; // results-detail-grid

	            // Retrain Timeline Chart
	            if (device.retrains && device.retrains.length > 0) {
	                html += '<div style="margin-top: 20px;">';
	                html += '<h5 style="font-size: 13px; font-weight: 700; margin-bottom: 10px;">Retrain Timeline</h5>';
	                html += '<div class="training-time-chart">';

	                const maxTime = Math.max(...device.retrains.map(r => r.time_ms));

	                device.retrains.forEach(retrain => {
	                    const barWidth = (retrain.time_ms / maxTime) * 100;
	                    const color = retrain.success ? '#22c55e' :
	                                  retrain.timeout ? '#f59e0b' : '#ef4444';
	                    const icon = retrain.success ? '✓' : retrain.timeout ? '⏱️' : '✗';

	                    html += '<div class="chart-bar-container">';
	                    html += `<div class="chart-bar-label">#${retrain.sequence} ${icon}</div>`;
	                    html += '<div class="chart-bar-track">';
	                    html += `<div class="chart-bar-fill" style="width: ${barWidth}%; background-color: ${color};"></div>`;
	                    html += `<span class="chart-bar-value">${retrain.time_ms}ms</span>`;
	                    html += '</div>';
	                    html += '</div>';
	                });

	                html += '</div>'; // training-time-chart
	                html += '</div>';
	            }

	            html += '</div>'; // device-training-card
	        });

	        html += '</div>'; // results-section
	    }

	    // System Information
	    html += '<div class="results-section">';
	    html += '<h3>ℹ️ System Information</h3>';
	    html += '<div class="results-detail-grid">';

	    html += `<div class="results-detail-item">`;
	    html += `<div class="results-detail-label">Permission Level</div>`;
	    html += `<div class="results-detail-value">${result.permission_level || 'unknown'}</div>`;
	    html += `</div>`;

	    html += `<div class="results-detail-item">`;
	    html += `<div class="results-detail-label">Test Duration</div>`;
	    html += `<div class="results-detail-value">${result.duration_ms}ms</div>`;
	    html += `</div>`;

	    html += `<div class="results-detail-item">`;
	    html += `<div class="results-detail-label">Timestamp</div>`;
	    html += `<div class="results-detail-value">${new Date(result.timestamp).toLocaleString()}</div>`;
	    html += `</div>`;

	    html += '</div>'; // results-detail-grid
	    html += '</div>'; // results-section

	    // Warnings
	    if (result.warnings && result.warnings.length > 0) {
	        html += '<div class="results-section warning-section">';
	        html += '<h3>⚠️ Warnings</h3>';
	        html += '<ul class="results-warning-list">';
	        result.warnings.forEach(warning => {
	            html += `<li>${warning}</li>`;
	        });
	        html += '</ul>';
	        html += '</div>';
	    }

	    // Errors
	    if (result.errors && result.errors.length > 0) {
	        html += '<div class="results-section error-section">';
	        html += '<h3>❌ Errors</h3>';
	        html += '<ul class="results-error-list">';
	        result.errors.forEach(error => {
	            html += `<li>${error}</li>`;
	        });
	        html += '</ul>';
	        html += '</div>';
	    }

	    html += '</div>'; // test-results-content
	    return html;
	}

	/**
	 * Export Link Retrain Count results
	 */
	exportLinkRetrainResults(result) {
	    const timestamp = new Date().toLocaleString();
	    const csvFilename = `CalypsoPy_LinkRetrain_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;
	    const txtFilename = `CalypsoPy_LinkRetrain_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

	    // Generate CSV Export
	    let csvContent = 'Device,PCI Address,Sequence,Success,Time (ms),Training Detected,Training Completed,Timeout,Error\n';

	    if (result.devices) {
	        result.devices.forEach(device => {
	            if (device.retrains) {
	                device.retrains.forEach(retrain => {
	                    csvContent += `"${device.name}",${device.pci_address},${retrain.sequence},`;
	                    csvContent += `${retrain.success},${retrain.time_ms},${retrain.training_detected},`;
	                    csvContent += `${retrain.training_completed},${retrain.timeout},"${retrain.error || ''}"\n`;
	                });
	            }
	        });
	    }

	    // Generate Text Report
	    let reportContent = '';
	    reportContent += '='.repeat(80) + '\n';
	    reportContent += 'CalypsoPy+ Link Retrain Count Test Report\n';
	    reportContent += 'Generated by Serial Cables Professional Interface\n';
	    reportContent += '='.repeat(80) + '\n';
	    reportContent += `Report Generated: ${timestamp}\n`;
	    reportContent += `Test Status: ${result.status.toUpperCase()}\n`;
	    reportContent += `Test Duration: ${result.duration_ms}ms\n`;
	    reportContent += `Permission Level: ${result.permission_level}\n`;
	    reportContent += '\n';

	    // Summary
	    if (result.summary) {
	        reportContent += 'SUMMARY\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += `Total Devices: ${result.summary.total_devices || 0}\n`;
	        reportContent += `Total Retrains: ${result.summary.total_retrains || 0}\n`;
	        reportContent += `Successful: ${result.summary.successful_retrains || 0}\n`;
	        reportContent += `Failed: ${result.summary.failed_retrains || 0}\n`;
	        reportContent += `Timeouts: ${result.summary.timeout_retrains || 0}\n`;
	        reportContent += `Success Rate: ${result.summary.success_rate || 0}%\n`;
	        reportContent += '\n';
	    }

	    // Statistics
	    if (result.statistics) {
	        reportContent += 'STATISTICS\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += `Average Retrain Time: ${result.statistics.avg_retrain_time_ms}ms\n`;
	        reportContent += `Min Retrain Time: ${result.statistics.min_retrain_time_ms}ms\n`;
	        reportContent += `Max Retrain Time: ${result.statistics.max_retrain_time_ms}ms\n`;
	        reportContent += `Standard Deviation: ${result.statistics.std_dev_ms}ms\n`;
	        reportContent += '\n';
	    }

	    // PCIe 6.x Compliance
	    if (result.compliance) {
	        reportContent += 'PCIe 6.x COMPLIANCE\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += `Specification: ${result.compliance.spec_version}\n`;
	        reportContent += `Compliant: ${result.compliance.compliant ? 'YES' : 'NO'}\n`;
	        reportContent += `Max Retrain Time Limit: ${result.compliance.max_retrain_time_ms}ms\n`;

	        if (result.compliance.issues && result.compliance.issues.length > 0) {
	            reportContent += '\nCompliance Issues:\n';
	            result.compliance.issues.forEach(issue => {
	                reportContent += `  - ${issue}\n`;
	            });
	        }
	        reportContent += '\n';
	    }

	    // Per-Device Results
	    if (result.devices && result.devices.length > 0) {
	        reportContent += 'PER-DEVICE RESULTS\n';
	        reportContent += '-'.repeat(80) + '\n';

	        result.devices.forEach(device => {
	            reportContent += `\nDevice: ${device.name}\n`;
	            reportContent += `PCI Address: ${device.pci_address}\n`;
	            reportContent += `Capability Offset: ${device.capability_offset}\n`;
	            reportContent += `Total Retrains: ${device.statistics.total}\n`;
	            reportContent += `Successful: ${device.statistics.successful}\n`;
	            reportContent += `Failed: ${device.statistics.failed}\n`;
	            reportContent += `Timeouts: ${device.statistics.timeouts}\n`;

	            if (device.statistics.avg_time_ms > 0) {
	                reportContent += `Average Time: ${device.statistics.avg_time_ms}ms\n`;
	                reportContent += `Min Time: ${device.statistics.min_time_ms}ms\n`;
	                reportContent += `Max Time: ${device.statistics.max_time_ms}ms\n`;
	            }

	            if (device.retrains && device.retrains.length > 0) {
	                reportContent += '\nRetrain Sequence:\n';
	                device.retrains.forEach(retrain => {
	                    const status = retrain.success ? 'SUCCESS' : retrain.timeout ? 'TIMEOUT' : 'FAILED';
	                    reportContent += `  #${retrain.sequence}: ${status} - ${retrain.time_ms}ms`;
	                    if (retrain.error) {
	                        reportContent += ` (${retrain.error})`;
	                    }
	                    reportContent += '\n';
	                });
	            }

	            reportContent += '-'.repeat(80) + '\n';
	        });
	    }

	    // Warnings
	    if (result.warnings && result.warnings.length > 0) {
	        reportContent += '\nWARNINGS\n';
	        reportContent += '-'.repeat(80) + '\n';
	        result.warnings.forEach(warning => {
	            reportContent += `⚠️  ${warning}\n`;
	        });
	        reportContent += '\n';
	    }

	    // Errors
	    if (result.errors && result.errors.length > 0) {
	        reportContent += '\nERRORS\n';
	        reportContent += '-'.repeat(80) + '\n';
	        result.errors.forEach(error => {
	            reportContent += `❌ ${error}\n`;
	        });
	        reportContent += '\n';
	    }

	    reportContent += '='.repeat(80) + '\n';
	    reportContent += 'End of Link Retrain Count Report\n';
	    reportContent += 'Visit: https://serial-cables.com for more information\n';
	    reportContent += '='.repeat(80) + '\n';

	    // Create download for CSV
	    const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
	    const csvUrl = window.URL.createObjectURL(csvBlob);
	    const csvLink = document.createElement('a');
	    csvLink.href = csvUrl;
	    csvLink.download = csvFilename;
	    csvLink.style.display = 'none';
	    document.body.appendChild(csvLink);
	    csvLink.click();
	    document.body.removeChild(csvLink);
	    window.URL.revokeObjectURL(csvUrl);

	    // Create download for text report
	    const txtBlob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
	    const txtUrl = window.URL.createObjectURL(txtBlob);
	    const txtLink = document.createElement('a');
	    txtLink.href = txtUrl;
	    txtLink.download = txtFilename;
	    txtLink.style.display = 'none';
	    document.body.appendChild(txtLink);
	    txtLink.click();
	    document.body.removeChild(txtLink);
	    window.URL.revokeObjectURL(txtUrl);

	    showNotification(`Link retrain results exported: ${csvFilename} and ${txtFilename}`, 'success');
	}

    /**
	 * Show results in popup window with export/print options
	 */
	showResultsWindow(testId, result) {
	    this.currentResultTestId = testId;

	    // Update window title
	    const titleElement = document.getElementById('resultsWindowTestName');
	    if (titleElement) {
	        titleElement.textContent = result.test_name || testId;
	    }

	    // Update status badge
	    const statusElement = document.getElementById('resultsWindowStatus');
	    if (statusElement) {
	        statusElement.textContent = result.status.toUpperCase();
	        statusElement.className = `results-status-badge ${result.status}`;
	    }

	    // Update timestamp
	    const timestampElement = document.getElementById('resultsWindowTimestamp');
	    if (timestampElement) {
	        const timestamp = result.timestamp ? new Date(result.timestamp).toLocaleString() : new Date().toLocaleString();
	        timestampElement.textContent = timestamp;
	    }

	    // Render test-specific results
	    this.renderTestResults(testId, result);

	    // Show the window
	    if (this.resultsWindowElement) {
	        this.resultsWindowElement.classList.add('active');
	    }
	}

	/**
	 * Print current results
	 */
	printCurrentResults() {
	    // Store original title
	    const originalTitle = document.title;
	    const testName = document.getElementById('resultsWindowTestName').textContent;

	    // Set print title
	    document.title = `CalypsoPy+ - ${testName} Results`;

	    // Hide non-printable elements
	    const actionsElements = document.querySelectorAll('.results-window-actions, .btn-close-results');
	    actionsElements.forEach(el => el.style.display = 'none');

	    // Trigger print
	    window.print();

	    // Restore
	    document.title = originalTitle;
	    actionsElements.forEach(el => el.style.display = '');
	}

	/**
	 * Export results as PDF (using browser's print to PDF)
	 */
	exportResultsAsPDF() {
	    showNotification('Use Print dialog and select "Save as PDF" to export', 'info');
	    this.printCurrentResults();
	}

	/**
	 * Export all results as comprehensive CSV
	 */
	exportAllResultsAsCSV() {
	    if (Object.keys(this.testResults).length === 0) {
	        showNotification('No test results to export', 'warning');
	        return;
	    }

	    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
	    const filename = `CalypsoPy_AllResults_${timestamp}.csv`;

	    let csvContent = 'Test Name,Test ID,Status,Duration (ms),Timestamp\n';

	    Object.entries(this.testResults).forEach(([testId, result]) => {
	        csvContent += `"${result.test_name || testId}",${testId},${result.status},`;
	        csvContent += `${result.duration_ms || 0},"${result.timestamp || ''}"\n`;
	    });

	    // Create download
	    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
	    const url = window.URL.createObjectURL(blob);
	    const link = document.createElement('a');
	    link.href = url;
	    link.download = filename;
	    link.style.display = 'none';
	    document.body.appendChild(link);
	    link.click();
	    document.body.removeChild(link);
	    window.URL.revokeObjectURL(url);

	    showNotification(`Results exported: ${filename}`, 'success');
	}

	/**
	 * Export current test results in appropriate format
	 */
	exportCurrentResults() {
	    const testName = document.getElementById('resultsWindowTestName').textContent;
	    const testId = this.currentResultTestId;
	    const result = this.testResults[testId];

	    if (!result) {
	        showNotification('No results to export', 'warning');
	        return;
	    }

	    // Handle specific export formats based on test type
	    if (testId === 'link_training_time') {
	        this.exportLinkTrainingResults(result);
	    } else if (testId === 'link_retrain_count') {
	        this.exportLinkRetrainResults(result);
	    } else if (testId === 'pcie_discovery') {
	        this.exportPCIeDiscoveryResults(result);
	    } else if (testId === 'nvme_discovery') {
	        this.exportNVMeDiscoveryResults(result);
	    } else {
	        // Default JSON export
	        this.exportResultsAsJSON();
	    }
	}

	/**
	 * Export PCIe Discovery results
	 */
	exportPCIeDiscoveryResults(result) {
	    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
	    const filename = `CalypsoPy_PCIeDiscovery_${timestamp}.txt`;

	    let reportContent = '';
	    reportContent += '='.repeat(80) + '\n';
	    reportContent += 'CalypsoPy+ PCIe Discovery Report\n';
	    reportContent += '='.repeat(80) + '\n';
	    reportContent += `Report Generated: ${new Date().toLocaleString()}\n`;
	    reportContent += `Test Status: ${result.status.toUpperCase()}\n\n`;

	    if (result.devices) {
	        reportContent += `Total Devices: ${result.devices.length}\n\n`;

	        result.devices.forEach(device => {
	            reportContent += '-'.repeat(80) + '\n';
	            reportContent += `Device: ${device.device_description || device.device_class}\n`;
	            reportContent += `PCI Address: ${device.pci_address}\n`;
	            reportContent += `Vendor: ${device.vendor_name || 'Unknown'} (${device.vendor_id})\n`;
	            reportContent += `Device ID: ${device.device_id}\n`;

	            if (device.link_speed) {
	                reportContent += `Link Speed: ${device.link_speed}\n`;
	            }
	            if (device.link_width) {
	                reportContent += `Link Width: ${device.link_width}\n`;
	            }

	            reportContent += '\n';
	        });
	    }

	    reportContent += '='.repeat(80) + '\n';

	    // Download
	    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
	    const url = window.URL.createObjectURL(blob);
	    const link = document.createElement('a');
	    link.href = url;
	    link.download = filename;
	    link.style.display = 'none';
	    document.body.appendChild(link);
	    link.click();
	    document.body.removeChild(link);
	    window.URL.revokeObjectURL(url);

	    showNotification(`PCIe discovery results exported: ${filename}`, 'success');
	}

	/**
	 * Export NVMe Discovery results
	 */
	exportNVMeDiscoveryResults(result) {
	    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
	    const csvFilename = `CalypsoPy_NVMeDiscovery_${timestamp}.csv`;

	    let csvContent = 'Device,Model,Serial,PCI Address,Firmware,Namespaces,Total Size (GB),Temperature (C)\n';

	    if (result.controllers) {
	        result.controllers.forEach(controller => {
	            const sizeGB = controller.total_capacity_bytes ? (controller.total_capacity_bytes / 1e9).toFixed(2) : '0';
	            const temp = controller.smart_data?.temperature_celsius || 'N/A';

	            csvContent += `"${controller.device}","${controller.model}","${controller.serial_number}",`;
	            csvContent += `${controller.pci_address || 'N/A'},"${controller.firmware_revision}",`;
	            csvContent += `${controller.namespace_count},${sizeGB},${temp}\n`;
	        });
	    }

	    // Download CSV
	    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
	    const url = window.URL.createObjectURL(blob);
	    const link = document.createElement('a');
	    link.href = url;
	    link.download = csvFilename;
	    link.style.display = 'none';
	    document.body.appendChild(link);
	    link.click();
	    document.body.removeChild(link);
	    window.URL.revokeObjectURL(url);

	    showNotification(`NVMe discovery results exported: ${csvFilename}`, 'success');
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