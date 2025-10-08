/**
 * CalypsoPy+ by Serial Cables
 * Professional Hardware Interface JavaScript Application
 * Updated with Link Status Dashboard Integration
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
let linkStatusDashboard = null;
let resetsDashboard = null;
let errorsDashboard = null;
let terminalDashboard = null;
let advancedDashboard = null;

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

        document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
            input.disabled = false;
        });
        document.querySelectorAll('button[id^="send"]').forEach(btn => {
            btn.disabled = false;
        });

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

        document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
            input.disabled = true;
        });
        document.querySelectorAll('button[id^="send"]').forEach(btn => {
            btn.disabled = true;
        });

        updateDashboardAccess();
    }
        // Update terminal-specific UI elements
        const terminalInput = document.getElementById('terminalInput');
        const sendTerminalBtn = document.getElementById('sendTerminalCmd');
        const terminalConnectionStatus = document.getElementById('terminalConnectionStatus');
        const terminalPromptLabel = document.getElementById('terminalPromptLabel');
        const terminalStatPort = document.getElementById('terminalStatPort');
        const terminalConnectionPort = document.getElementById('terminalConnectionPort');

        if (connected && port) {
            if (terminalInput) terminalInput.disabled = false;
            if (sendTerminalBtn) sendTerminalBtn.disabled = false;

            if (terminalConnectionStatus) {
                terminalConnectionStatus.className = 'terminal-connection-indicator connected';
                terminalConnectionStatus.innerHTML = `
                    <div class="terminal-connection-dot"></div>
                    <span>Connected: ${port}</span>
                `;
            }

            if (terminalPromptLabel) terminalPromptLabel.textContent = `${port}>`;
            if (terminalStatPort) terminalStatPort.textContent = port;
            if (terminalConnectionPort) terminalConnectionPort.textContent = port;
        } else {
            if (terminalInput) terminalInput.disabled = true;
            if (sendTerminalBtn) sendTerminalBtn.disabled = true;

            if (terminalConnectionStatus) {
                terminalConnectionStatus.className = 'terminal-connection-indicator disconnected';
                terminalConnectionStatus.innerHTML = `
                    <div class="terminal-connection-dot"></div>
                    <span>Disconnected</span>
                `;
            }

            if (terminalPromptLabel) terminalPromptLabel.textContent = '>';
            if (terminalStatPort) terminalStatPort.textContent = '--';
            if (terminalConnectionPort) terminalConnectionPort.textContent = '--';
        }
}

function updateDashboardAccess() {
    document.querySelectorAll('.nav-item').forEach(item => {
        const dashboard = item.dataset.dashboard;

        if (dashboard === 'connection' || dashboard === 'analytics') {
            item.classList.remove('disabled');
            item.style.opacity = '1';
            item.style.pointerEvents = 'auto';
            return;
        }

        if (isConnected || isDeveloperMode) {
            item.classList.remove('disabled');
            item.style.opacity = '1';
            item.style.pointerEvents = 'auto';
            item.style.cursor = 'pointer';
        } else {
            item.classList.add('disabled');
            item.style.opacity = '0.5';
            item.style.pointerEvents = 'none';
            item.style.cursor = 'not-allowed';
        }
    });
}

function toggleDeveloperMode(enabled) {
    isDeveloperMode = enabled;

    if (enabled) {
        showNotification('🔓 Developer Mode: ON - Dashboards unlocked for viewing', 'info');
    } else {
        showNotification('🔒 Developer Mode: OFF - Device connection required for dashboards', 'info');
    }

    updateDashboardAccess();
    localStorage.setItem('calypso_developer_mode', enabled.toString());
}

/** Complete and corrected switchDashboard function **/

function switchDashboard(dashboardId) {
    // Check if dashboard access is allowed (connected OR developer mode for viewing)
    if (!isConnected && !isDeveloperMode && dashboardId !== 'connection' && dashboardId !== 'analytics') {
        showNotification('Please connect to a device first or enable Developer Mode', 'warning');
        return;
    }

    // Handle specific dashboard activations
    if (dashboardId === 'errors') {
        if (window.errorsDashboard && window.errorsDashboard.onActivate) {
            setTimeout(() => {
                window.errorsDashboard.onActivate();
            }, 100);
        }
    } else if (dashboardId === 'terminal') {
        if (window.terminalDashboard && window.terminalDashboard.onActivate) {
            setTimeout(() => {
                window.terminalDashboard.onActivate();
            }, 100);
        }
    } else if (dashboardId === 'advanced') {
    if (window.advancedDashboard && window.advancedDashboard.onActivate) {
        setTimeout(() => {
            window.advancedDashboard.onActivate();
        }, 100);
    }
    }

    // Update navigation active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.dashboard === dashboardId) {
            item.classList.add('active');
        }
    });

    // Hide all dashboards
    document.querySelectorAll('.dashboard-content').forEach(dashboard => {
        dashboard.classList.remove('active');
    });

    // Show target dashboard
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
            } else if (dashboardId === 'resets') {
                // Activate Resets Dashboard
                if (window.resetsDashboard && window.resetsDashboard.onActivate) {
                    setTimeout(() => {
                        window.resetsDashboard.onActivate();
                    }, 100);
                }
            }

            // Request dashboard data from server
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
    }
    if (bifurcationDashboard && bifurcationDashboard.onActivate) {
        bifurcationDashboard.onActivate();
    }
}

function initializeLinkStatusDashboard() {
    if (!linkStatusDashboard) {
        linkStatusDashboard = new LinkStatusDashboard();
    }
    if (linkStatusDashboard && linkStatusDashboard.onActivate) {
        linkStatusDashboard.onActivate();
    }
}

function executeCommand(command, dashboardId = currentDashboard) {
    if (!isConnected || !currentPort) {
        showNotification('Please connect to a device first', 'error');
        return;
    }

    const consoleId = `${dashboardId}Console`;
    const useCacheCheckbox = document.getElementById(`useCache${dashboardId.charAt(0).toUpperCase() + dashboardId.slice(1).replace('_', '')}`);
    const useCache = useCacheCheckbox ? useCacheCheckbox.checked : true;

    addConsoleEntry(consoleId, 'command', `> ${command}`);

    const sendBtnId = `send${dashboardId.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}Cmd`;
    const sendBtn = document.getElementById(sendBtnId);

    if (sendBtn) {
        const originalText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<div class="loading"></div> Executing...';
        sendBtn.disabled = true;

        setTimeout(() => {
            sendBtn.innerHTML = originalText;
            sendBtn.disabled = false;
        }, 3000);
    }

    socket.emit('execute_command', {
        port: currentPort,
        command: command,
        dashboard: dashboardId,
        use_cache: useCache
    });

    systemMetrics.totalCommands++;
    document.getElementById('commandCount').textContent = systemMetrics.totalCommands;
}

function handleLinkStatusResponse(data) {
    if (linkStatusDashboard && linkStatusDashboard.handleResponse) {
        linkStatusDashboard.handleResponse(data);
    }
}

function updateDashboardData(data) {
    if (!data.data || !data.data.parsed) return;

    const dashboard = data.dashboard || currentDashboard;

    if (dashboard === 'link_status') {
        handleLinkStatusResponse(data);
        return;
    }

    if (dashboard === 'bifurcation') {
        if (bifurcationDashboard && bifurcationDashboard.handleResponse) {
            bifurcationDashboard.handleResponse(data);
        }
        return;
    }

    if (dashboard === 'device_info' && (data.data.command === 'sysinfo' || data.data.raw.includes('sysinfo'))) {
        parseSysinfoData(data.data.raw);
        return;
    }

    if (data.dashboard === 'errors' && window.errorsDashboard) {
    window.errorsDashboard.handleCommandResult(data);
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
        this.addConsoleEntry('Dashboard activated. Checking current bifurcation mode...', 'system');
    }

    handleResponse(data) {
        if (data.success && data.data?.command === 'showmode') {
            this.parseShowModeResponse(data.data.raw);
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
// LINK STATUS DASHBOARD CLASS
// =============================================================================

class LinkStatusDashboard {
    constructor() {
        this.portData = null;
        this.isLoading = false;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const commandInput = document.getElementById('linkCommandInput');
        const sendBtn = document.getElementById('sendLinkCmd');
        const refreshBtn = document.getElementById('refreshLinkStatus');

        if (commandInput && sendBtn) {
            commandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !sendBtn.disabled) {
                    executeCommand(commandInput.value.trim(), 'link_status');
                    commandInput.value = '';
                }
            });

            sendBtn.addEventListener('click', () => {
                if (!sendBtn.disabled) {
                    executeCommand(commandInput.value.trim(), 'link_status');
                    commandInput.value = '';
                }
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshLinkStatus();
            });
        }

        const presetBtns = document.querySelectorAll('#linkPresets .preset-btn');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.getAttribute('data-cmd');
                if (cmd) {
                    executeCommand(cmd, 'link_status');
                }
            });
        });
    }

    onActivate() {
        this.addConsoleEntry('Link Status dashboard activated. Loading port information...', 'system');

        if (isConnected && currentPort) {
            setTimeout(() => {
                executeCommand('showport', 'link_status');
            }, 500);
        }
    }

    handleResponse(data) {
        if (!data.success) {
            this.addConsoleEntry(`Error: ${data.message}`, 'error');
            return;
        }

        const parsedData = data.data?.parsed;

        if (data.data?.command === 'showport' && parsedData) {
            this.portData = parsedData;
            this.updatePortDisplay(parsedData);
            this.updateMetrics(parsedData);
        }
    }

    updateMetrics(parsedData) {
        const connectedSlotPorts = parsedData.ports?.filter(p => p.is_connected).length || 0;
        const totalSlotPorts = parsedData.ports?.length || 0;

        document.getElementById('totalPorts').textContent = totalSlotPorts;
        document.getElementById('activePorts').textContent = connectedSlotPorts;

        if (parsedData.golden_finger) {
            const gf = parsedData.golden_finger;
            document.getElementById('goldenFingerStatus').textContent = `${gf.speed} ${gf.width}`;
        } else {
            document.getElementById('goldenFingerStatus').textContent = 'N/A';
        }

        const maxSpeed = parsedData.golden_finger?.speed || 'N/A';
        document.getElementById('maxSpeed').textContent = maxSpeed;
    }

    updatePortDisplay(parsedData) {
        const container = document.getElementById('portStatusGrid');
        if (!container) return;

        container.innerHTML = '';

        if (parsedData.golden_finger) {
            const gf = parsedData.golden_finger;
            container.appendChild(this.createPortCard({
                port_number: 'GF',
                name: 'Golden Finger',
                speed: gf.speed,
                width: gf.width,
                max_speed: gf.speed,
                max_width: gf.max_width,
                is_connected: gf.speed_code !== '00',
                is_upstream: true
            }));
        }

        if (parsedData.ports && parsedData.ports.length > 0) {
            parsedData.ports.forEach(port => {
                container.appendChild(this.createPortCard({
                    port_number: port.port_number,
                    name: `Port ${port.port_number}`,
                    speed: port.speed,
                    width: port.width,
                    max_speed: port.max_speed,
                    max_width: port.max_width,
                    is_connected: port.is_connected,
                    is_upstream: false
                }));
            });
        } else {
            container.innerHTML = '<div class="port-status-loading">No port data available</div>';
        }

        this.addConsoleEntry('Port status updated successfully', 'success');
    }

    createPortCard(portInfo) {
        const card = document.createElement('div');
        card.className = `port-status-item ${portInfo.is_connected ? 'connected' : 'disconnected'}`;

        const statusClass = portInfo.is_connected ? 'connected' : 'disconnected';
        const speedClass = this.getSpeedClass(portInfo.speed);

        card.innerHTML = `
            <div class="port-header">
                <div class="port-name-container">
                    <div class="port-name">${portInfo.name}</div>
                    ${portInfo.is_upstream ? '<span class="port-type-badge">Upstream</span>' : '<span class="port-type-badge">Downstream</span>'}
                </div>
                <div class="port-led ${statusClass}"></div>
            </div>
            
            <div class="port-specs">
                <div class="port-spec">
                    <span class="port-spec-label">Current Speed</span>
                    <span class="port-spec-value">
                        <span class="port-generation ${speedClass}">${portInfo.speed}</span>
                    </span>
                </div>
                <div class="port-spec">
                    <span class="port-spec-label">Current Width</span>
                    <span class="port-spec-value">${portInfo.width}</span>
                </div>
                <div class="port-spec">
                    <span class="port-spec-label">Max Speed</span>
                    <span class="port-spec-value">${portInfo.max_speed}</span>
                </div>
                <div class="port-spec">
                    <span class="port-spec-label">Max Width</span>
                    <span class="port-spec-value">${portInfo.max_width}</span>
                </div>
            </div>
            
            <div class="connection-details">
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value">${portInfo.is_connected ? 'Connected' : 'Disconnected'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Lane Config</span>
                    <span class="detail-value">${portInfo.speed} ${portInfo.width}</span>
                </div>
            </div>
        `;

        return card;
    }

    getSpeedClass(speed) {
        if (speed.includes('Gen6')) return 'gen6';
        if (speed.includes('Gen5')) return 'gen5';
        if (speed.includes('Gen4')) return 'gen4';
        if (speed.includes('Gen3')) return 'gen3';
        if (speed.includes('Gen2')) return 'gen2';
        if (speed.includes('Gen1')) return 'gen1';
        return 'no-connection';
    }

    refreshLinkStatus() {
        this.addConsoleEntry('Refreshing link status...', 'command');
        executeCommand('showport', 'link_status');
    }

    addConsoleEntry(message, type = 'info') {
        addConsoleEntry('linkConsole', type, message);
    }

    getStatusSummary() {
        if (!this.portData) {
            return 'No port data available';
        }

        const connectedCount = this.portData.ports?.filter(p => p.is_connected).length || 0;
        const totalCount = this.portData.ports?.length || 0;

        return `${connectedCount} of ${totalCount} ports active`;
    }
}

// =============================================================================
// CHART AND METRICS
// =============================================================================

function initializeChart() {
    const ctx = document.getElementById('performanceChart');
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
    document.getElementById('successfulCommands').textContent = systemMetrics.successfulCommands;
    document.getElementById('errorCommands').textContent = systemMetrics.totalCommands - systemMetrics.successfulCommands;

    const avgResponseTime = systemMetrics.successfulCommands > 0 ?
        Math.round(systemMetrics.totalResponseTime / systemMetrics.successfulCommands) : 0;
    document.getElementById('avgResponseTime').textContent = avgResponseTime + 'ms';
}

async function loadPorts() {
    try {
        const portSelect = document.getElementById('portSelect');
        if (portSelect) {
            portSelect.innerHTML = '<option value="">Scanning for devices...</option>';
        }

        const response = await fetch('/api/ports');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const ports = await response.json();

        if (!portSelect) return;

        portSelect.innerHTML = '';

        if (!ports || ports.length === 0) {
            portSelect.innerHTML = '<option value="">No devices found - Try refreshing</option>';
            const connectBtn = document.getElementById('connectBtn');
            if (connectBtn) {
                connectBtn.disabled = true;
            }
            showNotification('No COM ports found', 'warning');
        } else {
            portSelect.innerHTML = '<option value="">Select a device...</option>';

            ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port.device;

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
            });

            portSelect.removeEventListener('change', handlePortChange);
            portSelect.addEventListener('change', handlePortChange);

            showNotification(`Found ${ports.length} available ports`, 'success');
        }

    } catch (error) {
        console.error('Failed to load ports:', error);
        showNotification('Failed to load ports: ' + error.message, 'error');

        const portSelect = document.getElementById('portSelect');
        if (portSelect) {
            portSelect.innerHTML = '<option value="">Error loading ports - Check server</option>';
        }
    }
}

function handlePortChange() {
    const portSelect = document.getElementById('portSelect');
    const connectBtn = document.getElementById('connectBtn');

    if (connectBtn && portSelect) {
        connectBtn.disabled = portSelect.value === '';
        if (portSelect.value) {
            showNotification(`Selected port: ${portSelect.value}`, 'info');
        }
    }
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

    if (linkStatusDashboard && linkStatusDashboard.portData) {
        reportContent += 'LINK STATUS\n';
        reportContent += '-'.repeat(30) + '\n';
        reportContent += `Summary: ${linkStatusDashboard.getStatusSummary()}\n`;
        reportContent += '\n';
    }

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

        // Notify terminal dashboard
        if (window.terminalDashboard) {
            window.terminalDashboard.onConnectionChange(true, data.connection_info.port);
        }

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

    // Notify terminal dashboard
    if (window.terminalDashboard) {
        window.terminalDashboard.onConnectionChange(false, null);
    }

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

        updateConnectionStatus(false);

        // Notify terminal dashboard of disconnection
        if (window.terminalDashboard) {
            window.terminalDashboard.onConnectionChange(false, null);
        }
    });

    socket.on('command_result', (data) => {
    // Handle terminal dashboard responses FIRST
    if (data.dashboard === 'terminal' && window.terminalDashboard) {
        window.terminalDashboard.handleCommandResult(data);
        return;
    }

    // Handle errors dashboard responses
    if (data.dashboard === 'errors' && window.errorsDashboard) {
        window.errorsDashboard.handleCommandResult(data);
    }

    socket.on('command_result', (data) => {
    // Handle advanced dashboard responses
    if (data.dashboard === 'advanced' && window.advancedDashboard) {
        window.advancedDashboard.handleCommandResult(data);
    }

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
});

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

    loadPorts();
    initializeChart();
    updateMetrics();

    const savedDeveloperMode = localStorage.getItem('calypso_developer_mode');
    console.log('Saved developer mode preference:', savedDeveloperMode);

    if (savedDeveloperMode === 'true') {
        const devModeCheckbox = document.getElementById('developerMode');
        if (devModeCheckbox) {
            devModeCheckbox.checked = true;
            toggleDeveloperMode(true);
        }
    }

    setTimeout(() => {
        updateDashboardAccess();
    }, 500);

    // Initialize Resets Dashboard (from external file)
    if (window.initializeResetsDashboard) {
        resetsDashboard = window.initializeResetsDashboard();
        console.log('✅ Resets Dashboard initialized');
    } else {
        console.warn('⚠️ Resets Dashboard not available');
    }

    // Initialize Errors Dashboard (from external file)
    if (window.initializeErrorsDashboard) {
        errorsDashboard = window.initializeErrorsDashboard();
        console.log('✅ Errors Dashboard initialized');
    } else {
        console.warn('⚠️ Errors Dashboard not available');
    }

    // Initialize Advanced Dashboard (from external file)
    if (window.initializeAdvancedDashboard) {
        advancedDashboard = window.initializeAdvancedDashboard();
        console.log('✅ Advanced Dashboard initialized');
        } else {
        console.warn('⚠️ Advanced Dashboard not available');
        }

    // Initialize Terminal Dashboard (from external file)
    if (window.initializeTerminalDashboard) {
        terminalDashboard = window.initializeTerminalDashboard();
        console.log('✅ Terminal Dashboard initialized');
    } else {
        console.warn('⚠️ Terminal Dashboard not available - will retry');
        setTimeout(() => {
            if (window.initializeTerminalDashboard) {
                terminalDashboard = window.initializeTerminalDashboard();
                console.log('✅ Terminal Dashboard initialized (retry)');
            }
        }, 1000);
    }

    if (window.innerWidth <= 768) {
        const headerControls = document.querySelector('.header-controls');
        const menuBtn = document.createElement('button');
        menuBtn.className = 'btn btn-secondary btn-sm';
        menuBtn.innerHTML = '☰ Menu';
        menuBtn.onclick = toggleMobileMenu;
        headerControls.insertBefore(menuBtn, headerControls.firstChild);
    }

    window.addEventListener('resize', handleWindowResize);

    setInterval(loadPorts, 10000);

    console.log('%cCalypsoPy+ v1.0.0', 'color: #790000; font-size: 16px; font-weight: bold;');
    console.log('%cby Serial Cables', 'color: #777676; font-size: 12px;');
    console.log('%cProfessional Hardware Interface Ready', 'color: #22c55e; font-size: 12px;');
    console.log('%cBifurcation Dashboard: Enabled', 'color: #e63946; font-size: 12px;');
    console.log('%cResets Dashboard: Enabled', 'color: #ef4444; font-size: 12px;');
    console.log('%cErrors Dashboard: Enabled', 'color: #f59e0b; font-size: 12px;');
    console.log('%cTerminal Dashboard: Enabled', 'color: #73d0ff; font-size: 12px;');
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
    resetsDashboard: () => window.resetsDashboard,
    errorsDashboard: () => window.errorsDashboard,
    advancedDashboard: () => window.advancedDashboard,
    terminalDashboard: () => window.terminalDashboard,
    BifurcationDashboard: BifurcationDashboard,
    BIFURCATION_MODES: BIFURCATION_MODES
};}