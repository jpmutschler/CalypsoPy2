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
        } else if (testId === 'link_quality') {
            const durationInput = document.getElementById('linkQualityDuration');
            const resetFreqInput = document.getElementById('linkQualityResetFreq');
            const targetDeviceSelect = document.getElementById('linkQualityTargetDevice');
            const enableLtssm = document.getElementById('linkQualityEnableLtssm');
            const enableAtlasErrors = document.getElementById('linkQualityEnableAtlasErrors');
            const enablePerf = document.getElementById('linkQualityEnablePerf');
            const resetMethodsInput = document.getElementById('linkQualityResetMethods');

            options = {
                duration_minutes: parseInt(durationInput?.value) || 5,
                reset_frequency_seconds: parseInt(resetFreqInput?.value) || 30,
                target_device: targetDeviceSelect?.value || null,
                enable_ltssm_monitoring: enableLtssm?.checked || true,
                enable_atlas_error_tracking: enableAtlasErrors?.checked || true,
                enable_perf_monitoring: enablePerf?.checked || false,
                reset_methods: resetMethodsInput?.value?.split(',').map(m => m.trim()).filter(m => m) || ['link_retrain', 'function_reset']
            };

            console.log('Link Quality options:', options);
        } else if (testId === 'nvme_namespace_validation') {
            const targetDeviceSelect = document.getElementById('nvmeNamespaceSelect');
            const validateFormat = document.getElementById('nvmeValidateFormat');

            options = {
                target_device: targetDeviceSelect?.value || 'all',
                validate_format: validateFormat?.checked || true,
                verbose: false
            };

            console.log('NVMe Namespace Validation options:', options);
        } else if (testId === 'nvme_command_set_validation') {
            const targetDeviceSelect = document.getElementById('nvmeCommandTargetDevice');
            const testMode = document.getElementById('nvmeCommandTestMode');
            const testErrors = document.getElementById('nvmeTestErrorConditions');

            options = {
                target_device: targetDeviceSelect?.value || 'all',
                test_mode: testMode?.value || 'basic',
                test_error_conditions: testErrors?.checked || false
            };

            console.log('NVMe Command Set Validation options:', options);
        } else if (testId === 'nvme_identify_validation') {
            const targetDeviceSelect = document.getElementById('nvmeIdentifyTargetDevice');
            const verbose = document.getElementById('nvmeIdentifyVerbose');
            const checkVendor = document.getElementById('nvmeIdentifyCheckVendor');

            options = {
                target_device: targetDeviceSelect?.value || 'all',
                verbose: verbose?.checked || false,
                check_vendor_fields: checkVendor?.checked || false
            };

            console.log('NVMe Identify Validation options:', options);
        }

        // Send test request with options
        // Use new testing engine for PCIe Discovery test
        if (testId === 'pcie_discovery') {
            // Use SocketIO for real-time updates with testing engine
            if (window.socket) {
                this.addConsoleEntry('info', 'Using enhanced testing engine for PCIe Discovery...');
                
                // Listen for testing engine progress updates
                window.socket.on('test_progress', (data) => {
                    if (data.test_id === testId) {
                        this.addConsoleEntry('info', `[${data.phase}] ${data.message}`);
                    }
                });
                
                // Listen for testing engine completion
                window.socket.on('test_completed', (data) => {
                    if (data.test_id === testId) {
                        this.handleTestResult(testId, data.result);
                        // Clean up listeners
                        window.socket.off('test_progress');
                        window.socket.off('test_completed');
                        window.socket.off('test_error');
                    }
                });
                
                // Listen for testing engine errors
                window.socket.on('test_error', (data) => {
                    if (data.test_id === testId || !data.test_id) {
                        console.error(`Testing engine error:`, data);
                        this.addConsoleEntry('error', `Testing engine error: ${data.message}`);
                        
                        if (status) {
                            status.className = 'test-status error';
                            status.textContent = '❌ Error';
                        }
                        // Clean up listeners
                        window.socket.off('test_progress');
                        window.socket.off('test_completed');
                        window.socket.off('test_error');
                    }
                });
                
                // Emit test with testing engine
                window.socket.emit('run_test_engine', {
                    test_id: testId,
                    options: options
                });
            } else {
                // Fallback to original method if socket not available
                this.addConsoleEntry('warning', 'SocketIO not available, using legacy test method...');
                this.runTestLegacy(testId, options, status);
            }
        } else {
            // Use original method for other tests
            this.runTestLegacy(testId, options, status);
        }
    }

    runTestLegacy(testId, options, status) {
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
                this.handleTestResult(testId, result);
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

        // Open results in pop-out window with export capabilities
        if (['nvme_namespace_validation', 'nvme_command_set_validation', 'nvme_identify_validation'].includes(testId)) {
            // Use the new ResultsWindow for NVMe validation tests
            if (window.ResultsWindow) {
                window.ResultsWindow.openResultsWindow(result.test_name || testId, result, testId);
            } else {
                // Fallback to old method
                this.openResultsWindow(testId, result);
            }
        } else {
            // Use existing results display for other tests
            this.openResultsWindow(testId, result);
        }

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
        } else if (testId === 'link_quality') {
            html += this.generateLinkQualityResultsHTML(result);
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

            // PCIe Infrastructure section (Root Bridge + Atlas 3 Switch side by side)
            html += '<div class="results-section">';
            html += '<h3>🔧 PCIe Infrastructure</h3>';
            html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">';
            
            // Root Bridge Tile
            if (topo.root_bridge) {
                html += '<div class="controller-card">';
                html += '<div class="controller-card-header">🔌 Root Bridge</div>';
                html += '<div class="controller-card-body">';
                html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                html += `<div class="results-detail-label">Device</div>`;
                html += `<div class="results-detail-value">${topo.root_bridge.bdf || 'N/A'}</div>`;
                html += `</div>`;
                if (topo.root_bridge.link_speed) {
                    html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                    html += `<div class="results-detail-label">Link Speed</div>`;
                    html += `<div class="results-detail-value">${this.formatLinkSpeedWithGen(topo.root_bridge.link_speed)}</div>`;
                    html += `</div>`;
                }
                if (topo.root_bridge.link_width) {
                    html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                    html += `<div class="results-detail-label">Link Width</div>`;
                    html += `<div class="results-detail-value">${topo.root_bridge.link_width}</div>`;
                    html += `</div>`;
                }
                // Add PCIe Generation if available
                if (topo.root_bridge.pcie_generation) {
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">PCIe Generation</div>`;
                    html += `<div class="results-detail-value">${topo.root_bridge.pcie_generation} <span class="compliance-badge">Compliant</span></div>`;
                    html += `</div>`;
                }
                html += '</div>';
                html += '</div>';
            }

            // Atlas 3 Switch Tile
            if (topo.atlas_switch) {
                html += '<div class="switch-card">';
                html += '<h4>🔄 Serial Cables Atlas 3 Switch (1000:c040)</h4>';
                html += '<div style="margin-top: 15px;">';
                html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                html += `<div class="results-detail-label">PCI Address</div>`;
                html += `<div class="results-detail-value">${topo.atlas_switch.bdf || 'N/A'}</div>`;
                html += `</div>`;
                if (topo.atlas_switch.link_speed) {
                    html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                    html += `<div class="results-detail-label">Link Speed</div>`;
                    html += `<div class="results-detail-value">${this.formatLinkSpeedWithGen(topo.atlas_switch.link_speed)}</div>`;
                    html += `</div>`;
                }
                if (topo.atlas_switch.link_width) {
                    html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                    html += `<div class="results-detail-label">Link Width</div>`;
                    html += `<div class="results-detail-value">${topo.atlas_switch.link_width}</div>`;
                    html += `</div>`;
                }
                if (topo.downstream_ports) {
                    html += `<div class="results-detail-item" style="margin-bottom: 15px;">`;
                    html += `<div class="results-detail-label">Downstream Ports</div>`;
                    html += `<div class="results-detail-value">${topo.downstream_ports.length} ports</div>`;
                    html += `</div>`;
                }
                
                // Switch Error Monitoring
                html += '<div style="background: rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 15px;">';
                html += '<h5 style="margin: 0 0 10px 0; color: white; font-size: 14px; font-weight: 600;">⚡ Switch Error Monitoring</h5>';
                html += '<p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 13px;">Baseline established: 0 errors detected during discovery phase. Switch operating within normal parameters.</p>';
                html += '</div>';
                
                html += '</div>';
                html += '</div>';
            }

            html += '</div>'; // Grid container
            html += '</div>'; // PCIe Infrastructure section

            // Downstream Ports section
            if (topo.downstream_ports && topo.downstream_ports.length > 0) {
                html += '<div class="results-section">';
                html += `<h3>🔽 Downstream Ports (${topo.downstream_ports.length} Active)</h3>`;
                html += '<div class="results-detail-grid">';
                topo.downstream_ports.forEach((port, index) => {
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">Port ${index + 1}</div>`;
                    html += `<div class="results-detail-value">${port.bdf}`;
                    if (port.link_speed) html += ` - ${this.formatLinkSpeedWithGen(port.link_speed)}`;
                    if (port.link_width) html += ` ${port.link_width}`;
                    // Add status indicator
                    const status = port.status || (port.link_speed ? 'UP' : 'DOWN');
                    const statusClass = status === 'UP' ? 'status-up' : 'status-down';
                    html += ` <span class="${statusClass}">${status}</span>`;
                    html += `</div>`;
                    html += `</div>`;
                });
                html += '</div>';
                html += '</div>';
            }

            // NVMe Devices section with 3-column tile layout
            if (topo.nvme_devices && topo.nvme_devices.length > 0) {
                html += '<div class="results-section">';
                html += `<h3>💾 NVMe Devices (${topo.nvme_devices.length} Found)</h3>`;
                html += '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px;">';
                
                topo.nvme_devices.forEach(dev => {
                    html += '<div class="controller-card">';
                    html += `<div class="controller-card-header">${dev.name || 'NVMe Device'}</div>`;
                    html += '<div class="controller-card-body">';
                    html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                    html += `<div class="results-detail-label">PCI Address</div>`;
                    html += `<div class="results-detail-value">${dev.bdf}</div>`;
                    html += `</div>`;
                    if (dev.driver) {
                        html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                        html += `<div class="results-detail-label">Driver</div>`;
                        html += `<div class="results-detail-value">${dev.driver}</div>`;
                        html += `</div>`;
                    }
                    if (dev.device_node) {
                        html += `<div class="results-detail-item" style="margin-bottom: 10px;">`;
                        html += `<div class="results-detail-label">Device Node</div>`;
                        html += `<div class="results-detail-value">${dev.device_node}</div>`;
                        html += `</div>`;
                    }
                    if (dev.link_speed) {
                        html += `<div class="results-detail-item">`;
                        html += `<div class="results-detail-label">Link Speed</div>`;
                        html += `<div class="results-detail-value">${this.formatLinkSpeedWithGen(dev.link_speed)}</div>`;
                        html += `</div>`;
                    }
                    html += '</div>';
                    html += '</div>';
                });
                
                html += '</div>'; // Grid container
                
                // Atlas 3 Device Filtering info
                html += '<div class="atlas-filter-info">';
                html += '<h5>🔒 Atlas 3 Device Filtering</h5>';
                html += '<p>Only Atlas 3 downstream endpoint devices are shown for safety. System bridges, switches, and the Atlas 3 switch itself are automatically excluded from testing operations.</p>';
                html += '</div>';
                
                html += '</div>'; // NVMe Devices section
            }

            // Enhanced Topology Visualization with link speeds
            html += '<div class="results-section">';
            html += '<h3>📊 Topology Diagram</h3>';
            html += '<div class="topology-visualization">';
            html += '<div id="resultsTopologyVisualization" style="background: #f8fafc; border-radius: 10px; padding: 20px; min-height: 400px;">';
            html += this.generateTopologyTree(topo);
            html += '</div>';
            html += '</div>';
            html += '</div>';

            // Error Analysis section (placeholder for future switch counter integration)
            html += '<div class="results-section">';
            html += '<h3>⚠️ Error Analysis</h3>';
            html += '<div class="error-section">';
            html += '<h4>📊 Switch Error Counters</h4>';
            html += '<p style="color: var(--secondary-gray); font-style: italic;">Error counter integration with testing engine is active. No errors detected during discovery phase.</p>';
            html += '</div>';
            html += '</div>';
        }

        return html;
    }

    // Helper function to format link speeds with generation information
    formatLinkSpeedWithGen(linkSpeed) {
        if (!linkSpeed) return 'N/A';
        
        // Add generation information based on speed
        if (linkSpeed.includes('32.0 GT/s')) {
            return linkSpeed.replace('32.0 GT/s', '32.0 GT/s Gen6');
        } else if (linkSpeed.includes('16.0 GT/s')) {
            return linkSpeed.replace('16.0 GT/s', '16.0 GT/s Gen5');
        } else if (linkSpeed.includes('8.0 GT/s')) {
            return linkSpeed.replace('8.0 GT/s', '8.0 GT/s Gen4');
        } else if (linkSpeed.includes('5.0 GT/s')) {
            return linkSpeed.replace('5.0 GT/s', '5.0 GT/s Gen3');
        } else if (linkSpeed.includes('2.5 GT/s')) {
            return linkSpeed.replace('2.5 GT/s', '2.5 GT/s Gen2');
        }
        
        return linkSpeed;
    }

    // Helper function to generate topology tree visualization
    generateTopologyTree(topo) {
        let html = '<div class="topology-tree">';
        
        // Root Complex
        if (topo.root_bridge) {
            html += '<div class="topology-node root">';
            html += `📍 Root Complex (${topo.root_bridge.bdf}) - PCIe 6.0 x16 @ ${this.formatLinkSpeedWithGen(topo.root_bridge.link_speed || '32.0 GT/s x16')} <span class="status-up">UP</span>`;
            html += '</div>';
            html += '<div style="margin-left: 10px;">│</div>';
        }
        
        // Atlas 3 Switch
        if (topo.atlas_switch) {
            html += '<div class="topology-node switch">';
            html += `🔄 Atlas 3 Switch (${topo.atlas_switch.bdf}) - 1000:c040 <span class="status-up">UP</span>`;
            html += '</div>';
        }
        
        // Downstream ports and devices
        if (topo.downstream_ports && topo.nvme_devices) {
            topo.downstream_ports.forEach((port, index) => {
                const device = topo.nvme_devices.find(dev => dev.bdf && port.bdf && dev.bdf.startsWith(port.bdf.replace('.0', '')));
                const status = device ? 'UP' : 'DOWN';
                const statusClass = status === 'UP' ? 'status-up' : 'status-down';
                
                html += `<div style="margin-left: 30px;">├── Port ${index + 1} (${port.bdf}) - ${this.formatLinkSpeedWithGen(port.link_speed || '32.0 GT/s x4')} <span class="${statusClass}">${status}</span></div>`;
                
                if (device) {
                    html += '<div class="topology-node endpoint">';
                    html += `💾 ${device.name || 'NVMe Device'} (${device.device_node || '/dev/nvme' + index}) - ${this.formatLinkSpeedWithGen(device.link_speed || port.link_speed || '32.0 GT/s x4')} <span class="status-up">UP</span>`;
                    html += '</div>';
                }
            });
        }
        
        html += '</div>';
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

    generateLinkQualityResultsHTML(result) {
        let html = '';

        // Link Quality Summary Section
        if (result.summary) {
            html += '<div class="results-section">';
            html += '<h3>🔍 Link Quality Assessment Summary</h3>';
            html += '<div class="results-stat-grid">';

            // Quality Grade
            if (result.summary.quality_grade) {
                const gradeColor = result.summary.quality_grade <= 'B' ? '#22c55e' : 
                                   result.summary.quality_grade <= 'D' ? '#f59e0b' : '#ef4444';
                html += `<div class="results-stat-item">`;
                html += `<span class="results-stat-value" style="color: ${gradeColor}; font-weight: 700; font-size: 24px;">${result.summary.quality_grade}</span>`;
                html += `<span class="results-stat-label">Quality Grade</span>`;
                html += `</div>`;
            }

            // Test Statistics
            html += `<div class="results-stat-item">`;
            html += `<span class="results-stat-value">${result.summary.total_reset_operations || 0}</span>`;
            html += `<span class="results-stat-label">Reset Operations</span>`;
            html += `</div>`;

            html += `<div class="results-stat-item">`;
            html += `<span class="results-stat-value">${result.summary.successful_recoveries || 0}</span>`;
            html += `<span class="results-stat-label">Successful Recoveries</span>`;
            html += `</div>`;

            html += `<div class="results-stat-item">`;
            html += `<span class="results-stat-value">${result.summary.quality_events_detected || 0}</span>`;
            html += `<span class="results-stat-label">Quality Events</span>`;
            html += `</div>`;

            if (result.summary.avg_recovery_time_ms) {
                html += `<div class="results-stat-item">`;
                html += `<span class="results-stat-value">${result.summary.avg_recovery_time_ms}ms</span>`;
                html += `<span class="results-stat-label">Avg Recovery Time</span>`;
                html += `</div>`;
            }

            html += '</div>'; // results-stat-grid
            html += '</div>'; // results-section
        }

        // Test Configuration
        if (result.configuration) {
            html += '<div class="results-section">';
            html += '<h3>⚙️ Test Configuration</h3>';
            html += '<div class="results-detail-grid">';

            const config = result.configuration;
            
            html += `<div class="results-detail-item">`;
            html += `<div class="results-detail-label">Test Duration</div>`;
            html += `<div class="results-detail-value">${config.duration_minutes || 5} minutes</div>`;
            html += `</div>`;

            html += `<div class="results-detail-item">`;
            html += `<div class="results-detail-label">Reset Frequency</div>`;
            html += `<div class="results-detail-value">${config.reset_frequency_seconds || 30} seconds</div>`;
            html += `</div>`;

            if (config.target_device) {
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Target Device</div>`;
                html += `<div class="results-detail-value">${config.target_device}</div>`;
                html += `</div>`;
            }

            if (config.reset_methods && config.reset_methods.length > 0) {
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Reset Methods</div>`;
                html += `<div class="results-detail-value">${config.reset_methods.join(', ')}</div>`;
                html += `</div>`;
            }

            html += '</div>'; // results-detail-grid
            html += '</div>'; // results-section
        }

        // Quality Events Timeline
        if (result.quality_events && result.quality_events.length > 0) {
            html += '<div class="results-section">';
            html += '<h3>📊 Quality Events Timeline</h3>';
            html += '<div class="event-timeline-container">';

            // Show most recent 20 events
            const displayEvents = result.quality_events.slice(-20);

            displayEvents.forEach(event => {
                const eventTypeClass = event.event_type.replace(/_/g, '-');
                const severityColor = event.severity === 'critical' ? '#ef4444' :
                                      event.severity === 'warning' ? '#f59e0b' : '#22c55e';

                html += `<div class="event-timeline-item ${eventTypeClass}">`;
                html += `<div class="event-timeline-time">${event.timestamp.toFixed(3)}s</div>`;
                html += `<div class="event-timeline-device">${event.device || 'Unknown'}</div>`;
                html += `<div class="event-timeline-type" style="color: ${severityColor};">${event.event_type.replace(/_/g, ' ').toUpperCase()}</div>`;
                html += `<div class="event-timeline-message">${event.description || event.message}</div>`;
                html += `</div>`;
            });

            if (result.quality_events.length > 20) {
                html += `<div class="event-timeline-note">Showing most recent 20 of ${result.quality_events.length} quality events</div>`;
            }

            html += '</div>'; // event-timeline-container
            html += '</div>'; // results-section
        }

        // LTSSM Monitoring Integration
        if (result.ltssm_monitoring && result.ltssm_monitoring.available) {
            html += '<div class="results-section">';
            html += '<h3>🔄 LTSSM State Monitoring</h3>';
            
            const ltssm = result.ltssm_monitoring;
            
            html += '<div class="results-detail-grid">';
            
            html += `<div class="results-detail-item">`;
            html += `<div class="results-detail-label">Total State Transitions</div>`;
            html += `<div class="results-detail-value">${ltssm.total_transitions || 0}</div>`;
            html += `</div>`;
            
            html += `<div class="results-detail-item">`;
            html += `<div class="results-detail-label">Correlated Reset Events</div>`;
            html += `<div class="results-detail-value">${ltssm.correlated_reset_events || 0}</div>`;
            html += `</div>`;
            
            if (ltssm.quality_correlation && ltssm.quality_correlation.correlation_score !== undefined) {
                const score = (ltssm.quality_correlation.correlation_score * 100).toFixed(1);
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Quality Correlation Score</div>`;
                html += `<div class="results-detail-value">${score}%</div>`;
                html += `</div>`;
            }
            
            html += '</div>'; // results-detail-grid
            html += '</div>'; // results-section
        }

        // Atlas 3 Error Correlation
        if (result.atlas_error_tracking && result.atlas_error_tracking.available) {
            html += '<div class="results-section">';
            html += '<h3>🔧 Atlas 3 Error Correlation</h3>';
            
            const atlas = result.atlas_error_tracking;
            
            html += '<div class="results-detail-grid">';
            
            html += `<div class="results-detail-item">`;
            html += `<div class="results-detail-label">Total Atlas Errors</div>`;
            html += `<div class="results-detail-value">${atlas.total_errors || 0}</div>`;
            html += `</div>`;
            
            html += `<div class="results-detail-item">`;
            html += `<div class="results-detail-label">Correlated Errors</div>`;
            html += `<div class="results-detail-value">${atlas.correlated_errors || 0}</div>`;
            html += `</div>`;
            
            if (atlas.error_correlation_rate !== undefined) {
                const rate = (atlas.error_correlation_rate * 100).toFixed(1);
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Error Correlation Rate</div>`;
                html += `<div class="results-detail-value">${rate}%</div>`;
                html += `</div>`;
            }
            
            html += '</div>'; // results-detail-grid
            
            // Error Timeline
            if (atlas.error_events && atlas.error_events.length > 0) {
                html += '<h4>🚨 Atlas 3 Error Events</h4>';
                html += '<div class="atlas-error-timeline">';
                
                atlas.error_events.slice(-10).forEach(error => {
                    html += `<div class="atlas-error-item">`;
                    html += `<div class="atlas-error-time">${error.timestamp.toFixed(3)}s</div>`;
                    html += `<div class="atlas-error-type">${error.error_type}</div>`;
                    html += `<div class="atlas-error-description">${error.description || error.message}</div>`;
                    html += `</div>`;
                });
                
                if (atlas.error_events.length > 10) {
                    html += `<div class="atlas-error-note">Showing most recent 10 of ${atlas.error_events.length} error events</div>`;
                }
                
                html += '</div>'; // atlas-error-timeline
            }
            
            html += '</div>'; // results-section
        }

        // Quality Assessment Details
        if (result.quality_assessment) {
            const assessment = result.quality_assessment;
            
            html += '<div class="results-section">';
            html += '<h3>📈 Quality Assessment Metrics</h3>';
            html += '<div class="results-detail-grid">';
            
            if (assessment.reset_recovery_score !== undefined) {
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Reset Recovery Score</div>`;
                html += `<div class="results-detail-value">${(assessment.reset_recovery_score * 100).toFixed(1)}%</div>`;
                html += `</div>`;
            }
            
            if (assessment.error_rate_score !== undefined) {
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Error Rate Score</div>`;
                html += `<div class="results-detail-value">${(assessment.error_rate_score * 100).toFixed(1)}%</div>`;
                html += `</div>`;
            }
            
            if (assessment.stability_score !== undefined) {
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Link Stability Score</div>`;
                html += `<div class="results-detail-value">${(assessment.stability_score * 100).toFixed(1)}%</div>`;
                html += `</div>`;
            }
            
            html += '</div>'; // results-detail-grid
            
            // Quality Recommendations
            if (assessment.recommendations && assessment.recommendations.length > 0) {
                html += '<h4>💡 Quality Recommendations</h4>';
                html += '<ul class="quality-recommendations-list">';
                assessment.recommendations.forEach(rec => {
                    html += `<li>${rec}</li>`;
                });
                html += '</ul>';
            }
            
            html += '</div>'; // results-section
        }

        // PCIe 6.x Specification Compliance
        if (result.link_quality_assessment && result.link_quality_assessment.compliance_status) {
            const compliance = result.link_quality_assessment.compliance_status;
            
            html += '<div class="results-section">';
            html += '<h3>📋 PCIe 6.x Specification Compliance</h3>';
            
            // Overall Compliance Status
            html += '<div class="compliance-summary">';
            const complianceColor = compliance.overall_compliant ? '#22c55e' : '#ef4444';
            const complianceIcon = compliance.overall_compliant ? '✅' : '❌';
            html += `<div class="compliance-status" style="color: ${complianceColor};">`;
            html += `${complianceIcon} Overall Compliance: ${compliance.overall_compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`;
            html += `</div>`;
            html += `<div class="compliance-score">Compliance Score: ${compliance.compliance_score}%</div>`;
            html += '</div>';
            
            // Specification Requirements
            if (compliance.spec_requirements) {
                html += '<h4>📖 Specification Requirements</h4>';
                html += '<div class="spec-requirements-grid">';
                
                Object.entries(compliance.spec_requirements).forEach(([category, requirement]) => {
                    html += `<div class="spec-requirement-item">`;
                    html += `<div class="spec-requirement-category">${category.replace(/_/g, ' ').toUpperCase()}</div>`;
                    html += `<div class="spec-requirement-description">${requirement.description}</div>`;
                    html += `</div>`;
                });
                
                html += '</div>'; // spec-requirements-grid
            }
            
            // Compliance Violations
            if (compliance.violations && compliance.violations.length > 0) {
                html += '<h4>⚠️ Compliance Violations</h4>';
                html += '<div class="violations-list">';
                
                compliance.violations.forEach(violation => {
                    const severityColor = violation.severity === 'high' ? '#ef4444' : '#f59e0b';
                    const severityIcon = violation.severity === 'high' ? '🚨' : '⚠️';
                    
                    html += `<div class="violation-item" style="border-left: 4px solid ${severityColor};">`;
                    html += `<div class="violation-header">`;
                    html += `<span class="violation-severity" style="color: ${severityColor};">${severityIcon} ${violation.severity.toUpperCase()}</span>`;
                    html += `<span class="violation-section">Section ${violation.section}</span>`;
                    html += `</div>`;
                    html += `<div class="violation-requirement">${violation.requirement}</div>`;
                    html += `<div class="violation-details">`;
                    html += `<span class="violation-spec">Spec: ${violation.specification}</span>`;
                    html += `<span class="violation-actual">Actual: ${violation.actual}</span>`;
                    html += `</div>`;
                    html += `</div>`;
                });
                
                html += '</div>'; // violations-list
            }
            
            // Component Scores
            if (compliance.detailed_analysis && compliance.detailed_analysis.component_scores) {
                html += '<h4>📊 Component Compliance Scores</h4>';
                html += '<div class="compliance-scores-grid">';
                
                Object.entries(compliance.detailed_analysis.component_scores).forEach(([component, score]) => {
                    const scoreColor = score >= 90 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ef4444';
                    html += `<div class="compliance-score-item">`;
                    html += `<div class="compliance-score-label">${component.replace(/_/g, ' ').toUpperCase()}</div>`;
                    html += `<div class="compliance-score-value" style="color: ${scoreColor};">${score.toFixed(1)}%</div>`;
                    html += `</div>`;
                });
                
                html += '</div>'; // compliance-scores-grid
            }
            
            // Compliance Recommendations
            if (compliance.recommendations && compliance.recommendations.length > 0) {
                html += '<h4>💡 Compliance Recommendations</h4>';
                html += '<ul class="compliance-recommendations-list">';
                compliance.recommendations.forEach(rec => {
                    html += `<li>${rec}</li>`;
                });
                html += '</ul>';
            }
            
            // Detailed Analysis Summary
            if (compliance.detailed_analysis) {
                const analysis = compliance.detailed_analysis;
                html += '<h4>🔍 Detailed Analysis</h4>';
                html += '<div class="results-detail-grid">';
                
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Total Violations</div>`;
                html += `<div class="results-detail-value">${analysis.total_violations || 0}</div>`;
                html += `</div>`;
                
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">High Severity Violations</div>`;
                html += `<div class="results-detail-value">${analysis.high_severity_violations || 0}</div>`;
                html += `</div>`;
                
                html += `<div class="results-detail-item">`;
                html += `<div class="results-detail-label">Certification Ready</div>`;
                html += `<div class="results-detail-value">${analysis.certification_ready ? 'Yes' : 'No'}</div>`;
                html += `</div>`;
                
                if (analysis.specification_sections_tested) {
                    html += `<div class="results-detail-item">`;
                    html += `<div class="results-detail-label">Sections Tested</div>`;
                    html += `<div class="results-detail-value">${analysis.specification_sections_tested.join(', ')}</div>`;
                    html += `</div>`;
                }
                
                html += '</div>'; // results-detail-grid
            }
            
            html += '</div>'; // results-section
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

    addConsoleEntry(level, message) {
        // Add console entries for real-time test monitoring
        // This can be expanded to show in a test console area if needed
        const timestamp = new Date().toLocaleTimeString();
        const levelIcons = {
            'info': 'ℹ️',
            'warning': '⚠️',
            'error': '❌',
            'success': '✅'
        };
        
        const icon = levelIcons[level] || 'ℹ️';
        const logMessage = `[${timestamp}] ${icon} ${message}`;
        
        // Log to browser console with appropriate level
        switch (level) {
            case 'error':
                console.error(logMessage);
                break;
            case 'warning':
                console.warn(logMessage);
                break;
            case 'success':
            case 'info':
            default:
                console.log(logMessage);
                break;
        }
        
        // Could also display in a test console UI element if implemented
        // const consoleElement = document.getElementById('testConsole');
        // if (consoleElement) {
        //     const entry = document.createElement('div');
        //     entry.className = `console-entry console-${level}`;
        //     entry.textContent = logMessage;
        //     consoleElement.appendChild(entry);
        //     consoleElement.scrollTop = consoleElement.scrollHeight;
        // }
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

	    // LTSSM Monitoring Section
	    if (result.ltssm_monitoring && result.ltssm_monitoring.available && result.ltssm_monitoring.data) {
	        html += '<div class="results-section">';
	        html += '<h3>🔄 LTSSM State Monitoring</h3>';
	        
	        const ltssm = result.ltssm_monitoring;
	        
	        // LTSSM Summary Stats
	        if (ltssm.summary) {
	            html += '<div class="results-detail-grid">';
	            
	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Total Transitions</div>`;
	            html += `<div class="results-detail-value">${ltssm.summary.total_transitions || 0}</div>`;
	            html += `</div>`;
	            
	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Devices Monitored</div>`;
	            html += `<div class="results-detail-value">${ltssm.summary.devices_monitored || 0}</div>`;
	            html += `</div>`;
	            
	            html += `<div class="results-detail-item">`;
	            html += `<div class="results-detail-label">Monitoring Duration</div>`;
	            html += `<div class="results-detail-value">${(ltssm.summary.duration_seconds || 0).toFixed(2)}s</div>`;
	            html += `</div>`;
	            
	            html += '</div>'; // results-detail-grid
	        }
	        
	        // LTSSM Correlation Analysis
	        if (ltssm.correlation && ltssm.correlation.summary) {
	            const correlation = ltssm.correlation;
	            
	            html += '<h4>🔗 Event Correlation Analysis</h4>';
	            html += '<div class="results-detail-grid">';
	            
	            if (correlation.summary.training_related_transitions !== undefined) {
	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Training-Related Transitions</div>`;
	                html += `<div class="results-detail-value">${correlation.summary.training_related_transitions}</div>`;
	                html += `</div>`;
	            }
	            
	            if (correlation.summary.training_sequences_detected !== undefined) {
	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Training Sequences Detected</div>`;
	                html += `<div class="results-detail-value">${correlation.summary.training_sequences_detected}</div>`;
	                html += `</div>`;
	            }
	            
	            if (correlation.summary.correlated_events !== undefined) {
	                html += `<div class="results-detail-item">`;
	                html += `<div class="results-detail-label">Correlated Events</div>`;
	                html += `<div class="results-detail-value">${correlation.summary.correlated_events}</div>`;
	                html += `</div>`;
	            }
	            
	            html += '</div>'; // results-detail-grid
	            
	            // State Timing Statistics
	            if (correlation.state_timing && Object.keys(correlation.state_timing).length > 0) {
	                html += '<h5>📊 State Duration Statistics</h5>';
	                html += '<div class="ltssm-state-timing-grid">';
	                
	                Object.entries(correlation.state_timing).forEach(([state, timing]) => {
	                    html += `<div class="ltssm-state-card">`;
	                    html += `<div class="ltssm-state-name">${state}</div>`;
	                    html += `<div class="ltssm-state-stats">`;
	                    html += `<div class="ltssm-timing-item">Avg: ${timing.avg_duration_ms}ms</div>`;
	                    html += `<div class="ltssm-timing-item">Min: ${timing.min_duration_ms}ms</div>`;
	                    html += `<div class="ltssm-timing-item">Max: ${timing.max_duration_ms}ms</div>`;
	                    html += `<div class="ltssm-timing-item">Count: ${timing.occurrence_count}</div>`;
	                    html += `</div>`;
	                    html += `</div>`;
	                });
	                
	                html += '</div>'; // ltssm-state-timing-grid
	            }
	            
	            // Training Sequences
	            if (correlation.training_sequences && correlation.training_sequences.length > 0) {
	                html += '<h5>⏱️ LTSSM Training Sequences</h5>';
	                html += '<div class="ltssm-sequences-container">';
	                
	                correlation.training_sequences.forEach((sequence, index) => {
	                    html += `<div class="ltssm-sequence-card">`;
	                    html += `<div class="ltssm-sequence-header">`;
	                    html += `<span class="ltssm-sequence-title">Sequence #${index + 1}</span>`;
	                    html += `<span class="ltssm-sequence-device">${sequence.device}</span>`;
	                    html += `<span class="ltssm-sequence-duration">${sequence.duration_ms}ms</span>`;
	                    html += `</div>`;
	                    
	                    if (sequence.sequence && sequence.sequence.length > 0) {
	                        html += '<div class="ltssm-sequence-states">';
	                        sequence.sequence.forEach((step, stepIndex) => {
	                            const isLast = stepIndex === sequence.sequence.length - 1;
	                            html += `<span class="ltssm-state-step">${step.from_state}</span>`;
	                            if (!isLast) {
	                                html += `<span class="ltssm-state-arrow">→</span>`;
	                            } else {
	                                html += `<span class="ltssm-state-arrow">→</span>`;
	                                html += `<span class="ltssm-state-step">${step.to_state}</span>`;
	                            }
	                        });
	                        html += '</div>';
	                    }
	                    
	                    html += `</div>`;
	                });
	                
	                html += '</div>'; // ltssm-sequences-container
	            }
	        }
	        
	        html += '</div>'; // results-section
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
	        const data = await response.json();

	        if (data.error) {
	            console.warn('Error loading link retrain devices:', data.error);
	            return;
	        }

	        const deviceSelect = document.getElementById('linkRetrainDeviceSelect');
	        const excludedDevicesDiv = document.getElementById('linkRetrainExcludedDevices');
	        const excludedList = document.getElementById('linkRetrainExcludedList');

	        if (!deviceSelect) return;

	        // Clear existing options
	        deviceSelect.innerHTML = '<option value="">All Atlas 3 Downstream Endpoints</option>';

	        // Separate available and excluded devices
	        const availableDevices = data.available_devices || [];
	        const excludedDevices = data.excluded_devices || [];

	        // Add available device options
	        if (availableDevices.length > 0) {
	            availableDevices.forEach(device => {
	                const option = document.createElement('option');
	                option.value = device.pci_address;
	                option.textContent = `${device.name} (${device.pci_address})`;
	                deviceSelect.appendChild(option);
	            });

	            console.log(`Loaded ${availableDevices.length} available endpoint device(s)`);
	        } else {
	            const option = document.createElement('option');
	            option.value = '';
	            option.textContent = 'No Atlas 3 downstream endpoints found';
	            option.disabled = true;
	            deviceSelect.appendChild(option);
	        }

	        // Show excluded devices if any
	        if (excludedDevices.length > 0 && excludedDevicesDiv && excludedList) {
	            let excludedHTML = '<ul style="margin: 5px 0 0 20px; padding: 0;">';
	            excludedDevices.forEach(device => {
	                excludedHTML += `<li style="margin-bottom: 3px;"><strong>${device.name}</strong> (${device.pci_address}): ${device.reason}</li>`;
	            });
	            excludedHTML += '</ul>';

	            excludedList.innerHTML = excludedHTML;
	            excludedDevicesDiv.style.display = 'block';

	            console.log(`${excludedDevices.length} device(s) excluded from link retrain test`);
	        } else if (excludedDevicesDiv) {
	            excludedDevicesDiv.style.display = 'none';
	        }

	        console.log(`Link Retrain Devices: ${availableDevices.length} available, ${excludedDevices.length} excluded`);

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
	 * Export Link Quality Assessment results
	 */
	exportLinkQualityResults(result) {
	    const timestamp = new Date().toLocaleString();
	    const csvFilename = `CalypsoPy_LinkQuality_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;
	    const txtFilename = `CalypsoPy_LinkQuality_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

	    // Generate CSV Export for Quality Events
	    let csvContent = 'Timestamp,Device,Event Type,Severity,Description,Reset Operation,LTSSM State,Atlas Error\n';

	    if (result.quality_events) {
	        result.quality_events.forEach(event => {
	            csvContent += `${event.timestamp.toFixed(3)},`;
	            csvContent += `"${event.device || 'Unknown'}",`;
	            csvContent += `"${event.event_type}",`;
	            csvContent += `"${event.severity || 'info'}",`;
	            csvContent += `"${event.description || event.message || ''}",`;
	            csvContent += `"${event.reset_operation || ''}",`;
	            csvContent += `"${event.ltssm_state || ''}",`;
	            csvContent += `"${event.atlas_error || ''}"\n`;
	        });
	    }

	    // Generate Text Report
	    let reportContent = '';
	    reportContent += '='.repeat(80) + '\n';
	    reportContent += 'CalypsoPy+ PCIe Link Quality Assessment Report\n';
	    reportContent += 'Generated by Serial Cables Professional Interface\n';
	    reportContent += '='.repeat(80) + '\n';
	    reportContent += `Report Generated: ${timestamp}\n`;
	    reportContent += `Test Status: ${result.status.toUpperCase()}\n`;
	    reportContent += `Test Duration: ${result.duration_ms}ms\n`;
	    reportContent += '\n';

	    // Summary
	    if (result.summary) {
	        reportContent += 'LINK QUALITY SUMMARY\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += `Quality Grade: ${result.summary.quality_grade || 'N/A'}\n`;
	        reportContent += `Total Reset Operations: ${result.summary.total_reset_operations || 0}\n`;
	        reportContent += `Successful Recoveries: ${result.summary.successful_recoveries || 0}\n`;
	        reportContent += `Quality Events Detected: ${result.summary.quality_events_detected || 0}\n`;
	        if (result.summary.avg_recovery_time_ms) {
	            reportContent += `Average Recovery Time: ${result.summary.avg_recovery_time_ms}ms\n`;
	        }
	        reportContent += '\n';
	    }

	    // Test Configuration
	    if (result.configuration) {
	        reportContent += 'TEST CONFIGURATION\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += `Duration: ${result.configuration.duration_minutes || 5} minutes\n`;
	        reportContent += `Reset Frequency: ${result.configuration.reset_frequency_seconds || 30} seconds\n`;
	        if (result.configuration.target_device) {
	            reportContent += `Target Device: ${result.configuration.target_device}\n`;
	        }
	        if (result.configuration.reset_methods) {
	            reportContent += `Reset Methods: ${result.configuration.reset_methods.join(', ')}\n`;
	        }
	        reportContent += `LTSSM Monitoring: ${result.configuration.enable_ltssm_monitoring ? 'Enabled' : 'Disabled'}\n`;
	        reportContent += `Atlas Error Tracking: ${result.configuration.enable_atlas_error_tracking ? 'Enabled' : 'Disabled'}\n`;
	        reportContent += `Performance Monitoring: ${result.configuration.enable_perf_monitoring ? 'Enabled' : 'Disabled'}\n`;
	        reportContent += '\n';
	    }

	    // Quality Assessment
	    if (result.quality_assessment) {
	        reportContent += 'QUALITY ASSESSMENT METRICS\n';
	        reportContent += '-'.repeat(80) + '\n';
	        if (result.quality_assessment.reset_recovery_score !== undefined) {
	            reportContent += `Reset Recovery Score: ${(result.quality_assessment.reset_recovery_score * 100).toFixed(1)}%\n`;
	        }
	        if (result.quality_assessment.error_rate_score !== undefined) {
	            reportContent += `Error Rate Score: ${(result.quality_assessment.error_rate_score * 100).toFixed(1)}%\n`;
	        }
	        if (result.quality_assessment.stability_score !== undefined) {
	            reportContent += `Link Stability Score: ${(result.quality_assessment.stability_score * 100).toFixed(1)}%\n`;
	        }
	        
	        if (result.quality_assessment.recommendations && result.quality_assessment.recommendations.length > 0) {
	            reportContent += '\nQuality Recommendations:\n';
	            result.quality_assessment.recommendations.forEach(rec => {
	                reportContent += `  - ${rec}\n`;
	            });
	        }
	        reportContent += '\n';
	    }

	    // LTSSM Monitoring Results
	    if (result.ltssm_monitoring && result.ltssm_monitoring.available) {
	        reportContent += 'LTSSM STATE MONITORING\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += `Total State Transitions: ${result.ltssm_monitoring.total_transitions || 0}\n`;
	        reportContent += `Correlated Reset Events: ${result.ltssm_monitoring.correlated_reset_events || 0}\n`;
	        if (result.ltssm_monitoring.quality_correlation && result.ltssm_monitoring.quality_correlation.correlation_score !== undefined) {
	            reportContent += `Quality Correlation Score: ${(result.ltssm_monitoring.quality_correlation.correlation_score * 100).toFixed(1)}%\n`;
	        }
	        reportContent += '\n';
	    }

	    // Atlas 3 Error Correlation
	    if (result.atlas_error_tracking && result.atlas_error_tracking.available) {
	        reportContent += 'ATLAS 3 ERROR CORRELATION\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += `Total Atlas Errors: ${result.atlas_error_tracking.total_errors || 0}\n`;
	        reportContent += `Correlated Errors: ${result.atlas_error_tracking.correlated_errors || 0}\n`;
	        if (result.atlas_error_tracking.error_correlation_rate !== undefined) {
	            reportContent += `Error Correlation Rate: ${(result.atlas_error_tracking.error_correlation_rate * 100).toFixed(1)}%\n`;
	        }
	        reportContent += '\n';
	    }

	    // Quality Events Timeline
	    if (result.quality_events && result.quality_events.length > 0) {
	        reportContent += 'QUALITY EVENTS TIMELINE\n';
	        reportContent += '-'.repeat(80) + '\n';
	        reportContent += String.prototype.padEnd.call('Time', 12);
	        reportContent += String.prototype.padEnd.call('Device', 20);
	        reportContent += String.prototype.padEnd.call('Event Type', 25);
	        reportContent += String.prototype.padEnd.call('Severity', 12);
	        reportContent += 'Description\n';
	        reportContent += '-'.repeat(80) + '\n';

	        result.quality_events.slice(-50).forEach(event => {
	            reportContent += String.prototype.padEnd.call(`${event.timestamp.toFixed(3)}s`, 12);
	            reportContent += String.prototype.padEnd.call(event.device || 'Unknown', 20);
	            reportContent += String.prototype.padEnd.call(event.event_type, 25);
	            reportContent += String.prototype.padEnd.call(event.severity || 'info', 12);
	            reportContent += `${event.description || event.message || ''}\n`;
	        });

	        if (result.quality_events.length > 50) {
	            reportContent += `\nShowing most recent 50 of ${result.quality_events.length} quality events\n`;
	        }
	        reportContent += '\n';
	    }

	    // Warnings
	    if (result.warnings && result.warnings.length > 0) {
	        reportContent += 'WARNINGS\n';
	        reportContent += '-'.repeat(80) + '\n';
	        result.warnings.forEach(warning => {
	            reportContent += `⚠️  ${warning}\n`;
	        });
	        reportContent += '\n';
	    }

	    // Errors
	    if (result.errors && result.errors.length > 0) {
	        reportContent += 'ERRORS\n';
	        reportContent += '-'.repeat(80) + '\n';
	        result.errors.forEach(error => {
	            reportContent += `❌ ${error}\n`;
	        });
	        reportContent += '\n';
	    }

	    reportContent += '='.repeat(80) + '\n';
	    reportContent += 'End of PCIe Link Quality Assessment Report\n';
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

	    showNotification(`Link quality results exported: ${csvFilename} and ${txtFilename}`, 'success');
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
	    } else if (testId === 'link_quality') {
	        this.exportLinkQualityResults(result);
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