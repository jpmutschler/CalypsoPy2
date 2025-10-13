#!/usr/bin/env python3
"""
CalypsoPy+ NVMe Command Set Validation Tests
Non-destructive validation of NVMe command sets against NVMe 2.3 Base Specification
Only tests Atlas 3 downstream devices for system safety
"""

import os
import json
import re
import subprocess
import logging
import struct
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from .nvme_discovery import NVMeDiscovery, NVMeController

logger = logging.getLogger(__name__)


@dataclass
class CommandTestResult:
    """Result from testing a specific command"""
    command_name: str
    command_opcode: int
    status: str  # 'pass', 'warning', 'fail', 'not_supported'
    response_time_us: Optional[int] = None
    issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    spec_compliance: Dict[str, str] = field(default_factory=dict)


@dataclass
class CommandSetValidationResult:
    """Results from command set validation"""
    controller_device: str
    status: str  # 'pass', 'warning', 'fail'
    admin_commands: List[CommandTestResult] = field(default_factory=list)
    io_commands: List[CommandTestResult] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class CommandSetValidator:
    """
    NVMe Command Set Validation - Non-destructive testing only
    Validates command set compliance against NVMe 2.3 Base Specification
    Only operates on Atlas 3 downstream devices
    """
    
    # NVMe 2.3 Mandatory Admin Commands (non-destructive subset)
    MANDATORY_ADMIN_COMMANDS = {
        0x06: 'Identify',           # Safe - read-only identification
        0x0A: 'Get Features',       # Safe - read current settings
        0x0C: 'Get Log Page',       # Safe - read log information
        0x1C: 'Firmware Image Download',  # Safe when not activating
        0x1D: 'Namespace Management',     # EXCLUDED - can be destructive
        0x20: 'Directive Send',           # EXCLUDED - can modify state
        0x21: 'Directive Receive',        # Safe - read directive status
    }
    
    # NVMe 2.3 Optional Admin Commands (safe subset)
    OPTIONAL_ADMIN_COMMANDS = {
        0x05: 'Security Send',             # EXCLUDED - security operations
        0x25: 'Security Receive',          # Safe - read security status
        0x81: 'Device Self-test',          # EXCLUDED - can be disruptive
        0x84: 'Sanitize',                  # EXCLUDED - destructive
        0x86: 'NVM Set Management',        # EXCLUDED - can be destructive
    }
    
    # NVMe I/O Commands (non-destructive subset)
    IO_COMMANDS = {
        0x02: 'Read',                      # Safe - read data
        0x04: 'Write Uncorrectable',       # EXCLUDED - modifies data
        0x05: 'Compare',                   # Safe - compare without write
        0x08: 'Write Zeroes',              # EXCLUDED - modifies data  
        0x09: 'Dataset Management',        # EXCLUDED - can be destructive
        0x0D: 'Reservation Register',      # EXCLUDED - can affect access
        0x11: 'Reservation Report',        # Safe - read reservation status
    }
    
    # Safe commands only (non-destructive)
    SAFE_ADMIN_COMMANDS = {
        0x06: 'Identify',
        0x0A: 'Get Features', 
        0x0C: 'Get Log Page',
        0x21: 'Directive Receive',
        0x25: 'Security Receive'
    }
    
    SAFE_IO_COMMANDS = {
        0x02: 'Read',
        0x05: 'Compare',
        0x11: 'Reservation Report'
    }
    
    def __init__(self):
        self.discovery = NVMeDiscovery()
        self.has_nvme_cli = self.discovery.has_nvme_cli
        self.has_root = self.discovery.has_root
        self.has_sudo = self.discovery.has_sudo
        
    def _run_command(self, cmd: List[str], use_sudo: bool = False) -> Optional[str]:
        """Run command with appropriate permissions"""
        return self.discovery._run_command(cmd, use_sudo=use_sudo)
    
    def _test_identify_command(self, controller: NVMeController) -> CommandTestResult:
        """Test Identify Controller command (0x06) - completely safe"""
        start_time = datetime.now()
        
        result = CommandTestResult(
            command_name='Identify Controller',
            command_opcode=0x06,
            status='pass'
        )
        
        if not self.has_nvme_cli:
            result.status = 'fail'
            result.issues.append("nvme-cli required for command testing")
            return result
        
        # Execute identify controller command
        output = self._run_command(
            ['nvme', 'id-ctrl', controller.device_path, '-o', 'json'],
            use_sudo=True
        )
        
        end_time = datetime.now()
        result.response_time_us = int((end_time - start_time).total_seconds() * 1000000)
        
        if not output:
            result.status = 'fail'
            result.issues.append("Identify Controller command failed")
            return result
        
        try:
            identify_data = json.loads(output)
            
            # Validate mandatory fields per NVMe 2.3 spec
            mandatory_fields = [
                'vid', 'ssvid', 'sn', 'mn', 'fr', 'rab', 'ieee',
                'cmic', 'mdts', 'cntlid', 'ver', 'rtd3r', 'rtd3e',
                'oaes', 'ctratt', 'fguid', 'oacs', 'acl', 'aerl',
                'frmw', 'lpa', 'elpe', 'npss', 'avscc', 'apsta',
                'sqes', 'cqes', 'maxcmd', 'nn', 'oncs', 'fuses'
            ]
            
            missing_fields = []
            for field in mandatory_fields:
                if field not in identify_data:
                    missing_fields.append(field)
            
            if missing_fields:
                result.warnings.append(f"Missing identify fields: {', '.join(missing_fields)}")
                result.status = 'warning'
            
            # Check version compliance
            version = identify_data.get('ver', 0)
            if version < 0x20000:  # NVMe 2.0 minimum for full PCIe 6.x compliance
                result.warnings.append(f"NVMe version {version:#x} below recommended 2.0 for PCIe 6.x")
            
            # Validate command support (OACS field)
            oacs = identify_data.get('oacs', 0)
            result.spec_compliance['security_commands'] = 'pass' if (oacs & 0x01) else 'not_supported'
            result.spec_compliance['format_nvm'] = 'pass' if (oacs & 0x02) else 'not_supported' 
            result.spec_compliance['firmware_commit'] = 'pass' if (oacs & 0x04) else 'not_supported'
            result.spec_compliance['namespace_mgmt'] = 'pass' if (oacs & 0x08) else 'not_supported'
            
        except json.JSONDecodeError:
            result.status = 'fail'
            result.issues.append("Failed to parse Identify Controller response")
        except Exception as e:
            result.status = 'fail'
            result.issues.append(f"Error validating Identify Controller: {str(e)}")
        
        return result
    
    def _test_get_features_command(self, controller: NVMeController) -> CommandTestResult:
        """Test Get Features command (0x0A) - safe read-only"""
        start_time = datetime.now()
        
        result = CommandTestResult(
            command_name='Get Features',
            command_opcode=0x0A,
            status='pass'
        )
        
        # Test mandatory features (safe to query)
        mandatory_features = {
            0x01: 'Arbitration',
            0x02: 'Power Management',
            0x04: 'Temperature Threshold',
            0x05: 'Error Recovery',
            0x06: 'Volatile Write Cache',
            0x07: 'Number of Queues',
            0x08: 'Interrupt Coalescing'
        }
        
        feature_results = {}
        
        for feature_id, feature_name in mandatory_features.items():
            output = self._run_command(
                ['nvme', 'get-feature', controller.device_path, '-f', str(feature_id), '-H'],
                use_sudo=True
            )
            
            if output and 'error' not in output.lower():
                feature_results[feature_name] = 'supported'
            else:
                feature_results[feature_name] = 'not_supported'
                result.warnings.append(f"Feature {feature_name} (0x{feature_id:02x}) not supported")
        
        end_time = datetime.now()
        result.response_time_us = int((end_time - start_time).total_seconds() * 1000000)
        
        # Validate that core features are supported
        core_features = ['Number of Queues', 'Error Recovery', 'Volatile Write Cache']
        unsupported_core = [f for f in core_features if feature_results.get(f) != 'supported']
        
        if unsupported_core:
            result.status = 'warning'
            result.warnings.append(f"Core features not supported: {', '.join(unsupported_core)}")
        
        result.spec_compliance = feature_results
        
        return result
    
    def _test_get_log_page_command(self, controller: NVMeController) -> CommandTestResult:
        """Test Get Log Page command (0x0C) - safe read-only"""
        start_time = datetime.now()
        
        result = CommandTestResult(
            command_name='Get Log Page',
            command_opcode=0x0C,
            status='pass'
        )
        
        # Test mandatory log pages (safe to read)
        mandatory_logs = {
            0x01: 'Error Information',
            0x02: 'SMART Health Information',
            0x03: 'Firmware Slot Information'
        }
        
        log_results = {}
        
        for log_id, log_name in mandatory_logs.items():
            output = self._run_command(
                ['nvme', 'get-log', controller.device_path, '-i', str(log_id), '-l', '512'],
                use_sudo=True
            )
            
            if output and 'error' not in output.lower():
                log_results[log_name] = 'supported'
            else:
                log_results[log_name] = 'not_supported'
                result.warnings.append(f"Log page {log_name} (0x{log_id:02x}) not supported")
        
        end_time = datetime.now()
        result.response_time_us = int((end_time - start_time).total_seconds() * 1000000)
        
        # All mandatory logs should be supported
        if 'not_supported' in log_results.values():
            result.status = 'warning'
        
        result.spec_compliance = log_results
        
        return result
    
    def _test_safe_io_commands(self, controller: NVMeController, 
                             test_mode: str) -> List[CommandTestResult]:
        """Test safe I/O commands (non-destructive only)"""
        results = []
        
        if not controller.namespaces:
            # No namespaces to test I/O commands
            return results
        
        # Use first namespace for testing
        test_namespace = controller.namespaces[0]
        
        if test_mode in ['extended', 'comprehensive']:
            # Test Read command (safe)
            result = self._test_read_command(test_namespace)
            results.append(result)
        
        if test_mode == 'comprehensive':
            # Test Compare command if supported (safe)
            result = self._test_compare_command(test_namespace)
            results.append(result)
        
        return results
    
    def _test_read_command(self, namespace) -> CommandTestResult:
        """Test Read command - completely safe"""
        start_time = datetime.now()
        
        result = CommandTestResult(
            command_name='Read',
            command_opcode=0x02,
            status='pass'
        )
        
        # Perform small read (1 LBA) from LBA 0 (safe)
        output = self._run_command(
            ['nvme', 'read', namespace.device_path, '-z', '512', '-s', '0', '-c', '0'],
            use_sudo=True
        )
        
        end_time = datetime.now()
        result.response_time_us = int((end_time - start_time).total_seconds() * 1000000)
        
        if not output or 'error' in output.lower():
            result.status = 'fail' 
            result.issues.append("Read command failed")
        else:
            result.spec_compliance['read_support'] = 'pass'
        
        return result
    
    def _test_compare_command(self, namespace) -> CommandTestResult:
        """Test Compare command if supported - safe operation"""
        start_time = datetime.now()
        
        result = CommandTestResult(
            command_name='Compare',
            command_opcode=0x05,
            status='not_supported'
        )
        
        # Note: Compare command testing would require more complex setup
        # For now, mark as not tested in basic validation
        result.warnings.append("Compare command testing not implemented in basic mode")
        
        end_time = datetime.now()
        result.response_time_us = int((end_time - start_time).total_seconds() * 1000000)
        
        return result
    
    def validate_command_set(self, controller: NVMeController, 
                           test_mode: str = 'basic',
                           test_error_conditions: bool = False) -> CommandSetValidationResult:
        """
        Validate command set for a controller
        
        Args:
            controller: Controller to test
            test_mode: 'basic', 'extended', or 'comprehensive'
            test_error_conditions: Test error handling (safe errors only)
        """
        result = CommandSetValidationResult(
            controller_device=controller.device,
            status='pass'
        )
        
        # Test mandatory admin commands (safe subset)
        admin_tests = [
            self._test_identify_command(controller),
            self._test_get_features_command(controller),
            self._test_get_log_page_command(controller)
        ]
        
        result.admin_commands = admin_tests
        
        # Test I/O commands if extended/comprehensive mode
        if test_mode in ['extended', 'comprehensive']:
            io_tests = self._test_safe_io_commands(controller, test_mode)
            result.io_commands = io_tests
        
        # Calculate summary
        total_admin = len(result.admin_commands)
        passed_admin = len([t for t in result.admin_commands if t.status == 'pass'])
        warning_admin = len([t for t in result.admin_commands if t.status == 'warning'])
        failed_admin = len([t for t in result.admin_commands if t.status == 'fail'])
        
        total_io = len(result.io_commands)
        passed_io = len([t for t in result.io_commands if t.status == 'pass'])
        warning_io = len([t for t in result.io_commands if t.status == 'warning'])
        failed_io = len([t for t in result.io_commands if t.status == 'fail'])
        
        result.summary = {
            'admin_commands': {
                'total': total_admin,
                'passed': passed_admin,
                'warnings': warning_admin,
                'failed': failed_admin,
                'pass_rate': (passed_admin / max(total_admin, 1)) * 100
            },
            'io_commands': {
                'total': total_io,
                'passed': passed_io,
                'warnings': warning_io,
                'failed': failed_io,
                'pass_rate': (passed_io / max(total_io, 1)) * 100 if total_io > 0 else 0
            }
        }
        
        # Determine overall status
        if failed_admin > 0 or failed_io > 0:
            result.status = 'fail'
        elif warning_admin > 0 or warning_io > 0:
            result.status = 'warning'
        
        return result
    
    def run_command_set_validation_test(self, target_device: str = 'all',
                                      test_mode: str = 'basic',
                                      test_error_conditions: bool = False) -> Dict[str, Any]:
        """
        Run command set validation test on Atlas 3 downstream devices
        
        Args:
            target_device: 'all' or specific controller (e.g., 'nvme0')
            test_mode: 'basic', 'extended', or 'comprehensive'
            test_error_conditions: Test error handling (safe only)
        """
        start_time = datetime.now()
        
        result = {
            'test_name': 'NVMe Command Set Validation',
            'status': 'pass',
            'timestamp': start_time.isoformat(),
            'target_device': target_device,
            'test_mode': test_mode,
            'test_error_conditions': test_error_conditions,
            'spec_version': 'NVMe 2.3 Base Specification',
            'pcie_compliance': 'PCIe 6.x',
            'safety_mode': 'Non-destructive only - READ OPERATIONS ONLY',
            'controller_results': [],
            'summary': {},
            'errors': [],
            'warnings': []
        }
        
        try:
            # Discover Atlas 3 downstream controllers
            controllers = self.discovery.discover_nvme_devices()
            
            if not controllers:
                result['warnings'].append("No NVMe devices found downstream of Atlas 3 switch")
                result['status'] = 'warning'
                return result
            
            total_controllers = 0
            passed_controllers = 0
            failed_controllers = 0
            warning_controllers = 0
            
            for controller in controllers:
                # Filter by target device if specified
                if target_device != 'all' and controller.device != target_device:
                    continue
                
                total_controllers += 1
                
                # Validate command set
                ctrl_result = self.validate_command_set(
                    controller, test_mode, test_error_conditions
                )
                
                result['controller_results'].append({
                    'controller': controller.device,
                    'model': controller.model,
                    'pci_address': controller.pci_address,
                    'status': ctrl_result.status,
                    'admin_commands': [
                        {
                            'name': cmd.command_name,
                            'opcode': f"0x{cmd.command_opcode:02x}",
                            'status': cmd.status,
                            'response_time_us': cmd.response_time_us,
                            'issues': cmd.issues,
                            'warnings': cmd.warnings,
                            'spec_compliance': cmd.spec_compliance
                        }
                        for cmd in ctrl_result.admin_commands
                    ],
                    'io_commands': [
                        {
                            'name': cmd.command_name,
                            'opcode': f"0x{cmd.command_opcode:02x}",
                            'status': cmd.status,
                            'response_time_us': cmd.response_time_us,
                            'issues': cmd.issues,
                            'warnings': cmd.warnings,
                            'spec_compliance': cmd.spec_compliance
                        }
                        for cmd in ctrl_result.io_commands
                    ],
                    'summary': ctrl_result.summary,
                    'errors': ctrl_result.errors,
                    'warnings': ctrl_result.warnings
                })
                
                # Update counters
                if ctrl_result.status == 'pass':
                    passed_controllers += 1
                elif ctrl_result.status == 'fail':
                    failed_controllers += 1
                else:
                    warning_controllers += 1
            
            # Generate overall summary
            result['summary'] = {
                'total_controllers': total_controllers,
                'passed': passed_controllers,
                'warnings': warning_controllers,
                'failed': failed_controllers,
                'pass_rate': (passed_controllers / max(total_controllers, 1)) * 100
            }
            
            # Determine overall status
            if failed_controllers > 0:
                result['status'] = 'fail'
            elif warning_controllers > 0:
                result['status'] = 'warning'
            
            # Add general warnings
            if not self.has_nvme_cli:
                result['errors'].append("nvme-cli not installed - install with: sudo apt install nvme-cli")
                result['status'] = 'fail'
            
            if total_controllers == 0:
                result['warnings'].append("No controllers found matching criteria")
                result['status'] = 'warning'
            
            # Safety reminder
            result['warnings'].append("Only non-destructive commands tested for system safety")
        
        except Exception as e:
            logger.error(f"Command set validation test failed: {e}")
            result['status'] = 'error'
            result['errors'].append(f"Test exception: {str(e)}")
        
        end_time = datetime.now()
        result['duration_ms'] = int((end_time - start_time).total_seconds() * 1000)
        
        return result


if __name__ == '__main__':
    # Test the command set validation module
    logging.basicConfig(level=logging.INFO)
    
    validator = CommandSetValidator()
    test_result = validator.run_command_set_validation_test(
        target_device='all',
        test_mode='extended',
        test_error_conditions=False
    )
    
    print(f"\n{'=' * 60}")
    print(f"NVMe Command Set Validation Test Results")
    print(f"{'=' * 60}")
    print(f"Status: {test_result['status'].upper()}")
    print(f"Duration: {test_result['duration_ms']}ms")
    print(f"Test Mode: {test_result['test_mode']}")
    print(f"Safety Mode: {test_result['safety_mode']}")
    
    summary = test_result.get('summary', {})
    if summary:
        print(f"\nSummary:")
        print(f"  Total controllers: {summary['total_controllers']}")
        print(f"  Passed: {summary['passed']}")
        print(f"  Warnings: {summary['warnings']}")
        print(f"  Failed: {summary['failed']}")
        print(f"  Pass rate: {summary['pass_rate']:.1f}%")
    
    if test_result.get('controller_results'):
        print(f"\nController Results:")
        for ctrl_result in test_result['controller_results']:
            print(f"  {ctrl_result['controller']}: {ctrl_result['status'].upper()}")
            print(f"    Admin commands: {ctrl_result['summary']['admin_commands']['passed']}/{ctrl_result['summary']['admin_commands']['total']} passed")
            if ctrl_result['summary']['io_commands']['total'] > 0:
                print(f"    I/O commands: {ctrl_result['summary']['io_commands']['passed']}/{ctrl_result['summary']['io_commands']['total']} passed")