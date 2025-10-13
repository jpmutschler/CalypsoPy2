/**
 * Test Results Pop-out Window Manager for CalypsoPy+
 * Handles displaying test results in separate windows with export capabilities
 * Supports Print to PDF and Export to HTML/CSV formats
 */

const ResultsWindow = (function() {
    'use strict';

    let openWindows = new Map();

    /**
     * Open a new results window with test data
     * @param {string} testName - Name of the test
     * @param {Object} testResults - Test results data
     * @param {string} testId - Unique test identifier
     */
    function openResultsWindow(testName, testResults, testId) {
        const windowName = `results_${testId}_${Date.now()}`;
        
        // Close existing window if open
        if (openWindows.has(testId)) {
            const existingWindow = openWindows.get(testId);
            if (existingWindow && !existingWindow.closed) {
                existingWindow.close();
            }
        }

        // Calculate window dimensions
        const width = Math.min(1200, screen.width * 0.8);
        const height = Math.min(900, screen.height * 0.8);
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;

        // Open new window
        const resultsWindow = window.open(
            '',
            windowName,
            `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );

        if (!resultsWindow) {
            alert('Pop-up blocked! Please allow pop-ups for this site to view test results.');
            return null;
        }

        // Store window reference
        openWindows.set(testId, resultsWindow);

        // Generate window content
        const windowContent = generateWindowContent(testName, testResults, testId);
        
        // Write content to window
        resultsWindow.document.write(windowContent);
        resultsWindow.document.close();

        // Add window event listeners
        setupWindowEventListeners(resultsWindow, testId);

        return resultsWindow;
    }

    /**
     * Generate HTML content for results window
     * @param {string} testName - Name of the test
     * @param {Object} testResults - Test results data  
     * @param {string} testId - Test identifier
     * @returns {string} HTML content
     */
    function generateWindowContent(testName, testResults, testId) {
        const timestamp = new Date().toLocaleString();
        const duration = testResults.duration_ms ? `${testResults.duration_ms}ms` : 'N/A';
        const status = testResults.status || 'unknown';
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${testName} - Test Results</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        
        .results-container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .results-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .results-title {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .results-subtitle {
            font-size: 16px;
            opacity: 0.9;
            margin-bottom: 20px;
        }
        
        .results-meta {
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
        }
        
        .meta-item {
            text-align: center;
        }
        
        .meta-label {
            font-size: 12px;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .meta-value {
            font-size: 18px;
            font-weight: 600;
            margin-top: 5px;
        }
        
        .status-pass { color: #4CAF50; }
        .status-warning { color: #FF9800; }
        .status-fail { color: #F44336; }
        .status-error { color: #E91E63; }
        
        .toolbar {
            background: #fafafa;
            padding: 15px 30px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .toolbar-section {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        
        .btn-primary {
            background: #2196F3;
            color: white;
        }
        
        .btn-primary:hover {
            background: #1976D2;
        }
        
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #5a6268;
        }
        
        .btn-success {
            background: #28a745;
            color: white;
        }
        
        .btn-success:hover {
            background: #218838;
        }
        
        .results-content {
            padding: 30px;
        }
        
        .section {
            margin-bottom: 30px;
        }
        
        .section-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e0e0e0;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .summary-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            text-align: center;
            border-left: 4px solid #2196F3;
        }
        
        .summary-number {
            font-size: 32px;
            font-weight: 700;
            color: #2196F3;
        }
        
        .summary-label {
            font-size: 14px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 5px;
        }
        
        .results-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        
        .results-table th,
        .results-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .results-table th {
            background: #f8f9fa;
            font-weight: 600;
            color: #333;
        }
        
        .results-table tr:hover {
            background: #f8f9fa;
        }
        
        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .badge-pass {
            background: #d4edda;
            color: #155724;
        }
        
        .badge-warning {
            background: #fff3cd;
            color: #856404;
        }
        
        .badge-fail {
            background: #f8d7da;
            color: #721c24;
        }
        
        .expandable-section {
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            margin-bottom: 15px;
        }
        
        .expandable-header {
            background: #f8f9fa;
            padding: 15px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .expandable-header:hover {
            background: #e9ecef;
        }
        
        .expandable-content {
            padding: 15px;
            display: none;
        }
        
        .expandable-content.expanded {
            display: block;
        }
        
        .spec-compliance {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin: 15px 0;
        }
        
        .compliance-item {
            padding: 10px;
            border-radius: 4px;
            border-left: 3px solid #ddd;
            background: #f9f9f9;
        }
        
        .compliance-pass {
            border-left-color: #4CAF50;
            background: #f1f8e9;
        }
        
        .compliance-warning {
            border-left-color: #FF9800;
            background: #fff8e1;
        }
        
        .compliance-fail {
            border-left-color: #F44336;
            background: #ffebee;
        }
        
        .warning-list, .error-list {
            list-style: none;
        }
        
        .warning-list li, .error-list li {
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        
        .warning-list li:before {
            content: "⚠️ ";
            margin-right: 8px;
        }
        
        .error-list li:before {
            content: "❌ ";
            margin-right: 8px;
        }
        
        @media print {
            body {
                background: white;
                padding: 0;
            }
            
            .toolbar {
                display: none;
            }
            
            .results-container {
                box-shadow: none;
                border-radius: 0;
            }
            
            .results-header {
                background: #333 !important;
                -webkit-print-color-adjust: exact;
            }
        }
        
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .results-header {
                padding: 20px;
            }
            
            .results-title {
                font-size: 24px;
            }
            
            .toolbar {
                flex-direction: column;
                align-items: stretch;
            }
            
            .toolbar-section {
                justify-content: center;
            }
            
            .results-content {
                padding: 20px;
            }
            
            .summary-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="results-container">
        <div class="results-header">
            <div class="results-title">${testName}</div>
            <div class="results-subtitle">CalypsoPy+ Test Results - ${timestamp}</div>
            <div class="results-meta">
                <div class="meta-item">
                    <div class="meta-label">Status</div>
                    <div class="meta-value status-${status}">${status.toUpperCase()}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Duration</div>
                    <div class="meta-value">${duration}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Timestamp</div>
                    <div class="meta-value">${timestamp}</div>
                </div>
            </div>
        </div>
        
        <div class="toolbar">
            <div class="toolbar-section">
                <button class="btn btn-primary" onclick="printResults()">
                    🖨️ Print to PDF
                </button>
                <button class="btn btn-secondary" onclick="exportToHTML()">
                    📄 Export HTML
                </button>
                <button class="btn btn-success" onclick="exportToCSV()">
                    📊 Export CSV
                </button>
            </div>
            <div class="toolbar-section">
                <button class="btn btn-secondary" onclick="window.close()">
                    ✖️ Close Window
                </button>
            </div>
        </div>
        
        <div class="results-content">
            ${generateResultsContent(testResults)}
        </div>
    </div>

    <script>
        // Test results data for export functions
        window.testResults = ${JSON.stringify(testResults, null, 2)};
        window.testName = "${testName}";
        
        function printResults() {
            window.print();
        }
        
        function exportToHTML() {
            const htmlContent = document.documentElement.outerHTML;
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`\${window.testName.replace(/[^a-zA-Z0-9]/g, '_')}_results_\${new Date().toISOString().split('T')[0]}.html\`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        function exportToCSV() {
            const csvContent = generateCSVContent(window.testResults, window.testName);
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`\${window.testName.replace(/[^a-zA-Z0-9]/g, '_')}_results_\${new Date().toISOString().split('T')[0]}.csv\`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        function generateCSVContent(testResults, testName) {
            const csv = [];
            
            // Header
            csv.push('Test Name,Status,Timestamp,Duration (ms)');
            csv.push(\`"\${testName}","\${testResults.status}","\${testResults.timestamp}","\${testResults.duration_ms || 'N/A'}"\`);
            csv.push(''); // Empty line
            
            // Summary section
            if (testResults.summary) {
                csv.push('Summary');
                Object.entries(testResults.summary).forEach(([key, value]) => {
                    if (typeof value === 'object') {
                        csv.push(\`\${key}:\`);
                        Object.entries(value).forEach(([subKey, subValue]) => {
                            csv.push(\`  \${subKey},\${subValue}\`);
                        });
                    } else {
                        csv.push(\`\${key},\${value}\`);
                    }
                });
                csv.push(''); // Empty line
            }
            
            // Results sections
            const resultSections = [
                'namespace_results', 'controller_results', 'field_validations',
                'admin_commands', 'io_commands'
            ];
            
            resultSections.forEach(section => {
                if (testResults[section] && Array.isArray(testResults[section])) {
                    csv.push(\`\${section.replace('_', ' ').toUpperCase()}\`);
                    
                    if (testResults[section].length > 0) {
                        const firstItem = testResults[section][0];
                        const headers = Object.keys(firstItem).filter(key => 
                            typeof firstItem[key] !== 'object' || Array.isArray(firstItem[key])
                        );
                        csv.push(headers.join(','));
                        
                        testResults[section].forEach(item => {
                            const row = headers.map(header => {
                                let value = item[header];
                                if (Array.isArray(value)) {
                                    value = value.join('; ');
                                }
                                return \`"\${String(value || '').replace(/"/g, '""')}"\`;
                            });
                            csv.push(row.join(','));
                        });
                    }
                    csv.push(''); // Empty line
                }
            });
            
            // Warnings and errors
            if (testResults.warnings && testResults.warnings.length > 0) {
                csv.push('WARNINGS');
                testResults.warnings.forEach(warning => {
                    csv.push(\`"\${warning.replace(/"/g, '""')}"\`);
                });
                csv.push('');
            }
            
            if (testResults.errors && testResults.errors.length > 0) {
                csv.push('ERRORS');
                testResults.errors.forEach(error => {
                    csv.push(\`"\${error.replace(/"/g, '""')}"\`);
                });
                csv.push('');
            }
            
            return csv.join('\\n');
        }
        
        function toggleExpandable(element) {
            const content = element.nextElementSibling;
            const isExpanded = content.classList.contains('expanded');
            
            if (isExpanded) {
                content.classList.remove('expanded');
                element.querySelector('.expand-indicator').textContent = '▶';
            } else {
                content.classList.add('expanded');
                element.querySelector('.expand-indicator').textContent = '▼';
            }
        }
        
        // Initialize expandable sections
        document.addEventListener('DOMContentLoaded', function() {
            const expandableHeaders = document.querySelectorAll('.expandable-header');
            expandableHeaders.forEach(header => {
                header.addEventListener('click', function() {
                    toggleExpandable(this);
                });
            });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generate the main results content based on test type
     * @param {Object} testResults - Test results data
     * @returns {string} HTML content
     */
    function generateResultsContent(testResults) {
        let content = '';

        // Summary section
        if (testResults.summary) {
            content += generateSummarySection(testResults.summary);
        }

        // Spec compliance section
        if (testResults.spec_version || testResults.pcie_compliance) {
            content += generateSpecComplianceSection(testResults);
        }

        // Test-specific results sections
        if (testResults.namespace_results) {
            content += generateNamespaceResultsSection(testResults.namespace_results);
        }

        if (testResults.controller_results) {
            content += generateControllerResultsSection(testResults.controller_results);
        }

        if (testResults.admin_commands || testResults.io_commands) {
            content += generateCommandResultsSection(testResults);
        }

        // Warnings and errors
        if (testResults.warnings && testResults.warnings.length > 0) {
            content += generateWarningsSection(testResults.warnings);
        }

        if (testResults.errors && testResults.errors.length > 0) {
            content += generateErrorsSection(testResults.errors);
        }

        // Raw data section (expandable)
        content += generateRawDataSection(testResults);

        return content;
    }

    /**
     * Generate summary section
     */
    function generateSummarySection(summary) {
        let content = '<div class="section"><div class="section-title">Test Summary</div>';
        content += '<div class="summary-grid">';

        Object.entries(summary).forEach(([key, value]) => {
            if (typeof value === 'object') {
                // Nested summary (e.g., controllers, namespaces)
                Object.entries(value).forEach(([subKey, subValue]) => {
                    content += `
                        <div class="summary-card">
                            <div class="summary-number">${subValue}</div>
                            <div class="summary-label">${key} ${subKey}</div>
                        </div>
                    `;
                });
            } else {
                content += `
                    <div class="summary-card">
                        <div class="summary-number">${value}</div>
                        <div class="summary-label">${key.replace('_', ' ')}</div>
                    </div>
                `;
            }
        });

        content += '</div></div>';
        return content;
    }

    /**
     * Generate spec compliance section
     */
    function generateSpecComplianceSection(testResults) {
        let content = '<div class="section"><div class="section-title">Specification Compliance</div>';
        
        content += '<div class="spec-compliance">';
        
        if (testResults.spec_version) {
            content += `
                <div class="compliance-item compliance-pass">
                    <strong>NVMe Specification:</strong><br>
                    ${testResults.spec_version}
                </div>
            `;
        }
        
        if (testResults.pcie_compliance) {
            content += `
                <div class="compliance-item compliance-pass">
                    <strong>PCIe Compliance:</strong><br>
                    ${testResults.pcie_compliance}
                </div>
            `;
        }
        
        if (testResults.safety_mode) {
            content += `
                <div class="compliance-item compliance-pass">
                    <strong>Safety Mode:</strong><br>
                    ${testResults.safety_mode}
                </div>
            `;
        }
        
        content += '</div></div>';
        return content;
    }

    /**
     * Generate namespace results section
     */
    function generateNamespaceResultsSection(namespaceResults) {
        let content = '<div class="section"><div class="section-title">Namespace Results</div>';
        
        if (namespaceResults.length === 0) {
            content += '<p>No namespace results available.</p>';
        } else {
            content += '<table class="results-table"><thead><tr>';
            content += '<th>Device</th><th>Status</th><th>Issues</th><th>Warnings</th><th>Compliance</th>';
            content += '</tr></thead><tbody>';
            
            namespaceResults.forEach(ns => {
                const badgeClass = ns.status === 'pass' ? 'badge-pass' : 
                                 ns.status === 'warning' ? 'badge-warning' : 'badge-fail';
                
                content += `
                    <tr>
                        <td>${ns.device_path || 'N/A'}</td>
                        <td><span class="status-badge ${badgeClass}">${ns.status}</span></td>
                        <td>${ns.issues ? ns.issues.length : 0}</td>
                        <td>${ns.warnings ? ns.warnings.length : 0}</td>
                        <td>${Object.keys(ns.spec_compliance || {}).length} checks</td>
                    </tr>
                `;
            });
            
            content += '</tbody></table>';
        }
        
        content += '</div>';
        return content;
    }

    /**
     * Generate controller results section
     */
    function generateControllerResultsSection(controllerResults) {
        let content = '<div class="section"><div class="section-title">Controller Results</div>';
        
        if (controllerResults.length === 0) {
            content += '<p>No controller results available.</p>';
        } else {
            controllerResults.forEach((ctrl, index) => {
                const badgeClass = ctrl.status === 'pass' ? 'badge-pass' : 
                                 ctrl.status === 'warning' ? 'badge-warning' : 'badge-fail';
                
                content += `
                    <div class="expandable-section">
                        <div class="expandable-header" onclick="toggleExpandable(this)">
                            <div>
                                <strong>${ctrl.controller || ctrl.model || 'Unknown Controller'}</strong>
                                <span class="status-badge ${badgeClass}">${ctrl.status}</span>
                            </div>
                            <span class="expand-indicator">▶</span>
                        </div>
                        <div class="expandable-content">
                            <p><strong>Model:</strong> ${ctrl.model || 'N/A'}</p>
                            <p><strong>PCI Address:</strong> ${ctrl.pci_address || 'N/A'}</p>
                            ${ctrl.summary ? generateControllerSummary(ctrl.summary) : ''}
                            ${ctrl.spec_compliance ? generateComplianceGrid(ctrl.spec_compliance) : ''}
                            ${generateIssuesAndWarnings(ctrl.issues, ctrl.warnings)}
                        </div>
                    </div>
                `;
            });
        }
        
        content += '</div>';
        return content;
    }

    /**
     * Generate command results section  
     */
    function generateCommandResultsSection(testResults) {
        let content = '<div class="section"><div class="section-title">Command Test Results</div>';
        
        testResults.controller_results.forEach(ctrl => {
            if (ctrl.admin_commands || ctrl.io_commands) {
                content += `
                    <div class="expandable-section">
                        <div class="expandable-header" onclick="toggleExpandable(this)">
                            <div><strong>${ctrl.controller}</strong> Command Results</div>
                            <span class="expand-indicator">▶</span>
                        </div>
                        <div class="expandable-content">
                `;
                
                if (ctrl.admin_commands && ctrl.admin_commands.length > 0) {
                    content += '<h4>Admin Commands</h4>';
                    content += generateCommandTable(ctrl.admin_commands);
                }
                
                if (ctrl.io_commands && ctrl.io_commands.length > 0) {
                    content += '<h4>I/O Commands</h4>';
                    content += generateCommandTable(ctrl.io_commands);
                }
                
                content += '</div></div>';
            }
        });
        
        content += '</div>';
        return content;
    }

    /**
     * Generate command table
     */
    function generateCommandTable(commands) {
        let table = '<table class="results-table"><thead><tr>';
        table += '<th>Command</th><th>Opcode</th><th>Status</th><th>Response Time</th><th>Issues</th>';
        table += '</tr></thead><tbody>';
        
        commands.forEach(cmd => {
            const badgeClass = cmd.status === 'pass' ? 'badge-pass' : 
                             cmd.status === 'warning' ? 'badge-warning' : 
                             cmd.status === 'not_supported' ? 'badge-warning' : 'badge-fail';
            
            table += `
                <tr>
                    <td>${cmd.name}</td>
                    <td>${cmd.opcode}</td>
                    <td><span class="status-badge ${badgeClass}">${cmd.status}</span></td>
                    <td>${cmd.response_time_us ? cmd.response_time_us + 'μs' : 'N/A'}</td>
                    <td>${cmd.issues ? cmd.issues.length : 0}</td>
                </tr>
            `;
        });
        
        table += '</tbody></table>';
        return table;
    }

    /**
     * Generate compliance grid
     */
    function generateComplianceGrid(compliance) {
        let content = '<div class="spec-compliance">';
        
        Object.entries(compliance).forEach(([key, status]) => {
            const complianceClass = status === 'pass' ? 'compliance-pass' : 
                                   status === 'warning' ? 'compliance-warning' : 'compliance-fail';
            
            content += `
                <div class="compliance-item ${complianceClass}">
                    <strong>${key.replace('_', ' ')}</strong><br>
                    <span class="status-badge badge-${status}">${status}</span>
                </div>
            `;
        });
        
        content += '</div>';
        return content;
    }

    /**
     * Generate issues and warnings lists
     */
    function generateIssuesAndWarnings(issues, warnings) {
        let content = '';
        
        if (warnings && warnings.length > 0) {
            content += '<h4>Warnings</h4><ul class="warning-list">';
            warnings.forEach(warning => {
                content += `<li>${warning}</li>`;
            });
            content += '</ul>';
        }
        
        if (issues && issues.length > 0) {
            content += '<h4>Issues</h4><ul class="error-list">';
            issues.forEach(issue => {
                content += `<li>${issue}</li>`;
            });
            content += '</ul>';
        }
        
        return content;
    }

    /**
     * Generate warnings section
     */
    function generateWarningsSection(warnings) {
        let content = '<div class="section"><div class="section-title">Warnings</div>';
        content += '<ul class="warning-list">';
        warnings.forEach(warning => {
            content += `<li>${warning}</li>`;
        });
        content += '</ul></div>';
        return content;
    }

    /**
     * Generate errors section
     */
    function generateErrorsSection(errors) {
        let content = '<div class="section"><div class="section-title">Errors</div>';
        content += '<ul class="error-list">';
        errors.forEach(error => {
            content += `<li>${error}</li>`;
        });
        content += '</ul></div>';
        return content;
    }

    /**
     * Generate raw data section
     */
    function generateRawDataSection(testResults) {
        return `
            <div class="section">
                <div class="expandable-section">
                    <div class="expandable-header" onclick="toggleExpandable(this)">
                        <div><strong>Raw Test Data</strong></div>
                        <span class="expand-indicator">▶</span>
                    </div>
                    <div class="expandable-content">
                        <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow: auto; font-size: 12px;">
${JSON.stringify(testResults, null, 2)}
                        </pre>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Generate controller summary
     */
    function generateControllerSummary(summary) {
        let content = '<div class="summary-grid">';
        
        Object.entries(summary).forEach(([section, data]) => {
            if (typeof data === 'object' && data.total !== undefined) {
                content += `
                    <div class="summary-card">
                        <div class="summary-number">${data.passed}/${data.total}</div>
                        <div class="summary-label">${section} Passed</div>
                    </div>
                `;
            }
        });
        
        content += '</div>';
        return content;
    }

    /**
     * Setup event listeners for the results window
     */
    function setupWindowEventListeners(resultsWindow, testId) {
        // Clean up window reference when closed
        resultsWindow.addEventListener('beforeunload', function() {
            openWindows.delete(testId);
        });

        // Focus the window
        resultsWindow.focus();
    }

    /**
     * Close all open results windows
     */
    function closeAllWindows() {
        openWindows.forEach((window, testId) => {
            if (window && !window.closed) {
                window.close();
            }
        });
        openWindows.clear();
    }

    // Public API
    return {
        openResultsWindow,
        closeAllWindows
    };
})();