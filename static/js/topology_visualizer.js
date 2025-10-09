/**
 * CalypsoPy+ Topology Visualizer
 * File: static/js/topology_visualizer.js
 *
 * Visual diagram generator for PCIe topology from Atlas 3 to NVMe devices
 */

class TopologyVisualizer {
    constructor() {
        this.container = null;
        this.topology = null;
        this.svg = null;
        this.width = 1200;
        this.height = 800;
        this.nodeWidth = 180;
        this.nodeHeight = 100;
        this.verticalSpacing = 150;
        this.horizontalSpacing = 200;
    }

    /**
     * Generate visual topology diagram
     * @param {Object} topology - PCIe topology data from test results
     * @param {string} containerId - DOM element ID to render into
     */
    generate(topology, containerId = 'topologyVisualization') {
        this.topology = topology;
        this.container = document.getElementById(containerId);

        if (!this.container) {
            console.error('Topology container not found:', containerId);
            return;
        }

        // Clear existing content
        this.container.innerHTML = '';

        // Create SVG canvas
        this.createSVGCanvas();

        // Build topology tree
        this.buildTopologyTree();
    }

    createSVGCanvas() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', this.height);
        svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
        svg.style.background = '#f9fafb';
        svg.style.borderRadius = '12px';
        svg.style.border = '2px solid #e5e7eb';

        this.svg = svg;
        this.container.appendChild(svg);

        // Add defs for gradients and filters
        this.createSVGDefs();
    }

    createSVGDefs() {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

        // Gradient for root bridge
        const rootGradient = this.createGradient('rootGradient', '#dc2626', '#991b1b');
        defs.appendChild(rootGradient);

        // Gradient for downstream ports
        const portGradient = this.createGradient('portGradient', '#3b82f6', '#1d4ed8');
        defs.appendChild(portGradient);

        // Gradient for NVMe devices
        const nvmeGradient = this.createGradient('nvmeGradient', '#10b981', '#059669');
        defs.appendChild(nvmeGradient);

        // Shadow filter
        const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        shadow.setAttribute('id', 'shadow');
        shadow.innerHTML = `
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
        `;
        defs.appendChild(shadow);

        this.svg.appendChild(defs);
    }

    createGradient(id, color1, color2) {
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradient.setAttribute('id', id);
        gradient.setAttribute('x1', '0%');
        gradient.setAttribute('y1', '0%');
        gradient.setAttribute('x2', '0%');
        gradient.setAttribute('y2', '100%');

        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('style', `stop-color:${color1};stop-opacity:1`);

        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('style', `stop-color:${color2};stop-opacity:1`);

        gradient.appendChild(stop1);
        gradient.appendChild(stop2);

        return gradient;
    }

    buildTopologyTree() {
        const elements = [];

        // Level 1: Root Bridge
        if (this.topology.root_bridge) {
            const rootX = this.width / 2;
            const rootY = 80;

            elements.push({
                type: 'root',
                x: rootX,
                y: rootY,
                data: this.topology.root_bridge
            });

            // Level 2: Downstream Ports
            const downstreamPorts = this.topology.downstream_ports || [];
            const activePorts = downstreamPorts.filter(p => p.link_speed);

            if (activePorts.length > 0) {
                const portY = rootY + this.verticalSpacing;
                const totalPortWidth = (activePorts.length - 1) * this.horizontalSpacing;
                const startX = rootX - (totalPortWidth / 2);

                activePorts.forEach((port, index) => {
                    const portX = startX + (index * this.horizontalSpacing);

                    // Draw connection from root to port
                    this.drawConnection(rootX, rootY + this.nodeHeight, portX, portY);

                    elements.push({
                        type: 'port',
                        x: portX,
                        y: portY,
                        data: port,
                        index: index
                    });

                    // Level 3: NVMe Devices connected to this port
                    const connectedNVMe = this.findConnectedNVMe(port);

                    if (connectedNVMe.length > 0) {
                        const nvmeY = portY + this.verticalSpacing;

                        connectedNVMe.forEach((nvme, nvmeIndex) => {
                            const nvmeX = portX + ((nvmeIndex - (connectedNVMe.length - 1) / 2) * 100);

                            // Draw connection from port to NVMe
                            this.drawConnection(portX, portY + this.nodeHeight, nvmeX, nvmeY);

                            elements.push({
                                type: 'nvme',
                                x: nvmeX,
                                y: nvmeY,
                                data: nvme
                            });
                        });
                    }
                });
            }
        }

        // Draw all elements
        elements.forEach(element => {
            switch (element.type) {
                case 'root':
                    this.drawRootBridge(element.x, element.y, element.data);
                    break;
                case 'port':
                    this.drawDownstreamPort(element.x, element.y, element.data, element.index);
                    break;
                case 'nvme':
                    this.drawNVMeDevice(element.x, element.y, element.data);
                    break;
            }
        });
    }

    findConnectedNVMe(port) {
        if (!this.topology.nvme_devices) return [];

        // Match NVMe devices by checking if their PCI address is on the port's subordinate bus
        const portBus = port.subordinate_bus;
        if (!portBus) return [];

        return this.topology.nvme_devices.filter(nvme => {
            if (!nvme.bdf) return false;
            const nvmeBus = parseInt(nvme.bdf.split(':')[0], 16);
            return nvmeBus === portBus;
        });
    }

    drawConnection(x1, y1, x2, y2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        // Create curved path
        const midY = (y1 + y2) / 2;
        const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

        line.setAttribute('d', path);
        line.setAttribute('stroke', '#9ca3af');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke-linecap', 'round');

        this.svg.appendChild(line);
    }

    drawRootBridge(x, y, data) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${x - this.nodeWidth/2}, ${y})`);

        // Background card
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', this.nodeWidth);
        rect.setAttribute('height', this.nodeHeight);
        rect.setAttribute('rx', '12');
        rect.setAttribute('fill', 'url(#rootGradient)');
        rect.setAttribute('filter', 'url(#shadow)');
        group.appendChild(rect);

        // Icon
        const icon = this.createText('🔀', this.nodeWidth / 2, 25, 32, 'middle', '#ffffff');
        group.appendChild(icon);

        // Title
        const title = this.createText('Atlas 3 Root Bridge', this.nodeWidth / 2, 48, 13, 'middle', '#ffffff', 700);
        group.appendChild(title);

        // BDF Address
        const bdf = this.createText(data.bdf || 'Unknown', this.nodeWidth / 2, 64, 11, 'middle', '#fecaca');
        group.appendChild(bdf);

        // Link Speed
        const speed = this.createText(
            `${data.link_speed || 'N/A'} ${data.link_width || ''}`,
            this.nodeWidth / 2,
            78,
            11,
            'middle',
            '#fef3c7',
            600
        );
        group.appendChild(speed);

        // Driver
        if (data.driver) {
            const driver = this.createText(`Driver: ${data.driver}`, this.nodeWidth / 2, 92, 9, 'middle', '#fecaca');
            group.appendChild(driver);
        }

        this.svg.appendChild(group);
    }

    drawDownstreamPort(x, y, data, index) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${x - this.nodeWidth/2}, ${y})`);

        // Background card
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', this.nodeWidth);
        rect.setAttribute('height', this.nodeHeight);
        rect.setAttribute('rx', '10');
        rect.setAttribute('fill', 'url(#portGradient)');
        rect.setAttribute('filter', 'url(#shadow)');
        group.appendChild(rect);

        // Icon
        const icon = this.createText('🔌', this.nodeWidth / 2, 25, 28, 'middle', '#ffffff');
        group.appendChild(icon);

        // Title
        const title = this.createText(`Downstream Port ${index + 1}`, this.nodeWidth / 2, 46, 12, 'middle', '#ffffff', 700);
        group.appendChild(title);

        // BDF Address
        const bdf = this.createText(data.bdf || 'Unknown', this.nodeWidth / 2, 60, 11, 'middle', '#dbeafe');
        group.appendChild(bdf);

        // Link Speed
        if (data.link_speed) {
            const speed = this.createText(
                `${data.link_speed} ${data.link_width || ''}`,
                this.nodeWidth / 2,
                74,
                11,
                'middle',
                '#fef3c7',
                600
            );
            group.appendChild(speed);
        } else {
            const noLink = this.createText('No Link', this.nodeWidth / 2, 74, 11, 'middle', '#fca5a5');
            group.appendChild(noLink);
        }

        // Subordinate Bus
        if (data.subordinate_bus !== undefined) {
            const bus = this.createText(
                `Bus: 0x${data.subordinate_bus.toString(16).padStart(2, '0')}`,
                this.nodeWidth / 2,
                88,
                9,
                'middle',
                '#dbeafe'
            );
            group.appendChild(bus);
        }

        this.svg.appendChild(group);
    }

    drawNVMeDevice(x, y, data) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('transform', `translate(${x - this.nodeWidth/2}, ${y})`);

        // Background card
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', this.nodeWidth);
        rect.setAttribute('height', this.nodeHeight + 20); // Taller for more info
        rect.setAttribute('rx', '10');
        rect.setAttribute('fill', 'url(#nvmeGradient)');
        rect.setAttribute('filter', 'url(#shadow)');
        group.appendChild(rect);

        // Icon
        const icon = this.createText('💾', this.nodeWidth / 2, 25, 28, 'middle', '#ffffff');
        group.appendChild(icon);

        // Device Name (from name field or construct from model)
        const deviceName = data.name || data.model || 'NVMe Device';
        const shortName = deviceName.length > 20 ? deviceName.substring(0, 17) + '...' : deviceName;
        const title = this.createText(shortName, this.nodeWidth / 2, 46, 12, 'middle', '#ffffff', 700);
        group.appendChild(title);

        // BDF/PCI Address
        const bdf = this.createText(data.bdf || 'Unknown', this.nodeWidth / 2, 60, 11, 'middle', '#d1fae5');
        group.appendChild(bdf);

        // Device Path (e.g., /dev/nvme0n1)
        if (data.device_path) {
            const devPath = this.createText(data.device_path, this.nodeWidth / 2, 74, 10, 'middle', '#fef3c7', 600);
            group.appendChild(devPath);
        }

        // Link Speed/Width
        if (data.link_speed) {
            const speed = this.createText(
                `${data.link_speed} ${data.link_width || ''}`,
                this.nodeWidth / 2,
                88,
                11,
                'middle',
                '#fef3c7',
                600
            );
            group.appendChild(speed);
        }

        // Driver
        if (data.driver) {
            const driver = this.createText(`Driver: ${data.driver}`, this.nodeWidth / 2, 102, 9, 'middle', '#d1fae5');
            group.appendChild(driver);
        }

        // Capacity (if available from extended data)
        if (data.capacity_gb) {
            const capacity = this.createText(
                `${data.capacity_gb.toFixed(1)} GB`,
                this.nodeWidth / 2,
                116,
                9,
                'middle',
                '#ffffff',
                600
            );
            group.appendChild(capacity);
        }

        this.svg.appendChild(group);
    }

    createText(content, x, y, fontSize, anchor, fill, fontWeight = 400) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('font-size', fontSize);
        text.setAttribute('font-family', 'Inter, -apple-system, sans-serif');
        text.setAttribute('font-weight', fontWeight);
        text.setAttribute('text-anchor', anchor);
        text.setAttribute('fill', fill);
        text.textContent = content;
        return text;
    }

    /**
     * Export topology as PNG image
     */
    exportAsPNG() {
        if (!this.svg) {
            console.error('No SVG to export');
            return;
        }

        const svgData = new XMLSerializer().serializeToString(this.svg);
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;

        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function() {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `CalypsoPy_Topology_${new Date().toISOString().slice(0,10)}.png`;
                link.click();
                URL.revokeObjectURL(url);
            });
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }

    /**
     * Export topology as SVG file
     */
    exportAsSVG() {
        if (!this.svg) {
            console.error('No SVG to export');
            return;
        }

        const svgData = new XMLSerializer().serializeToString(this.svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CalypsoPy_Topology_${new Date().toISOString().slice(0,10)}.svg`;
        link.click();
        URL.revokeObjectURL(url);
    }
}

// Global instance
let topologyVisualizer = null;

// Initialize visualizer
function initializeTopologyVisualizer() {
    if (!topologyVisualizer) {
        topologyVisualizer = new TopologyVisualizer();
        console.log('Topology Visualizer initialized');
    }
    return topologyVisualizer;
}

// Export to global scope
if (typeof window !== 'undefined') {
    window.TopologyVisualizer = TopologyVisualizer;
    window.topologyVisualizer = topologyVisualizer;
    window.initializeTopologyVisualizer = initializeTopologyVisualizer;
}

console.log('✅ Topology Visualizer loaded successfully');