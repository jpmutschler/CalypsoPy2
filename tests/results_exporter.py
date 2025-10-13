#!/usr/bin/env python3
"""
Results Exporter for CalypsoPy+ Performance Tests
Supports export to PDF, CSV, and HTML formats with charts and compliance reports
"""

import os
import csv
import json
import base64
from datetime import datetime
from typing import Dict, Any, List, Optional
from io import StringIO, BytesIO
import logging

logger = logging.getLogger(__name__)

try:
    # Optional dependencies for enhanced exports
    import matplotlib
    matplotlib.use('Agg')  # Use non-GUI backend
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    from matplotlib.backends.backend_pdf import PdfPages
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False
    logger.warning("matplotlib not available - chart generation will be limited")

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    logger.warning("reportlab not available - PDF generation will be limited")


class ResultsExporter:
    """
    Export test results to various formats with professional reporting
    """

    def __init__(self):
        self.temp_dir = None
        self.has_matplotlib = MATPLOTLIB_AVAILABLE
        self.has_reportlab = REPORTLAB_AVAILABLE

    def export_to_csv(self, results: Dict[str, Any], output_path: str) -> bool:
        """
        Export test results to CSV format
        
        Args:
            results: Test results dictionary
            output_path: Output CSV file path
            
        Returns:
            Success status
        """
        try:
            with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.writer(csvfile)
                
                # Header information
                writer.writerow(['CalypsoPy+ Sequential Read Performance Test Results'])
                writer.writerow(['Generated:', datetime.now().isoformat()])
                writer.writerow(['Test Name:', results.get('test_name', 'Unknown')])
                writer.writerow(['Status:', results.get('status', 'Unknown')])
                writer.writerow(['Device:', results.get('device', 'Unknown')])
                writer.writerow(['Duration (s):', results.get('duration_seconds', 0)])
                writer.writerow([])  # Empty row
                
                # Test Configuration
                writer.writerow(['Test Configuration'])
                config = results.get('configuration', {})
                for key, value in config.items():
                    writer.writerow([key.replace('_', ' ').title() + ':', value])
                writer.writerow([])
                
                # Performance Metrics
                writer.writerow(['Performance Metrics'])
                metrics = results.get('performance_metrics', {})
                writer.writerow(['Metric', 'Value', 'Unit'])
                
                metric_mappings = {
                    'throughput_mbps': ('Throughput', 'MB/s'),
                    'iops': ('IOPS', 'ops/sec'),
                    'avg_latency_us': ('Average Latency', 'μs'),
                    'p50_latency_us': ('50th Percentile Latency', 'μs'),
                    'p90_latency_us': ('90th Percentile Latency', 'μs'),
                    'p95_latency_us': ('95th Percentile Latency', 'μs'),
                    'p99_latency_us': ('99th Percentile Latency', 'μs'),
                    'cpu_utilization': ('CPU Utilization', '%'),
                    'throughput_efficiency': ('Throughput Efficiency', '%')
                }
                
                for key, (label, unit) in metric_mappings.items():
                    value = metrics.get(key, 0)
                    writer.writerow([label, f"{value:.2f}" if isinstance(value, float) else str(value), unit])
                
                writer.writerow([])
                
                # Compliance Results
                writer.writerow(['PCIe 6.x Compliance'])
                compliance = results.get('compliance', {})
                writer.writerow(['Compliance Status:', compliance.get('status', 'Unknown')])
                writer.writerow(['Detected PCIe Generation:', compliance.get('detected_pcie_gen', 'Unknown')])
                writer.writerow(['Detected PCIe Lanes:', compliance.get('detected_pcie_lanes', 'Unknown')])
                writer.writerow(['Expected Min Throughput (MB/s):', compliance.get('expected_min_throughput', 0)])
                writer.writerow([])
                
                # Validation Results
                writer.writerow(['Validation Results'])
                writer.writerow(['Metric', 'Status', 'Actual', 'Expected', 'Description'])
                
                validations = compliance.get('validations', [])
                for validation in validations:
                    writer.writerow([
                        validation.get('metric', ''),
                        validation.get('status', ''),
                        validation.get('actual', ''),
                        validation.get('expected_min', validation.get('expected_max', '')),
                        validation.get('description', '')
                    ])
                
                # Warnings and Errors
                if results.get('warnings'):
                    writer.writerow([])
                    writer.writerow(['Warnings'])
                    for warning in results['warnings']:
                        writer.writerow([warning])
                
                if results.get('errors'):
                    writer.writerow([])
                    writer.writerow(['Errors'])
                    for error in results['errors']:
                        writer.writerow([error])

            logger.info(f"CSV export completed: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Error exporting to CSV: {str(e)}")
            return False

    def export_to_html(self, results: Dict[str, Any], output_path: str) -> bool:
        """
        Export test results to HTML format with embedded charts
        
        Args:
            results: Test results dictionary
            output_path: Output HTML file path
            
        Returns:
            Success status
        """
        try:
            html_content = self._generate_html_report(results)
            
            with open(output_path, 'w', encoding='utf-8') as htmlfile:
                htmlfile.write(html_content)

            logger.info(f"HTML export completed: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Error exporting to HTML: {str(e)}")
            return False

    def export_to_pdf(self, results: Dict[str, Any], output_path: str) -> bool:
        """
        Export test results to PDF format with charts and professional layout
        
        Args:
            results: Test results dictionary
            output_path: Output PDF file path
            
        Returns:
            Success status
        """
        if not self.has_reportlab:
            logger.error("reportlab not available - cannot export to PDF")
            return False

        try:
            doc = SimpleDocTemplate(output_path, pagesize=A4)
            styles = getSampleStyleSheet()
            story = []

            # Title
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                spaceAfter=30,
                alignment=1  # Center
            )
            
            story.append(Paragraph("CalypsoPy+ Sequential Read Performance Test", title_style))
            story.append(Spacer(1, 20))

            # Test Information
            test_info = [
                ['Test Name:', results.get('test_name', 'Unknown')],
                ['Status:', results.get('status', 'Unknown').upper()],
                ['Device:', results.get('device', 'Unknown')],
                ['Test Date:', datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
                ['Duration:', f"{results.get('duration_seconds', 0):.1f} seconds"]
            ]

            test_table = Table(test_info, colWidths=[2*inch, 3*inch])
            test_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                ('BACKGROUND', (1, 0), (1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            story.append(test_table)
            story.append(Spacer(1, 20))

            # Performance Metrics
            story.append(Paragraph("Performance Metrics", styles['Heading2']))
            
            metrics = results.get('performance_metrics', {})
            metrics_data = [
                ['Metric', 'Value', 'Unit'],
                ['Throughput', f"{metrics.get('throughput_mbps', 0):.1f}", 'MB/s'],
                ['IOPS', f"{metrics.get('iops', 0):.0f}", 'ops/sec'],
                ['Average Latency', f"{metrics.get('avg_latency_us', 0):.1f}", 'μs'],
                ['95th Percentile Latency', f"{metrics.get('p95_latency_us', 0):.1f}", 'μs'],
                ['99th Percentile Latency', f"{metrics.get('p99_latency_us', 0):.1f}", 'μs'],
                ['CPU Utilization', f"{metrics.get('cpu_utilization', 0):.1f}", '%'],
                ['Throughput Efficiency', f"{metrics.get('throughput_efficiency', 0):.1f}", '%']
            ]

            metrics_table = Table(metrics_data, colWidths=[2.5*inch, 1.5*inch, 1*inch])
            metrics_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            story.append(metrics_table)
            story.append(Spacer(1, 20))

            # Compliance Results
            story.append(Paragraph("PCIe 6.x Compliance", styles['Heading2']))
            
            compliance = results.get('compliance', {})
            compliance_status = compliance.get('status', 'Unknown')
            
            status_color = colors.green if compliance_status == 'compliant' else colors.red
            status_text = f'<font color="{status_color.hexval()}"><b>{compliance_status.upper()}</b></font>'
            
            story.append(Paragraph(f"Compliance Status: {status_text}", styles['Normal']))
            story.append(Paragraph(f"Detected PCIe: {compliance.get('detected_pcie_gen', 'Unknown')} {compliance.get('detected_pcie_lanes', 'Unknown')}", styles['Normal']))
            story.append(Paragraph(f"Expected Minimum Throughput: {compliance.get('expected_min_throughput', 0):.1f} MB/s", styles['Normal']))
            story.append(Spacer(1, 10))

            # Validation Results
            validations = compliance.get('validations', [])
            if validations:
                story.append(Paragraph("Validation Details", styles['Heading3']))
                
                validation_data = [['Metric', 'Status', 'Description']]
                for validation in validations:
                    status = validation.get('status', 'unknown')
                    status_symbol = '✓' if status == 'pass' else '✗'
                    validation_data.append([
                        validation.get('metric', ''),
                        status_symbol,
                        validation.get('description', '')
                    ])

                validation_table = Table(validation_data, colWidths=[1.5*inch, 0.5*inch, 3*inch])
                validation_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 9),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                
                story.append(validation_table)
                story.append(Spacer(1, 20))

            # Test Configuration
            story.append(Paragraph("Test Configuration", styles['Heading2']))
            
            config = results.get('configuration', {})
            config_data = [
                ['Block Size:', config.get('block_size', 'Unknown')],
                ['Queue Depth:', str(config.get('queue_depth', 'Unknown'))],
                ['Runtime:', f"{config.get('runtime_seconds', 'Unknown')} seconds"]
            ]

            config_table = Table(config_data, colWidths=[2*inch, 3*inch])
            config_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                ('BACKGROUND', (1, 0), (1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            story.append(config_table)

            # Generate charts if matplotlib is available
            if self.has_matplotlib:
                chart_path = self._generate_performance_chart(results)
                if chart_path and os.path.exists(chart_path):
                    story.append(Spacer(1, 20))
                    story.append(Paragraph("Performance Visualization", styles['Heading2']))
                    chart_img = Image(chart_path, width=6*inch, height=4*inch)
                    story.append(chart_img)

            # Build PDF
            doc.build(story)
            
            logger.info(f"PDF export completed: {output_path}")
            return True

        except Exception as e:
            logger.error(f"Error exporting to PDF: {str(e)}")
            return False

    def _generate_html_report(self, results: Dict[str, Any]) -> str:
        """Generate HTML report content"""
        
        # Basic metrics
        metrics = results.get('performance_metrics', {})
        compliance = results.get('compliance', {})
        config = results.get('configuration', {})
        
        # Chart data for Chart.js
        chart_data = self._prepare_chart_data(results)
        
        html_template = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CalypsoPy+ Sequential Read Performance Report</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.min.js"></script>
    <style>
        body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }}
        .header {{
            text-align: center;
            border-bottom: 3px solid #333;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }}
        .header h1 {{
            color: #333;
            margin: 0;
            font-size: 2.5em;
        }}
        .header .subtitle {{
            color: #666;
            font-size: 1.1em;
            margin-top: 5px;
        }}
        .section {{
            margin-bottom: 30px;
        }}
        .section h2 {{
            color: #333;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 5px;
        }}
        .metrics-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }}
        .metric-card {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }}
        .metric-value {{
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 5px;
        }}
        .metric-label {{
            font-size: 0.9em;
            opacity: 0.9;
        }}
        .status-badge {{
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            text-transform: uppercase;
        }}
        .status-pass {{ background: #4CAF50; color: white; }}
        .status-fail {{ background: #f44336; color: white; }}
        .status-warning {{ background: #ff9800; color: white; }}
        .status-compliant {{ background: #4CAF50; color: white; }}
        .status-non_compliant {{ background: #f44336; color: white; }}
        .info-table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }}
        .info-table th, .info-table td {{
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }}
        .info-table th {{
            background-color: #f2f2f2;
            font-weight: bold;
        }}
        .validation-item {{
            display: flex;
            align-items: center;
            padding: 10px;
            margin: 5px 0;
            border-radius: 5px;
            border-left: 4px solid;
        }}
        .validation-pass {{
            background-color: #e8f5e8;
            border-left-color: #4CAF50;
        }}
        .validation-fail {{
            background-color: #fdeaea;
            border-left-color: #f44336;
        }}
        .validation-icon {{
            margin-right: 10px;
            font-weight: bold;
            font-size: 1.2em;
        }}
        .chart-container {{
            width: 100%;
            height: 400px;
            margin: 20px 0;
        }}
        .export-info {{
            text-align: center;
            color: #666;
            font-size: 0.9em;
            margin-top: 30px;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }}
        @media print {{
            body {{ background: white; }}
            .container {{ box-shadow: none; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Sequential Read Performance Report</h1>
            <div class="subtitle">CalypsoPy+ by Serial Cables</div>
            <div class="subtitle">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</div>
        </div>

        <div class="section">
            <h2>Test Summary</h2>
            <table class="info-table">
                <tr><th>Test Name</th><td>{results.get('test_name', 'Unknown')}</td></tr>
                <tr><th>Status</th><td><span class="status-badge status-{results.get('status', 'unknown')}">{results.get('status', 'Unknown').upper()}</span></td></tr>
                <tr><th>Device</th><td>{results.get('device', 'Unknown')}</td></tr>
                <tr><th>Duration</th><td>{results.get('duration_seconds', 0):.1f} seconds</td></tr>
                <tr><th>Block Size</th><td>{config.get('block_size', 'Unknown')}</td></tr>
                <tr><th>Queue Depth</th><td>{config.get('queue_depth', 'Unknown')}</td></tr>
                <tr><th>Runtime</th><td>{config.get('runtime_seconds', 'Unknown')} seconds</td></tr>
            </table>
        </div>

        <div class="section">
            <h2>Performance Metrics</h2>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">{metrics.get('throughput_mbps', 0):.1f}</div>
                    <div class="metric-label">MB/s Throughput</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">{metrics.get('iops', 0):.0f}</div>
                    <div class="metric-label">IOPS</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">{metrics.get('avg_latency_us', 0):.1f}</div>
                    <div class="metric-label">μs Average Latency</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">{metrics.get('p95_latency_us', 0):.1f}</div>
                    <div class="metric-label">μs 95th % Latency</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">{metrics.get('cpu_utilization', 0):.1f}</div>
                    <div class="metric-label">% CPU Usage</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">{metrics.get('throughput_efficiency', 0):.1f}</div>
                    <div class="metric-label">% Efficiency</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>PCIe 6.x Compliance</h2>
            <p><strong>Status:</strong> <span class="status-badge status-{compliance.get('status', 'unknown')}">{compliance.get('status', 'Unknown').upper()}</span></p>
            <p><strong>Detected PCIe:</strong> {compliance.get('detected_pcie_gen', 'Unknown')} {compliance.get('detected_pcie_lanes', 'Unknown')}</p>
            <p><strong>Expected Minimum Throughput:</strong> {compliance.get('expected_min_throughput', 0):.1f} MB/s</p>
            
            <h3>Validation Results</h3>
            <div class="validations">
        """
        
        # Add validation results
        validations = compliance.get('validations', [])
        for validation in validations:
            status_class = 'pass' if validation.get('status') == 'pass' else 'fail'
            status_icon = '✓' if validation.get('status') == 'pass' else '✗'
            html_template += f"""
                <div class="validation-item validation-{status_class}">
                    <span class="validation-icon">{status_icon}</span>
                    <span>{validation.get('description', '')}</span>
                </div>
            """
        
        html_template += """
            </div>
        </div>

        <div class="section">
            <h2>Performance Visualization</h2>
            <div class="chart-container">
                <canvas id="performanceChart"></canvas>
            </div>
        </div>

        <div class="export-info">
            <p>This report was generated by CalypsoPy+ Sequential Read Performance Test</p>
            <p>For more information, visit: <a href="https://github.com/serial-cables/calypso-py-plus">github.com/serial-cables/calypso-py-plus</a></p>
        </div>
    </div>

    <script>
        // Performance chart
        const ctx = document.getElementById('performanceChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Throughput (MB/s)', 'IOPS', 'Avg Latency (μs)', 'P95 Latency (μs)', 'CPU Usage (%)', 'Efficiency (%)'],
                datasets: [{
                    label: 'Performance Metrics',
                    data: [""" + f"""
                        {metrics.get('throughput_mbps', 0):.1f},
                        {metrics.get('iops', 0):.0f},
                        {metrics.get('avg_latency_us', 0):.1f},
                        {metrics.get('p95_latency_us', 0):.1f},
                        {metrics.get('cpu_utilization', 0):.1f},
                        {metrics.get('throughput_efficiency', 0):.1f}
                    """ + """],
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(255, 205, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)',
                        'rgba(255, 159, 64, 0.8)'
                    ],
                    borderColor: [
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 99, 132, 1)',
                        'rgba(255, 205, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Performance Metrics Overview'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    </script>
</body>
</html>
        """
        
        return html_template

    def _generate_performance_chart(self, results: Dict[str, Any]) -> Optional[str]:
        """Generate performance chart using matplotlib"""
        if not self.has_matplotlib:
            return None
            
        try:
            metrics = results.get('performance_metrics', {})
            
            # Create figure with subplots
            fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(12, 8))
            fig.suptitle('Sequential Read Performance Analysis', fontsize=16, fontweight='bold')
            
            # Throughput chart
            ax1.bar(['Throughput'], [metrics.get('throughput_mbps', 0)], color='#4CAF50')
            ax1.set_ylabel('MB/s')
            ax1.set_title('Throughput')
            ax1.grid(True, alpha=0.3)
            
            # IOPS chart
            ax2.bar(['IOPS'], [metrics.get('iops', 0)], color='#2196F3')
            ax2.set_ylabel('Operations/sec')
            ax2.set_title('IOPS')
            ax2.grid(True, alpha=0.3)
            
            # Latency chart
            latency_data = [
                metrics.get('avg_latency_us', 0),
                metrics.get('p95_latency_us', 0),
                metrics.get('p99_latency_us', 0)
            ]
            ax3.bar(['Avg', 'P95', 'P99'], latency_data, color=['#FF9800', '#FF5722', '#9C27B0'])
            ax3.set_ylabel('Microseconds')
            ax3.set_title('Latency Distribution')
            ax3.grid(True, alpha=0.3)
            
            # Efficiency chart
            efficiency_data = [
                metrics.get('throughput_efficiency', 0),
                metrics.get('cpu_utilization', 0)
            ]
            ax4.bar(['Throughput Efficiency', 'CPU Usage'], efficiency_data, color=['#8BC34A', '#FFC107'])
            ax4.set_ylabel('Percentage (%)')
            ax4.set_title('Efficiency Metrics')
            ax4.grid(True, alpha=0.3)
            
            plt.tight_layout()
            
            # Save chart
            chart_path = f"/tmp/performance_chart_{int(datetime.now().timestamp())}.png"
            plt.savefig(chart_path, dpi=150, bbox_inches='tight')
            plt.close()
            
            return chart_path
            
        except Exception as e:
            logger.error(f"Error generating performance chart: {str(e)}")
            return None

    def _prepare_chart_data(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare chart data for frontend visualization"""
        metrics = results.get('performance_metrics', {})
        
        return {
            'throughput': metrics.get('throughput_mbps', 0),
            'iops': metrics.get('iops', 0),
            'latency_avg': metrics.get('avg_latency_us', 0),
            'latency_p95': metrics.get('p95_latency_us', 0),
            'cpu_usage': metrics.get('cpu_utilization', 0),
            'efficiency': metrics.get('throughput_efficiency', 0)
        }

    def export_results(self, results: Dict[str, Any], format_type: str, output_path: str) -> bool:
        """
        Export results in the specified format
        
        Args:
            results: Test results dictionary
            format_type: Export format ('csv', 'html', 'pdf')
            output_path: Output file path
            
        Returns:
            Success status
        """
        format_type = format_type.lower()
        
        try:
            if format_type == 'csv':
                return self.export_to_csv(results, output_path)
            elif format_type == 'html':
                return self.export_to_html(results, output_path)
            elif format_type == 'pdf':
                return self.export_to_pdf(results, output_path)
            else:
                logger.error(f"Unsupported export format: {format_type}")
                return False
                
        except Exception as e:
            logger.error(f"Error exporting results: {str(e)}")
            return False


# Example usage
if __name__ == "__main__":
    # Sample test results for demonstration
    sample_results = {
        "test_name": "Sequential Read Performance",
        "status": "pass",
        "device": "/dev/nvme0n1",
        "duration_seconds": 60.5,
        "configuration": {
            "block_size": "128k",
            "queue_depth": 32,
            "runtime_seconds": 60
        },
        "performance_metrics": {
            "throughput_mbps": 3250.5,
            "iops": 26004,
            "avg_latency_us": 1230.5,
            "p95_latency_us": 2100.0,
            "p99_latency_us": 3500.0,
            "cpu_utilization": 25.3,
            "throughput_efficiency": 87.2
        },
        "compliance": {
            "status": "compliant",
            "detected_pcie_gen": "Gen4",
            "detected_pcie_lanes": "x4",
            "expected_min_throughput": 3000.0,
            "validations": [
                {
                    "metric": "throughput",
                    "status": "pass",
                    "actual": 3250.5,
                    "expected_min": 3000.0,
                    "description": "Sequential read throughput (3250.5 MB/s vs 3000.0 MB/s minimum)"
                }
            ]
        }
    }
    
    exporter = ResultsExporter()
    
    # Test all export formats
    print("Testing CSV export...")
    exporter.export_to_csv(sample_results, "test_results.csv")
    
    print("Testing HTML export...")
    exporter.export_to_html(sample_results, "test_results.html")
    
    if exporter.has_reportlab:
        print("Testing PDF export...")
        exporter.export_to_pdf(sample_results, "test_results.pdf")
    else:
        print("PDF export not available (reportlab not installed)")