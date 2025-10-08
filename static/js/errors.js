/**
 * CalypsoPy+ Errors Dashboard - Counter Display
 * File: static/js/errors.js
 *
 * Handles PCIe link training error counters with port name mapping
 */

class ErrorsDashboard {
    constructor() {
        this.linkErrors = {};
        this.flitErrors = {};
        this.previousErrors = {};
        this.errorHistory = [];
        this.lastUpdate = null;

        // Port name mapping
        this.portNameMap = {
            // Ports 1-32
            ...Object.fromEntries(Array.from({length: 32}, (_, i) => [i + 1, 'Gold Finger/Host'])),
            // Ports 80-95
            ...Object.fromEntries(Array.from({length: 16}, (_, i) => [i + 80, 'Straddle Mount'])),
            // Ports 112-119
            ...Object.fromEntries(Array.from({length: 8}, (_, i) => [i + 112, 'Upper Left MCIO'])),
            // Ports 120-127
            ...Object.fromEntries(Array.from({length: 8}, (_, i) => [i + 120, 'Lower Left MCIO'])),
            // Ports 128-135
            ...Object.fromEntries(Array.from({length: 8}, (_, i) => [i + 128, 'Upper Right MCIO'])),
            // Ports 136-143
            ...Object.fromEntries(Array.from({length: 8}, (_, i) => [i + 136, 'Lower Right MCIO']))
        };

        // Error type tooltips with common causes
        this.errorTooltips = {
            portRx: {
                title: 'Port Receive Errors (PortRx)',
                spec: 'PCIe 6.1 Specification §4.2.6 - Physical Layer Receive Errors',
                causes: [
                    'Poor signal integrity or excessive noise on the link',
                    'Cable quality issues or improper impedance matching',
                    'Clock skew or jitter exceeding tolerance',
                    'Electromagnetic interference (EMI) from nearby components',
                    'Marginal voltage levels or power supply instability'
                ]
            },
            badTLP: {
                title: 'Bad Transaction Layer Packets (BadTLP)',
                spec: 'PCIe 6.1 Specification §2.5.1 - TLP Format and Validation',
                causes: [
                    'ECRC (End-to-End CRC) validation failures',
                    'LCRC errors not caught at the Data Link Layer',
                    'Malformed packet headers or invalid TLP formatting',
                    'Buffer overflow/underflow in transaction layer logic',
                    'Firmware bugs in TLP generation or processing'
                ]
            },
            badDLLP: {
                title: 'Bad Data Link Layer Packets (BadDLLP)',
                spec: 'PCIe 6.1 Specification §3.4.1 - DLLP Format and CRC',
                causes: [
                    'CRC check failures on ACK/NAK packets',
                    'Invalid DLLP type or formatting errors',
                    'Sequence number mismatches between transmitter and receiver',
                    'Link training state machine errors',
                    'Physical layer bit errors propagating to DLLP level'
                ]
            },
            recDiag: {
                title: 'Receiver Diagnostic Errors (RecDiag)',
                spec: 'PCIe 6.1 Specification §4.2.3 - Link Training and Equalization',
                causes: [
                    'Equalization coefficient optimization failures',
                    'Preset application errors during link training',
                    'Receiver detection timeouts or failures',
                    'Eye diagram margin violations',
                    'Lane-to-lane skew exceeding allowable tolerance',
                    'Speed negotiation failures (Gen 1/2/3/4/5/6 transitions)'
                ]
            }
        };

        this.init();
    }

    init() {
        this.bindEvents();
        console.log('✅ Errors Dashboard initialized with counter display');
    }

    bindEvents() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshErrors');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshErrorData();
            });
        }

        // Reset counters button
        const resetBtn = document.getElementById('resetErrorCounters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetCounters();
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportErrors');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportErrorReport();
            });
        }

        // Clear error log button
        const clearLogBtn = document.getElementById('clearErrorLog');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                this.clearErrorLog();
            });
        }
    }

    onActivate() {
        console.log('Errors dashboard activated');
        this.addLogEntry('Dashboard activated. Loading error counters...', 'info');

        if (isConnected && currentPort) {
            setTimeout(() => {
                this.refreshErrorData();
            }, 500);
        } else {
            this.addLogEntry('No device connected. Connect a device to load error counters.', 'warning');
        }
    }

    refreshErrorData() {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            this.addLogEntry('Cannot refresh: No device connected', 'error');
            return;
        }

        this.addLogEntry('Refreshing error counters...', 'info');
        showNotification('Loading error counters...', 'info');

        // Store previous errors for change detection
        this.previousErrors = JSON.parse(JSON.stringify(this.linkErrors));

        // Execute 'error' command
        executeCommand('error', 'errors');
    }

    parseErrorResponse(responseData) {
        try {
            const rawResponse = responseData.raw || responseData;
            console.log('Parsing error response:', rawResponse);

            // Parse link errors - format: "PortXX: PortRx:XX, BadTLP:XX, BadDLLP:XX, RecDiag:XX"
            const portPattern = /Port(\d+):\s*PortRx:(\d+),\s*BadTLP:(\d+),\s*BadDLLP:(\d+),\s*RecDiag:(\d+)/gi;
            const matches = [...rawResponse.matchAll(portPattern)];

            if (matches.length === 0) {
                this.addLogEntry('No error data found in response', 'warning');
                return;
            }

            // Clear existing data
            this.linkErrors = {};
            this.flitErrors = {};

            // Parse each port's errors
            matches.forEach(match => {
                const [, portNum, portRx, badTLP, badDLLP, recDiag] = match;
                const port = `Port${portNum}`;
                const portNumber = parseInt(portNum);

                this.linkErrors[port] = {
                    portNumber: portNumber,
                    portName: this.getPortName(portNumber),
                    portRx: parseInt(portRx),
                    badTLP: parseInt(badTLP),
                    badDLLP: parseInt(badDLLP),
                    recDiag: parseInt(recDiag),
                    totalErrors: parseInt(portRx) + parseInt(badTLP) + parseInt(badDLLP) + parseInt(recDiag)
                };

                // Check for changes
                if (this.previousErrors[port]) {
                    const prev = this.previousErrors[port];
                    const current = this.linkErrors[port];

                    if (current.totalErrors > prev.totalErrors) {
                        const increase = current.totalErrors - prev.totalErrors;
                        this.addLogEntry(
                            `${port} (${current.portName}): +${increase} new errors detected`,
                            'warning'
                        );
                    }
                }

                // Simulate flit errors (can be updated with real data)
                this.flitErrors[port] = {
                    portNumber: portNumber,
                    portName: this.getPortName(portNumber),
                    flitBitRateErrors: 0,
                    errorRate: 0
                };
            });

            this.lastUpdate = new Date();
            this.updateDashboard();

            const totalErrors = Object.values(this.linkErrors).reduce((sum, port) => sum + port.totalErrors, 0);
            this.addLogEntry(
                `Successfully loaded ${matches.length} port counters (Total Errors: ${totalErrors})`,
                totalErrors > 0 ? 'warning' : 'success'
            );
            showNotification(`Error counters updated for ${matches.length} ports`, 'success');

        } catch (error) {
            console.error('Error parsing error response:', error);
            this.addLogEntry(`Parse error: ${error.message}`, 'error');
            showNotification('Failed to parse error data', 'error');
        }
    }

    getPortName(portNumber) {
        return this.portNameMap[portNumber] || 'Unknown Port';
    }

    updateDashboard() {
        this.updateLinkErrorCounters();
        this.updateFlitErrorCounters();

        // Update last updated timestamp
        const linkUpdateEl = document.getElementById('linkErrorsLastUpdate');
        const flitUpdateEl = document.getElementById('flitErrorsLastUpdate');

        if (this.lastUpdate) {
            const timeString = this.lastUpdate.toLocaleTimeString();
            if (linkUpdateEl) linkUpdateEl.textContent = timeString;
            if (flitUpdateEl) flitUpdateEl.textContent = timeString;
        }
    }

    updateLinkErrorCounters() {
        const container = document.getElementById('linkErrorsCounterGrid');
        if (!container) return;

        if (Object.keys(this.linkErrors).length === 0) {
            container.innerHTML = `
                <div class="loading-state">
                    <span>No error data available. Click "Refresh Counters" to load data.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        // Sort ports by number
        const sortedPorts = Object.keys(this.linkErrors).sort((a, b) => {
            return this.linkErrors[a].portNumber - this.linkErrors[b].portNumber;
        });

        sortedPorts.forEach(port => {
            const data = this.linkErrors[port];
            const hasErrors = data.totalErrors > 0;
            const isCritical = data.totalErrors >= 10;

            const card = document.createElement('div');
            card.className = `port-counter-card ${hasErrors ? 'has-errors' : ''} ${isCritical ? 'critical-errors' : ''}`;

            card.innerHTML = `
                <div class="port-counter-header">
                    <div>
                        <div class="port-counter-name">${data.portName}</div>
                        <div class="port-counter-number">Port ${data.portNumber}</div>
                    </div>
                    <div class="port-counter-status ${hasErrors ? 'has-errors' : ''} ${isCritical ? 'critical' : ''}"></div>
                </div>
                
                <div class="total-errors-badge ${data.totalErrors === 0 ? 'zero' : ''}">
                    ${data.totalErrors} Total
                </div>
                
                <div class="counter-display-grid">
                    <div class="counter-item ${data.portRx > 0 ? 'has-error' : ''}" 
                         data-error-type="portRx">
                        <div class="counter-label">
                            PortRx
                            <span class="info-icon">ℹ️</span>
                        </div>
                        <div class="counter-value ${data.portRx > 0 ? 'has-error' : ''} ${data.portRx >= 10 ? 'critical' : ''}">
                            ${data.portRx}
                        </div>
                        ${this.getCounterChange(port, 'portRx', data.portRx)}
                    </div>
                    
                    <div class="counter-item ${data.badTLP > 0 ? 'has-error' : ''}"
                         data-error-type="badTLP">
                        <div class="counter-label">
                            BadTLP
                            <span class="info-icon">ℹ️</span>
                        </div>
                        <div class="counter-value ${data.badTLP > 0 ? 'has-error' : ''} ${data.badTLP >= 10 ? 'critical' : ''}">
                            ${data.badTLP}
                        </div>
                        ${this.getCounterChange(port, 'badTLP', data.badTLP)}
                    </div>
                    
                    <div class="counter-item ${data.badDLLP > 0 ? 'has-error' : ''}"
                         data-error-type="badDLLP">
                        <div class="counter-label">
                            BadDLLP
                            <span class="info-icon">ℹ️</span>
                        </div>
                        <div class="counter-value ${data.badDLLP > 0 ? 'has-error' : ''} ${data.badDLLP >= 10 ? 'critical' : ''}">
                            ${data.badDLLP}
                        </div>
                        ${this.getCounterChange(port, 'badDLLP', data.badDLLP)}
                    </div>
                    
                    <div class="counter-item ${data.recDiag > 0 ? 'has-error' : ''}"
                         data-error-type="recDiag">
                        <div class="counter-label">
                            RecDiag
                            <span class="info-icon">ℹ️</span>
                        </div>
                        <div class="counter-value ${data.recDiag > 0 ? 'has-error' : ''} ${data.recDiag >= 10 ? 'critical' : ''}">
                            ${data.recDiag}
                        </div>
                        ${this.getCounterChange(port, 'recDiag', data.recDiag)}
                    </div>
                </div>
            `;

            // Add tooltip event listeners
            const counterItems = card.querySelectorAll('.counter-item');
            counterItems.forEach(item => {
                const errorType = item.getAttribute('data-error-type');

                item.addEventListener('mouseenter', (e) => {
                    this.showTooltip(e, errorType);
                });

                item.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });
            });

            container.appendChild(card);
        });
    }

    getCounterChange(port, errorType, currentValue) {
        if (!this.previousErrors[port]) {
            return '';
        }

        const previousValue = this.previousErrors[port][errorType];
        const change = currentValue - previousValue;

        if (change > 0) {
            return `<div class="counter-change increased">+${change}</div>`;
        }

        return '';
    }

    showTooltip(event, errorType) {
        const tooltip = this.errorTooltips[errorType];
        if (!tooltip) return;

        // Remove existing tooltip
        this.hideTooltip();

        // Create tooltip element
        const tooltipEl = document.createElement('div');
        tooltipEl.className = 'error-tooltip';
        tooltipEl.id = 'activeErrorTooltip';

        tooltipEl.innerHTML = `
            <div class="tooltip-title">${tooltip.title}</div>
            <div class="tooltip-spec">${tooltip.spec}</div>
            <div class="tooltip-causes">
                <strong>Common Causes:</strong>
                <ul>
                    ${tooltip.causes.map(cause => `<li>${cause}</li>`).join('')}
                </ul>
            </div>
        `;

        document.body.appendChild(tooltipEl);

        // Position tooltip
        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();

        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        let top = rect.top - tooltipRect.height - 10;

        // Adjust if tooltip goes off screen
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top < 10) {
            top = rect.bottom + 10;
        }

        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = top + 'px';
        tooltipEl.style.position = 'fixed';
    }

    hideTooltip() {
        const tooltip = document.getElementById('activeErrorTooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    updateFlitErrorCounters() {
        const container = document.getElementById('flitErrorsCounterGrid');
        if (!container) return;

        if (Object.keys(this.flitErrors).length === 0) {
            container.innerHTML = `
                <div class="loading-state">
                    <span>No flit error data available. Click "Refresh Counters" to load data.</span>
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        // Sort ports by number
        const sortedPorts = Object.keys(this.flitErrors).sort((a, b) => {
            return this.flitErrors[a].portNumber - this.flitErrors[b].portNumber;
        });

        sortedPorts.forEach(port => {
            const data = this.flitErrors[port];
            const hasErrors = data.flitBitRateErrors > 0;

            const card = document.createElement('div');
            card.className = `port-counter-card ${hasErrors ? 'has-errors' : ''}`;

            card.innerHTML = `
                <div class="port-counter-header">
                    <div>
                        <div class="port-counter-name">${data.portName}</div>
                        <div class="port-counter-number">Port ${data.portNumber}</div>
                    </div>
                    <div class="port-counter-status ${hasErrors ? 'has-errors' : ''}"></div>
                </div>
                
                <div class="total-errors-badge ${data.flitBitRateErrors === 0 ? 'zero' : ''}">
                    ${data.flitBitRateErrors} Total
                </div>
                
                <div class="counter-display-grid">
                    <div class="counter-item ${hasErrors ? 'has-error' : ''}">
                        <div class="counter-label">Flit Errors</div>
                        <div class="counter-value ${hasErrors ? 'has-error' : ''}">
                            ${data.flitBitRateErrors}
                        </div>
                    </div>
                    
                    <div class="counter-item ${hasErrors ? 'has-error' : ''}">
                        <div class="counter-label">Error Rate</div>
                        <div class="counter-value ${hasErrors ? 'has-error' : ''}" style="font-size: 20px;">
                            ${data.errorRate.toFixed(3)}%
                        </div>
                    </div>
                </div>
            `;

            container.appendChild(card);
        });
    }

    resetCounters() {
        if (!confirm('Are you sure you want to reset all error counters? This will clear all current error data.')) {
            return;
        }

        this.linkErrors = {};
        this.flitErrors = {};
        this.previousErrors = {};
        this.lastUpdate = null;

        this.updateDashboard();

        this.addLogEntry('All error counters reset to zero', 'info');
        showNotification('Error counters reset', 'info');
    }

    addLogEntry(message, type = 'info') {
        const container = document.getElementById('errorLogContainer');
        if (!container) return;

        const timestamp = new Date().toLocaleTimeString();

        const entry = document.createElement('div');
        entry.className = `error-log-entry ${type}`;

        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'error-log-timestamp';
        timestampDiv.textContent = timestamp;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'error-log-content';
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

        // Store in history array
        this.errorHistory.push({
            timestamp: new Date().toISOString(),
            message: message,
            type: type
        });
    }

    clearErrorLog() {
        const container = document.getElementById('errorLogContainer');
        if (container) {
            container.innerHTML = `
                <div class="error-log-entry system">
                    <div class="error-log-timestamp">System Ready</div>
                    <div class="error-log-content">Error monitoring initialized. Click 'Refresh Counters' to load data.</div>
                </div>
            `;
        }

        this.errorHistory = [];
        showNotification('Error log cleared', 'info');
    }

    exportErrorReport() {
        const timestamp = new Date().toLocaleString();
        const filename = `CalypsoPy_ErrorCounters_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

        let reportContent = '';
        reportContent += '='.repeat(80) + '\n';
        reportContent += 'CalypsoPy+ PCIe Error Counter Report\n';
        reportContent += 'Generated by Serial Cables Professional Interface\n';
        reportContent += '='.repeat(80) + '\n';
        reportContent += `Report Generated: ${timestamp}\n`;
        reportContent += `Connection Port: ${currentPort || 'Unknown'}\n`;
        reportContent += `Last Counter Update: ${this.lastUpdate ? this.lastUpdate.toLocaleString() : 'N/A'}\n`;
        reportContent += '\n';

        // Summary
        let totalLinkErrors = 0;
        let totalFlitErrors = 0;
        let portsWithErrors = 0;

        Object.values(this.linkErrors).forEach(port => {
            totalLinkErrors += port.totalErrors;
            if (port.totalErrors > 0) portsWithErrors++;
        });

        Object.values(this.flitErrors).forEach(port => {
            totalFlitErrors += port.flitBitRateErrors;
        });

        reportContent += 'SUMMARY\n';
        reportContent += '-'.repeat(80) + '\n';
        reportContent += `Total Link Training Errors: ${totalLinkErrors}\n`;
        reportContent += `Total Flit Bit Rate Errors: ${totalFlitErrors}\n`;
        reportContent += `Ports with Errors: ${portsWithErrors} of ${Object.keys(this.linkErrors).length}\n`;
        reportContent += '\n';

        // Link Error Counters by Port Type
        reportContent += 'LINK TRAINING ERROR COUNTERS (PCIe 6.1 Specification)\n';
        reportContent += '='.repeat(80) + '\n\n';

        const portGroups = {
            'Gold Finger/Host': [],
            'Straddle Mount': [],
            'Upper Left MCIO': [],
            'Lower Left MCIO': [],
            'Upper Right MCIO': [],
            'Lower Right MCIO': []
        };

        // Group ports by type
        Object.entries(this.linkErrors).forEach(([port, data]) => {
            if (portGroups[data.portName]) {
                portGroups[data.portName].push({port, data});
            }
        });

        // Output each group
        Object.entries(portGroups).forEach(([groupName, ports]) => {
            if (ports.length === 0) return;

            reportContent += `${groupName}\n`;
            reportContent += '-'.repeat(80) + '\n';
            reportContent += String.prototype.padEnd.call('Port', 15);
            reportContent += String.prototype.padEnd.call('PortRx', 12);
            reportContent += String.prototype.padEnd.call('BadTLP', 12);
            reportContent += String.prototype.padEnd.call('BadDLLP', 12);
            reportContent += String.prototype.padEnd.call('RecDiag', 12);
            reportContent += 'Total\n';
            reportContent += '-'.repeat(80) + '\n';

            ports.sort((a, b) => a.data.portNumber - b.data.portNumber).forEach(({port, data}) => {
                reportContent += String.prototype.padEnd.call(`Port ${data.portNumber}`, 15);
                reportContent += String.prototype.padEnd.call(data.portRx.toString(), 12);
                reportContent += String.prototype.padEnd.call(data.badTLP.toString(), 12);
                reportContent += String.prototype.padEnd.call(data.badDLLP.toString(), 12);
                reportContent += String.prototype.padEnd.call(data.recDiag.toString(), 12);
                reportContent += data.totalErrors.toString() + '\n';
            });

            reportContent += '\n';
        });

        // PCIe 6.1 Spec Reference with Common Causes
        reportContent += 'PCIe 6.1 SPECIFICATION REFERENCE & COMMON CAUSES\n';
        reportContent += '='.repeat(80) + '\n\n';

        Object.entries(this.errorTooltips).forEach(([key, tooltip]) => {
            reportContent += `${tooltip.title}\n`;
            reportContent += `${tooltip.spec}\n`;
            reportContent += 'Common Causes:\n';
            tooltip.causes.forEach((cause, index) => {
                reportContent += `  ${index + 1}. ${cause}\n`;
            });
            reportContent += '\n';
        });

        reportContent += '='.repeat(80) + '\n';
        reportContent += 'End of Error Counter Report\n';
        reportContent += `Report File: ${filename}\n`;
        reportContent += 'Visit: https://serial-cables.com for more information\n';
        reportContent += '='.repeat(80) + '\n';

        // Create and download the file
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

        this.addLogEntry(`Error counter report exported: ${filename}`, 'success');
        showNotification(`Error report exported: ${filename}`, 'success');
    }

    handleCommandResult(data) {
        if (data.success && data.data) {
            this.parseErrorResponse(data.data);
        } else {
            this.addLogEntry(`Failed to load error counters: ${data.message}`, 'error');
            showNotification('Failed to load error counters', 'error');
        }
    }
}

// Initialize Errors Dashboard
let errorsDashboard = null;

function initializeErrorsDashboard() {
    if (!errorsDashboard) {
        errorsDashboard = new ErrorsDashboard();
        console.log('✅ Errors Dashboard instance created');
    }
    return errorsDashboard;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initializeErrorsDashboard();
    });
} else {
    initializeErrorsDashboard();
}

// Export to global scope
if (typeof window !== 'undefined') {
    window.ErrorsDashboard = ErrorsDashboard;
    window.errorsDashboard = errorsDashboard;
    window.initializeErrorsDashboard = initializeErrorsDashboard;
}

// If using as a module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ErrorsDashboard,
        initializeErrorsDashboard
    };
}

console.log('✅ Errors Dashboard JavaScript loaded successfully');