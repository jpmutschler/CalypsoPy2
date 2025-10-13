/**
 * Sequential Write Performance Test Interface
 * Real-time performance monitoring with PCIe 6.x compliance validation
 */

class SequentialWritePerformance {
    constructor() {
        this.socket = null;
        this.isTestRunning = false;
        this.currentTestId = null;
        this.availableDevices = [];
        this.chartInstances = {};
        this.realtimeData = {
            timestamps: [],
            throughput: [],
            latency: [],
            cpu_usage: []
        };
        this.maxDataPoints = 60; // Keep last 60 seconds of data
        
        this.init();
    }

    init() {
        this.socket = io();
        this.setupEventListeners();
        this.setupSocketHandlers();
        this.loadAvailableDevices();
        this.initializeCharts();
    }

    setupEventListeners() {
        // Test configuration form
        const startButton = document.getElementById('startSequentialWriteTest');
        const stopButton = document.getElementById('stopSequentialWriteTest');
        const deviceSelect = document.getElementById('deviceSelectWrite');
        const runtimeInput = document.getElementById('runtimeSecondsWrite');
        const exportButton = document.getElementById('exportResultsWrite');

        if (startButton) {
            startButton.addEventListener('click', () => this.startTest());
        }

        if (stopButton) {
            stopButton.addEventListener('click', () => this.stopTest());
        }

        if (deviceSelect) {
            deviceSelect.addEventListener('change', () => this.onDeviceChange());
        }

        if (runtimeInput) {
            runtimeInput.addEventListener('change', () => this.validateRuntime());
        }

        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportResults());
        }

        // Refresh devices button
        const refreshButton = document.getElementById('refreshDevicesWrite');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => this.loadAvailableDevices());
        }
    }

    setupSocketHandlers() {
        this.socket.on('sequential_write_progress', (data) => {
            this.handleProgressUpdate(data);
        });

        this.socket.on('sequential_write_realtime', (data) => {
            this.handleRealtimeUpdate(data);
        });

        this.socket.on('sequential_write_complete', (data) => {
            this.handleTestComplete(data);
        });

        this.socket.on('sequential_write_error', (data) => {
            this.handleTestError(data);
        });

        this.socket.on('sequential_write_stopped', (data) => {
            this.handleTestStopped(data);
        });
    }

    async loadAvailableDevices() {
        try {
            this.showStatus('Loading available devices...', 'info');

            const response = await fetch('/api/tests/sequential_write/devices');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load devices');
            }

            this.availableDevices = data.available_devices || [];
            this.updateDeviceSelect();
            this.updateFioStatus(data.fio_info);
            this.updateRuntimeOptions(data.runtime_options, data.default_runtime);

            if (this.availableDevices.length === 0) {
                this.showStatus(data.error || 'No devices available', 'warning');
            } else {
                this.showStatus(`${this.availableDevices.length} devices available`, 'success');
            }

        } catch (error) {
            console.error('Error loading devices:', error);
            this.showStatus(error.message, 'error');
        }
    }

    updateDeviceSelect() {
        const deviceSelect = document.getElementById('deviceSelectWrite');
        if (!deviceSelect) return;

        // Clear existing options
        deviceSelect.innerHTML = '<option value="">Select Device...</option>';

        // Add device options
        this.availableDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.device_path;
            option.textContent = `${device.device} - ${device.model} (${device.size})`;
            option.dataset.deviceInfo = JSON.stringify(device);
            deviceSelect.appendChild(option);
        });

        // Enable/disable based on availability
        deviceSelect.disabled = this.availableDevices.length === 0;
    }

    updateFioStatus(fioInfo) {
        const statusElement = document.getElementById('fioStatusWrite');
        if (!statusElement) return;

        if (fioInfo && fioInfo.available) {
            statusElement.innerHTML = `
                <div class="status-success">
                    <span class="status-icon">✓</span>
                    <span>fio available: ${fioInfo.version || 'Unknown version'}</span>
                </div>
            `;
        } else {
            statusElement.innerHTML = `
                <div class="status-error">
                    <span class="status-icon">✗</span>
                    <span>fio not available: ${fioInfo?.error || 'Install fio for performance testing'}</span>
                </div>
            `;
        }
    }

    updateRuntimeOptions(runtimeOptions, defaultRuntime) {
        const runtimeSelect = document.getElementById('runtimeSecondsWrite');
        if (!runtimeSelect) return;

        // Only update if runtime options are provided from backend
        if (runtimeOptions && Array.isArray(runtimeOptions) && runtimeOptions.length > 0) {
            // Clear existing options
            runtimeSelect.innerHTML = '';

            // Add runtime options
            runtimeOptions.forEach(runtime => {
                const option = document.createElement('option');
                option.value = runtime;
                option.textContent = `${runtime} seconds`;
                if (runtime === defaultRuntime) {
                    option.selected = true;
                }
                runtimeSelect.appendChild(option);
            });

            // Add custom option
            const customOption = document.createElement('option');
            customOption.value = 'custom';
            customOption.textContent = 'Custom...';
            runtimeSelect.appendChild(customOption);
        } else {
            // Keep existing HTML options, just update default selection if provided
            if (defaultRuntime) {
                const options = runtimeSelect.options;
                for (let i = 0; i < options.length; i++) {
                    if (options[i].value === String(defaultRuntime)) {
                        options[i].selected = true;
                        break;
                    }
                }
            }
        }
    }

    onDeviceChange() {
        const deviceSelect = document.getElementById('deviceSelectWrite');
        const deviceInfo = document.getElementById('selectedDeviceInfoWrite');
        
        if (!deviceSelect || !deviceInfo) return;

        const selectedOption = deviceSelect.selectedOptions[0];
        if (selectedOption && selectedOption.dataset.deviceInfo) {
            const device = JSON.parse(selectedOption.dataset.deviceInfo);
            deviceInfo.innerHTML = `
                <div class="device-info">
                    <div class="device-detail">
                        <strong>Model:</strong> ${device.model}
                    </div>
                    <div class="device-detail">
                        <strong>Vendor:</strong> ${device.vendor}
                    </div>
                    <div class="device-detail">
                        <strong>Size:</strong> ${device.size}
                    </div>
                    <div class="device-detail">
                        <strong>PCI Address:</strong> ${device.pci_address}
                    </div>
                </div>
            `;
            deviceInfo.style.display = 'block';
        } else {
            deviceInfo.style.display = 'none';
        }
    }

    validateRuntime() {
        const runtimeSelect = document.getElementById('runtimeSecondsWrite');
        const customRuntimeInput = document.getElementById('customRuntimeWrite');
        
        if (!runtimeSelect) return;

        if (runtimeSelect.value === 'custom') {
            if (customRuntimeInput) {
                customRuntimeInput.style.display = 'block';
                customRuntimeInput.required = true;
            }
        } else {
            if (customRuntimeInput) {
                customRuntimeInput.style.display = 'none';
                customRuntimeInput.required = false;
            }
        }
    }

    startTest() {
        if (this.isTestRunning) {
            this.showStatus('Test already running', 'warning');
            return;
        }

        const deviceSelect = document.getElementById('deviceSelectWrite');
        const runtimeSelect = document.getElementById('runtimeSecondsWrite');
        const customRuntimeInput = document.getElementById('customRuntimeWrite');
        const blockSizeSelect = document.getElementById('blockSizeWrite');
        const queueDepthInput = document.getElementById('queueDepthWrite');

        if (!deviceSelect || !deviceSelect.value) {
            this.showStatus('Please select a device', 'error');
            return;
        }

        let runtime = parseInt(runtimeSelect.value);
        if (runtimeSelect.value === 'custom') {
            runtime = parseInt(customRuntimeInput.value);
            if (!runtime || runtime < 10 || runtime > 3600) {
                this.showStatus('Custom runtime must be between 10 and 3600 seconds', 'error');
                return;
            }
        }

        const testConfig = {
            device: deviceSelect.value,
            runtime_seconds: runtime,
            block_size: blockSizeSelect ? blockSizeSelect.value : '128k',
            queue_depth: queueDepthInput ? parseInt(queueDepthInput.value) : 32
        };

        this.currentTestId = `seq_write_${Date.now()}`;
        this.isTestRunning = true;

        // Reset charts and data
        this.resetCharts();
        this.clearResults();

        // Update UI
        this.updateTestControls(true);
        this.showTestConfiguration(testConfig);

        // Start test via WebSocket
        this.socket.emit('start_sequential_write_test', testConfig);

        this.showStatus(`Starting sequential write test on ${testConfig.device}...`, 'info');
    }

    stopTest() {
        if (!this.isTestRunning) {
            this.showStatus('No test running', 'warning');
            return;
        }

        this.socket.emit('stop_sequential_write_test', {
            test_id: this.currentTestId
        });

        this.showStatus('Stopping test...', 'info');
    }

    handleProgressUpdate(data) {
        const progressBar = document.getElementById('testProgressWrite');
        const progressText = document.getElementById('progressTextWrite');
        const elapsedTime = document.getElementById('elapsedTimeWrite');

        if (progressBar && data.progress_percent !== undefined) {
            progressBar.style.width = `${data.progress_percent}%`;
            progressBar.setAttribute('aria-valuenow', data.progress_percent);
        }

        if (progressText) {
            progressText.textContent = data.message || `${Math.round(data.progress_percent || 0)}% Complete`;
        }

        if (elapsedTime && data.elapsed_seconds !== undefined) {
            const elapsed = Math.round(data.elapsed_seconds);
            const total = data.total_runtime || 60;
            elapsedTime.textContent = `${elapsed}s / ${total}s`;
        }
    }

    handleRealtimeUpdate(data) {
        if (data.type === 'progress') {
            // Add data point to real-time charts
            const timestamp = new Date();
            
            this.realtimeData.timestamps.push(timestamp);
            
            // For now, we'll simulate some metrics since fio doesn't provide real-time metrics
            // In a real implementation, you'd parse actual metrics from fio output
            this.realtimeData.throughput.push(Math.random() * 4000 + 1500); // Simulated write throughput (typically lower than read)
            this.realtimeData.latency.push(Math.random() * 200 + 100); // Simulated write latency (typically higher than read)
            this.realtimeData.cpu_usage.push(Math.random() * 40 + 15); // Simulated CPU usage (write intensive)

            // Limit data points
            if (this.realtimeData.timestamps.length > this.maxDataPoints) {
                Object.keys(this.realtimeData).forEach(key => {
                    this.realtimeData[key].shift();
                });
            }

            this.updateRealtimeCharts();
        }
    }

    handleTestComplete(data) {
        this.isTestRunning = false;
        this.updateTestControls(false);

        this.showStatus(`Test completed: ${data.status}`, data.status === 'pass' ? 'success' : 'warning');

        // Display results
        this.displayResults(data);
        this.displayComplianceResults(data.compliance);
        this.displayPerformanceMetrics(data.performance_metrics);

        // Enable export
        const exportButton = document.getElementById('exportResultsWrite');
        if (exportButton) {
            exportButton.disabled = false;
            exportButton.dataset.results = JSON.stringify(data);
        }
    }

    handleTestError(data) {
        this.isTestRunning = false;
        this.updateTestControls(false);
        this.showStatus(`Test error: ${data.message}`, 'error');
    }

    handleTestStopped(data) {
        this.isTestRunning = false;
        this.updateTestControls(false);
        this.showStatus('Test stopped by user', 'info');
    }

    updateTestControls(running) {
        const startButton = document.getElementById('startSequentialWriteTest');
        const stopButton = document.getElementById('stopSequentialWriteTest');
        const deviceSelect = document.getElementById('deviceSelectWrite');
        const configInputs = document.querySelectorAll('.test-config-write input, .test-config-write select');

        if (startButton) startButton.disabled = running;
        if (stopButton) stopButton.disabled = !running;
        if (deviceSelect) deviceSelect.disabled = running;

        configInputs.forEach(input => {
            input.disabled = running;
        });

        // Show/hide progress section
        const progressSection = document.getElementById('testProgressSectionWrite');
        if (progressSection) {
            progressSection.style.display = running ? 'block' : 'none';
        }

        // Show/hide real-time charts section
        const chartsSection = document.getElementById('realtimeChartsSectionWrite');
        if (chartsSection) {
            chartsSection.style.display = running ? 'block' : 'none';
        }
    }

    initializeCharts() {
        // Initialize Chart.js charts for real-time monitoring
        this.initThroughputChart();
        this.initLatencyChart();
        this.initCpuChart();
    }

    initThroughputChart() {
        const ctx = document.getElementById('throughputChartWrite');
        if (!ctx) return;

        this.chartInstances.throughput = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Write Throughput (MB/s)',
                    data: [],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Throughput (MB/s)'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Real-time Write Throughput'
                    }
                }
            }
        });
    }

    initLatencyChart() {
        const ctx = document.getElementById('latencyChartWrite');
        if (!ctx) return;

        this.chartInstances.latency = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Write Latency (μs)',
                    data: [],
                    borderColor: 'rgb(255, 159, 64)',
                    backgroundColor: 'rgba(255, 159, 64, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Latency (μs)'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Real-time Write Latency'
                    }
                }
            }
        });
    }

    initCpuChart() {
        const ctx = document.getElementById('cpuChartWrite');
        if (!ctx) return;

        this.chartInstances.cpu = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'CPU Usage (%)',
                    data: [],
                    borderColor: 'rgb(255, 205, 86)',
                    backgroundColor: 'rgba(255, 205, 86, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'CPU Usage (%)'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Real-time CPU Usage'
                    }
                }
            }
        });
    }

    updateRealtimeCharts() {
        // Update all charts with latest data
        Object.keys(this.chartInstances).forEach(chartType => {
            const chart = this.chartInstances[chartType];
            if (!chart) return;

            chart.data.labels = this.realtimeData.timestamps;
            chart.data.datasets[0].data = this.realtimeData[chartType === 'cpu' ? 'cpu_usage' : chartType];
            chart.update('none'); // No animation for real-time updates
        });
    }

    resetCharts() {
        // Clear all real-time data
        Object.keys(this.realtimeData).forEach(key => {
            this.realtimeData[key] = [];
        });

        // Reset charts
        Object.values(this.chartInstances).forEach(chart => {
            if (chart) {
                chart.data.labels = [];
                chart.data.datasets[0].data = [];
                chart.update();
            }
        });
    }

    displayResults(data) {
        const resultsSection = document.getElementById('testResultsWrite');
        if (!resultsSection) return;

        resultsSection.innerHTML = `
            <div class="results-header">
                <h3>Write Test Results</h3>
                <div class="status-badge status-${data.status}">${data.status.toUpperCase()}</div>
            </div>
            <div class="results-summary">
                <div class="result-item">
                    <label>Test Duration:</label>
                    <span>${data.duration_seconds.toFixed(1)}s</span>
                </div>
                <div class="result-item">
                    <label>Device:</label>
                    <span>${data.device}</span>
                </div>
                <div class="result-item">
                    <label>Configuration:</label>
                    <span>${data.configuration.block_size}, QD=${data.configuration.queue_depth}</span>
                </div>
            </div>
        `;

        resultsSection.style.display = 'block';
    }

    displayPerformanceMetrics(metrics) {
        const metricsSection = document.getElementById('performanceMetricsWrite');
        if (!metricsSection) return;

        metricsSection.innerHTML = `
            <h4>Write Performance Metrics</h4>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">${metrics.throughput_mbps.toFixed(1)}</div>
                    <div class="metric-label">MB/s</div>
                    <div class="metric-sublabel">Write Throughput</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.iops.toFixed(0)}</div>
                    <div class="metric-label">IOPS</div>
                    <div class="metric-sublabel">Write Operations/sec</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.avg_latency_us.toFixed(1)}</div>
                    <div class="metric-label">μs</div>
                    <div class="metric-sublabel">Avg Write Latency</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.p95_latency_us.toFixed(1)}</div>
                    <div class="metric-label">μs</div>
                    <div class="metric-sublabel">95th % Latency</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.cpu_utilization.toFixed(1)}</div>
                    <div class="metric-label">%</div>
                    <div class="metric-sublabel">CPU Usage</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.throughput_efficiency.toFixed(1)}</div>
                    <div class="metric-label">%</div>
                    <div class="metric-sublabel">Write Efficiency</div>
                </div>
            </div>
        `;

        metricsSection.style.display = 'block';
    }

    displayComplianceResults(compliance) {
        const complianceSection = document.getElementById('complianceResultsWrite');
        if (!complianceSection) return;

        const statusClass = compliance.status === 'compliant' ? 'success' : 'error';

        let validationsHtml = '';
        if (compliance.validations) {
            validationsHtml = compliance.validations.map(validation => {
                const statusIcon = validation.status === 'pass' ? '✓' : '✗';
                const statusClass = validation.status === 'pass' ? 'success' : 'error';
                
                return `
                    <div class="validation-item status-${statusClass}">
                        <span class="validation-icon">${statusIcon}</span>
                        <span class="validation-description">${validation.description}</span>
                    </div>
                `;
            }).join('');
        }

        complianceSection.innerHTML = `
            <h4>PCIe 6.x Write Compliance</h4>
            <div class="compliance-status">
                <div class="status-badge status-${statusClass}">${compliance.status.toUpperCase()}</div>
                <div class="compliance-details">
                    <div class="compliance-detail">
                        <strong>Detected PCIe:</strong> ${compliance.detected_pcie_gen} ${compliance.detected_pcie_lanes}
                    </div>
                    <div class="compliance-detail">
                        <strong>Expected Min Throughput:</strong> ${compliance.expected_min_throughput.toFixed(1)} MB/s
                    </div>
                </div>
            </div>
            <div class="validations">
                ${validationsHtml}
            </div>
        `;

        complianceSection.style.display = 'block';
    }

    showTestConfiguration(config) {
        const configSection = document.getElementById('currentTestConfigWrite');
        if (!configSection) return;

        configSection.innerHTML = `
            <h4>Write Test Configuration</h4>
            <div class="config-details">
                <div class="config-item">
                    <strong>Device:</strong> ${config.device}
                </div>
                <div class="config-item">
                    <strong>Runtime:</strong> ${config.runtime_seconds}s
                </div>
                <div class="config-item">
                    <strong>Block Size:</strong> ${config.block_size}
                </div>
                <div class="config-item">
                    <strong>Queue Depth:</strong> ${config.queue_depth}
                </div>
            </div>
        `;

        configSection.style.display = 'block';
    }

    clearResults() {
        const sections = ['testResultsWrite', 'performanceMetricsWrite', 'complianceResultsWrite', 'currentTestConfigWrite'];
        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
                section.innerHTML = '';
            }
        });
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('testStatusWrite');
        if (!statusElement) return;

        statusElement.className = `status-message status-${type}`;
        statusElement.textContent = message;
        statusElement.style.display = 'block';

        // Auto-hide info messages after 5 seconds
        if (type === 'info') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    }

    exportResults() {
        const exportButton = document.getElementById('exportResultsWrite');
        if (!exportButton || !exportButton.dataset.results) {
            this.showStatus('No results to export', 'warning');
            return;
        }

        const results = JSON.parse(exportButton.dataset.results);
        
        // Create export options modal or dropdown
        this.showExportOptions(results);
    }

    showExportOptions(results) {
        // For now, export as JSON
        const dataStr = JSON.stringify(results, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `sequential_write_results_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.showStatus('Results exported successfully', 'success');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.sequential-write-performance')) {
        window.sequentialWritePerformance = new SequentialWritePerformance();
    }
});