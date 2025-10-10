/**
 * CalypsoPy+ Registers Dashboard
 * Handles read (mr), write (mw), and dump (dr/dp) register operations
 * PCIe 6.x register interface
 */

class RegistersDashboard {
    constructor() {
        this.baseAddress = 0x60800000;
        this.portOffset = 0x8000;
        this.currentPort = 0;
        this.lastCommand = null;
        this.commandHistory = [];
        this.init();
    }

    init() {
        console.log('Initializing Registers Dashboard...');
        this.setupEventHandlers();
        this.updatePortSelector();
    }

    setupEventHandlers() {
        // Port number selector
        const portSelector = document.getElementById('regPortNumber');
        if (portSelector) {
            portSelector.addEventListener('change', (e) => {
                this.currentPort = parseInt(e.target.value);
                console.log(`Register port changed to: ${this.currentPort}`);
            });
        }

        // Manual command input
        const commandInput = document.getElementById('registersCommandInput');
        if (commandInput) {
            commandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                    this.executeCommand(e.target.value.trim());
                    e.target.value = '';
                }
            });
        }

        // Send button
        const sendBtn = document.getElementById('sendRegistersCmd');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                const input = document.getElementById('registersCommandInput');
                if (input && input.value.trim()) {
                    this.executeCommand(input.value.trim());
                    input.value = '';
                }
            });
        }

        // Clear console button
        const clearBtn = document.getElementById('clearRegistersConsole');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearConsole());
        }

        // Preset buttons
        document.querySelectorAll('#registersPresets .preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.cmd;
                if (cmd) {
                    this.executePreset(cmd);
                }
            });
        });
    }

    updatePortSelector() {
        const selector = document.getElementById('regPortNumber');
        if (selector) {
            selector.innerHTML = '';
            for (let i = 0; i <= 144; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `Port ${i}`;
                if (i === 0) option.selected = true;
                selector.appendChild(option);
            }
        }
    }

    calculatePortAddress(port) {
        return this.baseAddress + (port * this.portOffset * 2);
    }

    executePreset(presetType) {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            return;
        }

        let command = '';
        const portAddr = this.calculatePortAddress(this.currentPort);

        switch (presetType) {
            case 'port_status':
                // Read port status register (example: 0x0)
                command = `mr 0x${portAddr.toString(16).toUpperCase()}`;
                break;
            case 'link_control':
                // Read link control register (example: 0x10)
                command = `mr 0x${(portAddr + 0x10).toString(16).toUpperCase()}`;
                break;
            case 'port_dump':
                // Dump 32 registers from port base
                command = `dr 0x${portAddr.toString(16).toUpperCase()} 20`;
                break;
            case 'port_config':
                // Dump port configuration area
                command = `dp ${this.currentPort}`;
                break;
            default:
                console.warn(`Unknown preset: ${presetType}`);
                return;
        }

        this.executeCommand(command);
    }

    executeCommand(command) {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            return;
        }

        this.lastCommand = command;
        this.commandHistory.push({
            command: command,
            timestamp: new Date().toISOString()
        });

        this.addConsoleEntry('command', `> ${command}`);

        // Show loading state
        const sendBtn = document.getElementById('sendRegistersCmd');
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
            dashboard: 'registers',
            use_cache: false
        });
    }

    handleResponse(data) {
        if (!data.success) {
            this.addConsoleEntry('error', `Error: ${data.message || 'Command failed'}`);
            showNotification('Command execution failed', 'error');
            return;
        }

        const rawResponse = data.data.raw;
        const commandType = this.detectCommandType(this.lastCommand);

        // Add raw response
        this.addConsoleEntry('response', rawResponse);

        // Parse and display formatted data
        try {
            const parsed = this.parseRegisterResponse(rawResponse, commandType);
            if (parsed) {
                this.displayParsedData(parsed, commandType);
            }
        } catch (error) {
            console.error('Error parsing register response:', error);
        }

        showNotification('Register command completed', 'success');
    }

    detectCommandType(command) {
        const cmd = command.trim().toLowerCase();
        if (cmd.startsWith('mr ')) return 'read';
        if (cmd.startsWith('mw ')) return 'write';
        if (cmd.startsWith('dr ')) return 'dump_register';
        if (cmd.startsWith('dp ')) return 'dump_port';
        return 'unknown';
    }

    parseRegisterResponse(response, commandType) {
        switch (commandType) {
            case 'read':
                return this.parseReadResponse(response);
            case 'write':
                return this.parseWriteResponse(response);
            case 'dump_register':
                return this.parseDumpResponse(response);
            case 'dump_port':
                return this.parseDumpResponse(response);
            default:
                return null;
        }
    }

    parseReadResponse(response) {
        // Example: "cmd>mr 0x60800000 0xffffffff"
        const match = response.match(/0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)/);
        if (match) {
            return {
                address: match[1],
                value: match[2],
                type: 'read'
            };
        }
        return null;
    }

    parseWriteResponse(response) {
        // Write commands typically just echo the command
        const match = response.match(/mw\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)/);
        if (match) {
            return {
                address: match[1],
                value: match[2],
                type: 'write'
            };
        }
        return null;
    }

    parseDumpResponse(response) {
        // Parse register dump format
        // Example: "60800000:00000000 00100000 00000000 00000000"
        const lines = response.split('\n');
        const registers = [];

        for (const line of lines) {
            const match = line.match(/^([0-9a-fA-F]+):(.+)/);
            if (match) {
                const baseAddr = match[1];
                const values = match[2].trim().split(/\s+/);

                values.forEach((value, index) => {
                    if (value.match(/^[0-9a-fA-F]{8}$/)) {
                        const offset = index * 4;
                        const fullAddr = (parseInt(baseAddr, 16) + offset).toString(16).toUpperCase();
                        registers.push({
                            address: fullAddr,
                            value: value,
                            offset: offset
                        });
                    }
                });
            }
        }

        return {
            type: 'dump',
            registers: registers
        };
    }

    displayParsedData(parsed, commandType) {
        const consoleContainer = document.getElementById('registersConsole');
        if (!consoleContainer) return;

        const entry = document.createElement('div');
        entry.className = 'console-entry parsed-data';

        if (commandType === 'read') {
            entry.innerHTML = `
                <div class="parsed-header">📊 Register Read Result</div>
                <div class="register-result">
                    <div class="reg-row">
                        <span class="reg-label">Address:</span>
                        <span class="reg-value mono">0x${parsed.address}</span>
                    </div>
                    <div class="reg-row">
                        <span class="reg-label">Value:</span>
                        <span class="reg-value mono">0x${parsed.value}</span>
                    </div>
                    <div class="reg-row">
                        <span class="reg-label">Binary:</span>
                        <span class="reg-value mono">${this.hexToBinary(parsed.value)}</span>
                    </div>
                    <div class="reg-row">
                        <span class="reg-label">Decimal:</span>
                        <span class="reg-value mono">${parseInt(parsed.value, 16)}</span>
                    </div>
                </div>
            `;
        } else if (commandType === 'write') {
            entry.innerHTML = `
                <div class="parsed-header">✅ Register Write Confirmed</div>
                <div class="register-result">
                    <div class="reg-row">
                        <span class="reg-label">Address:</span>
                        <span class="reg-value mono">0x${parsed.address}</span>
                    </div>
                    <div class="reg-row">
                        <span class="reg-label">Value Written:</span>
                        <span class="reg-value mono">0x${parsed.value}</span>
                    </div>
                </div>
            `;
        } else if (commandType === 'dump_register' || commandType === 'dump_port') {
            let tableHTML = `
                <div class="parsed-header">📋 Register Dump (${parsed.registers.length} registers)</div>
                <div class="register-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Address</th>
                                <th>+0x0</th>
                                <th>+0x4</th>
                                <th>+0x8</th>
                                <th>+0xC</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            // Group by rows of 4
            for (let i = 0; i < parsed.registers.length; i += 4) {
                const baseReg = parsed.registers[i];
                const baseAddr = parseInt(baseReg.address, 16) & 0xFFFFFFF0;

                tableHTML += `<tr><td class="addr-col">0x${baseAddr.toString(16).toUpperCase().padStart(8, '0')}</td>`;

                for (let j = 0; j < 4; j++) {
                    if (i + j < parsed.registers.length) {
                        tableHTML += `<td class="data-col">${parsed.registers[i + j].value}</td>`;
                    } else {
                        tableHTML += `<td class="data-col">--</td>`;
                    }
                }

                tableHTML += `</tr>`;
            }

            tableHTML += `
                        </tbody>
                    </table>
                </div>
            `;
            entry.innerHTML = tableHTML;
        }

        consoleContainer.appendChild(entry);
        consoleContainer.scrollTop = consoleContainer.scrollHeight;
    }

    hexToBinary(hex) {
        const num = parseInt(hex, 16);
        return num.toString(2).padStart(32, '0').match(/.{1,4}/g).join(' ');
    }

    addConsoleEntry(type, content) {
        const consoleContainer = document.getElementById('registersConsole');
        if (!consoleContainer) return;

        const entry = document.createElement('div');
        entry.className = `console-entry ${type}`;

        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `
            <div class="console-timestamp">${timestamp}</div>
            <div class="console-content">${this.escapeHtml(content)}</div>
        `;

        consoleContainer.appendChild(entry);
        consoleContainer.scrollTop = consoleContainer.scrollHeight;

        // Limit console entries
        while (consoleContainer.children.length > 100) {
            consoleContainer.removeChild(consoleContainer.firstChild);
        }
    }

    clearConsole() {
        const consoleContainer = document.getElementById('registersConsole');
        if (consoleContainer) {
            consoleContainer.innerHTML = `
                <div class="console-entry command">
                    <div class="console-timestamp">System Ready</div>
                    <div class="console-content">Registers interface ready. Port ${this.currentPort} selected (Base: 0x${this.calculatePortAddress(this.currentPort).toString(16).toUpperCase()})</div>
                </div>
            `;
        }
        showNotification('Console cleared', 'info');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    onActivate() {
        console.log('Registers dashboard activated');
        this.clearConsole();
    }

    getStatusSummary() {
        return `Registers Dashboard - Port ${this.currentPort} (0x${this.calculatePortAddress(this.currentPort).toString(16).toUpperCase()})`;
    }
}

// Initialize the dashboard
let registersDashboard;

function initializeRegistersDashboard() {
    registersDashboard = new RegistersDashboard();
    console.log('✅ Registers Dashboard initialized');
    return registersDashboard;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRegistersDashboard);
} else {
    initializeRegistersDashboard();
}