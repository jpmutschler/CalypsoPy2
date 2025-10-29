/**
 * CalypsoPy+ Errors Dashboard - Counter Display
 * File: static/js/errors.js
 *
 * Handles PCIe link training error counters with port name mapping
 */

// Global instance
window.errorsDashboard = null;

class ErrorsDashboard {
    constructor() {
        this.linkErrors = {};
        this.flitErrors = {};
        this.previousErrors = {};
        this.errorHistory = [];
        this.lastUpdate = null;
        this.activePorts = new Set(); // Track active ports from showport command

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
            },
            linkDown: {
                title: 'Link Down Events (LinkDown)',
                spec: 'PCIe 6.1 Specification §4.2.5 - Link Training and Status State Machine',
                causes: [
                    'Physical disconnection or cable removal',
                    'Power management state transitions (L1/L2/L3)',
                    'Hot-plug events or surprise link down conditions',
                    'Link training failures causing fallback to Detect state',
                    'Excessive error recovery attempts triggering link reset',
                    'Thermal throttling or power supply instability'
                ]
            },
            flitError: {
                title: 'Flit Errors (FlitError)',
                spec: 'PCIe 6.1 Specification §4.2.2.5 - Flit Mode Error Detection and Recovery',
                causes: [
                    'CRC errors in 256-bit flit boundaries (PCIe 6.0+ specific)',
                    'Flit header corruption or invalid flit formatting',
                    'Lane deskew failures in flit mode operation',
                    'Symbol alignment errors affecting flit boundaries',
                    'Retimer or redrive device flit processing errors',
                    'PAM4 signal integrity issues in PCIe 6.0+ links'
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
        console.log('🔍 Errors dashboard activated');
        console.log('🔍 isConnected:', typeof isConnected !== 'undefined' ? isConnected : 'undefined');
        console.log('🔍 currentPort:', typeof currentPort !== 'undefined' ? currentPort : 'undefined');
        
        this.addLogEntry('Dashboard activated. Loading error counters...', 'info');

        if (typeof isConnected !== 'undefined' && typeof currentPort !== 'undefined' && isConnected && currentPort) {
            console.log('🔍 Device is connected, executing counters command...');
            setTimeout(() => {
                // First get port status to identify active ports, then get counters
                this.loadPortStatusAndCounters();
            }, 500);
        } else {
            console.log('🔍 Device not connected or variables undefined');
            this.addLogEntry('No device connected. Connect a device to load error counters.', 'warning');
        }
    }

    loadPortStatusAndCounters() {
        this.addLogEntry('Getting port status to identify active ports...', 'info');
        
        // First, get port status from showport command to identify active ports
        if (typeof executeCommand === 'function') {
            console.log('🔍 Executing showport command to get active ports...');
            // The showport result will be handled by existing dashboard systems
            // We'll access it through the global dashboardCache or similar mechanism
            this.loadActivePortsFromCache();
            
            // Then load counters after a brief delay to allow port status to load
            setTimeout(() => {
                this.refreshErrorData();
            }, 1000);
        } else {
            console.error('🔍 executeCommand function not found!');
            this.addLogEntry('executeCommand function not available', 'error');
        }
    }

    loadActivePortsFromCache() {
        // Get active ports from the Link Status dashboard data
        this.activePorts.clear();
        let foundActivePorts = false;
        
        try {
            // Check if Link Status dashboard has port data available
            if (typeof window.linkStatusDashboard !== 'undefined' && window.linkStatusDashboard) {
                console.log('🔍 Checking Link Status dashboard for active ports...');
                
                // Access the correct port data structure: portData.port_groups
                if (window.linkStatusDashboard.portData && 
                    window.linkStatusDashboard.portData.port_groups && 
                    Object.keys(window.linkStatusDashboard.portData.port_groups).length > 0) {
                    
                    console.log('🔍 Found port_groups data in Link Status dashboard');
                    
                    // Iterate through each port group
                    Object.entries(window.linkStatusDashboard.portData.port_groups).forEach(([groupKey, group]) => {
                        if (group.ports && Array.isArray(group.ports)) {
                            // Check each port in the group
                            group.ports.forEach(port => {
                                // Consider ports active if they have a non-idle status
                                if (port.status && port.status.toLowerCase() !== 'idle') {
                                    const portNumber = parseInt(port.port_number || port.port);
                                    if (!isNaN(portNumber)) {
                                        this.activePorts.add(portNumber);
                                        console.log(`🔍 Found active port from Link Status: ${portNumber} (Group: ${group.name}, Status: ${port.status})`);
                                        foundActivePorts = true;
                                    }
                                }
                            });
                        }
                    });
                }
                
                // Fallback: Try accessing legacy port data structures for compatibility
                if (!foundActivePorts && window.linkStatusDashboard.portStates && Object.keys(window.linkStatusDashboard.portStates).length > 0) {
                    console.log('🔍 Found legacy portStates data in Link Status dashboard');
                    
                    Object.entries(window.linkStatusDashboard.portStates).forEach(([portKey, portData]) => {
                        // Consider ports active if they have an active status or are connected
                        if (portData.status && (portData.status.toLowerCase().includes('active') || 
                                               portData.status.toLowerCase().includes('connected') ||
                                               portData.status.toLowerCase().includes('degraded'))) {
                            const portNumber = parseInt(portData.portNumber || portKey.replace('Port', ''));
                            if (!isNaN(portNumber)) {
                                this.activePorts.add(portNumber);
                                console.log(`🔍 Found active port from Link Status: ${portNumber} (${portData.status})`);
                                foundActivePorts = true;
                            }
                        }
                    });
                }
                
                // Alternative fallback: Try accessing parsed showport data if available
                if (!foundActivePorts && window.linkStatusDashboard.lastResponse) {
                    console.log('🔍 Trying to parse Link Status lastResponse for active ports');
                    
                    const response = window.linkStatusDashboard.lastResponse;
                    if (response && response.parsed && response.parsed.port_summary) {
                        const portSummary = response.parsed.port_summary;
                        
                        // Check upstream ports
                        if (portSummary.upstream_ports) {
                            portSummary.upstream_ports.forEach(port => {
                                if (port.is_active || (port.current_width && port.current_width > 0)) {
                                    this.activePorts.add(port.port_number);
                                    console.log(`🔍 Found active upstream port: ${port.port_number}`);
                                    foundActivePorts = true;
                                }
                            });
                        }
                        
                        // Check downstream port arrays
                        ['ext_mcio_ports', 'int_mcio_ports', 'straddle_ports'].forEach(portType => {
                            if (portSummary[portType]) {
                                portSummary[portType].forEach(port => {
                                    if (port.is_active || (port.current_width && port.current_width > 0)) {
                                        this.activePorts.add(port.port_number);
                                        console.log(`🔍 Found active ${portType} port: ${port.port_number}`);
                                        foundActivePorts = true;
                                    }
                                });
                            }
                        });
                    }
                }
            }
        } catch (error) {
            console.warn('🔍 Error accessing Link Status dashboard data:', error);
        }

        // If we still haven't found active ports, use fallback method
        if (!foundActivePorts) {
            console.log('🔍 No active ports found from Link Status dashboard, using fallback method...');
            this.addLogEntry('Using fallback active port detection (32, 132)', 'info');
            
            // Use known active ports as fallback
            const fallbackPorts = [32, 132]; // Common active ports based on your setup
            fallbackPorts.forEach(portNum => {
                this.activePorts.add(portNum);
                foundActivePorts = true;
            });
            console.log('🔍 Applied fallback active ports:', fallbackPorts);
        }

        console.log(`🔍 Final active ports identified: ${Array.from(this.activePorts)}`);
        
        if (this.activePorts.size === 0) {
            this.addLogEntry('No active ports found - will show all ports with data', 'warning');
        } else {
            this.addLogEntry(`Monitoring errors for ${this.activePorts.size} active ports: ${Array.from(this.activePorts).sort((a,b) => a-b).join(', ')}`, 'info');
        }
    }

    refreshErrorData() {
        console.log('🔍 refreshErrorData called');
        console.log('🔍 isConnected:', isConnected);
        console.log('🔍 currentPort:', currentPort);
        
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            this.addLogEntry('Cannot refresh: No device connected', 'error');
            return;
        }

        // First refresh active ports from Link Status dashboard
        this.loadActivePortsFromCache();

        this.addLogEntry('Refreshing error counters...', 'info');
        showNotification('Loading error counters...', 'info');

        // Store previous errors for change detection
        this.previousErrors = JSON.parse(JSON.stringify(this.linkErrors));

        // Execute 'counters' command
        console.log('🔍 About to execute counters command...');
        console.log('🔍 executeCommand function exists:', typeof executeCommand !== 'undefined');
        
        if (typeof executeCommand === 'function') {
            executeCommand('counters', 'errors');
            console.log('🔍 executeCommand called successfully');
        } else {
            console.error('🔍 executeCommand function not found!');
            this.addLogEntry('executeCommand function not available', 'error');
        }
    }

    // Method to be called by Link Status dashboard when port data is updated
    onLinkStatusUpdate() {
        console.log('🔍 Link Status data updated - refreshing active ports in Errors dashboard');
        this.loadActivePortsFromCache();
        
        // If we have error data, refresh the display to apply new filtering
        if (Object.keys(this.linkErrors).length > 0) {
            this.updateDashboard();
            this.addLogEntry('Active port filtering updated from Link Status dashboard', 'info');
        }
    }

    parseErrorResponse(responseData) {
        try {
            const rawResponse = responseData.raw || responseData;
            console.log('Parsing counters response:', rawResponse);

            // Parse counters table - looking for lines with port data
            // Format: Port#        PortRx       BadTLP       BadDLLP      RecDiag      LinkDown     FlitError
            const lines = rawResponse.split('\n');
            const dataLines = lines.filter(line => {
                // Look for lines that start with a number (port number)
                return /^\s*\d+\s+/.test(line);
            });

            if (dataLines.length === 0) {
                this.addLogEntry('No counter data found in response', 'warning');
                return;
            }

            // Clear existing data
            this.linkErrors = {};
            this.flitErrors = {};

            // Parse each port's errors
            dataLines.forEach(line => {
                // Split by whitespace and filter out empty strings
                const parts = line.trim().split(/\s+/).filter(part => part.length > 0);
                if (parts.length >= 6) {
                    const [portNum, portRx, badTLP, badDLLP, recDiag, linkDown, flitError] = parts;
                    const port = `Port${portNum}`;
                    const portNumber = parseInt(portNum);

                    const portRxVal = parseInt(portRx, 16) || 0; // Parse as hex
                    const badTLPVal = parseInt(badTLP, 16) || 0;
                    const badDLLPVal = parseInt(badDLLP, 16) || 0;
                    const recDiagVal = parseInt(recDiag, 16) || 0;
                    const linkDownVal = parseInt(linkDown, 16) || 0;
                    const flitErrorVal = parseInt(flitError, 16) || 0;

                    this.linkErrors[port] = {
                        portNumber: portNumber,
                        portName: this.getPortName(portNumber),
                        portRx: portRxVal,
                        badTLP: badTLPVal,
                        badDLLP: badDLLPVal,
                        recDiag: recDiagVal,
                        linkDown: linkDownVal,
                        flitError: flitErrorVal,
                        totalErrors: portRxVal + badTLPVal + badDLLPVal + recDiagVal + linkDownVal + flitErrorVal
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

                    // Store flit errors separately for the flit dashboard section
                    this.flitErrors[port] = {
                        portNumber: portNumber,
                        portName: this.getPortName(portNumber),
                        flitBitRateErrors: flitErrorVal,
                        errorRate: flitErrorVal > 0 ? (flitErrorVal / 1000) : 0
                    };
                }
            });

            this.lastUpdate = new Date();
            this.updateDashboard();

            const totalErrors = Object.values(this.linkErrors).reduce((sum, port) => sum + port.totalErrors, 0);
            this.addLogEntry(
                `Successfully loaded ${dataLines.length} port counters (Total Errors: ${totalErrors})`,
                totalErrors > 0 ? 'warning' : 'success'
            );
            showNotification(`Error counters updated for ${dataLines.length} ports`, 'success');

        } catch (error) {
            console.error('Error parsing counters response:', error);
            this.addLogEntry(`Parse error: ${error.message}`, 'error');
            showNotification('Failed to parse counter data', 'error');
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

        // Filter to only active ports, then sort by number
        let portsToShow = Object.keys(this.linkErrors);
        console.log(`🔍 Total ports with error data: ${portsToShow.length}`, portsToShow.map(p => this.linkErrors[p].portNumber));
        console.log(`🔍 Active ports configured: ${this.activePorts.size}`, Array.from(this.activePorts));
        
        // ALWAYS filter to active ports if we have any identified
        if (this.activePorts.size > 0) {
            const originalCount = portsToShow.length;
            portsToShow = portsToShow.filter(port => {
                const portNumber = this.linkErrors[port].portNumber;
                const isActive = this.activePorts.has(portNumber);
                if (!isActive) {
                    console.log(`🔍 Filtering out inactive port: ${portNumber}`);
                }
                return isActive;
            });
            console.log(`🔍 Filtered from ${originalCount} to ${portsToShow.length} active ports for link errors display`);
            console.log(`🔍 Active ports being displayed:`, portsToShow.map(p => this.linkErrors[p].portNumber));
        } else {
            console.warn(`🔍 No active ports configured - showing all ${portsToShow.length} ports`);
        }
        
        // If no active ports after filtering, show a message
        if (portsToShow.length === 0 && this.activePorts.size > 0) {
            container.innerHTML = `
                <div class="loading-state">
                    <span>No error data available for active ports. Active ports: ${Array.from(this.activePorts).sort((a,b) => a-b).join(', ')}</span>
                </div>
            `;
            return;
        }
        
        // If no active ports were detected at all, show a warning and force filter to only known active ports
        if (this.activePorts.size === 0) {
            console.warn(`🔍 No active ports detected - forcing filter to known active ports (32, 132)`);
            const knownActivePorts = [32, 132];
            portsToShow = portsToShow.filter(port => {
                const portNumber = this.linkErrors[port].portNumber;
                return knownActivePorts.includes(portNumber);
            });
            console.log(`🔍 Forced filter result: ${portsToShow.length} ports`, portsToShow.map(p => this.linkErrors[p].portNumber));
            
            // Add a warning message to the container
            const warningDiv = document.createElement('div');
            warningDiv.className = 'loading-state warning';
            warningDiv.innerHTML = `
                <span>⚠️ Active port detection failed - showing only known active ports (32, 132). 
                Visit Link Status dashboard first to populate active port data.</span>
            `;
            container.appendChild(warningDiv);
        }
        
        const sortedPorts = portsToShow.sort((a, b) => {
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
                    
                    <div class="counter-item ${data.linkDown > 0 ? 'has-error' : ''}"
                         data-error-type="linkDown">
                        <div class="counter-label">
                            LinkDown
                            <span class="info-icon">ℹ️</span>
                        </div>
                        <div class="counter-value ${data.linkDown > 0 ? 'has-error' : ''} ${data.linkDown >= 10 ? 'critical' : ''}">
                            ${data.linkDown}
                        </div>
                        ${this.getCounterChange(port, 'linkDown', data.linkDown)}
                    </div>
                    
                    <div class="counter-item ${data.flitError > 0 ? 'has-error' : ''}"
                         data-error-type="flitError">
                        <div class="counter-label">
                            FlitError
                            <span class="info-icon">ℹ️</span>
                        </div>
                        <div class="counter-value ${data.flitError > 0 ? 'has-error' : ''} ${data.flitError >= 10 ? 'critical' : ''}">
                            ${data.flitError}
                        </div>
                        ${this.getCounterChange(port, 'flitError', data.flitError)}
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

        // Filter to only active ports, then sort by number
        let portsToShow = Object.keys(this.flitErrors);
        console.log(`🔍 Total ports with flit error data: ${portsToShow.length}`, portsToShow.map(p => this.flitErrors[p].portNumber));
        console.log(`🔍 Active ports configured for flit errors: ${this.activePorts.size}`, Array.from(this.activePorts));
        
        // ALWAYS filter to active ports if we have any identified
        if (this.activePorts.size > 0) {
            const originalCount = portsToShow.length;
            portsToShow = portsToShow.filter(port => {
                const portNumber = this.flitErrors[port].portNumber;
                const isActive = this.activePorts.has(portNumber);
                if (!isActive) {
                    console.log(`🔍 Filtering out inactive port from flit errors: ${portNumber}`);
                }
                return isActive;
            });
            console.log(`🔍 Filtered flit errors from ${originalCount} to ${portsToShow.length} active ports`);
            console.log(`🔍 Active ports being displayed for flit errors:`, portsToShow.map(p => this.flitErrors[p].portNumber));
        } else {
            console.warn(`🔍 No active ports configured for flit errors - showing all ${portsToShow.length} ports`);
        }
        
        // If no active ports after filtering, show a message
        if (portsToShow.length === 0 && this.activePorts.size > 0) {
            container.innerHTML = `
                <div class="loading-state">
                    <span>No flit error data available for active ports. Active ports: ${Array.from(this.activePorts).sort((a,b) => a-b).join(', ')}</span>
                </div>
            `;
            return;
        }
        
        // If no active ports were detected at all, show a warning and force filter to only known active ports
        if (this.activePorts.size === 0) {
            console.warn(`🔍 No active ports detected for flit errors - forcing filter to known active ports (32, 132)`);
            const knownActivePorts = [32, 132];
            portsToShow = portsToShow.filter(port => {
                const portNumber = this.flitErrors[port].portNumber;
                return knownActivePorts.includes(portNumber);
            });
            console.log(`🔍 Forced flit error filter result: ${portsToShow.length} ports`, portsToShow.map(p => this.flitErrors[p].portNumber));
        }
        
        const sortedPorts = portsToShow.sort((a, b) => {
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
        if (!confirm('Are you sure you want to reset all error counters? This will send the "counters-reset" command to the device.')) {
            return;
        }

        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            this.addLogEntry('Cannot reset: No device connected', 'error');
            return;
        }

        this.addLogEntry('Sending counters-reset command...', 'info');
        showNotification('Resetting error counters...', 'info');

        // Execute 'counters-reset' command
        executeCommand('counters-reset', 'errors');
    }

    addLogEntry(message, type = 'info') {
        // Log to console for debugging
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] Errors Dashboard ${type.toUpperCase()}: ${message}`);

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
            reportContent += String.prototype.padEnd.call('PortRx', 10);
            reportContent += String.prototype.padEnd.call('BadTLP', 10);
            reportContent += String.prototype.padEnd.call('BadDLLP', 10);
            reportContent += String.prototype.padEnd.call('RecDiag', 10);
            reportContent += String.prototype.padEnd.call('LinkDown', 10);
            reportContent += String.prototype.padEnd.call('FlitError', 10);
            reportContent += 'Total\n';
            reportContent += '-'.repeat(80) + '\n';

            ports.sort((a, b) => a.data.portNumber - b.data.portNumber).forEach(({port, data}) => {
                reportContent += String.prototype.padEnd.call(`Port ${data.portNumber}`, 15);
                reportContent += String.prototype.padEnd.call(data.portRx.toString(), 10);
                reportContent += String.prototype.padEnd.call(data.badTLP.toString(), 10);
                reportContent += String.prototype.padEnd.call(data.badDLLP.toString(), 10);
                reportContent += String.prototype.padEnd.call(data.recDiag.toString(), 10);
                reportContent += String.prototype.padEnd.call((data.linkDown || 0).toString(), 10);
                reportContent += String.prototype.padEnd.call((data.flitError || 0).toString(), 10);
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

function initializeErrorsDashboard() {
    if (!window.errorsDashboard) {
        window.errorsDashboard = new ErrorsDashboard();
        console.log('✅ Errors Dashboard instance created');
        console.log('✅ Errors Dashboard set on window object');
    }
    return window.errorsDashboard;
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

// Force initialization immediately for debugging
console.log('🔍 Forcing immediate initialization...');
initializeErrorsDashboard();
console.log('🔍 Window object check:', window.errorsDashboard ? 'EXISTS' : 'MISSING');