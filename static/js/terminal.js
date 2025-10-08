/**
 * CalypsoPy+ Terminal Dashboard JavaScript
 * File: static/js/terminal.js
 *
 * Full-featured CLI terminal emulator for direct device communication
 */

class TerminalDashboard {
    constructor() {
        this.commandHistory = [];
        this.historyIndex = -1;
        this.currentCommand = '';
        this.terminalBuffer = [];
        this.maxBufferSize = 1000;
        this.isProcessing = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.initializeTerminal();
        console.log('✅ Terminal Dashboard initialized');
    }

    bindEvents() {
        const terminalInput = document.getElementById('terminalInput');
        const sendTerminalBtn = document.getElementById('sendTerminalCmd');
        const clearTerminalBtn = document.getElementById('clearTerminal');
        const exportTerminalBtn = document.getElementById('exportTerminal');

        if (terminalInput) {
            // Handle Enter key for command submission
            terminalInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.submitCommand();
                }
                // Up arrow - previous command
                else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateHistory('up');
                }
                // Down arrow - next command
                else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateHistory('down');
                }
                // Tab - autocomplete (future feature)
                else if (e.key === 'Tab') {
                    e.preventDefault();
                    // Placeholder for autocomplete
                }
                // Ctrl+C - cancel current input
                else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                    e.preventDefault();
                    this.cancelInput();
                }
                // Ctrl+L - clear terminal
                else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                    e.preventDefault();
                    this.clearTerminal();
                }
            });

            // Focus input when clicking anywhere in terminal
            const terminalDisplay = document.getElementById('terminalDisplay');
            if (terminalDisplay) {
                terminalDisplay.addEventListener('click', () => {
                    terminalInput.focus();
                });
            }
        }

        if (sendTerminalBtn) {
            sendTerminalBtn.addEventListener('click', () => {
                this.submitCommand();
            });
        }

        if (clearTerminalBtn) {
            clearTerminalBtn.addEventListener('click', () => {
                this.clearTerminal();
            });
        }

        if (exportTerminalBtn) {
            exportTerminalBtn.addEventListener('click', () => {
                this.exportSession();
            });
        }
    }

    initializeTerminal() {
        this.addTerminalLine('system', 'CalypsoPy+ Terminal Emulator v1.0.0');
        this.addTerminalLine('system', 'by Serial Cables - Professional Hardware Interface');
        this.addTerminalLine('system', '─'.repeat(80));

        if (isConnected && currentPort) {
            this.addTerminalLine('success', `Connected to ${currentPort}`);
            this.addTerminalLine('info', 'Settings: 115200-8-N-1');
        } else {
            this.addTerminalLine('warning', 'No device connected. Connect a device to begin.');
        }

        this.addTerminalLine('system', '─'.repeat(80));
        this.addTerminalLine('info', 'Type commands and press Enter to execute');
        this.addTerminalLine('info', 'Keyboard shortcuts: ↑/↓ (history), Ctrl+L (clear), Ctrl+C (cancel)');
        this.addTerminalLine('system', '');
        this.showPrompt();
    }

    onActivate() {
        console.log('Terminal dashboard activated');

        // Focus the input
        const terminalInput = document.getElementById('terminalInput');
        if (terminalInput) {
            setTimeout(() => terminalInput.focus(), 100);
        }

        // Update connection status
        if (isConnected && currentPort) {
            this.addTerminalLine('success', `Terminal ready on ${currentPort}`);
        } else {
            this.addTerminalLine('warning', 'Connect a device to use terminal features');
        }
    }

    submitCommand() {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            this.addTerminalLine('error', 'ERROR: No device connected');
            return;
        }

        const terminalInput = document.getElementById('terminalInput');
        if (!terminalInput) return;

        const command = terminalInput.value.trim();

        if (!command) {
            this.showPrompt();
            return;
        }

        // Add to history
        this.commandHistory.push(command);
        this.historyIndex = this.commandHistory.length;

        // Display command with prompt
        this.addTerminalLine('command', `${this.getPromptString()}${command}`);

        // Clear input
        terminalInput.value = '';
        this.currentCommand = '';

        // Set processing state
        this.isProcessing = true;
        this.addTerminalLine('info', '⟳ Processing...');

        // Execute command
        this.executeTerminalCommand(command);
    }

    executeTerminalCommand(command) {
        // Send command via socket to device
        socket.emit('execute_command', {
            port: currentPort,
            command: command,
            dashboard: 'terminal',
            use_cache: false  // Terminal always sends fresh commands
        });
    }

    handleCommandResult(data) {
        this.isProcessing = false;

        // Remove "Processing..." message
        const terminalDisplay = document.getElementById('terminalDisplay');
        if (terminalDisplay && terminalDisplay.lastChild) {
            const lastLine = terminalDisplay.lastChild;
            if (lastLine.textContent.includes('Processing...')) {
                terminalDisplay.removeChild(lastLine);
            }
        }

        if (data.success && data.data) {
            const response = data.data.raw || data.data;
            const timestamp = data.data.timestamp || new Date().toISOString();

            // Display response
            if (response) {
                // Split multi-line responses
                const lines = response.split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        this.addTerminalLine('response', line);
                    }
                });
            }

            // Show response time if available
            if (data.response_time_ms) {
                this.addTerminalLine('system', `[Completed in ${data.response_time_ms.toFixed(2)}ms]`);
            }

        } else {
            this.addTerminalLine('error', `ERROR: ${data.message || 'Command failed'}`);
        }

        // Show new prompt
        this.addTerminalLine('system', '');
        this.showPrompt();
    }

    addTerminalLine(type, content, timestamp = null) {
        const terminalDisplay = document.getElementById('terminalDisplay');
        if (!terminalDisplay) return;

        const line = document.createElement('div');
        line.className = `terminal-line terminal-${type}`;

        // Add timestamp for some types
        if (timestamp && (type === 'command' || type === 'response')) {
            const time = new Date(timestamp).toLocaleTimeString();
            const timeSpan = document.createElement('span');
            timeSpan.className = 'terminal-timestamp';
            timeSpan.textContent = `[${time}] `;
            line.appendChild(timeSpan);
        }

        const contentSpan = document.createElement('span');
        contentSpan.className = 'terminal-content';
        contentSpan.textContent = content;
        line.appendChild(contentSpan);

        terminalDisplay.appendChild(line);

        // Add to buffer
        this.terminalBuffer.push({
            type: type,
            content: content,
            timestamp: timestamp || new Date().toISOString()
        });

        // Trim buffer if too large
        if (this.terminalBuffer.length > this.maxBufferSize) {
            this.terminalBuffer.shift();
        }

        // Auto-scroll to bottom
        terminalDisplay.scrollTop = terminalDisplay.scrollHeight;
    }

    showPrompt() {
        const promptStr = this.getPromptString();
        this.addTerminalLine('prompt', promptStr);
    }

    getPromptString() {
        const deviceName = currentPort || 'disconnected';
        return `${deviceName}> `;
    }

    navigateHistory(direction) {
        const terminalInput = document.getElementById('terminalInput');
        if (!terminalInput) return;

        if (this.commandHistory.length === 0) return;

        if (direction === 'up') {
            if (this.historyIndex > 0) {
                this.historyIndex--;
            }
        } else if (direction === 'down') {
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
            } else {
                this.historyIndex = this.commandHistory.length;
                terminalInput.value = this.currentCommand;
                return;
            }
        }

        if (this.historyIndex >= 0 && this.historyIndex < this.commandHistory.length) {
            terminalInput.value = this.commandHistory[this.historyIndex];
        }
    }

    cancelInput() {
        const terminalInput = document.getElementById('terminalInput');
        if (terminalInput) {
            terminalInput.value = '';
            this.currentCommand = '';
            this.addTerminalLine('system', '^C');
            this.showPrompt();
        }
    }

    clearTerminal() {
        const terminalDisplay = document.getElementById('terminalDisplay');
        if (terminalDisplay) {
            terminalDisplay.innerHTML = '';
        }

        this.terminalBuffer = [];
        this.addTerminalLine('system', 'Terminal cleared');
        this.addTerminalLine('system', '');
        this.showPrompt();

        showNotification('Terminal cleared', 'info');
    }

    exportSession() {
        const timestamp = new Date().toLocaleString();
        const filename = `CalypsoPy_Terminal_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

        let sessionContent = '';
        sessionContent += '='.repeat(80) + '\n';
        sessionContent += 'CalypsoPy+ Terminal Session Export\n';
        sessionContent += 'Generated by Serial Cables Professional Interface\n';
        sessionContent += '='.repeat(80) + '\n';
        sessionContent += `Session Exported: ${timestamp}\n`;
        sessionContent += `Connection Port: ${currentPort || 'Not Connected'}\n`;
        sessionContent += `Connection Settings: 115200-8-N-1\n`;
        sessionContent += `Commands Executed: ${this.commandHistory.length}\n`;
        sessionContent += '\n';
        sessionContent += 'SESSION TRANSCRIPT\n';
        sessionContent += '='.repeat(80) + '\n';

        // Export terminal buffer
        this.terminalBuffer.forEach(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            sessionContent += `[${time}] [${entry.type.toUpperCase()}] ${entry.content}\n`;
        });

        sessionContent += '\n';
        sessionContent += '='.repeat(80) + '\n';
        sessionContent += 'COMMAND HISTORY\n';
        sessionContent += '='.repeat(80) + '\n';

        this.commandHistory.forEach((cmd, index) => {
            sessionContent += `${index + 1}. ${cmd}\n`;
        });

        sessionContent += '\n';
        sessionContent += '='.repeat(80) + '\n';
        sessionContent += 'End of Terminal Session Export\n';
        sessionContent += `Export File: ${filename}\n`;
        sessionContent += 'Visit: https://serial-cables.com for more information\n';
        sessionContent += '='.repeat(80) + '\n';

        // Create and download file
        const blob = new Blob([sessionContent], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.style.display = 'none';

        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        window.URL.revokeObjectURL(url);

        this.addTerminalLine('success', `Session exported: ${filename}`);
        showNotification(`Terminal session exported: ${filename}`, 'success');
    }

    // Handle connection status changes
    onConnectionChange(connected, port) {
        if (connected) {
            this.addTerminalLine('success', `Connected to ${port}`);
            this.addTerminalLine('info', 'Settings: 115200-8-N-1');
        } else {
            this.addTerminalLine('warning', 'Device disconnected');
        }
        this.addTerminalLine('system', '');
        this.showPrompt();
    }

    // Get terminal statistics
    getStats() {
        return {
            totalCommands: this.commandHistory.length,
            bufferSize: this.terminalBuffer.length,
            maxBufferSize: this.maxBufferSize,
            isProcessing: this.isProcessing
        };
    }
}

function initializeTerminalDashboard() {
    if (!terminalDashboard) {
        terminalDashboard = new TerminalDashboard();
        console.log('✅ Terminal Dashboard instance created');
    }
    return terminalDashboard;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initializeTerminalDashboard();
    });
} else {
    initializeTerminalDashboard();
}

// Handle terminal dashboard activation
function handleTerminalDashboardActivation() {
    if (terminalDashboard && terminalDashboard.onActivate) {
        terminalDashboard.onActivate();
    }
}

// Export to global scope
if (typeof window !== 'undefined') {
    window.TerminalDashboard = TerminalDashboard;
    window.terminalDashboard = terminalDashboard;
    window.initializeTerminalDashboard = initializeTerminalDashboard;
    window.handleTerminalDashboardActivation = handleTerminalDashboardActivation;
}

// If using as a module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TerminalDashboard,
        initializeTerminalDashboard,
        handleTerminalDashboardActivation
    };
}

console.log('✅ Terminal Dashboard JavaScript loaded successfully');