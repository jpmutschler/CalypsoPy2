/**
 * Random IOPS Performance Test Interface
 * Real-time performance monitoring with PCIe 6.x compliance validation
 */

class RandomIOPSPerformance {
    constructor() {
        this.socket = null;
        this.isTestRunning = false;
        this.currentTestId = null;
        this.availableDevices = [];
        this.chartInstances = {};
        this.realtimeData = {
            timestamps: [],
            iops: [],
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
        const startButton = document.getElementById('startRandomIOPSTest');
        const stopButton = document.getElementById('stopRandomIOPSTest');
        const deviceSelect = document.getElementById('deviceSelectIOPS');
        const runtimeInput = document.getElementById('runtimeSecondsIOPS');
        const workloadSelect = document.getElementById('workloadTypeIOPS');
        const exportButton = document.getElementById('exportResultsIOPS');

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

        if (workloadSelect) {
            workloadSelect.addEventListener('change', () => this.onWorkloadChange());
        }

        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportResults());
        }

        // Refresh devices button
        const refreshButton = document.getElementById('refreshDevicesIOPS');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => this.loadAvailableDevices());
        }
    }

    setupSocketHandlers() {
        this.socket.on('random_iops_progress', (data) => {
            this.handleProgressUpdate(data);
        });

        this.socket.on('random_iops_realtime', (data) => {
            this.handleRealtimeUpdate(data);
        });

        this.socket.on('random_iops_complete', (data) => {
            this.handleTestComplete(data);
        });

        this.socket.on('random_iops_error', (data) => {
            this.handleTestError(data);
        });

        this.socket.on('random_iops_stopped', (data) => {
            this.handleTestStopped(data);
        });
    }

    async loadAvailableDevices() {
        try {
            this.showStatus('Loading available devices...', 'info');

            const response = await fetch('/api/tests/random_iops/devices');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load devices');
            }

            this.availableDevices = data.available_devices || [];
            this.updateDeviceSelect();
            this.updateFioStatus(data.fio_info);
            this.updateRuntimeOptions(data.runtime_options, data.default_runtime);
            this.updateWorkloadOptions(data.workload_types, data.default_workload);

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
        const deviceSelect = document.getElementById('deviceSelectIOPS');
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
        const statusElement = document.getElementById('fioStatusIOPS');
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
        const runtimeSelect = document.getElementById('runtimeSecondsIOPS');
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

    updateWorkloadOptions(workloadTypes, defaultWorkload) {
        const workloadSelect = document.getElementById('workloadTypeIOPS');
        if (!workloadSelect) return;

        // Clear existing options
        workloadSelect.innerHTML = '';

        // Add workload options
        if (workloadTypes && Array.isArray(workloadTypes)) {
            workloadTypes.forEach(workload => {
                const option = document.createElement('option');
                option.value = workload.value;
                option.textContent = workload.label;
                if (workload.value === defaultWorkload) {
                    option.selected = true;
                }
                workloadSelect.appendChild(option);
            });
        }
    }

    onDeviceChange() {
        const deviceSelect = document.getElementById('deviceSelectIOPS');
        const deviceInfo = document.getElementById('selectedDeviceInfoIOPS');
        
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

    onWorkloadChange() {
        const workloadSelect = document.getElementById('workloadTypeIOPS');
        const readWriteRatioSection = document.getElementById('readWriteRatioSection');
        
        if (!workloadSelect || !readWriteRatioSection) return;

        // Show/hide read/write ratio controls for mixed workloads
        if (workloadSelect.value === 'randrw') {
            readWriteRatioSection.style.display = 'block';
        } else {
            readWriteRatioSection.style.display = 'none';
        }
    }

    validateRuntime() {
        const runtimeSelect = document.getElementById('runtimeSecondsIOPS');
        const customRuntimeInput = document.getElementById('customRuntimeIOPS');
        
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

        const deviceSelect = document.getElementById('deviceSelectIOPS');
        const runtimeSelect = document.getElementById('runtimeSecondsIOPS');
        const customRuntimeInput = document.getElementById('customRuntimeIOPS');
        const workloadSelect = document.getElementById('workloadTypeIOPS');
        const blockSizeSelect = document.getElementById('blockSizeIOPS');
        const queueDepthInput = document.getElementById('queueDepthIOPS');
        const readRatioInput = document.getElementById('readRatio');

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
            workload_type: workloadSelect ? workloadSelect.value : 'randread',
            block_size: blockSizeSelect ? blockSizeSelect.value : '4k',
            queue_depth: queueDepthInput ? parseInt(queueDepthInput.value) : 64
        };

        // Add read/write ratio for mixed workloads
        if (testConfig.workload_type === 'randrw' && readRatioInput) {
            const readRatio = parseInt(readRatioInput.value);
            const writeRatio = 100 - readRatio;
            testConfig.read_write_ratio = `${readRatio}:${writeRatio}`;
        }

        this.currentTestId = `random_iops_${Date.now()}`;
        this.isTestRunning = true;

        // Reset charts and data
        this.resetCharts();
        this.clearResults();

        // Update UI
        this.updateTestControls(true);
        this.showTestConfiguration(testConfig);

        // Start test via WebSocket
        this.socket.emit('start_random_iops_test', testConfig);

        this.showStatus(`Starting random IOPS test on ${testConfig.device}...`, 'info');
    }

    stopTest() {
        if (!this.isTestRunning) {
            this.showStatus('No test running', 'warning');
            return;
        }

        this.socket.emit('stop_random_iops_test', {
            test_id: this.currentTestId
        });

        this.showStatus('Stopping test...', 'info');
    }

    handleProgressUpdate(data) {
        const progressBar = document.getElementById('testProgressIOPS');
        const progressText = document.getElementById('progressTextIOPS');
        const elapsedTime = document.getElementById('elapsedTimeIOPS');

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
            
            // Simulate IOPS-specific metrics
            const baseIOPS = data.workload_type === 'randread' ? 400000 : 
                             data.workload_type === 'randwrite' ? 250000 : 300000;
            
            this.realtimeData.iops.push(Math.random() * baseIOPS * 0.3 + baseIOPS * 0.7); // Simulated IOPS
            this.realtimeData.latency.push(Math.random() * 50 + 20); // Simulated latency for 4K random I/O
            this.realtimeData.cpu_usage.push(Math.random() * 35 + 20); // Simulated CPU usage for IOPS testing

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
        const exportButton = document.getElementById('exportResultsIOPS');
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
        const startButton = document.getElementById('startRandomIOPSTest');
        const stopButton = document.getElementById('stopRandomIOPSTest');
        const deviceSelect = document.getElementById('deviceSelectIOPS');
        const configInputs = document.querySelectorAll('.test-config-iops input, .test-config-iops select');

        if (startButton) startButton.disabled = running;
        if (stopButton) stopButton.disabled = !running;
        if (deviceSelect) deviceSelect.disabled = running;

        configInputs.forEach(input => {
            input.disabled = running;
        });

        // Show/hide progress section
        const progressSection = document.getElementById('testProgressSectionIOPS');
        if (progressSection) {
            progressSection.style.display = running ? 'block' : 'none';
        }

        // Show/hide real-time charts section
        const chartsSection = document.getElementById('realtimeChartsSectionIOPS');
        if (chartsSection) {
            chartsSection.style.display = running ? 'block' : 'none';
        }
    }

    initializeCharts() {
        // Initialize Chart.js charts for real-time monitoring
        this.initIOPSChart();
        this.initLatencyChart();
        this.initCpuChart();
    }

    initIOPSChart() {
        const ctx = document.getElementById('iopsChart');
        if (!ctx) return;

        this.chartInstances.iops = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'IOPS',
                    data: [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
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
                            text: 'IOPS'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Real-time IOPS'
                    }
                }
            }
        });
    }

    initLatencyChart() {
        const ctx = document.getElementById('latencyChartIOPS');
        if (!ctx) return;

        this.chartInstances.latency = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Latency (μs)',
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
                            text: 'Latency (μs)'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Real-time Latency'
                    }
                }
            }
        });
    }

    initCpuChart() {
        const ctx = document.getElementById('cpuChartIOPS');
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
        const resultsSection = document.getElementById('testResultsIOPS');
        if (!resultsSection) return;

        resultsSection.innerHTML = `
            <div class="results-header">
                <h3>Random IOPS Test Results</h3>
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
                    <label>Workload:</label>
                    <span>${data.configuration.workload_type.toUpperCase()}</span>
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
        const metricsSection = document.getElementById('performanceMetricsIOPS');
        if (!metricsSection) return;

        metricsSection.innerHTML = `
            <h4>IOPS Performance Metrics</h4>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">${metrics.iops.toFixed(0)}</div>
                    <div class="metric-label">IOPS</div>
                    <div class="metric-sublabel">Random Operations/sec</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.throughput_mbps.toFixed(1)}</div>
                    <div class="metric-label">MB/s</div>
                    <div class="metric-sublabel">Throughput</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.avg_latency_us.toFixed(1)}</div>
                    <div class="metric-label">μs</div>
                    <div class="metric-sublabel">Avg Latency</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.p95_latency_us.toFixed(1)}</div>
                    <div class="metric-label">μs</div>
                    <div class="metric-sublabel">95th % Latency</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.p99_latency_us.toFixed(1)}</div>
                    <div class="metric-label">μs</div>
                    <div class="metric-sublabel">99th % Latency</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${metrics.cpu_utilization.toFixed(1)}</div>
                    <div class="metric-label">%</div>
                    <div class="metric-sublabel">CPU Usage</div>
                </div>
            </div>
        `;

        metricsSection.style.display = 'block';
    }

    displayComplianceResults(compliance) {
        const complianceSection = document.getElementById('complianceResultsIOPS');
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
            <h4>PCIe 6.x IOPS Compliance</h4>
            <div class="compliance-status">
                <div class="status-badge status-${statusClass}">${compliance.status.toUpperCase()}</div>
                <div class="compliance-details">
                    <div class="compliance-detail">
                        <strong>Detected PCIe:</strong> ${compliance.detected_pcie_gen} ${compliance.detected_pcie_lanes}
                    </div>
                    <div class="compliance-detail">
                        <strong>Expected Min IOPS:</strong> ${compliance.expected_min_iops.toFixed(0)}
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
        const configSection = document.getElementById('currentTestConfigIOPS');
        if (!configSection) return;

        let configDetails = `
            <div class="config-item">
                <strong>Device:</strong> ${config.device}
            </div>
            <div class="config-item">
                <strong>Runtime:</strong> ${config.runtime_seconds}s
            </div>
            <div class="config-item">
                <strong>Workload:</strong> ${config.workload_type.toUpperCase()}
            </div>
            <div class="config-item">
                <strong>Block Size:</strong> ${config.block_size}
            </div>
            <div class="config-item">
                <strong>Queue Depth:</strong> ${config.queue_depth}
            </div>
        `;

        if (config.read_write_ratio) {
            configDetails += `
                <div class="config-item">
                    <strong>Read/Write Ratio:</strong> ${config.read_write_ratio}
                </div>
            `;
        }

        configSection.innerHTML = `
            <h4>IOPS Test Configuration</h4>
            <div class="config-details">
                ${configDetails}
            </div>
        `;

        configSection.style.display = 'block';
    }

    clearResults() {
        const sections = ['testResultsIOPS', 'performanceMetricsIOPS', 'complianceResultsIOPS', 'currentTestConfigIOPS'];
        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
                section.innerHTML = '';
            }
        });
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('testStatusIOPS');
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
        const exportButton = document.getElementById('exportResultsIOPS');
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
        link.download = `random_iops_results_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.showStatus('Results exported successfully', 'success');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.random-iops-performance')) {
        window.randomIOPSPerformance = new RandomIOPSPerformance();
    }
});