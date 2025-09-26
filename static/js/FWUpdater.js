class FirmwareUpdateManager {
    constructor() {
        this.mcuFile = null;
        this.sbrFile = null;
        this.activeTransfer = null;
        this.init();
    }

    init() {
        this.setupFileUploadZones();
        this.setupButtonHandlers();
        this.setupSocketHandlers();
    }

    setupFileUploadZones() {
        // MCU Upload Zone
        const mcuDropZone = document.getElementById('mcuDropZone');
        const mcuFileInput = document.getElementById('mcuFileInput');

        if (mcuDropZone && mcuFileInput) {
            mcuDropZone.addEventListener('click', () => mcuFileInput.click());

            mcuDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                mcuDropZone.classList.add('drag-over');
            });

            mcuDropZone.addEventListener('dragleave', () => {
                mcuDropZone.classList.remove('drag-over');
            });

            mcuDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                mcuDropZone.classList.remove('drag-over');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleMcuFileSelect(files[0]);
                }
            });

            mcuFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleMcuFileSelect(e.target.files[0]);
                }
            });
        }

        // SBR Upload Zone
        const sbrDropZone = document.getElementById('sbrDropZone');
        const sbrFileInput = document.getElementById('sbrFileInput');

        if (sbrDropZone && sbrFileInput) {
            sbrDropZone.addEventListener('click', () => sbrFileInput.click());

            sbrDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                sbrDropZone.classList.add('drag-over');
            });

            sbrDropZone.addEventListener('dragleave', () => {
                sbrDropZone.classList.remove('drag-over');
            });

            sbrDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                sbrDropZone.classList.remove('drag-over');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleSbrFileSelect(files[0]);
                }
            });

            sbrFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleSbrFileSelect(e.target.files[0]);
                }
            });
        }
    }

    setupButtonHandlers() {
        // MCU Update Button
        document.getElementById('startMcuUpdate')?.addEventListener('click', () => {
            this.startMcuUpdate();
        });

        document.getElementById('cancelMcuUpdate')?.addEventListener('click', () => {
            this.cancelUpdate('mcu');
        });

        document.getElementById('mcuRemoveFile')?.addEventListener('click', () => {
            this.removeMcuFile();
        });

        // SBR Update Button
        document.getElementById('startSbrUpdate')?.addEventListener('click', () => {
            this.startSbrUpdate();
        });

        document.getElementById('cancelSbrUpdate')?.addEventListener('click', () => {
            this.cancelUpdate('sbr');
        });

        document.getElementById('sbrRemoveFile')?.addEventListener('click', () => {
            this.removeSbrFile();
        });

        // Other buttons
        document.getElementById('checkFirmwareVersion')?.addEventListener('click', () => {
            this.checkFirmwareVersion();
        });

        document.getElementById('clearFirmwareLog')?.addEventListener('click', () => {
            this.clearLog();
        });
    }

    setupSocketHandlers() {
        // Listen for firmware progress updates
        socket.on('firmware_progress', (data) => {
            this.handleProgressUpdate(data);
        });

        socket.on('firmware_update_result', (data) => {
            this.handleUpdateResult(data);
        });

        socket.on('firmware_cancel_result', (data) => {
            this.handleCancelResult(data);
        });
    }

    handleMcuFileSelect(file) {
        if (!this.validateFile(file)) {
            showNotification('Invalid file type. Please select a .bin, .hex, or .fw file', 'error');
            return;
        }

        this.mcuFile = file;

        // Update UI
        document.getElementById('mcuDropZone').style.display = 'none';
        document.getElementById('mcuSelectedFile').style.display = 'flex';
        document.getElementById('mcuFileName').textContent = file.name;
        document.getElementById('mcuFileSize').textContent = this.formatFileSize(file.size);
        document.getElementById('startMcuUpdate').disabled = false;

        this.addLogEntry(`MCU firmware file selected: ${file.name} (${this.formatFileSize(file.size)})`, 'info');
    }

    handleSbrFileSelect(file) {
        if (!this.validateFile(file)) {
            showNotification('Invalid file type. Please select a .bin, .hex, or .fw file', 'error');
            return;
        }

        this.sbrFile = file;

        // Update UI
        document.getElementById('sbrDropZone').style.display = 'none';
        document.getElementById('sbrSelectedFile').style.display = 'flex';
        document.getElementById('sbrFileName').textContent = file.name;
        document.getElementById('sbrFileSize').textContent = this.formatFileSize(file.size);
        document.getElementById('startSbrUpdate').disabled = false;

        this.addLogEntry(`SBR firmware file selected: ${file.name} (${this.formatFileSize(file.size)})`, 'info');
    }

    removeMcuFile() {
        this.mcuFile = null;
        document.getElementById('mcuDropZone').style.display = 'block';
        document.getElementById('mcuSelectedFile').style.display = 'none';
        document.getElementById('startMcuUpdate').disabled = true;
        document.getElementById('mcuFileInput').value = '';
    }

    removeSbrFile() {
        this.sbrFile = null;
        document.getElementById('sbrDropZone').style.display = 'block';
        document.getElementById('sbrSelectedFile').style.display = 'none';
        document.getElementById('startSbrUpdate').disabled = true;
        document.getElementById('sbrFileInput').value = '';
    }

    validateFile(file) {
        const validExtensions = ['.bin', '.hex', '.fw'];
        const fileName = file.name.toLowerCase();
        return validExtensions.some(ext => fileName.endsWith(ext));
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    async startMcuUpdate() {
        if (!this.mcuFile || !currentPort) {
            showNotification('Please select a file and ensure device is connected', 'error');
            return;
        }

        this.activeTransfer = 'mcu';

        // Update UI
        document.getElementById('startMcuUpdate').style.display = 'none';
        document.getElementById('cancelMcuUpdate').style.display = 'inline-flex';
        document.getElementById('mcuProgress').style.display = 'block';
        document.getElementById('mcuRemoveFile').disabled = true;
        document.getElementById('mcuStatusIndicator').textContent = 'Uploading...';
        document.getElementById('mcuStatusIndicator').className = 'status-indicator uploading';

        this.addLogEntry('Starting MCU firmware update...', 'command');
        this.addLogEntry(`Sending command: fdl mcu`, 'command');

        try {
            // Read file as base64
            const fileData = await this.readFileAsBase64(this.mcuFile);

            // Send update command via socket
            socket.emit('firmware_update', {
                port: currentPort,
                target: 'mcu',
                file_data: fileData
            });

        } catch (error) {
            this.addLogEntry(`Error reading file: ${error}`, 'error');
            this.resetMcuUI();
        }
    }

    async startSbrUpdate() {
        if (!this.sbrFile || !currentPort) {
            showNotification('Please select a file and ensure device is connected', 'error');
            return;
        }

        this.activeTransfer = 'sbr';

        // Update UI
        document.getElementById('startSbrUpdate').style.display = 'none';
        document.getElementById('cancelSbrUpdate').style.display = 'inline-flex';
        document.getElementById('sbrProgress').style.display = 'block';
        document.getElementById('sbrRemoveFile').disabled = true;
        document.getElementById('sbrStatusIndicator').textContent = 'Uploading...';
        document.getElementById('sbrStatusIndicator').className = 'status-indicator uploading';
        document.getElementById('sbr0Indicator').textContent = 'In Progress';
        document.getElementById('sbr0Indicator').className = 'in-progress';
        document.getElementById('sbr1Indicator').textContent = 'Waiting';

        this.addLogEntry('Starting SBR firmware update (both halves)...', 'command');
        this.addLogEntry(`Sending command: fdl sbr0`, 'command');

        try {
            // Read file as base64
            const fileData = await this.readFileAsBase64(this.sbrFile);

            // Send update command via socket
            socket.emit('firmware_update', {
                port: currentPort,
                target: 'sbr',
                file_data: fileData
            });

        } catch (error) {
            this.addLogEntry(`Error reading file: ${error}`, 'error');
            this.resetSbrUI();
        }
    }

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    handleProgressUpdate(data) {
        const percent = data.overall_percent || data.percent || 0;
        const bytesStr = `${this.formatFileSize(data.bytes_sent)} / ${this.formatFileSize(data.total_bytes)}`;

        if (data.target === 'mcu' || this.activeTransfer === 'mcu') {
            document.getElementById('mcuProgressBar').style.width = percent + '%';
            document.getElementById('mcuProgressPercent').textContent = Math.round(percent) + '%';
            document.getElementById('mcuBytesTransferred').textContent = bytesStr;

            // Estimate time remaining
            if (data.bytes_sent > 0 && data.time_elapsed) {
                const rate = data.bytes_sent / data.time_elapsed;
                const remaining = (data.total_bytes - data.bytes_sent) / rate;
                document.getElementById('mcuTimeRemaining').textContent = this.formatTime(remaining);
            }

        } else if (data.target === 'sbr' || this.activeTransfer === 'sbr') {
            document.getElementById('sbrProgressBar').style.width = percent + '%';
            document.getElementById('sbrProgressPercent').textContent = Math.round(percent) + '%';
            document.getElementById('sbrBytesTransferred').textContent = bytesStr;

            // Update phase indicator
            if (data.phase === 'sbr0') {
                document.getElementById('sbrProgressLabel').textContent = 'Uploading SBR0 Firmware';
                document.getElementById('sbr0Indicator').textContent = 'In Progress';
                document.getElementById('sbr0Indicator').className = 'in-progress';
            } else if (data.phase === 'sbr1') {
                document.getElementById('sbrProgressLabel').textContent = 'Uploading SBR1 Firmware';
                document.getElementById('sbr0Indicator').textContent = 'Complete';
                document.getElementById('sbr0Indicator').className = 'complete';
                document.getElementById('sbr1Indicator').textContent = 'In Progress';
                document.getElementById('sbr1Indicator').className = 'in-progress';
            }

            // Estimate time remaining
            if (data.bytes_sent > 0 && data.time_elapsed) {
                const rate = data.bytes_sent / data.time_elapsed;
                const remaining = (data.total_bytes - data.bytes_sent) / rate;
                document.getElementById('sbrTimeRemaining').textContent = this.formatTime(remaining);
            }
        }

        // Log progress milestones
        if (percent % 25 === 0 && percent > 0) {
            this.addLogEntry(`Transfer progress: ${Math.round(percent)}% complete`, 'info');
        }
    }

    handleUpdateResult(data) {
        if (data.success) {
            showNotification(`Firmware update successful: ${data.message}`, 'success');
            this.addLogEntry(`✅ ${data.message}`, 'success');

            if (data.details) {
                this.addLogEntry(`Transfer details: ${data.details.bytes_sent} bytes in ${data.details.time_taken?.toFixed(2)}s`, 'info');
            }

            // Update status cards
            if (data.target === 'mcu') {
                document.getElementById('mcuStatus').textContent = 'Updated';
                document.getElementById('mcuStatusIndicator').textContent = 'Complete';
                document.getElementById('mcuStatusIndicator').className = 'status-indicator complete';
            } else if (data.target === 'sbr' || data.sbr1) {
                document.getElementById('sbr0Status').textContent = 'Updated';
                document.getElementById('sbr1Status').textContent = 'Updated';
                document.getElementById('sbrStatusIndicator').textContent = 'Complete';
                document.getElementById('sbrStatusIndicator').className = 'status-indicator complete';
                document.getElementById('sbr0Indicator').textContent = 'Complete';
                document.getElementById('sbr0Indicator').className = 'complete';
                document.getElementById('sbr1Indicator').textContent = 'Complete';
                document.getElementById('sbr1Indicator').className = 'complete';
            }
        } else {
            showNotification(`Firmware update failed: ${data.message}`, 'error');
            this.addLogEntry(`❌ ${data.message}`, 'error');
        }

        // Reset UI
        setTimeout(() => {
            if (this.activeTransfer === 'mcu') {
                this.resetMcuUI();
            } else if (this.activeTransfer === 'sbr') {
                this.resetSbrUI();
            }
        }, 3000);

        this.activeTransfer = null;
    }

    handleCancelResult(data) {
        if (data.success) {
            showNotification('Firmware update cancelled', 'warning');
            this.addLogEntry('Update cancelled by user', 'warning');
        }

        if (this.activeTransfer === 'mcu') {
            this.resetMcuUI();
        } else if (this.activeTransfer === 'sbr') {
            this.resetSbrUI();
        }

        this.activeTransfer = null;
    }

    cancelUpdate(target) {
        if (!currentPort) return;

        socket.emit('cancel_firmware_update', {
            port: currentPort,
            target: target
        });

        this.addLogEntry(`Cancelling ${target.toUpperCase()} update...`, 'warning');
    }

    resetMcuUI() {
        document.getElementById('startMcuUpdate').style.display = 'inline-flex';
        document.getElementById('cancelMcuUpdate').style.display = 'none';
        document.getElementById('mcuProgress').style.display = 'none';
        document.getElementById('mcuRemoveFile').disabled = false;
        document.getElementById('mcuProgressBar').style.width = '0%';
        document.getElementById('mcuStatusIndicator').textContent = 'Ready';
        document.getElementById('mcuStatusIndicator').className = 'status-indicator';
    }

    resetSbrUI() {
        document.getElementById('startSbrUpdate').style.display = 'inline-flex';
        document.getElementById('cancelSbrUpdate').style.display = 'none';
        document.getElementById('sbrProgress').style.display = 'none';
        document.getElementById('sbrRemoveFile').disabled = false;
        document.getElementById('sbrProgressBar').style.width = '0%';
        document.getElementById('sbrStatusIndicator').textContent = 'Ready';
        document.getElementById('sbrStatusIndicator').className = 'status-indicator';
        document.getElementById('sbr0Indicator').textContent = 'Pending';
        document.getElementById('sbr0Indicator').className = '';
        document.getElementById('sbr1Indicator').textContent = 'Pending';
        document.getElementById('sbr1Indicator').className = '';
    }

    checkFirmwareVersion() {
        if (!currentPort) {
            showNotification('Please connect to a device first', 'error');
            return;
        }

        this.addLogEntry('Checking firmware version...', 'command');

        // Send version check command
        socket.emit('execute_command', {
            port: currentPort,
            command: 'version',
            dashboard: 'firmware'
        });
    }

    clearLog() {
        const console = document.getElementById('firmwareConsole');
        console.innerHTML = '<div class="console-entry system"><div class="console-timestamp">System Ready</div><div class="console-content">Firmware update log cleared.</div></div>';
    }

    addLogEntry(message, type = 'info') {
        const console = document.getElementById('firmwareConsole');
        const entry = document.createElement('div');
        entry.className = `console-entry ${type}`;

        const timestamp = document.createElement('div');
        timestamp.className = 'console-timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();

        const content = document.createElement('div');
        content.className = 'console-content';
        content.textContent = message;

        entry.appendChild(timestamp);
        entry.appendChild(content);
        console.appendChild(entry);

        // Auto-scroll if enabled
        if (document.getElementById('autoScrollLog')?.checked) {
            console.scrollTop = console.scrollHeight;
        }
    }

    formatTime(seconds) {
        if (seconds < 60) return Math.round(seconds) + 's';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${minutes}m ${secs}s`;
    }
}

// Initialize firmware manager when document is ready
let firmwareManager = null;

// Add to your existing initialization
document.addEventListener('DOMContentLoaded', () => {
    // Initialize firmware manager after a delay to ensure DOM is ready
    setTimeout(() => {
        if (document.getElementById('firmware-dashboard')) {
            firmwareManager = new FirmwareUpdateManager();
            console.log('Firmware Update Manager initialized');
        }
    }, 1000);
});

// Export for global access if needed
window.FirmwareUpdateManager = FirmwareUpdateManager;