/**
 * CalypsoPy+ by Serial Cables
 * Professional Hardware Interface JavaScript Application
 */

// Initialize Socket.IO connection
const socket = io();

// Application state
let currentDashboard = 'connection';  // Start with connection dashboard
let currentPort = null;
let isConnected = false;
let systemMetrics = {
    totalCommands: 0,
    successfulCommands: 0,
    totalResponseTime: 0,
    cacheHits: 0,
    commandHistory: []
};

// Chart instance
let responseChart;

// Developer Mode State
let isDeveloperMode = false;

/**
 * Toggle Developer Mode - Simply enables/disables dashboard access
 */
function toggleDeveloperMode() {
    isDeveloperMode = document.getElementById('developerModeToggle').checked;

    if (isDeveloperMode) {
        // Enable all dashboards
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('disabled');
            item.style.opacity = '1';
            item.style.pointerEvents = 'auto';
        });

        // Enable command inputs (for UI development)
        document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
            input.disabled = false;
        });
        document.querySelectorAll('button[id^="send"]').forEach(btn => {
            btn.disabled = false;
        });

        // Update connection status to show developer mode
        const statusElement = document.getElementById('connectionStatus');
        statusElement.className = 'connection-status connected';
        statusElement.innerHTML = `<div class="status-dot"></div><span>Developer Mode</span>`;

        showNotification('Developer Mode enabled - Dashboards unlocked for development', 'success');

    } else {
        // If not connected to real device, disable dashboards
        if (!isConnected) {
            document.querySelectorAll('.nav-item').forEach(item => {
                if (item.dataset.dashboard !== 'connection' && item.dataset.dashboard !== 'analytics') {
                    item.classList.add('disabled');
                    item.style.opacity = '0.5';
                    item.style.pointerEvents = 'none';
                }
            });

            // Disable command inputs
            document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
                input.disabled = true;
            });
            document.querySelectorAll('button[id^="send"]').forEach(btn => {
                btn.disabled = true;
            });

            // Reset connection status
            const statusElement = document.getElementById('connectionStatus');
            statusElement.className = 'connection-status disconnected';
            statusElement.innerHTML = `<div class="status-dot"></div><span>Disconnected</span>`;
        }

        showNotification('Developer Mode disabled', 'info');
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Show notification to user
 */
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

/**
 * Format current timestamp
 */
function formatTimestamp() {
    return new Date().toLocaleTimeString();
}

/**
 * Add entry to console output
 */
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

    // Keep only last 50 entries for performance
    const entries = container.children;
    if (entries.length > 50) {
        container.removeChild(entries[1]); // Keep the initial system message
    }
}

/**
 * Update connection status display
 */
function updateConnectionStatus(connected, port = null) {
    isConnected = connected;
    currentPort = port;

    const statusElement = document.getElementById('connectionStatus');

    if (connected) {
        statusElement.className = 'connection-status connected';
        statusElement.innerHTML = `<div class="status-dot"></div><span>Connected to ${port}</span>`;

        // Update connection details
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

        // Enable command inputs
        document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
            input.disabled = false;
        });
        document.querySelectorAll('button[id^="send"]').forEach(btn => {
            btn.disabled = false;
        });

        // Enable dashboard navigation (remove disabled class)
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.dataset.dashboard !== 'connection') {
                item.classList.remove('disabled');
                item.style.opacity = '1';
                item.style.pointerEvents = 'auto';
            }
        });

    } else {
        statusElement.className = 'connection-status disconnected';
        statusElement.innerHTML = `<div class="status-dot"></div><span>Disconnected</span>`;

        // Update connection details
        const detailsElement = document.getElementById('connectionDetails');
        if (detailsElement) {
            detailsElement.innerHTML = '<p style="color: var(--secondary-gray); font-style: italic;">No device connected</p>';
        }

        // Disable command inputs
        document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
            input.disabled = true;
        });
        document.querySelectorAll('button[id^="send"]').forEach(btn => {
            btn.disabled = true;
        });

        // Disable dashboard navigation (except connection and analytics)
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.dataset.dashboard !== 'connection' && item.dataset.dashboard !== 'analytics') {
                item.classList.add('disabled');
                item.style.opacity = '0.5';
                item.style.pointerEvents = 'none';
            }
        });
    }
}

/**
 * Switch between dashboards
 */
function switchDashboard(dashboardId) {
    // Allow switching if connected OR in developer mode
    if (!isConnected && !isDeveloperMode && dashboardId !== 'connection' && dashboardId !== 'analytics') {
        showNotification('Please connect to a device or enable Developer Mode', 'warning');
        return;
    }

    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.dashboard === dashboardId) {
            item.classList.add('active');
        }
    });

    // Update dashboard content
    document.querySelectorAll('.dashboard-content').forEach(dashboard => {
        dashboard.classList.remove('active');
    });

    const targetDashboard = document.getElementById(`${dashboardId}-dashboard`);
    if (targetDashboard) {
        targetDashboard.classList.add('active');
        currentDashboard = dashboardId;

        // Only auto-execute commands if actually connected (not in developer mode)
        if (dashboardId === 'device_info' && isConnected && currentPort && !isDeveloperMode) {
            setTimeout(() => {
                executeCommand('sysinfo', 'device_info');
            }, 500);
        }

        // Load dashboard-specific data only if actually connected
        if (isConnected && currentPort && !isDeveloperMode) {
            socket.emit('get_dashboard_data', {
                dashboard: dashboardId,
                port: currentPort
            });
        }
    }
}

/**
 * Execute command on connected device
 */
function executeCommand(command, dashboardId = currentDashboard) {
    // In developer mode, just show a simple message
    if (isDeveloperMode && !isConnected) {
        const consoleId = `${dashboardId}Console`;
        addConsoleEntry(consoleId, 'command', `> ${command}`);
        addConsoleEntry(consoleId, 'response', 'Developer Mode: Command not executed (no hardware connected)', formatTimestamp());
        return;
    }

    // Original logic for real connections
    if (!isConnected || !currentPort) {
        showNotification('Please connect to a device or enable Developer Mode for UI development', 'error');
        return;
    }

    const consoleId = `${dashboardId}Console`;
    const useCache = document.getElementById(`useCache${dashboardId.charAt(0).toUpperCase() + dashboardId.slice(1)}`)?.checked || true;

    // Add command to console
    addConsoleEntry(consoleId, 'command', `> ${command}`);

    // Update button state
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

function setupDeveloperModeEventHandlers() {
    const developerToggle = document.getElementById('developerModeToggle');
    if (developerToggle) {
        developerToggle.addEventListener('change', toggleDeveloperMode);
    }

    // Simple export for debugging
    window.CalypsoPy.developerMode = {
    toggle: toggleDeveloperMode,
    isActive: () => isDeveloperMode
    };
}

/**
 * Export device information to TXT file
 */
function exportDeviceInfo() {
    const timestamp = new Date().toLocaleString();
    const deviceModel = document.getElementById('deviceModel').textContent || 'Unknown';
    const firmwareVersion = document.getElementById('firmwareVersion').textContent || 'Unknown';
    const serialNumber = document.getElementById('hwSerialNumber')?.textContent || 'Unknown';

    // Generate filename with timestamp
    const filename = `CalypsoPy_DeviceInfo_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

    // Build the report content
    let reportContent = '';

    // Header
    reportContent += '=' .repeat(60) + '\n';
    reportContent += 'CalypsoPy+ Device Information Report\n';
    reportContent += 'Generated by Serial Cables Professional Interface\n';
    reportContent += '=' .repeat(60) + '\n';
    reportContent += `Report Generated: ${timestamp}\n`;
    reportContent += `Connection Port: ${currentPort || 'Unknown'}\n`;
    reportContent += `Connection Settings: 115200-8-N-1\n`;
    reportContent += '\n';

    // Hardware Information Section
    reportContent += 'HARDWARE INFORMATION\n';
    reportContent += '-' .repeat(30) + '\n';
    reportContent += `Serial Number: ${document.getElementById('hwSerialNumber')?.textContent || 'Unknown'}\n`;
    reportContent += `Company: ${document.getElementById('hwCompany')?.textContent || 'Unknown'}\n`;
    reportContent += `Model: ${document.getElementById('hwModel')?.textContent || 'Unknown'}\n`;
    reportContent += `Version: ${document.getElementById('hwVersion')?.textContent || 'Unknown'}\n`;
    reportContent += `SDK Version: ${document.getElementById('sdkVersion')?.textContent || 'Unknown'}\n`;
    reportContent += '\n';

    // Thermal Status Section
    reportContent += 'THERMAL STATUS\n';
    reportContent += '-' .repeat(30) + '\n';
    reportContent += `Board Temperature: ${document.getElementById('thermalBoardTemp')?.textContent || 'Unknown'}\n`;
    reportContent += `Thermal Status: ${document.getElementById('thermalBoardStatus')?.textContent || 'Unknown'}\n`;
    reportContent += `Fan Speed: ${document.getElementById('fanSpeed')?.textContent || 'Unknown'}\n`;
    reportContent += '\n';

    // Voltage Sensors Section
    reportContent += 'VOLTAGE SENSORS\n';
    reportContent += '-' .repeat(30) + '\n';
    const voltageItems = document.querySelectorAll('.voltage-item');
    if (voltageItems.length > 0) {
        voltageItems.forEach(item => {
            const label = item.querySelector('.voltage-label')?.textContent || 'Unknown';
            const value = item.querySelector('.voltage-value')?.textContent || 'Unknown';
            const unit = item.querySelector('.voltage-unit')?.textContent || 'Unknown';
            const status = item.classList.contains('normal') ? 'Normal' :
                         item.classList.contains('warning') ? 'Warning' :
                         item.classList.contains('error') ? 'Error' : 'Unknown';
            reportContent += `${label}: ${value} ${unit} [${status}]\n`;
        });
    } else {
        reportContent += 'No voltage sensor data available\n';
    }
    reportContent += '\n';

    // Current Status Section
    reportContent += 'CURRENT STATUS\n';
    reportContent += '-' .repeat(30) + '\n';
    reportContent += `Board Current: ${document.getElementById('boardCurrent')?.textContent || 'Unknown'}\n`;
    reportContent += '\n';

    // Port Configuration Section
    reportContent += 'PORT CONFIGURATION\n';
    reportContent += '-' .repeat(30) + '\n';
    const portItems = document.querySelectorAll('.port-item');
    if (portItems.length > 0) {
        portItems.forEach((item, index) => {
            const name = item.querySelector('.port-name')?.textContent || `Port${index}`;
            const specs = item.querySelector('.port-specs')?.textContent || 'Unknown specs';
            const status = item.classList.contains('active') ? 'Active' : 'Inactive';
            reportContent += `${name}: ${specs} [${status}]\n`;
        });
    } else {
        reportContent += 'No port configuration data available\n';
    }
    reportContent += '\n';

    // Error Status Section
    reportContent += 'ERROR STATUS\n';
    reportContent += '-' .repeat(30) + '\n';
    const errorItems = document.querySelectorAll('.error-item');
    if (errorItems.length > 0) {
        errorItems.forEach(item => {
            const label = item.querySelector('.error-label')?.textContent || 'Unknown';
            const count = item.querySelector('.error-count')?.textContent || '0';
            const status = item.classList.contains('no-error') ? 'OK' : 'ERROR';
            reportContent += `${label}: ${count} errors [${status}]\n`;
        });
    } else {
        reportContent += 'No error status data available\n';
    }
    reportContent += '\n';

    // System Summary Section
    reportContent += 'SYSTEM SUMMARY\n';
    reportContent += '-' .repeat(30) + '\n';
    const temp = parseInt(document.getElementById('thermalBoardTemp')?.textContent) || 0;
    const overallStatus = temp < 60 ? 'NORMAL' : temp < 80 ? 'WARNING' : 'CRITICAL';
    reportContent += `Overall System Status: ${overallStatus}\n`;
    reportContent += `Temperature Status: ${document.getElementById('thermalBoardStatus')?.textContent || 'Unknown'}\n`;

    const errorCount = Array.from(errorItems).reduce((total, item) => {
        const count = parseInt(item.querySelector('.error-count')?.textContent) || 0;
        return total + count;
    }, 0);
    reportContent += `Total Error Count: ${errorCount}\n`;

    const voltageStatus = Array.from(voltageItems).every(item =>
        item.classList.contains('normal')) ? 'ALL NORMAL' : 'CHECK REQUIRED';
    reportContent += `Voltage Status: ${voltageStatus}\n`;
    reportContent += '\n';

    // Footer
    reportContent += '=' .repeat(60) + '\n';
    reportContent += 'End of CalypsoPy+ Device Report\n';
    reportContent += `Report File: ${filename}\n`;
    reportContent += 'Visit: https://serial-cables.com for more information\n';
    reportContent += '=' .repeat(60) + '\n';

    // Create and download the file
    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);

    // Create temporary download link
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.style.display = 'none';

    // Trigger download
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // Clean up
    window.URL.revokeObjectURL(url);

    // Show success notification
    showNotification(`Device report exported: ${filename}`, 'success');

    console.log('Device information exported:', filename);
}
function parseSysinfoData(rawData) {
    // For development, use example data structure
    const exampleData = {
        hardware: {
            serial: 'G8H144125062062',
            company: 'SerialCables,Inc.',
            model: 'PC16-RN-xkmjl-835-144',
            version: '0.1.0',
            date: 'Jul 18 2025 11:35:16',
            sdk_version: '0 34 160 29'
        },
        thermal: {
            board_temperature: 55,
            fan_speed: 6310
        },
        voltages: [
            { rail: '0.8V', voltage: 800, unit: 'mV', status: 'normal' },
            { rail: '0.86V', voltage: 864, unit: 'mV', status: 'normal' },
            { rail: '1.2V', voltage: 1204, unit: 'mV', status: 'normal' },
            { rail: '1.5V', voltage: 1532, unit: 'mV', status: 'normal' }
        ],
        current: {
            board_current: 10240
        },
        errors: [
            { type: '0.8V', count: 0 },
            { type: '0.86V', count: 0 },
            { type: '1.2V', count: 0 },
            { type: '1.5V', count: 0 }
        ],
        ports: [
            { name: 'Port80', specs: 'speed D1, width D0, max_speed06, max_width16' },
            { name: 'Port112', specs: 'speed D1, width D0, max_speed06, max_width16' },
            { name: 'Port128', specs: 'speed D1, width D0, max_speed06, max_width16' }
        ]
    };

    // Update hardware information
    document.getElementById('hwSerialNumber').textContent = exampleData.hardware.serial;
    document.getElementById('hwCompany').textContent = exampleData.hardware.company;
    document.getElementById('hwModel').textContent = exampleData.hardware.model;
    document.getElementById('hwVersion').textContent = exampleData.hardware.version;
    document.getElementById('sdkVersion').textContent = exampleData.hardware.sdk_version;

    // Update metric cards
    document.getElementById('deviceModel').textContent = exampleData.hardware.model.split('-')[0];
    document.getElementById('firmwareVersion').textContent = exampleData.hardware.version;
    document.getElementById('serialNumber').textContent = exampleData.hardware.serial.substring(0, 12) + '...';
    document.getElementById('boardTemp').textContent = exampleData.thermal.board_temperature + '°C';

    // Update thermal information
    document.getElementById('thermalBoardTemp').textContent = exampleData.thermal.board_temperature + '°C';
    document.getElementById('fanSpeed').textContent = exampleData.thermal.fan_speed.toLocaleString() + ' RPM';

    // Update thermal status based on temperature
    const tempStatus = document.getElementById('thermalBoardStatus');
    const temp = exampleData.thermal.board_temperature;
    if (temp < 60) {
        tempStatus.textContent = 'Normal';
        tempStatus.className = 'thermal-status normal';
    } else if (temp < 80) {
        tempStatus.textContent = 'Warning';
        tempStatus.className = 'thermal-status warning';
    } else {
        tempStatus.textContent = 'Critical';
        tempStatus.className = 'thermal-status critical';
    }

    // Update fan speed bar (assuming max 10000 RPM)
    const fanSpeedPercentage = Math.min((exampleData.thermal.fan_speed / 10000) * 100, 100);
    document.getElementById('fanSpeedBar').style.width = fanSpeedPercentage + '%';

    // Update voltage sensors
    const voltageGrid = document.getElementById('voltageGrid');
    voltageGrid.innerHTML = '';
    exampleData.voltages.forEach(voltage => {
        const voltageItem = document.createElement('div');
        voltageItem.className = `voltage-item ${voltage.status}`;
        voltageItem.innerHTML = `
            <div class="voltage-label">${voltage.rail}</div>
            <div class="voltage-value">${voltage.voltage}</div>
            <div class="voltage-unit">${voltage.unit}</div>
        `;
        voltageGrid.appendChild(voltageItem);
    });

    // Update current status
    document.getElementById('boardCurrent').textContent = exampleData.current.board_current + ' mA';

    // Update port configuration
    const portGrid = document.getElementById('portGrid');
    portGrid.innerHTML = '';
    exampleData.ports.forEach((port, index) => {
        const portItem = document.createElement('div');
        portItem.className = 'port-item active';
        portItem.innerHTML = `
            <div class="port-icon">${80 + (index * 32)}</div>
            <div class="port-details">
                <div class="port-name">${port.name}</div>
                <div class="port-specs">${port.specs}</div>
            </div>
        `;
        portGrid.appendChild(portItem);
    });

    // Update error status
    const errorGrid = document.getElementById('errorGrid');
    errorGrid.innerHTML = '';
    exampleData.errors.forEach(error => {
        const errorItem = document.createElement('div');
        errorItem.className = error.count === 0 ? 'error-item no-error' : 'error-item has-error';
        errorItem.innerHTML = `
            <div class="error-label">${error.type} Voltage</div>
            <div class="error-count">${error.count}</div>
        `;
        errorGrid.appendChild(errorItem);
    });

    // Show success notification
    showNotification('System information updated successfully', 'success');
}

/**
 * Update dashboard-specific data displays
 */
function updateDashboardData(data) {
    if (!data.data || !data.data.parsed) return;

    const dashboard = data.dashboard || currentDashboard;
    const parsed = data.data.parsed;
    const rawResponse = data.data.raw;

    // Handle sysinfo command specifically
    if (dashboard === 'device_info' && (data.data.command === 'sysinfo' || rawResponse.includes('sysinfo'))) {
        parseSysinfoData(rawResponse);
        return;
    }

    // Update device info metrics (fallback for other commands)
    if (dashboard === 'device_info') {
        if (parsed.model) document.getElementById('deviceModel').textContent = parsed.model;
        if (parsed.version) document.getElementById('firmwareVersion').textContent = parsed.version;
        if (parsed.serial) document.getElementById('serialNumber').textContent = parsed.serial;
    }

    // Update link status metrics
    if (dashboard === 'link_status') {
        if (parsed.link_up) document.getElementById('linkState').textContent = parsed.link_up;
        if (parsed.signal_strength) document.getElementById('signalStrength').textContent = parsed.signal_strength + ' dBm';
        if (parsed.errors) document.getElementById('errorCount').textContent = parsed.errors;
        if (parsed.packets) document.getElementById('packetCount').textContent = parsed.packets;
    }

    // Update firmware version
    if (dashboard === 'firmware' && parsed.version) {
        document.getElementById('currentFwVersion').value = parsed.version;
    }
}

/**
 * Initialize Chart.js response time chart
 */
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
                fill: true,
                pointBackgroundColor: '#790000',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#777676',
                        font: {
                            family: 'Inter',
                            weight: '600'
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#e0e0e0'
                    },
                    ticks: {
                        color: '#777676',
                        font: {
                            family: 'Inter'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Response Time (ms)',
                        color: '#777676',
                        font: {
                            family: 'Inter',
                            weight: '600'
                        }
                    }
                },
                x: {
                    grid: {
                        color: '#e0e0e0'
                    },
                    ticks: {
                        color: '#777676',
                        font: {
                            family: 'Inter'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Command Sequence',
                        color: '#777676',
                        font: {
                            family: 'Inter',
                            weight: '600'
                        }
                    }
                }
            }
        }
    });
}

/**
 * Update response time chart
 */
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

/**
 * Update system metrics display
 */
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

/**
 * Load available serial ports
 */
async function loadPorts() {
    try {
        const response = await fetch('/api/ports');
        const ports = await response.json();

        const portSelect = document.getElementById('portSelect');
        portSelect.innerHTML = '';

        if (ports.length === 0) {
            portSelect.innerHTML = '<option value="">No devices found</option>';
            document.getElementById('connectBtn').disabled = true;
        } else {
            portSelect.innerHTML = '<option value="">Select a device...</option>';
            ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port.device;
                option.textContent = `${port.icon} ${port.device} - ${port.description} (${port.device_type})`;
                portSelect.appendChild(option);
            });

            portSelect.addEventListener('change', () => {
                document.getElementById('connectBtn').disabled = portSelect.value === '';
            });
        }
    } catch (error) {
        showNotification('Failed to load ports: ' + error.message, 'error');
    }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

/**
 * Setup all event handlers for the application
 */
function setupEventHandlers() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const dashboard = item.dataset.dashboard;
            if (dashboard) {
                switchDashboard(dashboard);
            }
        });
    });

    // Connection controls
    document.getElementById('connectBtn')?.addEventListener('click', () => {
        const port = document.getElementById('portSelect').value;

        if (!port) return;

        const btn = document.getElementById('connectBtn');
        btn.innerHTML = '<div class="loading"></div> Connecting...';
        btn.disabled = true;

        // Use hardcoded serial settings
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

    // Command inputs - Enter key support
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

    // Command buttons
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

    // Preset command buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const command = btn.dataset.cmd;
            const dashboardId = btn.closest('[id$="-dashboard"]')?.id.replace('-dashboard', '') || currentDashboard;
            if (command) {
                executeCommand(command, dashboardId);
            }
        });
    });

    // Export device info button
    document.getElementById('exportDeviceInfo')?.addEventListener('click', () => {
        exportDeviceInfo();
    });

    // Refresh device info button
    document.getElementById('refreshDeviceInfo')?.addEventListener('click', () => {
        if (!isConnected) {
            showNotification('Please connect to a device first', 'error');
            return;
        }
        executeCommand('sysinfo', 'device_info');
    });

    // Reset buttons
    document.getElementById('softReset')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to perform a soft reset?')) {
            executeCommand('AT+CFUN=1,1', 'resets');
        }
    });

    document.getElementById('hardReset')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to perform a hard reset?')) {
            executeCommand('RESET HARD', 'resets');
        }
    });

    document.getElementById('factoryReset')?.addEventListener('click', () => {
        if (confirm('WARNING: Factory reset will erase all configuration. Are you absolutely sure?')) {
            executeCommand('FACTORY_RESET', 'resets');
        }
    });

    document.getElementById('configReset')?.addEventListener('click', () => {
        if (confirm('Reset device configuration to defaults?')) {
            executeCommand('RESET_CONFIG', 'resets');
        }
    });

    // I2C controls
    document.getElementById('i2cScan')?.addEventListener('click', () => {
        executeCommand('I2C_SCAN', 'i2c');
    });

    document.getElementById('i2cRead')?.addEventListener('click', () => {
        const addr = document.getElementById('i2cAddress').value;
        const bytes = document.getElementById('i2cReadBytes').value;
        if (addr) {
            executeCommand(`I2C_READ ${addr} ${bytes}`, 'i2c');
        }
    });

    document.getElementById('i2cWrite')?.addEventListener('click', () => {
        const addr = document.getElementById('i2cAddress').value;
        const data = document.getElementById('i2cData').value;
        if (addr && data) {
            executeCommand(`I2C_WRITE ${addr} ${data}`, 'i2c');
        }
    });

    // Firmware controls
    document.getElementById('checkUpdate')?.addEventListener('click', () => {
        executeCommand('FW_VERSION', 'firmware');
    });

    document.getElementById('uploadFirmware')?.addEventListener('click', () => {
        const fileInput = document.getElementById('firmwareFile');
        if (fileInput.files.length > 0) {
            showNotification('Firmware upload simulation started', 'info');
            // Simulate firmware update progress
            let progress = 0;
            const interval = setInterval(() => {
                progress += 5;
                document.getElementById('updateProgress').style.width = progress + '%';
                document.getElementById('progressText').textContent = `Uploading... ${progress}%`;

                if (progress >= 100) {
                    clearInterval(interval);
                    document.getElementById('progressText').textContent = 'Upload complete';
                    showNotification('Firmware upload completed', 'success');
                }
            }, 200);
        } else {
            showNotification('Please select a firmware file', 'error');
        }
    });

    // Port configuration apply button
    document.getElementById('applyPortConfig')?.addEventListener('click', () => {
        const dataBits = document.getElementById('dataBitsSelect').value;
        const parity = document.getElementById('paritySelect').value;
        const stopBits = document.getElementById('stopBitsSelect').value;
        const flowControl = document.getElementById('flowControlSelect').value;

        const configCmd = `CONFIG_SET ${dataBits} ${parity} ${stopBits} ${flowControl}`;
        executeCommand(configCmd, 'port_config');
        showNotification('Port configuration applied', 'success');
    });

    // File upload handling
    document.getElementById('firmwareFile')?.addEventListener('change', (e) => {
        const uploadBtn = document.getElementById('uploadFirmware');
        if (e.target.files.length > 0) {
            uploadBtn.disabled = false;
            const fileName = e.target.files[0].name;
            showNotification(`Firmware file selected: ${fileName}`, 'info');
        } else {
            uploadBtn.disabled = true;
        }
    });
}

// =============================================================================
// SOCKET EVENT HANDLERS
// =============================================================================

/**
 * Setup Socket.IO event handlers
 */
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

            // Auto-switch to Device Information dashboard after successful connection
            setTimeout(() => {
                switchDashboard('device_info');
                showNotification('Switched to Device Information - Loading system data...', 'info');
            }, 1000);  // Small delay to let user see the success message

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

            // Auto-switch back to Connection dashboard after disconnection
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

            // Update dashboard-specific metrics
            updateDashboardData(data);

        } else {
            addConsoleEntry(consoleId, 'error', data.message);
            showNotification(data.message, 'error');
        }

        updateMetrics();
    });

    socket.on('system_status', (data) => {
        // Update connection status based on server state
        const connectedPorts = Object.keys(data.connected_ports || {}).filter(port =>
            data.connected_ports[port].connected
        );

        if (connectedPorts.length > 0 && !isConnected) {
            updateConnectionStatus(true, connectedPorts[0]);
        } else if (connectedPorts.length === 0 && isConnected) {
            updateConnectionStatus(false);
        }
    });

    socket.on('dashboard_data', (data) => {
        if (data.success) {
            // Handle dashboard-specific data updates
            console.log('Dashboard data received:', data);
        }
    });
}

// =============================================================================
// MOBILE & RESPONSIVE FEATURES
// =============================================================================

/**
 * Mobile menu toggle for responsive design
 */
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('open');
}

/**
 * Handle window resize events
 */
function handleWindowResize() {
    if (responseChart) {
        responseChart.resize();
    }

    // Auto-hide mobile menu on desktop
    if (window.innerWidth > 768) {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.remove('open');
    }
}

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

/**
 * Handle keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Number keys for dashboard switching
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const dashboards = ['connection', 'device_info', 'link_status', 'port_config', 'i2c', 'advanced', 'resets', 'firmware', 'analytics'];
            const index = parseInt(e.key) - 1;
            if (dashboards[index]) {
                switchDashboard(dashboards[index]);
            }
        }

        // Escape key to clear current command input
        if (e.key === 'Escape') {
            document.querySelectorAll('input[id$="CommandInput"]').forEach(input => {
                input.value = '';
                input.blur();
            });
        }

        // Ctrl/Cmd + R to refresh ports (prevent browser refresh)
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            loadPorts();
            showNotification('Refreshing available ports...', 'info');
        }
    });
}

// =============================================================================
// DEVELOPMENT HELPERS
// =============================================================================

/**
 * Auto-connect feature for development/testing
 */
function autoConnectIfAvailable() {
    setTimeout(() => {
        const portSelect = document.getElementById('portSelect');
        if (portSelect && portSelect.options.length > 1 && !isConnected) {
            // Auto-select first available port for testing
            portSelect.selectedIndex = 1;
            console.log('Auto-selecting port for testing:', portSelect.value);

            // Enable connect button
            document.getElementById('connectBtn').disabled = false;
        }
    }, 2000);
}

// =============================================================================
// APPLICATION INITIALIZATION
// =============================================================================

/**
 * Initialize the CalypsoPy+ application
 */
function initializeApplication() {
    console.log('🚀 CalypsoPy+ by Serial Cables - Initializing...');

    // Setup event handlers
    setupEventHandlers();
    setupSocketHandlers();
    setupKeyboardShortcuts();

    // Initialize components
    loadPorts();
    initializeChart();
    updateMetrics();

    // Add mobile menu button for small screens
    if (window.innerWidth <= 768) {
        const headerControls = document.querySelector('.header-controls');
        const menuBtn = document.createElement('button');
        menuBtn.className = 'btn btn-secondary btn-sm';
        menuBtn.innerHTML = '☰ Menu';
        menuBtn.onclick = toggleMobileMenu;
        headerControls.insertBefore(menuBtn, headerControls.firstChild);
    }

    // Handle window resize
    window.addEventListener('resize', handleWindowResize);

    // Auto-refresh ports every 30 seconds
    setInterval(loadPorts, 30000);

    // Auto-connect for development (remove in production)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        autoConnectIfAvailable();
    }

    // Add version info to console
    console.log('%cCalypsoPy+ v1.0.0', 'color: #790000; font-size: 16px; font-weight: bold;');
    console.log('%cby Serial Cables', 'color: #777676; font-size: 12px;');
    console.log('%cProfessional Hardware Interface Ready', 'color: #22c55e; font-size: 12px;');

    console.log('✅ CalypsoPy+ initialization complete');
}

// =============================================================================
// START APPLICATION
// =============================================================================

// Initialize application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApplication);

// Expose useful functions to global scope for debugging
window.CalypsoPy = {
    executeCommand,
    switchDashboard,
    showNotification,
    loadPorts,
    toggleMobileMenu,
    parseSysinfoData,
    systemMetrics,
    isConnected: () => isConnected,
    currentPort: () => currentPort,
    currentDashboard: () => currentDashboard
};