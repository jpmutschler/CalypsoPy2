/**
 * CalypsoPy+ Resets Dashboard JavaScript
 * Add this to static/js/app.js or create a new file static/js/resets.js
 */

class ResetsDashboard {
    constructor() {
        this.currentResetCommand = null;
        this.currentResetType = null;
        this.resetHistory = [];
        this.init();
    }

    init() {
        this.bindEvents();
        console.log('Resets Dashboard initialized');
    }

    bindEvents() {
        // Reset button click handlers
        document.querySelectorAll('.btn-reset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const command = btn.getAttribute('data-reset-cmd');
                const resetType = btn.getAttribute('data-reset-type');
                this.showConfirmationModal(command, resetType);
            });
        });

        // Confirmation modal handlers
        const confirmBtn = document.getElementById('confirmResetBtn');
        const cancelBtn = document.getElementById('cancelResetBtn');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.executeReset();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideConfirmationModal();
            });
        }

        // Restart modal handlers
        const restartNowBtn = document.getElementById('restartNowBtn');
        const restartLaterBtn = document.getElementById('restartLaterBtn');

        if (restartNowBtn) {
            restartNowBtn.addEventListener('click', () => {
                this.restartApplication();
            });
        }

        if (restartLaterBtn) {
            restartLaterBtn.addEventListener('click', () => {
                this.hideRestartModal();
            });
        }

        // Clear history button
        const clearHistoryBtn = document.getElementById('clearResetHistory');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                this.clearHistory();
            });
        }

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                }
            });
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideConfirmationModal();
                this.hideRestartModal();
            }
        });
    }

    showConfirmationModal(command, resetType) {
        if (!isConnected || !currentPort) {
            showNotification('Please connect to a device first', 'error');
            return;
        }

        this.currentResetCommand = command;
        this.currentResetType = resetType;

        const modal = document.getElementById('resetConfirmationModal');
        const message = document.getElementById('resetConfirmMessage');

        if (modal && message) {
            message.textContent = `Are you sure you want to execute the ${resetType} Reset? This will send the "${command}" command to the device.`;
            modal.classList.add('active');
        }
    }

    hideConfirmationModal() {
        const modal = document.getElementById('resetConfirmationModal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.currentResetCommand = null;
        this.currentResetType = null;
    }

    showRestartModal() {
        const modal = document.getElementById('restartRequiredModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    hideRestartModal() {
        const modal = document.getElementById('restartRequiredModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    executeReset() {
        if (!this.currentResetCommand || !currentPort) {
            return;
        }

        this.hideConfirmationModal();

        // Add to history - executing
        this.addHistoryEntry(
            `Executing ${this.currentResetType} Reset...`,
            'warning'
        );

        // Disable all reset buttons during execution
        this.disableResetButtons(true);

        // Show notification
        showNotification(
            `Executing ${this.currentResetType} Reset (${this.currentResetCommand})...`,
            'info'
        );

        // Execute the reset command via socket
        socket.emit('execute_command', {
            port: currentPort,
            command: this.currentResetCommand,
            dashboard: 'resets',
            use_cache: false
        });

        // Set up one-time listener for this specific reset result
        const resetResultHandler = (data) => {
            // Only handle if it's from the resets dashboard
            if (data.dashboard === 'resets') {
                this.handleResetResult(data);
                // Remove this specific handler after use
                socket.off('command_result', resetResultHandler);
            }
        };

        socket.on('command_result', resetResultHandler);
    }

    handleResetResult(data) {
        this.disableResetButtons(false);

        if (data.success) {
            // Add success to history
            this.addHistoryEntry(
                `${this.currentResetType} Reset completed successfully (${this.currentResetCommand})`,
                'success'
            );

            showNotification(
                `${this.currentResetType} Reset executed successfully`,
                'success'
            );

            // Show restart modal after a short delay
            setTimeout(() => {
                this.showRestartModal();
            }, 1500);

        } else {
            // Add error to history
            this.addHistoryEntry(
                `${this.currentResetType} Reset failed: ${data.message}`,
                'error'
            );

            showNotification(
                `Reset failed: ${data.message}`,
                'error'
            );
        }

        this.currentResetCommand = null;
        this.currentResetType = null;
    }

    disableResetButtons(disabled) {
        document.querySelectorAll('.btn-reset').forEach(btn => {
            btn.disabled = disabled;
            if (disabled) {
                const textEl = btn.querySelector('.btn-text');
                if (textEl) {
                    const originalText = textEl.textContent;
                    textEl.textContent = 'Executing...';
                    btn.dataset.originalText = originalText;
                }
            } else if (btn.dataset.originalText) {
                const textEl = btn.querySelector('.btn-text');
                if (textEl) {
                    textEl.textContent = btn.dataset.originalText;
                }
            }
        });
    }

    addHistoryEntry(message, type = 'info') {
        const container = document.getElementById('resetHistoryContainer');
        if (!container) return;

        const timestamp = new Date().toLocaleTimeString();

        const entry = document.createElement('div');
        entry.className = `reset-history-entry ${type}`;

        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'reset-history-timestamp';
        timestampDiv.textContent = timestamp;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'reset-history-content';
        contentDiv.textContent = message;

        entry.appendChild(timestampDiv);
        entry.appendChild(contentDiv);

        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;

        // Keep only last 50 entries
        const entries = container.children;
        if (entries.length > 50) {
            container.removeChild(entries[1]); // Keep the first "System Ready" entry
        }

        // Store in history array
        this.resetHistory.push({
            timestamp: new Date().toISOString(),
            message: message,
            type: type
        });
    }

    clearHistory() {
        const container = document.getElementById('resetHistoryContainer');
        if (container) {
            container.innerHTML = `
                <div class="reset-history-entry system">
                    <div class="reset-history-timestamp">System Ready</div>
                    <div class="reset-history-content">Reset controls initialized. Ready to execute reset operations.</div>
                </div>
            `;
        }

        this.resetHistory = [];
        showNotification('Reset history cleared', 'info');
    }

    restartApplication() {
        this.hideRestartModal();

        // Add to history
        this.addHistoryEntry(
            'Application restart initiated by user',
            'system'
        );

        showNotification('Restarting CalypsoPy+...', 'info');

        // Disconnect current device if connected
        if (isConnected && currentPort) {
            socket.emit('disconnect_device', { port: currentPort });
        }

        // Wait a moment then reload the page
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    }

    onActivate() {
        console.log('Resets dashboard activated');

        // Check connection status
        if (!isConnected) {
            this.addHistoryEntry(
                'No device connected. Please connect a device to use reset functions.',
                'warning'
            );
        } else {
            this.addHistoryEntry(
                `Reset controls ready for ${currentPort}`,
                'success'
            );
        }
    }

    exportResetHistory() {
        const timestamp = new Date().toLocaleString();
        const filename = `CalypsoPy_ResetHistory_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`;

        let reportContent = '';
        reportContent += '='.repeat(60) + '\n';
        reportContent += 'CalypsoPy+ Reset History Report\n';
        reportContent += 'Generated by Serial Cables Professional Interface\n';
        reportContent += '='.repeat(60) + '\n';
        reportContent += `Report Generated: ${timestamp}\n`;
        reportContent += `Connection Port: ${currentPort || 'Unknown'}\n`;
        reportContent += '\n';

        reportContent += 'RESET HISTORY\n';
        reportContent += '-'.repeat(60) + '\n';

        if (this.resetHistory.length === 0) {
            reportContent += 'No reset operations recorded\n';
        } else {
            this.resetHistory.forEach((entry, index) => {
                reportContent += `${index + 1}. [${entry.timestamp}] [${entry.type.toUpperCase()}]\n`;
                reportContent += `   ${entry.message}\n\n`;
            });
        }

        reportContent += '\n';
        reportContent += '='.repeat(60) + '\n';
        reportContent += 'End of Reset History Report\n';
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

        this.addHistoryEntry('Reset history exported to file', 'success');
        showNotification(`Reset history exported: ${filename}`, 'success');
    }
}

// Initialize Resets Dashboard
let resetsDashboard = null;

// Initialization function to be called from main app
function initializeResetsDashboard() {
    if (!resetsDashboard) {
        resetsDashboard = new ResetsDashboard();
        console.log('Resets Dashboard instance created');
    }
    return resetsDashboard;
}

// Auto-initialize when DOM is ready (if not already initialized in main app)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initializeResetsDashboard();
    });
} else {
    // DOM already loaded
    initializeResetsDashboard();
}

// Integrate with existing dashboard switching
// This should be called from the main app.js switchDashboard function
function handleResetsDashboardActivation() {
    if (resetsDashboard && resetsDashboard.onActivate) {
        resetsDashboard.onActivate();
    }
}

// Export to global scope for access from other scripts
if (typeof window !== 'undefined') {
    window.ResetsDashboard = ResetsDashboard;
    window.resetsDashboard = resetsDashboard;
    window.initializeResetsDashboard = initializeResetsDashboard;
    window.handleResetsDashboardActivation = handleResetsDashboardActivation;
}

// If using as a module, export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ResetsDashboard,
        initializeResetsDashboard,
        handleResetsDashboardActivation
    };
}

console.log('✅ Resets Dashboard JavaScript loaded successfully');