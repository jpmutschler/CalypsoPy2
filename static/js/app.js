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
let lastSysinfoData = null;
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
let clockDashboard = null;
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

        if (dashboard === 'connection' || dashboard === 'analytics' || dashboard === 'user-manual') {
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
            } else if (dashboardId === 'link_status') {
                initializeLinkStatusDashboard();
                setTimeout(() => {
                    executeCommand('showport', 'link_status');
                }, 500);
            } else if (dashboardId === 'clock') {
                initializeClockDashboard();
                setTimeout(() => {
                    // Execute all three clock commands
                    executeCommand('showmode', 'clock');
                    setTimeout(() => executeCommand('clk', 'clock'), 1000);
                    setTimeout(() => executeCommand('spread', 'clock'), 2000);
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

function initializeClockDashboard() {
    if (!clockDashboard) {
        clockDashboard = new ClockDashboard();
    }
    if (clockDashboard && clockDashboard.onActivate) {
        clockDashboard.onActivate();
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

    // Handle special console IDs for different dashboards
    let consoleId;
    if (dashboardId === 'link_status') {
        consoleId = 'linkConsole';
    } else {
        consoleId = `${dashboardId}Console`;
    }
    
    const useCacheCheckbox = document.getElementById(`useCache${dashboardId.charAt(0).toUpperCase() + dashboardId.slice(1).replace('_', '')}`);
    const useCache = useCacheCheckbox ? useCacheCheckbox.checked : true;

    // Only try to add console entry if the console element exists
    const consoleElement = document.getElementById(consoleId);
    if (consoleElement) {
        addConsoleEntry(consoleId, 'command', `> ${command}`);
    }

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

    if (dashboard === 'clock') {
        if (clockDashboard && clockDashboard.handleResponse) {
            clockDashboard.handleResponse(data);
        }
        return;
    }

    if (dashboard === 'device_info' && (data.data.command === 'sysinfo' || data.data.raw.includes('sysinfo'))) {
        parseSysinfoData(data.data.parsed);
        return;
    }

    if (data.dashboard === 'errors' && window.errorsDashboard) {
    window.errorsDashboard.handleCommandResult(data);
    }
}

// =============================================================================
// CLOCK DASHBOARD CLASS
// =============================================================================

class ClockDashboard {
    constructor() {
        this.firmwareConfig = null;
        this.refclkData = null;
        this.sscData = null;
        this.isLoading = false;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const refreshBtn = document.getElementById('refreshClock');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshClockStatus();
            });
        }
    }

    onActivate() {
        console.log('Clock Dashboard activated. Fetching clock status...');
    }

    handleResponse(data) {
        if (!data.success) return;

        const command = data.data?.command?.toLowerCase();
        const type = data.data?.type;

        if (command === 'showmode' || type === 'showmode_response') {
            this.handleShowModeResponse(data.data);
        } else if (command === 'clk' || type === 'clk_response') {
            this.handleClkResponse(data.data);
        } else if (command === 'spread' || type === 'spread_response') {
            this.handleSpreadResponse(data.data);
        }
    }

    handleShowModeResponse(data) {
        if (data.parsed?.firmware_config !== undefined) {
            this.firmwareConfig = data.parsed.firmware_config;
            this.updateFirmwareDisplay();
        }
    }

    handleClkResponse(data) {
        if (data.parsed?.refclk_status) {
            this.parseRefclkStatus(data.parsed.refclk_status);
        }
    }

    handleSpreadResponse(data) {
        if (data.parsed?.ssc_spread) {
            this.parseSSCSpread(data.parsed.ssc_spread);
        }
    }

    parseRefclkStatus(response) {
        const lines = response.split('\n');
        const portGroups = [];
        
        lines.forEach(line => {
            const match = line.match(/Port Group (\d+):\s*(\w+)/);
            if (match) {
                portGroups.push({
                    group: parseInt(match[1]),
                    status: match[2].toLowerCase()
                });
            }
        });

        this.refclkData = portGroups;
        this.updateRefclkGrid();
        this.updateRefclkStatus();
    }

    parseSSCSpread(response) {
        const lines = response.split('\n');
        const sscData = {};
        
        lines.forEach(line => {
            if (line.includes('Spread Percentage:')) {
                const match = line.match(/Spread Percentage:\s*(.+)/);
                if (match) sscData.percentage = match[1];
            } else if (line.includes('PCIe 6.x Compliance:')) {
                const match = line.match(/PCIe 6.x Compliance:\s*(.+)/);
                if (match) sscData.compliance = match[1];
            } else if (line.includes('Spread Type:')) {
                const match = line.match(/Spread Type:\s*(.+)/);
                if (match) sscData.type = match[1];
            } else if (line.includes('Modulation Frequency:')) {
                const match = line.match(/Modulation Frequency:\s*(.+)/);
                if (match) sscData.frequency = match[1];
            }
        });

        this.sscData = sscData;
        this.updateSSCDisplay();
    }

    updateFirmwareDisplay() {
        if (!this.firmwareConfig) return;
        
        // Update the overview metrics
        this.updateElement('firmwareConfig', this.firmwareConfig.toString());
        
        // Map mode numbers to descriptions
        const modeDescriptions = {
            1: 'SSC without Precoding',
            2: 'SSC with Precoding', 
            3: 'Common Clock without Precoding',
            4: 'Common Clock with Precoding'
        };
        
        // Update current mode display
        this.updateElement('currentModeNumber', this.firmwareConfig.toString());
        this.updateElement('currentModeDescription', modeDescriptions[this.firmwareConfig] || 'Unknown Configuration');
        
        // Highlight active mode in the list
        this.highlightActiveMode(this.firmwareConfig);
    }
    
    highlightActiveMode(activeMode) {
        const modeItems = document.querySelectorAll('.mode-item');
        modeItems.forEach((item, index) => {
            const modeNumber = index + 1; // Mode numbers are 1-based
            if (modeNumber === activeMode) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    updateRefclkGrid() {
        const grid = document.getElementById('refclkGrid');
        if (!grid || !this.refclkData) return;

        grid.innerHTML = '';
        this.refclkData.forEach(group => {
            const card = document.createElement('div');
            card.className = 'refclk-group-card';
            card.innerHTML = `
                <div class="refclk-group-title">Port Group ${group.group}</div>
                <div class="refclk-status ${group.status}">${group.status.charAt(0).toUpperCase() + group.status.slice(1)}</div>
            `;
            grid.appendChild(card);
        });
    }

    updateRefclkStatus() {
        if (!this.refclkData) return;
        
        const enabledCount = this.refclkData.filter(g => g.status === 'enabled').length;
        const totalCount = this.refclkData.length;
        this.updateElement('refclkStatus', `${enabledCount}/${totalCount} Enabled`);
    }

    updateSSCDisplay() {
        if (!this.sscData) return;

        this.updateElement('sscSpread', this.sscData.percentage || '--');
        this.updateElement('sscPercentage', this.sscData.percentage || '--');
        this.updateElement('pcie6xCompliance', this.sscData.compliance || '--');
        this.updateElement('spreadRange', this.sscData.percentage || '--');
        this.updateElement('modulationType', this.sscData.type || '--');
        this.updateElement('clockCompliance', this.sscData.compliance || '--');
    }

    refreshClockStatus() {
        console.log('Refreshing clock status...');
        executeCommand('showmode', 'clock');
        setTimeout(() => executeCommand('clk', 'clock'), 1000);
        setTimeout(() => executeCommand('spread', 'clock'), 2000);
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    getStatusSummary() {
        if (!this.firmwareConfig && !this.refclkData && !this.sscData) {
            return 'No clock information available';
        }

        let summary = '';
        if (this.firmwareConfig) summary += `Config: ${this.firmwareConfig}`;
        if (this.refclkData) {
            const enabledCount = this.refclkData.filter(g => g.status === 'enabled').length;
            summary += `, REFCLK: ${enabledCount}/${this.refclkData.length}`;
        }
        if (this.sscData?.percentage) summary += `, SSC: ${this.sscData.percentage}`;
        
        return summary || 'Clock status available';
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
        
        // Bind port overlay click events
        this.bindPortOverlayEvents();
    }
    
    bindPortOverlayEvents() {
        const portOverlays = document.querySelectorAll('.port-overlay');
        portOverlays.forEach(overlay => {
            overlay.addEventListener('click', () => {
                const location = overlay.getAttribute('data-location');
                this.highlightPortGroup(location);
            });
        });
    }
    
    highlightPortGroup(location) {
        // Scroll to and highlight the corresponding port group card
        const portGroupCards = document.querySelectorAll('.port-group-card');
        portGroupCards.forEach(card => {
            card.style.border = '1px solid #e2e8f0';
            card.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
        });
        
        // Find and highlight the matching port group
        if (this.portData && this.portData.port_groups && this.portData.port_groups[location]) {
            const group = this.portData.port_groups[location];
            const groupTitle = group.name;
            
            portGroupCards.forEach(card => {
                const titleElement = card.querySelector('.port-group-title');
                if (titleElement && titleElement.textContent === groupTitle) {
                    card.style.border = '2px solid var(--primary-red)';
                    card.style.boxShadow = '0 4px 15px rgba(220, 53, 69, 0.3)';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
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
            this.updatePhysicalLayout(parsedData);
            this.updatePortGroups(parsedData);
            this.updateMetrics(parsedData);
        }
    }

    updateMetrics(parsedData) {
        // Update Atlas 3 version banner
        const versionBanner = document.querySelector('.atlas3-version-banner');
        if (versionBanner && parsedData.atlas3_version) {
            const versionValue = versionBanner.querySelector('.atlas3-version-value');
            if (versionValue) {
                versionValue.textContent = parsedData.atlas3_version;
            }
        }

        // Calculate total ports and active ports across all groups
        let totalPorts = 0;
        let activePorts = 0;
        let goldenFingerPort = null;
        let maxSpeedDetected = 'Gen1';
        
        if (parsedData.port_groups) {
            Object.values(parsedData.port_groups).forEach(group => {
                if (group.ports) {
                    totalPorts += group.ports.length;
                    const activeGroupPorts = group.ports.filter(p => p.status && p.status.toLowerCase() !== 'idle');
                    activePorts += activeGroupPorts.length;
                    
                    // Find Golden Finger port for speed display
                    if (group.name && group.name.includes('Gold Finger') && activeGroupPorts.length > 0) {
                        goldenFingerPort = activeGroupPorts[0]; // Should only be one golden finger port
                    }
                    
                    // Track maximum speed detected across all active ports
                    activeGroupPorts.forEach(port => {
                        if (port.current_speed && this.compareSpeed(port.current_speed, maxSpeedDetected) > 0) {
                            maxSpeedDetected = port.current_speed;
                        }
                    });
                }
            });
        }

        // Update metrics cards
        const totalPortsEl = document.getElementById('totalPorts');
        const activePortsEl = document.getElementById('activePorts');
        const goldenFingerStatusEl = document.getElementById('goldenFingerStatus');
        const maxSpeedEl = document.getElementById('maxSpeed');

        if (totalPortsEl) totalPortsEl.textContent = totalPorts;
        if (activePortsEl) activePortsEl.textContent = activePorts;
        if (goldenFingerStatusEl) {
            goldenFingerStatusEl.textContent = goldenFingerPort ? goldenFingerPort.current_speed : '--';
        }
        if (maxSpeedEl) {
            maxSpeedEl.textContent = activePorts > 0 ? maxSpeedDetected : '--';
        }
        if (atlas3VersionEl) atlas3VersionEl.textContent = parsedData.atlas3_version || 'Unknown';
        if (portUtilizationEl) {
            const utilization = totalPorts > 0 ? Math.round((activePorts / totalPorts) * 100) : 0;
            portUtilizationEl.textContent = `${utilization}%`;
        }
    }

    updatePhysicalLayout(parsedData) {
        // Update port overlays on the physical card image
        const portOverlays = document.querySelectorAll('.port-overlay');
        
        portOverlays.forEach(overlay => {
            const location = overlay.getAttribute('data-location');
            if (parsedData.port_groups && parsedData.port_groups[location]) {
                const group = parsedData.port_groups[location];
                const activePorts = group.ports.filter(p => p.status && p.status.toLowerCase() !== 'idle').length;
                
                // Add or update status indicator
                let indicator = overlay.querySelector('.port-status-indicator');
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.className = 'port-status-indicator';
                    overlay.appendChild(indicator);
                }
                
                // Update indicator based on port activity - only show if there are active ports
                if (activePorts === 0) {
                    // Hide overlay for groups with no active ports
                    overlay.style.display = 'none';
                    overlay.classList.remove('has-connection');
                } else {
                    // Show overlay and set indicator based on port statuses
                    overlay.style.display = 'block';
                    overlay.classList.add('has-connection');
                    
                    // Check if any ports have 'Connected' status specifically
                    const hasConnectedPorts = group.ports.some(p => p.status && p.status.toLowerCase() === 'connected');
                    const hasActivePorts = group.ports.some(p => p.status && p.status.toLowerCase() === 'active');
                    
                    if (hasConnectedPorts) {
                        indicator.className = 'port-status-indicator connected';
                    } else if (hasActivePorts) {
                        indicator.className = 'port-status-indicator active';
                    } else {
                        indicator.className = 'port-status-indicator active'; // Default for any non-idle ports
                    }
                }
                
                // Update connected devices display only for active ports
                let connectedDevicesDiv = overlay.querySelector('.connected-devices');
                if (connectedDevicesDiv && activePorts > 0) {
                    // Filter for active connected devices (not idle)
                    const activeConnectedPorts = group.ports.filter(p => 
                        p.is_connected && p.status && p.status.toLowerCase() !== 'idle'
                    );
                    
                    if (activeConnectedPorts.length > 0) {
                        const deviceInfo = activeConnectedPorts.map(port => 
                            `Port ${port.port_number}: ${port.current_speed} x${port.current_width}`
                        ).join('<br>');
                        
                        connectedDevicesDiv.innerHTML = deviceInfo;
                        connectedDevicesDiv.style.opacity = '1';
                        connectedDevicesDiv.style.visibility = 'visible';
                    } else {
                        connectedDevicesDiv.innerHTML = '';
                        connectedDevicesDiv.style.opacity = '0';
                        connectedDevicesDiv.style.visibility = 'hidden';
                    }
                }
                
                // Update overlay title with current status (only show active ports count)
                if (activePorts > 0) {
                    overlay.setAttribute('title', `${group.name}: ${activePorts} active port${activePorts !== 1 ? 's' : ''}`);
                }
            }
        });
    }

    updatePortGroups(parsedData) {
        const container = document.querySelector('.port-groups-container');
        if (!container) return;

        container.innerHTML = '';

        if (parsedData.port_groups) {
            Object.entries(parsedData.port_groups).forEach(([groupKey, group]) => {
                if (group.ports && group.ports.length > 0) {
                    // Only show groups that have active ports, but within those groups show ALL ports
                    const activePorts = group.ports.filter(p => p.status && p.status.toLowerCase() !== 'idle');
                    if (activePorts.length > 0) {
                        container.appendChild(this.createPortGroupCard(group));
                    }
                }
            });
        }

        if (container.children.length === 0) {
            container.innerHTML = '<div class="link-status-loading"><div class="loading-spinner"></div>No active ports found</div>';
        } else {
            this.addConsoleEntry('Port groups updated successfully', 'success');
        }
    }

    createPortGroupCard(group) {
        const card = document.createElement('div');
        card.className = 'port-group-card';
        
        // For the Port Group Detail tile, show ALL ports (both active and idle)
        const allPortsData = group.ports;
        const activePortsData = group.ports.filter(p => p.status && p.status.toLowerCase() !== 'idle');
        const activePorts = activePortsData.length;
        
        card.innerHTML = `
            <div class="port-group-header">
                <div class="port-group-title">${group.name}</div>
                <div class="port-group-range">${group.port_range}</div>
            </div>
            
            <div class="port-group-summary">
                <div class="port-summary-item">
                    <span class="port-summary-value">${activePorts}</span>
                    <span class="port-summary-label">Active Port${activePorts !== 1 ? 's' : ''}</span>
                </div>
            </div>
            
            <div class="port-details-list">
                ${allPortsData.map(port => `
                    <div class="port-detail-item">
                        <div class="port-detail-header">
                            <span class="port-detail-name">Port ${port.port_number}</span>
                            <span class="port-detail-status ${this.getStatusClass(port.status)} ${port.status && port.status.toLowerCase() === 'connected' ? 'connected-tooltip' : ''}">
                                ${port.status || 'Unknown'}
                            </span>
                        </div>
                        ${port.status && port.status.toLowerCase() !== 'idle' ? `
                            <div class="port-detail-specs">
                                <div class="port-spec">
                                    <span class="port-spec-label">Speed</span>
                                    <span class="port-spec-value speed">${port.current_speed || '--'}</span>
                                </div>
                                <div class="port-spec">
                                    <span class="port-spec-label">Width</span>
                                    <span class="port-spec-value width">x${port.current_width || 0}</span>
                                </div>
                                <div class="port-spec">
                                    <span class="port-spec-label">Max Speed</span>
                                    <span class="port-spec-value speed">${port.max_speed || '--'}</span>
                                </div>
                                <div class="port-spec">
                                    <span class="port-spec-label">Max Width</span>
                                    <span class="port-spec-value width">x${port.max_width || 0}</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        return card;
    }
    
    getStatusClass(status) {
        if (!status) return 'idle';
        const statusLower = status.toLowerCase();
        if (statusLower === 'idle') return 'idle';
        if (statusLower === 'connected') return 'connected';
        if (statusLower.includes('active')) return 'active';
        if (statusLower.includes('error') || statusLower.includes('fail')) return 'error';
        return 'idle';
    }
    
    compareSpeed(speed1, speed2) {
        // Compare PCIe speeds, returns 1 if speed1 > speed2, -1 if speed1 < speed2, 0 if equal
        const speedOrder = {'Gen1': 1, 'Gen2': 2, 'Gen3': 3, 'Gen4': 4, 'Gen5': 5, 'Gen6': 6};
        const val1 = speedOrder[speed1] || 0;
        const val2 = speedOrder[speed2] || 0;
        
        if (val1 > val2) return 1;
        if (val1 < val2) return -1;
        return 0;
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
        // Link Status dashboard doesn't have a console - use notifications instead
        if (type === 'error') {
            showNotification(message, 'error');
        } else if (type === 'success') {
            showNotification(message, 'success');
        } else if (type === 'command') {
            // Don't show command notifications for cleaner UX
            console.log(`Link Status: ${message}`);
        } else {
            console.log(`Link Status: ${message}`);
        }
    }

    getStatusSummary() {
        if (!this.portData) {
            return 'No port data available';
        }

        let totalPorts = 0;
        let activePorts = 0;
        
        if (this.portData.port_groups) {
            Object.values(this.portData.port_groups).forEach(group => {
                if (group.ports) {
                    totalPorts += group.ports.length;
                    activePorts += group.ports.filter(p => p.status && p.status.toLowerCase() !== 'idle').length;
                }
            });
        }

        return `${activePorts} of ${totalPorts} ports active across ${Object.keys(this.portData.port_groups || {}).length} locations`;
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

function parseSysinfoData(parsedData) {
    // Use the properly parsed data from Atlas3Parser
    if (!parsedData || !parsedData.device_info) {
        showNotification('No device information available', 'warning');
        return;
    }

    // Store the data globally for export functionality
    lastSysinfoData = parsedData;

    const deviceInfo = parsedData.device_info;
    const thermalData = parsedData.thermal_data || {};
    const voltageRails = parsedData.voltage_rails || [];
    const powerConsumption = parsedData.power_consumption || {};
    const clockStatus = parsedData.clock_status || {};
    const spreadStatus = parsedData.spread_status || {};
    const portSummary = parsedData.port_summary || {};
    const bistResults = parsedData.bist_results || {};

    // Update Hardware Information section
    document.getElementById('hwSerialNumber').textContent = deviceInfo.serial_number || 'Unknown';
    document.getElementById('hwCompany').textContent = deviceInfo.company || 'Unknown';
    document.getElementById('hwModel').textContent = deviceInfo.model || 'Unknown';
    document.getElementById('hwVersion').textContent = deviceInfo.mcu_version || 'Unknown';
    document.getElementById('sdkVersion').textContent = deviceInfo.sbr_version || 'Unknown';

    // Update Device Summary Cards
    document.getElementById('deviceModel').textContent = deviceInfo.model || 'Unknown';
    document.getElementById('firmwareVersion').textContent = deviceInfo.mcu_version || 'Unknown';
    document.getElementById('serialNumber').textContent = deviceInfo.serial_number || 'Unknown';

    // Update Thermal Status
    if (thermalData.switch_temperature) {
        // Update summary card
        document.getElementById('boardTemp').textContent = `${thermalData.switch_temperature.value}°C`;
        
        // Update thermal section temperature
        const thermalBoardTempEl = document.getElementById('thermalBoardTemp');
        if (thermalBoardTempEl) {
            thermalBoardTempEl.textContent = `${thermalData.switch_temperature.value}°C`;
        }
        
        // Update thermal status indicator
        const thermalBoardStatusEl = document.getElementById('thermalBoardStatus');
        if (thermalBoardStatusEl) {
            thermalBoardStatusEl.textContent = thermalData.switch_temperature.status || 'Normal';
            thermalBoardStatusEl.className = `thermal-status ${thermalData.switch_temperature.status || 'normal'}`;
        }
    }

    // Update Fan Speed
    if (thermalData.fan_speed) {
        const fanSpeedEl = document.getElementById('fanSpeed');
        if (fanSpeedEl) {
            fanSpeedEl.textContent = `${thermalData.fan_speed.value} ${thermalData.fan_speed.unit}`;
        }
        
        // Update fan speed bar (optional visual indicator)
        const fanSpeedBar = document.getElementById('fanSpeedBar');
        if (fanSpeedBar && thermalData.fan_speed.value) {
            const percentage = Math.min((thermalData.fan_speed.value / 10000) * 100, 100);
            fanSpeedBar.style.width = `${percentage}%`;
        }
    }

    // Update Voltage Rails - FIX: Populate voltage grid with compact layout
    const voltageGrid = document.getElementById('voltageGrid');
    if (voltageGrid && voltageRails.length > 0) {
        voltageGrid.innerHTML = ''; // Clear existing content
        
        voltageRails.forEach(rail => {
            const voltageItem = document.createElement('div');
            voltageItem.className = 'voltage-item compact';
            const toleranceColor = rail.tolerance_percent > 5 ? 'error' : rail.tolerance_percent > 2 ? 'warning' : 'normal';
            voltageItem.innerHTML = `
                <div class="voltage-header">
                    <span class="voltage-label">${rail.rail_name}</span>
                    <span class="voltage-status ${toleranceColor}"></span>
                </div>
                <div class="voltage-reading">${rail.measured_voltage_v}V</div>
                <div class="voltage-details">
                    <span class="nominal">nom: ${rail.nominal_voltage}V</span>
                    <span class="tolerance ${rail.tolerance_percent >= 0 ? 'positive' : 'negative'}">${rail.tolerance_percent > 0 ? '+' : ''}${rail.tolerance_percent}%</span>
                </div>
            `;
            voltageGrid.appendChild(voltageItem);
        });
    }

    // Update Power Consumption
    if (powerConsumption.load_current) {
        const boardCurrentEl = document.getElementById('boardCurrent');
        if (boardCurrentEl) {
            boardCurrentEl.textContent = `${powerConsumption.load_current.current_ma} mA (${powerConsumption.load_current.value}A)`;
        }
    }
    
    if (powerConsumption.power_voltage) {
        const powerVoltageEl = document.getElementById('powerVoltage');
        if (powerVoltageEl) {
            powerVoltageEl.textContent = `${powerConsumption.power_voltage.value}V`;
        }
    }
    
    if (powerConsumption.load_power) {
        const loadPowerEl = document.getElementById('loadPower');
        if (loadPowerEl) {
            loadPowerEl.textContent = `${powerConsumption.load_power.value}W`;
        }
    }

    // Update Port Configuration
    const portGrid = document.getElementById('portGrid');
    if (portGrid) {
        portGrid.innerHTML = ''; // Clear existing content
        
        // Add Atlas3 version info if available
        const versionEl = document.getElementById('atlas3Version');
        if (versionEl) {
            versionEl.textContent = portSummary.atlas3_version || 'Unknown';
        }
        
        // Helper function to add port sections (only shows non-idle ports)
        const addPortSection = (ports, sectionTitle) => {
            if (ports && ports.length > 0) {
                // Filter out idle ports - only show active/connected ports
                const activePorts = ports.filter(port => {
                    const cleanStatus = port.status ? port.status.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase() : '';
                    return cleanStatus !== 'idle' && port.is_active;
                });
                
                // Only create section if there are active ports to show
                if (activePorts.length > 0) {
                    const sectionHeader = document.createElement('div');
                    sectionHeader.className = 'port-section-header';
                    sectionHeader.textContent = sectionTitle;
                    portGrid.appendChild(sectionHeader);
                    
                    activePorts.forEach(port => {
                        const portItem = document.createElement('div');
                        portItem.className = 'port-item active'; // All shown ports are active
                        
                        // Clean any ANSI codes from status
                        const cleanStatus = port.status ? port.status.replace(/\x1b\[[0-9;]*m/g, '') : 'Unknown';
                        const tooltipClass = cleanStatus.toLowerCase() === 'connected' ? 'connected-tooltip' : '';
                        
                        portItem.innerHTML = `
                            <div class="port-label">${port.connector || 'N/A'} | Port ${port.port_number || 'N/A'}</div>
                            <div class="port-speed">${port.current_speed || 'N/A'} x${port.current_width || 0}</div>
                            <div class="port-max">Max: ${port.max_speed || 'N/A'} x${port.max_width || 0}</div>
                            <div class="port-status active ${tooltipClass}">${cleanStatus}</div>
                        `;
                        portGrid.appendChild(portItem);
                    });
                }
            }
        };
        
        // Helper function to count active ports only
        const countActivePorts = (ports) => {
            if (!ports || !Array.isArray(ports)) return 0;
            return ports.filter(port => {
                const cleanStatus = port.status ? port.status.replace(/\x1b\[[0-9;]*m/g, '').toLowerCase() : '';
                return cleanStatus !== 'idle' && port.is_active;
            }).length;
        };
        
        // Check if we have any active port data
        const activePortCount = countActivePorts(portSummary.upstream_ports) + 
                               countActivePorts(portSummary.ext_mcio_ports) + 
                               countActivePorts(portSummary.int_mcio_ports) + 
                               countActivePorts(portSummary.straddle_ports);
        
        if (activePortCount > 0) {
            // Add all port sections (will filter internally)
            addPortSection(portSummary.upstream_ports, 'Upstream Ports');
            addPortSection(portSummary.ext_mcio_ports, 'EXT MCIO Ports');
            addPortSection(portSummary.int_mcio_ports, 'INT MCIO Ports');
            addPortSection(portSummary.straddle_ports, 'Straddle Ports');
        } else {
            // Show empty state for ports if no active ports
            portGrid.innerHTML = `
                <div style="text-align: center; color: var(--secondary-gray); padding: 20px;">
                    No active ports found
                </div>
            `;
        }
    }

    // Update Clock Status
    if (Object.keys(clockStatus).length > 0) {
        const clockStatusEl = document.getElementById('clockStatus');
        if (clockStatusEl) {
            const clockItems = [];
            if (clockStatus.pcie_straddle_clock) clockItems.push('PCIe Straddle');
            if (clockStatus.ext_mcio_clock) clockItems.push('EXT MCIO');
            if (clockStatus.int_mcio_clock) clockItems.push('INT MCIO');
            clockStatusEl.textContent = clockItems.length > 0 ? clockItems.join(', ') + ' Enabled' : 'All Disabled';
        }
    }
    
    // Update Spread Status
    if (Object.keys(spreadStatus).length > 0) {
        const spreadStatusEl = document.getElementById('spreadStatus');
        if (spreadStatusEl) {
            spreadStatusEl.textContent = spreadStatus.status ? spreadStatus.status.toUpperCase() : 'Unknown';
            spreadStatusEl.className = `status-indicator ${spreadStatus.enabled ? 'normal' : 'warning'}`;
        }
    }
    
    // Update BIST Results
    if (Object.keys(bistResults).length > 0 && bistResults.devices) {
        const bistGrid = document.getElementById('bistGrid');
        if (bistGrid) {
            bistGrid.innerHTML = ''; // Clear existing content
            
            // Add summary
            const bistSummary = document.createElement('div');
            bistSummary.className = 'bist-summary';
            bistSummary.innerHTML = `
                <div class="bist-total">Total: ${bistResults.total_devices || 0}</div>
                <div class="bist-passed">Passed: ${bistResults.passed_devices || 0}</div>
                <div class="bist-failed">Failed: ${bistResults.failed_devices || 0}</div>
            `;
            bistGrid.appendChild(bistSummary);
            
            // Add device results
            bistResults.devices.forEach(device => {
                const deviceItem = document.createElement('div');
                const statusClass = device.passed ? 'passed' : 'failed';
                deviceItem.className = `bist-item ${statusClass}`;
                
                // Clean the status text for display (remove ANSI codes if any)
                const cleanStatus = device.status.replace(/\x1b\[[0-9;]*m/g, '');
                
                deviceItem.innerHTML = `
                    <div class="bist-device">${device.device}</div>
                    <div class="bist-channel">${device.channel}</div>
                    <div class="bist-address">${device.address}</div>
                    <div class="bist-status ${statusClass}">${cleanStatus}</div>
                `;
                bistGrid.appendChild(deviceItem);
            });
        }
    } else {
        // Show empty state for BIST if no data
        const bistGrid = document.getElementById('bistGrid');
        if (bistGrid) {
            bistGrid.innerHTML = `
                <div style="text-align: center; color: var(--secondary-gray); padding: 20px;">
                    No BIST data available
                </div>
            `;
        }
    }


    showNotification('System information updated successfully', 'success');
}

function exportDeviceInfo() {
    const timestamp = new Date().toLocaleString();
    const filename = `CalypsoPy_DeviceInfo_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

    let reportContent = '';
    reportContent += '='.repeat(80) + '\n';
    reportContent += 'CalypsoPy+ Comprehensive Device Information Report\n';
    reportContent += 'Generated by Serial Cables Professional Interface\n';
    reportContent += '='.repeat(80) + '\n';
    reportContent += `Report Generated: ${timestamp}\n`;
    reportContent += `Connection Port: ${currentPort || 'Unknown'}\n`;
    reportContent += `Connection Settings: 115200-8-N-1\n`;
    reportContent += '\n';

    // Export comprehensive sysinfo data if available
    if (lastSysinfoData) {
        const data = lastSysinfoData;
        
        // Device Information
        if (data.device_info) {
            reportContent += 'DEVICE INFORMATION\n';
            reportContent += '-'.repeat(40) + '\n';
            reportContent += `Company: ${data.device_info.company || 'Unknown'}\n`;
            reportContent += `Model: ${data.device_info.model || 'Unknown'}\n`;
            reportContent += `Serial Number: ${data.device_info.serial_number || 'Unknown'}\n`;
            reportContent += `MCU Version: ${data.device_info.mcu_version || 'Unknown'}\n`;
            reportContent += `MCU Build Time: ${data.device_info.mcu_build_time || 'Unknown'}\n`;
            reportContent += `SBR Version: ${data.device_info.sbr_version || 'Unknown'}\n`;
            reportContent += '\n';
        }

        // Thermal Status
        if (data.thermal_data && Object.keys(data.thermal_data).length > 0) {
            reportContent += 'THERMAL STATUS\n';
            reportContent += '-'.repeat(40) + '\n';
            if (data.thermal_data.switch_temperature) {
                reportContent += `Switch Temperature: ${data.thermal_data.switch_temperature.value}°C (Status: ${data.thermal_data.switch_temperature.status})\n`;
            }
            if (data.thermal_data.fan_speed) {
                reportContent += `Fan Speed: ${data.thermal_data.fan_speed.value} ${data.thermal_data.fan_speed.unit} (Status: ${data.thermal_data.fan_speed.status})\n`;
            }
            reportContent += '\n';
        }

        // Voltage Rails
        if (data.voltage_rails && data.voltage_rails.length > 0) {
            reportContent += 'VOLTAGE RAILS\n';
            reportContent += '-'.repeat(40) + '\n';
            data.voltage_rails.forEach(rail => {
                reportContent += `${rail.rail_name}: ${rail.measured_voltage_v}V (Nominal: ${rail.nominal_voltage}V, Tolerance: ${rail.tolerance_percent}%, Status: ${rail.status})\n`;
            });
            reportContent += '\n';
        }

        // Power Consumption
        if (data.power_consumption && Object.keys(data.power_consumption).length > 0) {
            reportContent += 'POWER CONSUMPTION\n';
            reportContent += '-'.repeat(40) + '\n';
            if (data.power_consumption.power_voltage) {
                reportContent += `Power Voltage: ${data.power_consumption.power_voltage.value}V\n`;
            }
            if (data.power_consumption.load_current) {
                reportContent += `Load Current: ${data.power_consumption.load_current.value}A (${data.power_consumption.load_current.current_ma}mA)\n`;
            }
            if (data.power_consumption.load_power) {
                reportContent += `Load Power: ${data.power_consumption.load_power.value}W\n`;
            }
            reportContent += '\n';
        }

        // Port Configuration
        if (data.port_summary && Object.keys(data.port_summary).length > 0) {
            reportContent += 'PORT CONFIGURATION\n';
            reportContent += '-'.repeat(40) + '\n';
            if (data.port_summary.atlas3_version) {
                reportContent += `Atlas3 Chip Version: ${data.port_summary.atlas3_version}\n`;
            }
            reportContent += `Total Ports: ${data.port_summary.total_ports || 0}\n`;
            reportContent += `Active Ports: ${data.port_summary.active_ports || 0}\n`;
            reportContent += '\n';

            // Active Port Details
            const addPortDetails = (ports, sectionName) => {
                if (ports && ports.length > 0) {
                    const activePorts = ports.filter(port => 
                        port.status && port.status.toLowerCase() !== 'idle' && port.is_active
                    );
                    if (activePorts.length > 0) {
                        reportContent += `${sectionName}:\n`;
                        activePorts.forEach(port => {
                            const cleanStatus = port.status ? port.status.replace(/\x1b\[[0-9;]*m/g, '') : 'Unknown';
                            reportContent += `  ${port.connector || 'N/A'} | Port ${port.port_number}: ${port.current_speed} x${port.current_width} (Max: ${port.max_speed} x${port.max_width}) - ${cleanStatus}\n`;
                        });
                        reportContent += '\n';
                    }
                }
            };

            addPortDetails(data.port_summary.upstream_ports, 'Upstream Ports');
            addPortDetails(data.port_summary.ext_mcio_ports, 'EXT MCIO Ports');
            addPortDetails(data.port_summary.int_mcio_ports, 'INT MCIO Ports');
            addPortDetails(data.port_summary.straddle_ports, 'Straddle Ports');
        }

        // Clock Status
        if (data.clock_status && Object.keys(data.clock_status).length > 0) {
            reportContent += 'CLOCK STATUS\n';
            reportContent += '-'.repeat(40) + '\n';
            reportContent += `PCIe Straddle Clock: ${data.clock_status.pcie_straddle_clock ? 'Enabled' : 'Disabled'}\n`;
            reportContent += `EXT MCIO Clock: ${data.clock_status.ext_mcio_clock ? 'Enabled' : 'Disabled'}\n`;
            reportContent += `INT MCIO Clock: ${data.clock_status.int_mcio_clock ? 'Enabled' : 'Disabled'}\n`;
            reportContent += '\n';
        }

        // Spread Status
        if (data.spread_status && Object.keys(data.spread_status).length > 0) {
            reportContent += 'SPREAD SPECTRUM STATUS\n';
            reportContent += '-'.repeat(40) + '\n';
            reportContent += `Status: ${data.spread_status.status || 'Unknown'}\n`;
            reportContent += `Enabled: ${data.spread_status.enabled ? 'Yes' : 'No'}\n`;
            reportContent += '\n';
        }

        // BIST Results
        if (data.bist_results && data.bist_results.devices && data.bist_results.devices.length > 0) {
            reportContent += 'BUILT-IN SELF TEST (BIST) RESULTS\n';
            reportContent += '-'.repeat(40) + '\n';
            reportContent += `Total Devices: ${data.bist_results.total_devices || 0}\n`;
            reportContent += `Passed: ${data.bist_results.passed_devices || 0}\n`;
            reportContent += `Failed: ${data.bist_results.failed_devices || 0}\n`;
            reportContent += '\nDevice Details:\n';
            data.bist_results.devices.forEach(device => {
                const cleanStatus = device.status.replace(/\x1b\[[0-9;]*m/g, '');
                reportContent += `  ${device.channel} | ${device.device} | ${device.address} | ${cleanStatus}\n`;
            });
            reportContent += '\n';
        }
    } else {
        reportContent += 'No device information available. Please run "sysinfo" command first.\n\n';
    }

    // Additional dashboard data
    if (linkStatusDashboard && linkStatusDashboard.portData) {
        reportContent += 'LINK STATUS SUMMARY\n';
        reportContent += '-'.repeat(40) + '\n';
        reportContent += `Summary: ${linkStatusDashboard.getStatusSummary()}\n`;
        reportContent += '\n';
    }

    if (clockDashboard && clockDashboard.firmwareConfig !== null) {
        reportContent += 'CLOCK CONFIGURATION\n';
        reportContent += '-'.repeat(40) + '\n';
        reportContent += `Firmware Config: ${clockDashboard.firmwareConfig}\n`;
        reportContent += `Status: ${clockDashboard.getStatusSummary()}\n`;
        reportContent += '\n';
    }

    reportContent += '='.repeat(80) + '\n';
    reportContent += 'End of CalypsoPy+ Comprehensive Device Report\n';
    reportContent += `Report File: ${filename}\n`;
    reportContent += 'Visit: https://serial-cables.com for more information\n';
    reportContent += '='.repeat(80) + '\n';

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
            if (dashboard === 'user-manual') {
                // Open User's Manual in new window
                window.open('/static/users_manual.html', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
            } else if (dashboard) {
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
    // WebSocket connection established
    socket.on('connect', () => {
        console.log('Connected to CalypsoPy+ server');
        showNotification('Connected to CalypsoPy+ server', 'success');

        // UPDATE: Set header status to show WebSocket is connected
        // Use a generic "Server" label since no device is connected yet
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.className = 'connection-status connected';
            statusElement.innerHTML = `<div class="status-dot"></div><span>Connected</span>`;
        }
    });

    // WebSocket disconnected from server
    socket.on('disconnect', () => {
        console.log('Disconnected from CalypsoPy+ server');
        showNotification('Disconnected from server', 'error');

        // When WebSocket disconnects, also clear device connection
        updateConnectionStatus(false);
    });

    // Device successfully connected
    socket.on('connection_result', (data) => {
        const btn = document.getElementById('connectBtn');
        btn.innerHTML = '<span>🔗</span> Connect Device';
        btn.disabled = false;

        if (data.success) {
            // Update status to show connected device port
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

    // Device disconnected
    socket.on('disconnection_result', (data) => {
        const btn = document.getElementById('disconnectBtn');
        btn.innerHTML = '<span>🔌</span> Disconnect';
        btn.disabled = false;

        // Clear device connection but keep WebSocket server connection status
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

        // After device disconnect, show "Connected to Server" again
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement && socket.connected) {
            statusElement.className = 'connection-status connected';
            statusElement.innerHTML = `<div class="status-dot"></div><span>Connected to Server</span>`;
        }
    });

    // Rest of the socket handlers remain the same...
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

            // After clearing device connection, show server connection if WebSocket is still connected
            const statusElement = document.getElementById('connectionStatus');
            if (statusElement && socket.connected) {
                statusElement.className = 'connection-status connected';
                statusElement.innerHTML = `<div class="status-dot"></div><span>Connected to Server</span>`;
            }
        }
    });
}

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
            const dashboards = ['connection', 'device_info', 'link_status', 'clock', 'i2c', 'advanced', 'resets', 'firmware', 'analytics'];
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
    console.log('%cClock Dashboard: Enabled', 'color: #e63946; font-size: 12px;');
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
    clockDashboard: () => clockDashboard,
    resetsDashboard: () => window.resetsDashboard,
    errorsDashboard: () => window.errorsDashboard,
    advancedDashboard: () => window.advancedDashboard,
    terminalDashboard: () => window.terminalDashboard,
    ClockDashboard: ClockDashboard
};