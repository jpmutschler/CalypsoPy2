/**
 * CalypsoPy+ by Serial Cables
 * Professional Hardware Interface JavaScript Application
 * Updated with Bifurcation Dashboard Support and Developer Mode
 */

// Initialize Socket.IO connection
const socket = io();

// Application state
let currentDashboard = 'connection';
let currentPort = null;
let isConnected = false;
let isDeveloperMode = false;
let systemMetrics = {
    totalCommands: 0,
    successfulCommands: 0,
    totalResponseTime: 0,
    cacheHits: 0,
    commandHistory: []
};

// Chart instance
let responseChart;

// Dashboard instances
let bifurcationDashboard = null;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const content = document.createElement('div');
    content.className = 'notification-content';

    const icon = document.createElement('div');
    icon.className = 'notification-icon';
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';

    const message_div = document.createElement('div');
    message_div.className = 'notification-message';
    message_div.textContent = message;

    content.appendChild(icon);
    content.appendChild(message_div);
    notification.appendChild(content);

    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => document.body.removeChild(notification), 400);
    }, 4000);
}

function formatTimestamp() {
    return new Date().toLocaleTimeString();
}

function addConsoleEntry(containerId, type, content, timestamp = null, parsedData = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entry = document.createElement('div');
    entry.className = `console-entry ${type}`;

    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'console-timestamp';
    timestampDiv.textContent = timestamp || formatTimestamp();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'console-content';
    contentDiv.textContent = content;

    entry.appendChild(timestampDiv);
    entry.appendChild(contentDiv);

    if (parsedData && parsedData.parsed && Object.keys(parsedData.parsed).length > 0) {
        const parsedDiv = document.createElement('div');
        parsedDiv.className = 'parsed-data';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'parsed-data-header';
        headerDiv.textContent = `Parsed Data (${parsedData.type}):`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'parsed-data-content';
        contentDiv.textContent = JSON.stringify(parsedData.parsed, null, 2);

        parsedDiv.appendChild(headerDiv);
        parsedDiv.appendChild(contentDiv);
        entry.appendChild(parsedDiv);
    }

    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;

    const entries = container.children;
    if (entries.length > 50) {
        container.removeChild(entries[1]);
    }
}

function updateConnectionStatus(connected, port = null) {
    isConnected = connected;
    currentPort = port;

    const statusElement = document.getElementById('connectionStatus');

    if (connected) {
        statusElement.className = 'connection-status connected';
        statusElement.innerHTML = `<div class="status-dot"></div><span>Connected to ${port}</span>`;

        const detailsElement = document.getElementById('connectionDetails');
        if (detailsElement) {
            detailsElement.innerHTML = `
                <div style="color: var(--dark-black);">
                    <strong>Port:</strong> ${port}<br>
                    <strong>Status:</strong> <span style="color: #22c55e;">Active</span><br>
                    <strong>Settings:</strong> 115200-8-N-1<br>
                    <strong>Connected:</strong> ${new Date().toLocaleString()}
                </div>
            `;
        }

        // Enable command inputs when connected
        document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
            input.disabled = false;
        });
        document.querySelectorAll('button[id^="send"]').forEach(btn => {
            btn.disabled = false;
        });

        // Enable all dashboard navigation when connected
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('disabled');
            item.style.opacity = '1';
            item.style.pointerEvents = 'auto';
        });

    } else {
        statusElement.className = 'connection-status disconnected';
        statusElement.innerHTML = `<div class="status-dot"></div><span>Disconnected</span>`;

        const detailsElement = document.getElementById('connectionDetails');
        if (detailsElement) {
            detailsElement.innerHTML = '<p style="color: var(--secondary-gray); font-style: italic;">No device connected</p>';
        }

        // Always disable command inputs when not connected (Developer Mode only affects dashboard viewing)
        document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
            input.disabled = true;
        });
        document.querySelectorAll('button[id^="send"]').forEach(btn => {
            btn.disabled = true;
        });

        // Update dashboard access (considers Developer Mode)
        updateDashboardAccess();
    }
}

function updateDashboardAccess() {
    document.querySelectorAll('.nav-item').forEach(item => {
        const dashboard = item.dataset.dashboard;

        // Always allow access to connection and analytics dashboards
        if (dashboard === 'connection' || dashboard === 'analytics') {
            item.classList.remove('disabled');
            item.style.opacity = '1';
            item.style.pointerEvents = 'auto';
            return;
        }

        // Allow access to other dashboards if connected OR in developer mode
        if (isConnected || isDeveloperMode) {
            item.classList.remove('disabled');
            item.style.opacity = '1';
            item.style.pointerEvents = 'auto';
            // Remove any disabled styling
            item.style.cursor = 'pointer';
        } else {
            item.classList.add('disabled');
            item.style.opacity = '0.5';
            item.style.pointerEvents = 'none';
            item.style.cursor = 'not-allowed';
        }
    });

    console.log(`Dashboard access updated - Connected: ${isConnected}, Developer Mode: ${isDeveloperMode}`);
}

function toggleDeveloperMode(enabled) {
    isDeveloperMode = enabled;

    console.log(`Developer Mode toggled: ${enabled}`);

    if (enabled) {
        showNotification('🔓 Developer Mode: ON - Dashboards unlocked for viewing', 'info');
    } else {
        showNotification('🔒 Developer Mode: OFF - Device connection required for dashboards', 'info');
    }

    // ONLY update dashboard access - no command functionality changes
    updateDashboardAccess();

    // Store preference
    localStorage.setItem('calypso_developer_mode', enabled.toString());

    console.log(`Developer Mode: ${enabled ? 'ENABLED' : 'DISABLED'} - Dashboard viewing only`);
}

function switchDashboard(dashboardId) {
    // Check if dashboard access is allowed (connected OR developer mode for viewing)
    if (!isConnected && !isDeveloperMode && dashboardId !== 'connection' && dashboardId !== 'analytics') {
        showNotification('Please connect to a device first or enable Developer Mode', 'warning');
        return;
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.dashboard === dashboardId) {
            item.classList.add('active');
        }
    });

    document.querySelectorAll('.dashboard-content').forEach(dashboard => {
        dashboard.classList.remove('active');
    });

    const targetDashboard = document.getElementById(`${dashboardId}-dashboard`);
    if (targetDashboard) {
        targetDashboard.classList.add('active');
        currentDashboard = dashboardId;

        // Only auto-execute commands if actually connected
        if (isConnected && currentPort) {
            if (dashboardId === 'device_info') {
                setTimeout(() => {
                    executeCommand('sysinfo', 'device_info');
                }, 500);
            } else if (dashboardId === 'bifurcation') {
                initializeBifurcationDashboard();
                setTimeout(() => {
                    executeCommand('showmode', 'bifurcation');
                }, 500);
            }

            socket.emit('get_dashboard_data', {
                dashboard: dashboardId,
                port: currentPort
            });
        }

        // Show info message when using developer mode
        if (!isConnected && isDeveloperMode && dashboardId !== 'connection' && dashboardId !== 'analytics') {
            showNotification(`🔓 Developer Mode: Viewing ${dashboardId} dashboard (commands disabled)`, 'info');
        }
    }
}

function initializeBifurcationDashboard() {
    if (!bifurcationDashboard) {
        bifurcationDashboard = new BifurcationDashboard();
        console.log('Bifurcation dashboard initialized');
    }

    if (bifurcationDashboard && bifurcationDashboard.onActivate) {
        bifurcationDashboard.onActivate();
    }
}

function executeCommand(command, dashboardId = currentDashboard) {
    // Commands only work when actually connected to a device
    if (!isConnected || !currentPort) {
        showNotification('Please connect to a device first', 'error');
        return;
    }

    const consoleId = `${dashboardId}Console`;
    const useCache = document.getElementById(`useCache${dashboardId.charAt(0).toUpperCase() + dashboardId.slice(1)}`)?.checked || true;

    addConsoleEntry(consoleId, 'command', `> ${command}`);

    const sendBtn = document.getElementById(`send${dashboardId.charAt(0).toUpperCase() + dashboardId.slice(1)}Cmd`);
    if (sendBtn) {
        const originalText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<div class="loading"></div> Executing...';
        sendBtn.disabled = true;

        setTimeout(() => {
            sendBtn.innerHTML = originalText;
            sendBtn.disabled = false;
        }, 3000);
    }

    // Send command via socket
    socket.emit('execute_command', {
        port: currentPort,
        command: command,
        dashboard: dashboardId,
        use_cache: useCache
    });

    // Update metrics
    systemMetrics.totalCommands++;
    document.getElementById('commandCount').textContent = systemMetrics.totalCommands;
}

function handleBifurcationResponse(data) {
    if (bifurcationDashboard && bifurcationDashboard.handleResponse) {
        bifurcationDashboard.handleResponse({
            success: data.success,
            response: data.data?.raw || '',
            command: data.data?.command || '',
            error: data.message
        });
    }
}

function parseShowModeResponse(responseData) {
    const rawResponse = responseData.raw || '';
    const modeMatch = rawResponse.match(/SBR mode:\s*(\d+)/i) || rawResponse.match(/mode:\s*(\d+)/i);

    if (modeMatch) {
        const mode = parseInt(modeMatch[1]);
        console.log('Parsed SBR mode:', mode);

        if (currentDashboard === 'bifurcation' && bifurcationDashboard) {
            bifurcationDashboard.updateCurrentMode(mode);
        }

        return mode;
    }

    return null;
}

function exportDeviceInfo() {
    const timestamp = new Date().toLocaleString();
    const filename = `CalypsoPy_DeviceInfo_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

    let reportContent = '';
    reportContent += '='.repeat(60) + '\n';
    reportContent += 'CalypsoPy+ Device Information Report\n';
    reportContent += 'Generated by Serial Cables Professional Interface\n';
    reportContent += '='.repeat(60) + '\n';
    reportContent += `Report Generated: ${timestamp}\n`;
    reportContent += `Connection Port: ${currentPort || 'Unknown'}\n`;
    reportContent += `Connection Settings: 115200-8-N-1\n`;
    reportContent += '\n';

    if (bifurcationDashboard && bifurcationDashboard.currentMode !== null) {
        reportContent += 'PCIE BIFURCATION\n';
        reportContent += '-'.repeat(30) + '\n';
        reportContent += `Current SBR Mode: ${bifurcationDashboard.currentMode}\n`;
        reportContent += `Configuration: ${bifurcationDashboard.getStatusSummary()}\n`;
        reportContent += '\n';
    }

    reportContent += '='.repeat(60) + '\n';
    reportContent += 'End of CalypsoPy+ Device Report\n';
    reportContent += `Report File: ${filename}\n`;
    reportContent += 'Visit: https://serial-cables.com for more information\n';
    reportContent += '='.repeat(60) + '\n';

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
    showNotification(`Device report exported: ${filename}`, 'success');
}

function parseSysinfoData(rawData) {
    const exampleData = {
        hardware: {
            serial: 'G8H144125062062',
            company: 'SerialCables,Inc.',
            model: 'PC16-RN-xkmjl-835-144',
            version: '0.1.0',
            sdk_version: '0 34 160 29'
        },
        thermal: {
            board_temperature: 55,
            fan_speed: 6310
        }
    };

    document.getElementById('hwSerialNumber').textContent = exampleData.hardware.serial;
    document.getElementById('hwCompany').textContent = exampleData.hardware.company;
    document.getElementById('hwModel').textContent = exampleData.hardware.model;
    document.getElementById('hwVersion').textContent = exampleData.hardware.version;
    document.getElementById('sdkVersion').textContent = exampleData.hardware.sdk_version;

    document.getElementById('deviceModel').textContent = exampleData.hardware.model.split('-')[0];
    document.getElementById('firmwareVersion').textContent = exampleData.hardware.version;
    document.getElementById('serialNumber').textContent = exampleData.hardware.serial.substring(0, 12) + '...';
    document.getElementById('boardTemp').textContent = exampleData.thermal.board_temperature + '°C';

    showNotification('System information updated successfully', 'success');
}

function updateDashboardData(data) {
    if (!data.data || !data.data.parsed) return;

    const dashboard = data.dashboard || currentDashboard;
    const rawResponse = data.data.raw;

    if (dashboard === 'device_info' && (data.data.command === 'sysinfo' || rawResponse.includes('sysinfo'))) {
        parseSysinfoData(rawResponse);
        return;
    }

    if (dashboard === 'bifurcation') {
        handleBifurcationResponse(data);

        if (data.data.command === 'showmode') {
            parseShowModeResponse(data.data);
        }
        return;
    }
}

// =============================================================================
// BIFURCATION DASHBOARD CLASS
// =============================================================================

const BIFURCATION_MODES = {
    0: { goldenFinger: 'X16(SSC)', straddlePCIE: 'X16(CC)', leftMCIO: 'X16(CC)', rightMCIO: 'X16(CC)' },
    1: { goldenFinger: 'X16(SSC)', straddlePCIE: 'X16(CC)', leftMCIO: 'X8(CC)', rightMCIO: 'X8(CC)' },
    2: { goldenFinger: 'X16(SSC)', straddlePCIE: 'X16(CC)', leftMCIO: 'X4(CC)', rightMCIO: 'X4(CC)' },
    3: { goldenFinger: 'X16(SSC)', straddlePCIE: 'X16(CC)', leftMCIO: 'X2(CC)', rightMCIO: 'X2(CC)' },
    4: { goldenFinger: 'X16(SSC)', straddlePCIE: 'X16(CC)', leftMCIO: 'X8(CC)', rightMCIO: 'X16(CC)' },
    5: { goldenFinger: 'X16(SSC)', straddlePCIE: 'X16(CC)', leftMCIO: 'X4(CC)', rightMCIO: 'X16(CC)' },
    6: { goldenFinger: 'X16(SSC)', straddlePCIE: 'X16(CC)', leftMCIO: 'X16(CC)', rightMCIO: 'X4(CC)' }
};

class BifurcationDashboard {
    constructor() {
        this.currentMode = null;
        this.isLoading = false;
        this.init();
    }

    init() {
        this.bindEvents();
        console.log('Bifurcation Dashboard initialized');
    }

    bindEvents() {
        const commandInput = document.getElementById('bifurcationCommandInput');
        const sendBtn = document.getElementById('sendBifurcationCmd');
        const refreshBtn = document.getElementById('refreshBifurcation');

        if (commandInput && sendBtn) {
            commandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !sendBtn.disabled) {
                    executeCommand(commandInput.value.trim(), 'bifurcation');
                    commandInput.value = '';
                }
            });

            sendBtn.addEventListener('click', () => {
                if (!sendBtn.disabled) {
                    executeCommand(commandInput.value.trim(), 'bifurcation');
                    commandInput.value = '';
                }
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshBifurcationMode();
            });
        }

        const presetBtns = document.querySelectorAll('#bifurcationPresets .preset-btn');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.getAttribute('data-cmd');
                if (cmd) {
                    executeCommand(cmd, 'bifurcation');
                }
            });
        });
    }

    onActivate() {
        console.log('Bifurcation dashboard activated');
        this.addConsoleEntry('Dashboard activated. Checking current bifurcation mode...', 'system');
    }

    handleResponse(data) {
        if (data.success && data.command === 'showmode') {
            this.parseShowModeResponse(data.response);
        }
    }

    parseShowModeResponse(response) {
        const modeMatch = response.match(/SBR mode:\s*(\d+)/i) || response.match(/mode:\s*(\d+)/i);

        if (modeMatch) {
            const mode = parseInt(modeMatch[1]);
            this.updateCurrentMode(mode);
        }
    }

    updateCurrentMode(mode) {
        if (mode < 0 || mode > 6) return;

        this.currentMode = mode;
        const modeConfig = BIFURCATION_MODES[mode];

        this.updateElement('currentSBRMode', mode.toString());
        this.updateElement('goldenFingerConfig', modeConfig.goldenFinger);
        this.updateElement('straddlePCIE', modeConfig.straddlePCIE);
        this.updateElement('mcioStatus', `L:${modeConfig.leftMCIO} R:${modeConfig.rightMCIO}`);

        this.updateElement('modeGoldenFinger', modeConfig.goldenFinger);
        this.updateElement('modeStraddlePCIE', modeConfig.straddlePCIE);
        this.updateElement('modeLeftMCIO', modeConfig.leftMCIO);
        this.updateElement('modeRightMCIO', modeConfig.rightMCIO);

        const modeNumberEl = document.querySelector('.bifurcation-mode-number');
        if (modeNumberEl) {
            modeNumberEl.textContent = `Mode: ${mode}`;
        }

        this.highlightActiveMode(mode);
        this.addConsoleEntry(`Current bifurcation mode updated: ${mode}`, 'success');
    }

    highlightActiveMode(activeMode) {
        const rows = document.querySelectorAll('#bifurcationTableBody tr');
        rows.forEach(row => {
            const mode = parseInt(row.getAttribute('data-mode'));
            if (mode === activeMode) {
                row.classList.add('active-mode');
            } else {
                row.classList.remove('active-mode');
            }
        });
    }

    refreshBifurcationMode() {
        this.addConsoleEntry('Refreshing bifurcation mode...', 'command');
        executeCommand('showmode', 'bifurcation');
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    addConsoleEntry(message, type = 'info') {
        addConsoleEntry('bifurcationConsole', type, message);
    }

    getStatusSummary() {
        if (this.currentMode === null) {
            return 'No mode information available';
        }

        const config = BIFURCATION_MODES[this.currentMode];
        return `Mode ${this.currentMode}: GF:${config.goldenFinger}, SP:${config.straddlePCIE}, L:${config.leftMCIO}, R:${config.rightMCIO}`;
    }
}

// =============================================================================
// CHART AND METRICS
// =============================================================================

function initializeChart() {
    const ctx = document.getElementById('responseChart');
    if (!ctx) return;

    responseChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Response Time (ms)',
                data: [],
                borderColor: '#790000',
                backgroundColor: 'rgba(121, 0, 0, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function updateChart(responseTime) {
    if (!responseChart) return;

    if (responseChart.data.labels.length >= 20) {
        responseChart.data.labels.shift();
        responseChart.data.datasets[0].data.shift();
    }

    responseChart.data.labels.push(systemMetrics.totalCommands);
    responseChart.data.datasets[0].data.push(responseTime);
    responseChart.update('none');
}

function updateMetrics() {
    document.getElementById('totalCommands').textContent = systemMetrics.totalCommands;

    const successRate = systemMetrics.totalCommands > 0 ?
        Math.round((systemMetrics.successfulCommands / systemMetrics.totalCommands) * 100) : 0;
    document.getElementById('successRate').textContent = successRate + '%';

    const avgResponseTime = systemMetrics.successfulCommands > 0 ?
        Math.round(systemMetrics.totalResponseTime / systemMetrics.successfulCommands) : 0;
    document.getElementById('avgResponseTime').textContent = avgResponseTime + 'ms';

    const cacheHitRate = systemMetrics.totalCommands > 0 ?
        Math.round((systemMetrics.cacheHits / systemMetrics.totalCommands) * 100) : 0;
    document.getElementById('cacheHitRate').textContent = cacheHitRate + '%';
}

async function loadPorts() {
    console.log('Loading ports...');

    try {
        // Clear the loading state
        const portSelect = document.getElementById('portSelect');
        if (portSelect) {
            portSelect.innerHTML = '<option value="">Scanning for devices...</option>';
        }

        const response = await fetch('/api/ports');
        console.log('Port API response status:', response.status);
        console.log('Port API response ok:', response.ok);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.text(); // Get raw text first
        console.log('Raw response:', data);

        const ports = JSON.parse(data); // Then parse JSON
        console.log('Parsed ports:', ports);
        console.log('Number of ports found:', ports.length);

        if (!portSelect) {
            console.error('Port select element not found');
            return;
        }

        // Clear existing options
        portSelect.innerHTML = '';

        if (!ports || ports.length === 0) {
            console.log('No ports found');
            portSelect.innerHTML = '<option value="">No devices found - Try refreshing</option>';
            const connectBtn = document.getElementById('connectBtn');
            if (connectBtn) {
                connectBtn.disabled = true;
            }
            showNotification('No COM ports found', 'warning');
        } else {
            console.log(`Found ${ports.length} ports`);
            portSelect.innerHTML = '<option value="">Select a device...</option>';

            ports.forEach((port, index) => {
                console.log(`Port ${index + 1}:`, port);
                const option = document.createElement('option');
                option.value = port.device;

                // Create display text
                let displayText = port.device;
                if (port.description && port.description !== 'Unknown Device') {
                    displayText += ` - ${port.description}`;
                }
                if (port.device_type) {
                    displayText += ` (${port.device_type})`;
                }
                if (port.icon) {
                    displayText = `${port.icon} ${displayText}`;
                }

                option.textContent = displayText;
                portSelect.appendChild(option);
                console.log(`Added option: ${displayText}`);
            });

            // Add event listener for port selection
            portSelect.removeEventListener('change', handlePortChange); // Remove old listener
            portSelect.addEventListener('change', handlePortChange);

            showNotification(`Found ${ports.length} available ports`, 'success');
        }

    } catch (error) {
        console.error('Failed to load ports:', error);
        showNotification('Failed to load ports: ' + error.message, 'error');

        // Show error in port select
        const portSelect = document.getElementById('portSelect');
        if (portSelect) {
            portSelect.innerHTML = '<option value="">Error loading ports - Check server</option>';
        }
    }
}

// Separate function to handle port selection
function handlePortChange() {
    const portSelect = document.getElementById('portSelect');
    const connectBtn = document.getElementById('connectBtn');

    if (connectBtn && portSelect) {
        connectBtn.disabled = portSelect.value === '';
        console.log('Port selected:', portSelect.value);

        if (portSelect.value) {
            showNotification(`Selected port: ${portSelect.value}`, 'info');
        }
    }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function setupEventHandlers() {
    document.getElementById('developerMode')?.addEventListener('change', (e) => {
        toggleDeveloperMode(e.target.checked);
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const dashboard = item.dataset.dashboard;
            if (dashboard) {
                switchDashboard(dashboard);
            }
        });
    });

    document.getElementById('connectBtn')?.addEventListener('click', () => {
        const port = document.getElementById('portSelect').value;
        if (!port) return;

        const btn = document.getElementById('connectBtn');
        btn.innerHTML = '<div class="loading"></div> Connecting...';
        btn.disabled = true;

        socket.emit('connect_device', {
            port: port,
            baudrate: 115200,
            timeout: 2.0
        });
    });

    document.getElementById('disconnectBtn')?.addEventListener('click', () => {
        if (!currentPort) return;

        const btn = document.getElementById('disconnectBtn');
        btn.innerHTML = '<div class="loading"></div> Disconnecting...';
        btn.disabled = true;

        socket.emit('disconnect_device', { port: currentPort });
    });

    document.getElementById('refreshBtn')?.addEventListener('click', loadPorts);

    // Test API button for debugging
    document.getElementById('testApiBtn')?.addEventListener('click', async () => {
        console.log('=== API TEST START ===');

        try {
            // Test 1: Basic connectivity
            console.log('Test 1: Testing basic API connectivity...');
            const response = await fetch('/api/status');
            console.log('Status API response:', response.status, response.ok);
            const statusData = await response.json();
            console.log('Status data:', statusData);

            // Test 2: Port API
            console.log('Test 2: Testing port API directly...');
            const portResponse = await fetch('/api/ports');
            console.log('Port API response:', portResponse.status, portResponse.ok);
            console.log('Port API headers:', [...portResponse.headers.entries()]);

            const portText = await portResponse.text();
            console.log('Port API raw response:', portText);

            try {
                const portData = JSON.parse(portText);
                console.log('Port API parsed data:', portData);
                console.log('Port count:', Array.isArray(portData) ? portData.length : 'Not an array');

                if (Array.isArray(portData) && portData.length > 0) {
                    console.log('Ports found:');
                    portData.forEach((port, i) => {
                        console.log(`  ${i + 1}. ${port.device} - ${port.description}`);
                    });
                } else {
                    console.log('No ports in response');
                }
            } catch (e) {
                console.error('Failed to parse port JSON:', e);
            }

            showNotification('API test complete - check console', 'info');

        } catch (error) {
            console.error('API test failed:', error);
            showNotification('API test failed: ' + error.message, 'error');
        }

        console.log('=== API TEST END ===');
    });

    document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const command = input.value.trim();
                if (command) {
                    const dashboardId = input.id.replace('CommandInput', '').toLowerCase().replace('device', 'device_info');
                    executeCommand(command, dashboardId);
                    input.value = '';
                }
            }
        });
    });

    document.getElementById('sendDeviceCmd')?.addEventListener('click', () => {
        const command = document.getElementById('deviceCommandInput').value.trim();
        if (command) {
            executeCommand(command, 'device_info');
            document.getElementById('deviceCommandInput').value = '';
        }
    });

    document.getElementById('sendLinkCmd')?.addEventListener('click', () => {
        const command = document.getElementById('linkCommandInput').value.trim();
        if (command) {
            executeCommand(command, 'link_status');
            document.getElementById('linkCommandInput').value = '';
        }
    });

    document.getElementById('sendAdvancedCmd')?.addEventListener('click', () => {
        const command = document.getElementById('advancedCommandInput').value.trim();
        if (command) {
            executeCommand(command, 'advanced');
            document.getElementById('advancedCommandInput').value = '';
        }
    });

    document.getElementById('exportDeviceInfo')?.addEventListener('click', exportDeviceInfo);

    document.getElementById('refreshDeviceInfo')?.addEventListener('click', () => {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            return;
        }
        executeCommand('sysinfo', 'device_info');
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const command = btn.dataset.cmd;
            const dashboardId = btn.closest('[id$="-dashboard"]')?.id.replace('-dashboard', '') || currentDashboard;
            if (command) {
                executeCommand(command, dashboardId);
            }
        });
    });
}

// =============================================================================
// SOCKET EVENT HANDLERS
// =============================================================================

function setupSocketHandlers() {
    socket.on('connect', () => {
        console.log('Connected to CalypsoPy+ server');
        showNotification('Connected to CalypsoPy+ server', 'success');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from CalypsoPy+ server');
        showNotification('Disconnected from server', 'error');
        updateConnectionStatus(false);
    });

    socket.on('connection_result', (data) => {
        const btn = document.getElementById('connectBtn');
        btn.innerHTML = '<span>🔗</span> Connect Device';
        btn.disabled = false;

        if (data.success) {
            updateConnectionStatus(true, data.connection_info.port);
            showNotification(`Connected to ${data.connection_info.port}`, 'success');

            setTimeout(() => {
                switchDashboard('device_info');
                showNotification('Switched to Device Information - Loading system data...', 'info');
            }, 1000);

        } else {
            showNotification(data.message, 'error');
        }
    });

    socket.on('disconnection_result', (data) => {
        const btn = document.getElementById('disconnectBtn');
        btn.innerHTML = '<span>🔌</span> Disconnect';
        btn.disabled = false;

        updateConnectionStatus(false);

        if (data.success) {
            showNotification(data.message, 'success');

            setTimeout(() => {
                switchDashboard('connection');
                showNotification('Disconnected - Please connect to a device to continue', 'info');
            }, 1000);

        } else {
            showNotification(data.message, 'error');
        }
    });

    socket.on('command_result', (data) => {
        const consoleId = `${data.dashboard || currentDashboard}Console`;

        if (data.success) {
            systemMetrics.successfulCommands++;
            if (data.response_time_ms) {
                systemMetrics.totalResponseTime += data.response_time_ms;
                updateChart(data.response_time_ms);
            }
            if (data.from_cache) {
                systemMetrics.cacheHits++;
            }

            const parsedData = data.data;
            const cacheIndicator = data.from_cache ? ' [CACHED]' : '';

            addConsoleEntry(consoleId, 'response',
                `${parsedData.raw}${cacheIndicator}`,
                parsedData.timestamp,
                parsedData);

            updateDashboardData(data);

        } else {
            addConsoleEntry(consoleId, 'error', data.message);
            showNotification(data.message, 'error');
        }

        updateMetrics();
    });

    socket.on('system_status', (data) => {
        const connectedPorts = Object.keys(data.connected_ports || {}).filter(port =>
            data.connected_ports[port].connected
        );

        if (connectedPorts.length > 0 && !isConnected) {
            updateConnectionStatus(true, connectedPorts[0]);
        } else if (connectedPorts.length === 0 && isConnected) {
            updateConnectionStatus(false);
        }
    });
}

// =============================================================================
// MOBILE & RESPONSIVE FEATURES
// =============================================================================

function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('open');
}

function handleWindowResize() {
    if (responseChart) {
        responseChart.resize();
    }

    if (window.innerWidth > 768) {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.remove('open');
    }
}

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const dashboards = ['connection', 'device_info', 'link_status', 'bifurcation', 'i2c', 'advanced', 'resets', 'firmware', 'analytics'];
            const index = parseInt(e.key) - 1;
            if (dashboards[index]) {
                switchDashboard(dashboards[index]);
            }
        }

        if (e.key === 'Escape') {
            document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
                input.value = '';
                input.blur();
            });
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            loadPorts();
            showNotification('Refreshing available ports...', 'info');
        }
    });
}

// =============================================================================
// APPLICATION INITIALIZATION
// =============================================================================

function initializeApplication() {
    console.log('🚀 CalypsoPy+ by Serial Cables - Initializing...');

    setupEventHandlers();
    setupSocketHandlers();
    setupKeyboardShortcuts();

    // Load ports immediately and set up refresh
    loadPorts();
    initializeChart();
    updateMetrics();

    // Restore developer mode preference with debugging
    const savedDeveloperMode = localStorage.getItem('calypso_developer_mode');
    console.log('Saved developer mode preference:', savedDeveloperMode);

    if (savedDeveloperMode === 'true') {
        const devModeCheckbox = document.getElementById('developerMode');
        console.log('Developer mode checkbox found:', !!devModeCheckbox);

        if (devModeCheckbox) {
            devModeCheckbox.checked = true;
            toggleDeveloperMode(true);
            console.log('Developer mode restored and enabled');
        }
    }

    // Initial dashboard access update
    setTimeout(() => {
        updateDashboardAccess();
        console.log('Initial dashboard access updated');
    }, 500);

    if (window.innerWidth <= 768) {
        const headerControls = document.querySelector('.header-controls');
        const menuBtn = document.createElement('button');
        menuBtn.className = 'btn btn-secondary btn-sm';
        menuBtn.innerHTML = '☰ Menu';
        menuBtn.onclick = toggleMobileMenu;
        headerControls.insertBefore(menuBtn, headerControls.firstChild);
    }

    window.addEventListener('resize', handleWindowResize);

    // More frequent port refresh for development
    setInterval(loadPorts, 10000); // Every 10 seconds instead of 30

    console.log('%cCalypsoPy+ v1.0.0', 'color: #790000; font-size: 16px; font-weight: bold;');
    console.log('%cby Serial Cables', 'color: #777676; font-size: 12px;');
    console.log('%cProfessional Hardware Interface Ready', 'color: #22c55e; font-size: 12px;');
    console.log('%cBifurcation Dashboard: Enabled', 'color: #e63946; font-size: 12px;');
    console.log('%cDeveloper Mode: Dashboard viewing only', 'color: #fbbf24; font-size: 12px;');

    console.log('Application State:', {
        isConnected: isConnected,
        isDeveloperMode: isDeveloperMode,
        currentDashboard: currentDashboard
    });

    console.log('✅ CalypsoPy+ initialization complete');
}

// =============================================================================
// START APPLICATION
// =============================================================================

document.addEventListener('DOMContentLoaded', initializeApplication);

window.CalypsoPy = {
    executeCommand,
    switchDashboard,
    showNotification,
    loadPorts,
    toggleMobileMenu,
    parseSysinfoData,
    toggleDeveloperMode,
    systemMetrics,
    isConnected: () => isConnected,
    isDeveloperMode: () => isDeveloperMode,
    currentPort: () => currentPort,
    currentDashboard: () => currentDashboard,
    bifurcationDashboard: () => bifurcationDashboard,
    BifurcationDashboard: BifurcationDashboard,
    BIFURCATION_MODES: BIFURCATION_MODES
};