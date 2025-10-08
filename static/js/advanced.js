/**
 * CalypsoPy+ Advanced Dashboard JavaScript
 * File: static/js/advanced.js
 *
 * Controls for PCIe clock modes (SRIS/SRNS) and flit mode configuration
 */

class AdvancedDashboard {
    constructor() {
        this.clockStatus = {
            mcioLeft: null,    // left, right, straddle
            mcioRight: null,
            straddle: null
        };
        this.clockModes = {
            srise5: false,
            srise2: false,
            srisd: false
        };
        this.flitModes = {};
        this.portGroups = {
            32: 'Gold Finger Ports (1-32)',
            80: 'Straddle Mount Ports (80-95)',
            112: 'Upper Left MCIO (112-119)',
            128: 'Upper Right MCIO (128-135)'
        };
        this.init();
    }

    init() {
        this.bindEvents();
        console.log('✅ Advanced Dashboard initialized');
    }

    bindEvents() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshAdvanced');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshStatus();
            });
        }

        // Clock control buttons
        document.querySelectorAll('.clock-control-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const location = btn.getAttribute('data-location');
                const state = btn.getAttribute('data-state');
                this.setClockState(location, state);
            });
        });

        // SSC mode buttons
        document.querySelectorAll('.ssc-mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = btn.getAttribute('data-mode');
                this.setSSCMode(mode);
            });
        });

        // Flit mode toggle buttons
        document.querySelectorAll('.flit-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const portGroup = btn.getAttribute('data-port-group');
                const state = btn.getAttribute('data-state');
                this.setFlitMode(portGroup, state);
            });
        });

        // Clear history button
        const clearBtn = document.getElementById('clearAdvancedHistory');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearHistory();
            });
        }
    }

    onActivate() {
        console.log('Advanced dashboard activated');
        this.addHistoryEntry('Dashboard activated. Loading clock and flit mode status...', 'info');

        if (isConnected && currentPort) {
            setTimeout(() => {
                this.refreshStatus();
            }, 500);
        } else {
            this.addHistoryEntry('No device connected. Connect a device to configure advanced settings.', 'warning');
        }
    }

    refreshStatus() {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            this.addHistoryEntry('Cannot refresh: No device connected', 'error');
            return;
        }

        this.addHistoryEntry('Refreshing clock and flit mode status...', 'info');
        showNotification('Loading advanced settings...', 'info');

        // Execute clock status command
        executeCommand('clock', 'advanced');

        // Small delay before next command
        setTimeout(() => {
            executeCommand('fmode', 'advanced');
        }, 300);
    }

    handleCommandResult(data) {
        if (!data.success) {
            this.addHistoryEntry(`Command failed: ${data.message}`, 'error');
            return;
        }

        const rawResponse = data.data?.raw || '';
        const command = data.data?.command || '';

        if (command === 'clock' || rawResponse.includes('clock')) {
            this.parseClockResponse(rawResponse);
        } else if (command === 'fmode' || rawResponse.includes('flitmode') || rawResponse.includes('Flitmode')) {
            this.parseFlitModeResponse(rawResponse);
        }
    }

    parseClockResponse(response) {
        console.log('Parsing clock response:', response);

        // Parse clock enable/disable status
        // Example: "MCIO Left clock disable." or "MCIO Right clock enable."
        const mcioLeftMatch = response.match(/MCIO Left clock (enable|disable)/i);
        const mcioRightMatch = response.match(/MCIO Right clock (enable|disable)/i);
        const straddleMatch = response.match(/Straddle clock (enable|disable)/i);

        if (mcioLeftMatch) {
            this.clockStatus.mcioLeft = mcioLeftMatch[1].toLowerCase();
            this.updateClockStatusUI('left', this.clockStatus.mcioLeft);
            this.addHistoryEntry(`MCIO Left clock: ${mcioLeftMatch[1]}`, 'info');
        }

        if (mcioRightMatch) {
            this.clockStatus.mcioRight = mcioRightMatch[1].toLowerCase();
            this.updateClockStatusUI('right', this.clockStatus.mcioRight);
            this.addHistoryEntry(`MCIO Right clock: ${mcioRightMatch[1]}`, 'info');
        }

        if (straddleMatch) {
            this.clockStatus.straddle = straddleMatch[1].toLowerCase();
            this.updateClockStatusUI('straddle', this.clockStatus.straddle);
            this.addHistoryEntry(`Straddle clock: ${straddleMatch[1]}`, 'info');
        }

        // Parse SSC mode
        // Example: "Set SR18 Clock mode enable 0.5% success."
        if (response.includes('0.5%')) {
            this.clockModes.srise5 = true;
            this.clockModes.srise2 = false;
            this.clockModes.srisd = false;
            this.updateSSCModeUI('srise5');
            this.addHistoryEntry('SSC Mode: SRISE5 (0.5% spread)', 'success');
        } else if (response.includes('0.25%')) {
            this.clockModes.srise5 = false;
            this.clockModes.srise2 = true;
            this.clockModes.srisd = false;
            this.updateSSCModeUI('srise2');
            this.addHistoryEntry('SSC Mode: SRISE2 (0.25% spread)', 'success');
        } else if (response.match(/disable.*success/i) && response.includes('Clock mode')) {
            this.clockModes.srise5 = false;
            this.clockModes.srise2 = false;
            this.clockModes.srisd = true;
            this.updateSSCModeUI('srisd');
            this.addHistoryEntry('SSC Mode: SRISD (disabled)', 'success');
        }

        showNotification('Clock status updated', 'success');
    }

    parseFlitModeResponse(response) {
        console.log('Parsing flit mode response:', response);

        // Parse port-specific flit mode status
        // Example: "Port 32 enable flitmode." or "Port 80 disable flitmode."
        const portMatches = [...response.matchAll(/Port\s+(\d+)\s+(enable|disable)\s+flitmode/gi)];

        if (portMatches.length > 0) {
            portMatches.forEach(match => {
                const portNum = parseInt(match[1]);
                const state = match[2].toLowerCase();
                this.flitModes[portNum] = state === 'enable';

                this.addHistoryEntry(`Port ${portNum} flit mode: ${state}`, 'info');
            });

            this.updateFlitModeUI();
            showNotification('Flit mode status updated', 'success');
        }
    }

    updateClockStatusUI(location, state) {
        const card = document.getElementById(`clock${location.charAt(0).toUpperCase() + location.slice(1)}Card`);
        if (!card) return;

        const statusDot = card.querySelector('.clock-status-dot');
        const statusText = card.querySelector('.clock-status-text');
        const indicator = card.querySelector('.clock-status-indicator');

        if (state === 'enable') {
            card.classList.add('clock-enabled');
            card.classList.remove('clock-disabled');
            if (statusDot) statusDot.className = 'clock-status-dot enabled';
            if (statusText) statusText.textContent = 'Enabled';
            if (indicator) {
                indicator.textContent = '✓ Active';
                indicator.className = 'clock-status-indicator active';
            }
        } else {
            card.classList.add('clock-disabled');
            card.classList.remove('clock-enabled');
            if (statusDot) statusDot.className = 'clock-status-dot disabled';
            if (statusText) statusText.textContent = 'Disabled';
            if (indicator) {
                indicator.textContent = '✕ Inactive';
                indicator.className = 'clock-status-indicator inactive';
            }
        }
    }

    updateSSCModeUI(activeMode) {
        // Update mode cards
        ['srise5', 'srise2', 'srisd'].forEach(mode => {
            const card = document.getElementById(`${mode}Card`);
            if (card) {
                if (mode === activeMode) {
                    card.classList.add('ssc-mode-active');
                    const indicator = card.querySelector('.ssc-mode-indicator');
                    if (indicator) {
                        indicator.textContent = '✓ Active';
                        indicator.className = 'ssc-mode-indicator active';
                    }
                } else {
                    card.classList.remove('ssc-mode-active');
                    const indicator = card.querySelector('.ssc-mode-indicator');
                    if (indicator) {
                        indicator.textContent = 'Inactive';
                        indicator.className = 'ssc-mode-indicator inactive';
                    }
                }
            }
        });

        // Update current mode display
        const currentModeEl = document.getElementById('currentSSCMode');
        if (currentModeEl) {
            const modeNames = {
                'srise5': 'SRISE5 (0.5%)',
                'srise2': 'SRISE2 (0.25%)',
                'srisd': 'SRISD (Disabled)'
            };
            currentModeEl.textContent = modeNames[activeMode] || '--';
        }
    }

    updateFlitModeUI() {
        Object.entries(this.portGroups).forEach(([startPort, label]) => {
            const port = parseInt(startPort);
            const enabled = this.flitModes[port] === true;

            const card = document.getElementById(`flitPort${startPort}Card`);
            if (card) {
                if (enabled) {
                    card.classList.add('flit-enabled');
                    card.classList.remove('flit-disabled');
                } else {
                    card.classList.add('flit-disabled');
                    card.classList.remove('flit-enabled');
                }

                const indicator = card.querySelector('.flit-mode-indicator');
                if (indicator) {
                    indicator.textContent = enabled ? '✓ Enabled' : '✕ Disabled';
                    indicator.className = `flit-mode-indicator ${enabled ? 'enabled' : 'disabled'}`;
                }

                const statusDot = card.querySelector('.flit-status-dot');
                if (statusDot) {
                    statusDot.className = `flit-status-dot ${enabled ? 'enabled' : 'disabled'}`;
                }
            }
        });
    }

    setClockState(location, state) {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            return;
        }

        const locationMap = {
            'left': 'l',
            'right': 'r',
            'straddle': 's'
        };

        const stateMap = {
            'enable': 'e',
            'disable': 'd'
        };

        const cmd = locationMap[location];
        const stateCmd = stateMap[state];

        if (!cmd || !stateCmd) {
            this.addHistoryEntry(`Invalid clock command: ${location} ${state}`, 'error');
            return;
        }

        const command = `clock ${cmd} ${stateCmd}`;
        this.addHistoryEntry(`Setting ${location} clock to ${state}: ${command}`, 'command');

        executeCommand(command, 'advanced');
    }

    setSSCMode(mode) {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            return;
        }

        const command = `clock ${mode}`;
        const modeNames = {
            'srise5': 'SRISE5 (0.5% spread)',
            'srise2': 'SRISE2 (0.25% spread)',
            'srisd': 'SRISD (disabled)'
        };

        this.addHistoryEntry(`Setting SSC mode to ${modeNames[mode]}: ${command}`, 'command');

        executeCommand(command, 'advanced');
    }

    setFlitMode(portGroup, state) {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            return;
        }

        const command = `fmode ${portGroup} ${state}`;
        const portLabel = this.portGroups[portGroup] || `Port ${portGroup}`;

        this.addHistoryEntry(`Setting flit mode for ${portLabel} to ${state}: ${command}`, 'command');

        executeCommand(command, 'advanced');
    }

    clearHistory() {
        const container = document.getElementById('advancedHistoryContainer');
        if (container) {
            container.innerHTML = `
                <div class="advanced-history-entry system">
                    <div class="advanced-history-timestamp">System Ready</div>
                    <div class="advanced-history-content">Advanced settings dashboard initialized.</div>
                </div>
            `;
        }
        showNotification('History cleared', 'info');
    }

    addHistoryEntry(message, type = 'info') {
        const container = document.getElementById('advancedHistoryContainer');
        if (!container) return;

        const timestamp = new Date().toLocaleTimeString();

        const entry = document.createElement('div');
        entry.className = `advanced-history-entry ${type}`;

        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'advanced-history-timestamp';
        timestampDiv.textContent = timestamp;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'advanced-history-content';
        contentDiv.textContent = message;

        entry.appendChild(timestampDiv);
        entry.appendChild(contentDiv);

        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;

        // Keep only last 50 entries
        const entries = container.children;
        if (entries.length > 50) {
            container.removeChild(entries[1]);
        }
    }
}

// Initialization function
function initializeAdvancedDashboard() {
    if (!advancedDashboard) {
        advancedDashboard = new AdvancedDashboard();
        console.log('✅ Advanced Dashboard instance created');
    }
    return advancedDashboard;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initializeAdvancedDashboard();
    });
} else {
    initializeAdvancedDashboard();
}

// Export to global scope
if (typeof window !== 'undefined') {
    window.AdvancedDashboard = AdvancedDashboard;
    window.advancedDashboard = advancedDashboard;
    window.initializeAdvancedDashboard = initializeAdvancedDashboard;
}

console.log('✅ Advanced Dashboard JavaScript loaded successfully');