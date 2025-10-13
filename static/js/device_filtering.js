/**
 * Device Filtering Utility Module for CalypsoPy+
 * Provides reusable functions for Atlas 3 downstream device filtering
 * Ensures only endpoint devices downstream of Atlas 3 switch are tested
 */

const DeviceFiltering = (function() {
    'use strict';

    /**
     * Filter PCIe devices to only include Atlas 3 downstream endpoints
     * Excludes bridges, switches, and the Atlas 3 itself for system stability
     * 
     * @param {Array} devices - Array of PCIe device objects
     * @returns {Object} - Contains filtered and excluded devices
     */
    function filterAtlas3DownstreamEndpoints(devices) {
        if (!devices || !Array.isArray(devices)) {
            return {
                filtered: [],
                excluded: [],
                atlas3Found: false
            };
        }

        const result = {
            filtered: [],
            excluded: [],
            atlas3Found: false
        };

        // First, identify the Atlas 3 device
        const atlas3Device = devices.find(device => 
            device.vendor_id === '10ee' || 
            device.device_name?.toLowerCase().includes('atlas') ||
            device.description?.toLowerCase().includes('atlas')
        );

        if (atlas3Device) {
            result.atlas3Found = true;
            result.excluded.push({
                device: atlas3Device,
                reason: 'Atlas 3 switch - excluded for stability'
            });
        }

        // Filter devices
        devices.forEach(device => {
            // Skip if this is the Atlas 3 itself
            if (device === atlas3Device) {
                return;
            }

            // Check if device is a bridge or switch
            const isBridge = device.class_code?.startsWith('0604') || 
                            device.device_type?.toLowerCase().includes('bridge');
            const isSwitch = device.device_type?.toLowerCase().includes('switch') ||
                            device.description?.toLowerCase().includes('switch');

            // Check if device is downstream of Atlas 3
            const isDownstream = atlas3Device ? 
                isDeviceDownstreamOf(device, atlas3Device, devices) : false;

            if (isBridge || isSwitch) {
                result.excluded.push({
                    device: device,
                    reason: isBridge ? 'PCIe bridge - excluded for stability' : 'PCIe switch - excluded for stability'
                });
            } else if (!atlas3Device || isDownstream) {
                // Include only endpoint devices that are downstream of Atlas 3
                result.filtered.push(device);
            } else {
                result.excluded.push({
                    device: device,
                    reason: 'Not downstream of Atlas 3'
                });
            }
        });

        return result;
    }

    /**
     * Check if a device is downstream of another device in the PCIe topology
     * 
     * @param {Object} device - Device to check
     * @param {Object} parentDevice - Potential parent device
     * @param {Array} allDevices - All devices for topology analysis
     * @returns {Boolean} - True if device is downstream of parentDevice
     */
    function isDeviceDownstreamOf(device, parentDevice, allDevices) {
        if (!device || !parentDevice) return false;

        // Simple BDF (Bus:Device.Function) comparison
        // Downstream devices will have higher bus numbers than the parent
        const deviceBus = parseInt(device.bus_id?.split(':')[0] || '0', 16);
        const parentBus = parseInt(parentDevice.bus_id?.split(':')[0] || '0', 16);

        // If device has a parent_bridge field, check it
        if (device.parent_bridge === parentDevice.bus_id) {
            return true;
        }

        // Basic heuristic: downstream devices typically have higher bus numbers
        // This is a simplified check - real topology would require walking the tree
        return deviceBus > parentBus;
    }

    /**
     * Update device selection dropdown with filtered devices
     * 
     * @param {String} selectId - ID of the select element
     * @param {Array} devices - Filtered device array
     * @param {String} defaultText - Default option text
     */
    function updateDeviceSelect(selectId, devices, defaultText = 'All Atlas 3 Downstream Endpoints') {
        const select = document.getElementById(selectId);
        if (!select) return;

        // Clear existing options
        select.innerHTML = '';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = defaultText;
        select.appendChild(defaultOption);

        // Add filtered devices
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.bus_id || device.device_id || '';
            
            // Create descriptive text for the option
            const deviceName = device.device_name || device.model || 'Unknown Device';
            const busId = device.bus_id || '';
            option.textContent = `${deviceName} (${busId})`;
            
            select.appendChild(option);
        });
    }

    /**
     * Display excluded devices in the UI
     * 
     * @param {String} containerId - ID of the container element
     * @param {Array} excluded - Array of excluded device objects with reasons
     */
    function displayExcludedDevices(containerId, excluded) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Clear existing content
        container.innerHTML = '';

        if (!excluded || excluded.length === 0) {
            container.innerHTML = '<p>No devices excluded</p>';
            return;
        }

        // Create list of excluded devices
        const list = document.createElement('ul');
        list.style.cssText = 'list-style: none; padding: 0; margin: 0;';

        excluded.forEach(item => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 8px; margin-bottom: 5px; background: #f8f9fa; border-radius: 4px;';
            
            const deviceInfo = document.createElement('div');
            deviceInfo.style.cssText = 'font-weight: 500; color: #495057;';
            
            const deviceName = item.device.device_name || item.device.model || 'Unknown Device';
            const busId = item.device.bus_id || '';
            deviceInfo.textContent = `${deviceName} (${busId})`;
            
            const reasonInfo = document.createElement('div');
            reasonInfo.style.cssText = 'font-size: 12px; color: #6c757d; margin-top: 2px;';
            reasonInfo.textContent = `Reason: ${item.reason}`;
            
            li.appendChild(deviceInfo);
            li.appendChild(reasonInfo);
            list.appendChild(li);
        });

        container.appendChild(list);
    }

    /**
     * Initialize device filtering for a test
     * Sets up the UI and returns filtered devices
     * 
     * @param {Object} config - Configuration object
     * @param {String} config.selectId - Device select element ID
     * @param {String} config.checkboxId - Filter checkbox element ID
     * @param {String} config.excludedContainerId - Excluded devices container ID
     * @param {Array} config.devices - Array of all devices
     * @param {Function} config.onDeviceChange - Callback when device selection changes
     * @returns {Object} - Filtering results
     */
    function initializeTestFiltering(config) {
        const {
            selectId,
            checkboxId,
            excludedContainerId,
            devices,
            onDeviceChange
        } = config;

        // Apply filtering
        const filterResult = filterAtlas3DownstreamEndpoints(devices);

        // Update UI
        updateDeviceSelect(selectId, filterResult.filtered);
        
        // Ensure checkbox is checked and disabled
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.checked = true;
            checkbox.disabled = true;
        }

        // Display excluded devices if container exists
        if (excludedContainerId) {
            displayExcludedDevices(excludedContainerId, filterResult.excluded);
        }

        // Set up change handler if provided
        if (onDeviceChange) {
            const select = document.getElementById(selectId);
            if (select) {
                select.addEventListener('change', function() {
                    onDeviceChange(this.value, filterResult.filtered);
                });
            }
        }

        return filterResult;
    }

    /**
     * Get filter status message for UI display
     * 
     * @param {Object} filterResult - Result from filterAtlas3DownstreamEndpoints
     * @returns {String} - Status message
     */
    function getFilterStatusMessage(filterResult) {
        if (!filterResult.atlas3Found) {
            return 'Atlas 3 switch not detected - filtering by device type only';
        }

        const filteredCount = filterResult.filtered.length;
        const excludedCount = filterResult.excluded.length;

        return `Filtering active: ${filteredCount} endpoint${filteredCount !== 1 ? 's' : ''} available, ` +
               `${excludedCount} device${excludedCount !== 1 ? 's' : ''} excluded`;
    }

    // Public API
    return {
        filterAtlas3DownstreamEndpoints,
        isDeviceDownstreamOf,
        updateDeviceSelect,
        displayExcludedDevices,
        initializeTestFiltering,
        getFilterStatusMessage
    };
})();

// Export for use in other modules if using module system
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceFiltering;
}