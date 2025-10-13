#!/usr/bin/env python3
"""
CalypsoPy+ NVMe Identify Structure Validation Tests
Non-destructive validation of NVMe Identify structures against NVMe 2.3 Base Specification
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
class IdentifyFieldValidation:
    """Validation result for a specific identify field"""
    field_name: str
    expected_type: str
    actual_value: Any
    status: str  # 'pass', 'warning', 'fail', 'info'
    message: str = ""
    spec_reference: str = ""


@dataclass
class IdentifyValidationResult:
    """Results from identify structure validation"""
    structure_name: str  # 'controller' or 'namespace'
    controller_device: str
    namespace_id: Optional[int] = None
    status: str = 'pass'  # 'pass', 'warning', 'fail'
    field_validations: List[IdentifyFieldValidation] = field(default_factory=list)
    mandatory_fields: Dict[str, str] = field(default_factory=dict)  # field -> status
    optional_fields: Dict[str, str] = field(default_factory=dict)   # field -> status
    spec_compliance: Dict[str, str] = field(default_factory=dict)
    issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class IdentifyStructureValidator:
    """
    NVMe Identify Structure Validation - Non-destructive testing only
    Validates Identify Controller and Namespace structures against NVMe 2.3 Base Specification
    Only operates on Atlas 3 downstream devices
    """
    
    # NVMe 2.3 Identify Controller mandatory fields
    CONTROLLER_MANDATORY_FIELDS = {
        # Basic Controller Information
        'vid': {'type': 'uint16', 'desc': 'Vendor ID', 'spec': 'Figure 275'},
        'ssvid': {'type': 'uint16', 'desc': 'Subsystem Vendor ID', 'spec': 'Figure 275'},
        'sn': {'type': 'string', 'desc': 'Serial Number', 'spec': 'Figure 275'},
        'mn': {'type': 'string', 'desc': 'Model Number', 'spec': 'Figure 275'},
        'fr': {'type': 'string', 'desc': 'Firmware Revision', 'spec': 'Figure 275'},
        'rab': {'type': 'uint8', 'desc': 'Recommended Arbitration Burst', 'spec': 'Figure 275'},
        'ieee': {'type': 'array', 'desc': 'IEEE OUI Identifier', 'spec': 'Figure 275'},
        
        # Controller Capabilities
        'cmic': {'type': 'uint8', 'desc': 'Controller Multi-Path I/O', 'spec': 'Figure 276'},
        'mdts': {'type': 'uint8', 'desc': 'Maximum Data Transfer Size', 'spec': 'Figure 276'},
        'cntlid': {'type': 'uint16', 'desc': 'Controller ID', 'spec': 'Figure 276'},
        'ver': {'type': 'uint32', 'desc': 'NVMe Version', 'spec': 'Figure 276'},
        'rtd3r': {'type': 'uint32', 'desc': 'RTD3 Resume Latency', 'spec': 'Figure 276'},
        'rtd3e': {'type': 'uint32', 'desc': 'RTD3 Entry Latency', 'spec': 'Figure 276'},
        'oaes': {'type': 'uint32', 'desc': 'Optional Async Events Supported', 'spec': 'Figure 276'},
        
        # Admin Command Set Attributes
        'oacs': {'type': 'uint16', 'desc': 'Optional Admin Command Support', 'spec': 'Figure 277'},
        'acl': {'type': 'uint8', 'desc': 'Abort Command Limit', 'spec': 'Figure 277'},
        'aerl': {'type': 'uint8', 'desc': 'Async Event Request Limit', 'spec': 'Figure 277'},
        'frmw': {'type': 'uint8', 'desc': 'Firmware Updates', 'spec': 'Figure 277'},
        'lpa': {'type': 'uint8', 'desc': 'Log Page Attributes', 'spec': 'Figure 277'},
        'elpe': {'type': 'uint8', 'desc': 'Error Log Page Entries', 'spec': 'Figure 277'},
        
        # Submission and Completion Queues
        'sqes': {'type': 'uint8', 'desc': 'Submission Queue Entry Size', 'spec': 'Figure 278'},
        'cqes': {'type': 'uint8', 'desc': 'Completion Queue Entry Size', 'spec': 'Figure 278'},
        'maxcmd': {'type': 'uint16', 'desc': 'Maximum Outstanding Commands', 'spec': 'Figure 278'},
        'nn': {'type': 'uint32', 'desc': 'Number of Namespaces', 'spec': 'Figure 278'},
        
        # NVM Command Set Attributes  
        'oncs': {'type': 'uint16', 'desc': 'Optional NVM Command Support', 'spec': 'Figure 279'},
        'fuses': {'type': 'uint16', 'desc': 'Fused Operation Support', 'spec': 'Figure 279'},
    }
    
    # NVMe 2.3 Identify Namespace mandatory fields
    NAMESPACE_MANDATORY_FIELDS = {
        'nsze': {'type': 'uint64', 'desc': 'Namespace Size', 'spec': 'Figure 281'},
        'ncap': {'type': 'uint64', 'desc': 'Namespace Capacity', 'spec': 'Figure 281'},
        'nuse': {'type': 'uint64', 'desc': 'Namespace Utilization', 'spec': 'Figure 281'},
        'nsfeat': {'type': 'uint8', 'desc': 'Namespace Features', 'spec': 'Figure 282'},
        'nlbaf': {'type': 'uint8', 'desc': 'Number of LBA Formats', 'spec': 'Figure 282'},
        'flbas': {'type': 'uint8', 'desc': 'Formatted LBA Size', 'spec': 'Figure 282'},
        'mc': {'type': 'uint8', 'desc': 'Metadata Capabilities', 'spec': 'Figure 282'},
        'dpc': {'type': 'uint8', 'desc': 'End-to-End Data Protection Capabilities', 'spec': 'Figure 282'},
        'dps': {'type': 'uint8', 'desc': 'End-to-End Data Protection Type Settings', 'spec': 'Figure 282'},
        'nmic': {'type': 'uint8', 'desc': 'Namespace Multi-path I/O', 'spec': 'Figure 282'},
        'rescap': {'type': 'uint8', 'desc': 'Reservation Capabilities', 'spec': 'Figure 282'},
        'lbaf': {'type': 'array', 'desc': 'LBA Format Support', 'spec': 'Figure 283'},
    }
    
    def __init__(self):
        self.discovery = NVMeDiscovery()
        self.has_nvme_cli = self.discovery.has_nvme_cli
        self.has_root = self.discovery.has_root
        self.has_sudo = self.discovery.has_sudo
        
    def _run_command(self, cmd: List[str], use_sudo: bool = False) -> Optional[str]:
        """Run command with appropriate permissions"""
        return self.discovery._run_command(cmd, use_sudo=use_sudo)
    
    def _validate_field_presence(self, data: Dict[str, Any], field_name: str, 
                                field_spec: Dict[str, str]) -> IdentifyFieldValidation:
        """Validate that a mandatory field is present and has expected characteristics"""
        validation = IdentifyFieldValidation(
            field_name=field_name,
            expected_type=field_spec['type'],
            actual_value=data.get(field_name),
            status='pass',
            spec_reference=field_spec['spec']
        )
        
        if field_name not in data:
            validation.status = 'fail'
            validation.message = f"Mandatory field '{field_name}' missing"
            return validation
        
        value = data[field_name]
        validation.actual_value = value
        
        # Type-specific validation
        if field_spec['type'] == 'string':
            if not isinstance(value, str):
                validation.status = 'fail'
                validation.message = f"Expected string, got {type(value).__name__}"
            elif len(value.strip()) == 0:
                validation.status = 'warning'
                validation.message = "String field is empty"
            elif len(value) > 40:  # NVMe string fields typically max 40 chars
                validation.status = 'warning'
                validation.message = f"String length {len(value)} exceeds typical limit"
                
        elif field_spec['type'] in ['uint8', 'uint16', 'uint32', 'uint64']:
            if not isinstance(value, int):
                validation.status = 'fail'
                validation.message = f"Expected integer, got {type(value).__name__}"
            else:
                # Check value ranges
                max_val = (2 ** int(field_spec['type'][4:])) - 1
                if value < 0 or value > max_val:
                    validation.status = 'fail'
                    validation.message = f"Value {value} out of range [0, {max_val}]"
                    
        elif field_spec['type'] == 'array':
            if not isinstance(value, (list, tuple)):
                validation.status = 'fail'
                validation.message = f"Expected array, got {type(value).__name__}"
        
        return validation
    
    def _validate_controller_specific_fields(self, data: Dict[str, Any]) -> List[IdentifyFieldValidation]:
        """Validate controller-specific field values and relationships"""
        validations = []
        
        # Validate NVMe version
        if 'ver' in data:
            version = data['ver']
            validation = IdentifyFieldValidation(
                field_name='ver',
                expected_type='uint32',
                actual_value=version,
                status='pass',
                spec_reference='Figure 276'
            )
            
            # Check for minimum version for PCIe 6.x compatibility
            if version < 0x10400:  # NVMe 1.4
                validation.status = 'warning'
                validation.message = f"NVMe version {version:#x} may have limited PCIe 6.x support"
            elif version >= 0x20000:  # NVMe 2.0+
                validation.status = 'pass'
                validation.message = f"NVMe version {version:#x} supports PCIe 6.x features"
            
            validations.append(validation)
        
        # Validate queue entry sizes
        for field, expected_size in [('sqes', 6), ('cqes', 4)]:  # 2^6=64 bytes SQ, 2^4=16 bytes CQ
            if field in data:
                value = data[field]
                validation = IdentifyFieldValidation(
                    field_name=field,
                    expected_type='uint8',
                    actual_value=value,
                    status='pass',
                    spec_reference='Figure 278'
                )
                
                min_size = (value >> 4) & 0x0F
                max_size = value & 0x0F
                
                if expected_size < min_size or expected_size > max_size:
                    validation.status = 'fail'
                    validation.message = f"Required size {expected_size} not in supported range [{min_size}, {max_size}]"
                elif min_size != expected_size or max_size != expected_size:
                    validation.status = 'warning'
                    validation.message = f"Variable size support [{min_size}, {max_size}], expected {expected_size}"
                
                validations.append(validation)
        
        # Validate optional admin command support (OACS)
        if 'oacs' in data:
            oacs = data['oacs']
            validation = IdentifyFieldValidation(
                field_name='oacs',
                expected_type='uint16',
                actual_value=oacs,
                status='pass',
                spec_reference='Figure 277'
            )
            
            features = []
            if oacs & 0x01:
                features.append("Security Send/Receive")
            if oacs & 0x02:
                features.append("Format NVM")
            if oacs & 0x04:
                features.append("Firmware Commit/Download")
            if oacs & 0x08:
                features.append("Namespace Management")
            if oacs & 0x10:
                features.append("Device Self-test")
            if oacs & 0x20:
                features.append("Directives")
            
            validation.message = f"Supported admin commands: {', '.join(features) if features else 'None'}"
            validations.append(validation)
        
        return validations
    
    def _validate_namespace_specific_fields(self, data: Dict[str, Any]) -> List[IdentifyFieldValidation]:
        """Validate namespace-specific field values and relationships"""
        validations = []
        
        # Validate capacity relationships
        nsze = data.get('nsze', 0)
        ncap = data.get('ncap', 0)
        nuse = data.get('nuse', 0)
        
        if nsze > 0:
            # NCAP <= NSZE
            validation = IdentifyFieldValidation(
                field_name='capacity_relationship',
                expected_type='relationship',
                actual_value=f"NSZE={nsze}, NCAP={ncap}, NUSE={nuse}",
                status='pass',
                spec_reference='Figure 281'
            )
            
            if ncap > nsze:
                validation.status = 'fail'
                validation.message = f"Namespace capacity ({ncap}) exceeds size ({nsze})"
            elif nuse > ncap:
                validation.status = 'fail' 
                validation.message = f"Namespace utilization ({nuse}) exceeds capacity ({ncap})"
            else:
                utilization_pct = (nuse / ncap * 100) if ncap > 0 else 0
                validation.message = f"Utilization: {utilization_pct:.1f}%"
                if utilization_pct > 95:
                    validation.status = 'warning'
                    validation.message += " (high utilization)"
            
            validations.append(validation)
        
        # Validate LBA formats
        if 'lbaf' in data and 'nlbaf' in data:
            lbaf = data['lbaf']
            nlbaf = data['nlbaf']
            
            validation = IdentifyFieldValidation(
                field_name='lba_formats',
                expected_type='array',
                actual_value=f"{nlbaf} formats",
                status='pass',
                spec_reference='Figure 283'
            )
            
            if len(lbaf) != nlbaf + 1:  # nlbaf is 0-based count
                validation.status = 'fail'
                validation.message = f"LBA format count mismatch: nlbaf={nlbaf}, array length={len(lbaf)}"
            else:
                # Check for common LBA sizes
                lba_sizes = []
                for i, fmt in enumerate(lbaf[:nlbaf + 1]):
                    lba_data_size = fmt.get('ds', 0)
                    lba_sizes.append(lba_data_size)
                
                common_sizes = [512, 4096]
                supported_common = [size for size in common_sizes if size in lba_sizes]
                
                if not supported_common:
                    validation.status = 'warning'
                    validation.message = f"No common LBA sizes supported. Available: {lba_sizes}"
                else:
                    validation.message = f"Supported LBA sizes: {lba_sizes}"
            
            validations.append(validation)
        
        return validations
    
    def validate_identify_controller(self, controller: NVMeController, 
                                   verbose: bool = False, 
                                   check_vendor_fields: bool = False) -> IdentifyValidationResult:
        """
        Validate Identify Controller structure
        
        Args:
            controller: Controller to validate
            verbose: Include detailed field analysis
            check_vendor_fields: Validate vendor-specific fields
        """
        result = IdentifyValidationResult(
            structure_name='controller',
            controller_device=controller.device,
            status='pass'
        )
        
        if not self.has_nvme_cli:
            result.status = 'fail'
            result.issues.append("nvme-cli required for identify structure validation")
            return result
        
        # Get identify controller data
        output = self._run_command(
            ['nvme', 'id-ctrl', controller.device_path, '-o', 'json'],
            use_sudo=True
        )
        
        if not output:
            result.status = 'fail'
            result.issues.append("Failed to retrieve identify controller data")
            return result
        
        try:
            identify_data = json.loads(output)
        except json.JSONDecodeError:
            result.status = 'fail'
            result.issues.append("Failed to parse identify controller JSON")
            return result
        
        # Validate mandatory fields
        for field_name, field_spec in self.CONTROLLER_MANDATORY_FIELDS.items():
            validation = self._validate_field_presence(identify_data, field_name, field_spec)
            result.field_validations.append(validation)
            
            if validation.status == 'fail':
                result.mandatory_fields[field_name] = 'missing'
                result.status = 'fail'
            elif validation.status == 'warning':
                result.mandatory_fields[field_name] = 'warning'
                if result.status == 'pass':
                    result.status = 'warning'
            else:
                result.mandatory_fields[field_name] = 'present'
        
        # Controller-specific validations
        controller_validations = self._validate_controller_specific_fields(identify_data)
        result.field_validations.extend(controller_validations)
        
        # Check for warnings/failures in specific validations
        for validation in controller_validations:
            if validation.status == 'fail':
                result.status = 'fail'
            elif validation.status == 'warning' and result.status == 'pass':
                result.status = 'warning'
        
        # PCIe 6.x compliance checks
        version = identify_data.get('ver', 0)
        oacs = identify_data.get('oacs', 0)
        oncs = identify_data.get('oncs', 0)
        
        result.spec_compliance = {
            'nvme_version': 'pass' if version >= 0x20000 else 'warning',
            'firmware_update': 'pass' if (oacs & 0x04) else 'not_supported',
            'namespace_management': 'pass' if (oacs & 0x08) else 'not_supported',
            'write_zeroes': 'pass' if (oncs & 0x08) else 'not_supported',
            'compare_write': 'pass' if (oncs & 0x01) else 'not_supported'
        }
        
        return result
    
    def validate_identify_namespace(self, controller: NVMeController, namespace_id: int,
                                  verbose: bool = False,
                                  check_vendor_fields: bool = False) -> IdentifyValidationResult:
        """
        Validate Identify Namespace structure
        
        Args:
            controller: Controller containing the namespace
            namespace_id: Namespace ID to validate
            verbose: Include detailed field analysis
            check_vendor_fields: Validate vendor-specific fields
        """
        result = IdentifyValidationResult(
            structure_name='namespace',
            controller_device=controller.device,
            namespace_id=namespace_id,
            status='pass'
        )
        
        if not self.has_nvme_cli:
            result.status = 'fail'
            result.issues.append("nvme-cli required for identify structure validation")
            return result
        
        # Get identify namespace data
        namespace_device = f"/dev/{controller.device}n{namespace_id}"
        output = self._run_command(
            ['nvme', 'id-ns', namespace_device, '-o', 'json'],
            use_sudo=True
        )
        
        if not output:
            result.status = 'fail'
            result.issues.append(f"Failed to retrieve identify namespace data for ns{namespace_id}")
            return result
        
        try:
            identify_data = json.loads(output)
        except json.JSONDecodeError:
            result.status = 'fail'
            result.issues.append("Failed to parse identify namespace JSON")
            return result
        
        # Validate mandatory fields
        for field_name, field_spec in self.NAMESPACE_MANDATORY_FIELDS.items():
            validation = self._validate_field_presence(identify_data, field_name, field_spec)
            result.field_validations.append(validation)
            
            if validation.status == 'fail':
                result.mandatory_fields[field_name] = 'missing'
                result.status = 'fail'
            elif validation.status == 'warning':
                result.mandatory_fields[field_name] = 'warning'
                if result.status == 'pass':
                    result.status = 'warning'
            else:
                result.mandatory_fields[field_name] = 'present'
        
        # Namespace-specific validations
        namespace_validations = self._validate_namespace_specific_fields(identify_data)
        result.field_validations.extend(namespace_validations)
        
        # Check for warnings/failures in specific validations
        for validation in namespace_validations:
            if validation.status == 'fail':
                result.status = 'fail'
            elif validation.status == 'warning' and result.status == 'pass':
                result.status = 'warning'
        
        # Namespace compliance checks
        nsfeat = identify_data.get('nsfeat', 0)
        dpc = identify_data.get('dpc', 0)
        rescap = identify_data.get('rescap', 0)
        
        result.spec_compliance = {
            'thin_provisioning': 'pass' if (nsfeat & 0x01) else 'not_supported',
            'deallocate_support': 'pass' if (nsfeat & 0x04) else 'not_supported',
            'data_protection': 'pass' if dpc > 0 else 'not_supported',
            'reservations': 'pass' if rescap > 0 else 'not_supported'
        }
        
        return result
    
    def run_identify_structure_validation_test(self, target_device: str = 'all',
                                             verbose: bool = False,
                                             check_vendor_fields: bool = False) -> Dict[str, Any]:
        """
        Run identify structure validation test on Atlas 3 downstream devices
        
        Args:
            target_device: 'all' or specific controller (e.g., 'nvme0')
            verbose: Include detailed field analysis
            check_vendor_fields: Validate vendor-specific fields
        """
        start_time = datetime.now()
        
        result = {
            'test_name': 'NVMe Identify Structure Validation',
            'status': 'pass',
            'timestamp': start_time.isoformat(),
            'target_device': target_device,
            'verbose': verbose,
            'check_vendor_fields': check_vendor_fields,
            'spec_version': 'NVMe 2.3 Base Specification',
            'pcie_compliance': 'PCIe 6.x',
            'safety_mode': 'Non-destructive read-only validation',
            'controller_results': [],
            'namespace_results': [],
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
            total_namespaces = 0
            passed_controllers = 0
            passed_namespaces = 0
            failed_controllers = 0
            failed_namespaces = 0
            warning_controllers = 0
            warning_namespaces = 0
            
            for controller in controllers:
                # Filter by target device if specified
                if target_device != 'all' and controller.device != target_device:
                    continue
                
                total_controllers += 1
                
                # Validate controller identify structure
                ctrl_result = self.validate_identify_controller(
                    controller, verbose, check_vendor_fields
                )
                
                result['controller_results'].append({
                    'controller': controller.device,
                    'model': controller.model,
                    'pci_address': controller.pci_address,
                    'status': ctrl_result.status,
                    'mandatory_fields': ctrl_result.mandatory_fields,
                    'field_validations': [
                        {
                            'field_name': v.field_name,
                            'status': v.status,
                            'message': v.message,
                            'actual_value': str(v.actual_value)[:100],  # Truncate long values
                            'spec_reference': v.spec_reference
                        }
                        for v in ctrl_result.field_validations
                    ],
                    'spec_compliance': ctrl_result.spec_compliance,
                    'issues': ctrl_result.issues,
                    'warnings': ctrl_result.warnings
                })
                
                # Update controller counters
                if ctrl_result.status == 'pass':
                    passed_controllers += 1
                elif ctrl_result.status == 'fail':
                    failed_controllers += 1
                else:
                    warning_controllers += 1
                
                # Validate namespace identify structures
                for namespace in controller.namespaces:
                    total_namespaces += 1
                    
                    ns_result = self.validate_identify_namespace(
                        controller, namespace.namespace_id, verbose, check_vendor_fields
                    )
                    
                    result['namespace_results'].append({
                        'controller': controller.device,
                        'namespace_id': namespace.namespace_id,
                        'device_path': namespace.device_path,
                        'status': ns_result.status,
                        'mandatory_fields': ns_result.mandatory_fields,
                        'field_validations': [
                            {
                                'field_name': v.field_name,
                                'status': v.status,
                                'message': v.message,
                                'actual_value': str(v.actual_value)[:100],
                                'spec_reference': v.spec_reference
                            }
                            for v in ns_result.field_validations
                        ],
                        'spec_compliance': ns_result.spec_compliance,
                        'issues': ns_result.issues,
                        'warnings': ns_result.warnings
                    })
                    
                    # Update namespace counters
                    if ns_result.status == 'pass':
                        passed_namespaces += 1
                    elif ns_result.status == 'fail':
                        failed_namespaces += 1
                    else:
                        warning_namespaces += 1
            
            # Generate overall summary
            result['summary'] = {
                'controllers': {
                    'total': total_controllers,
                    'passed': passed_controllers,
                    'warnings': warning_controllers,
                    'failed': failed_controllers,
                    'pass_rate': (passed_controllers / max(total_controllers, 1)) * 100
                },
                'namespaces': {
                    'total': total_namespaces,
                    'passed': passed_namespaces,
                    'warnings': warning_namespaces,
                    'failed': failed_namespaces,
                    'pass_rate': (passed_namespaces / max(total_namespaces, 1)) * 100
                }
            }
            
            # Determine overall status
            if failed_controllers > 0 or failed_namespaces > 0:
                result['status'] = 'fail'
            elif warning_controllers > 0 or warning_namespaces > 0:
                result['status'] = 'warning'
            
            # Add general warnings
            if not self.has_nvme_cli:
                result['errors'].append("nvme-cli not installed - install with: sudo apt install nvme-cli")
                result['status'] = 'fail'
            
            if total_controllers == 0:
                result['warnings'].append("No controllers found matching criteria")
                result['status'] = 'warning'
        
        except Exception as e:
            logger.error(f"Identify structure validation test failed: {e}")
            result['status'] = 'error'
            result['errors'].append(f"Test exception: {str(e)}")
        
        end_time = datetime.now()
        result['duration_ms'] = int((end_time - start_time).total_seconds() * 1000)
        
        return result


if __name__ == '__main__':
    # Test the identify structure validation module
    logging.basicConfig(level=logging.INFO)
    
    validator = IdentifyStructureValidator()
    test_result = validator.run_identify_structure_validation_test(
        target_device='all',
        verbose=True,
        check_vendor_fields=False
    )
    
    print(f"\n{'=' * 60}")
    print(f"NVMe Identify Structure Validation Test Results")
    print(f"{'=' * 60}")
    print(f"Status: {test_result['status'].upper()}")
    print(f"Duration: {test_result['duration_ms']}ms")
    print(f"Safety Mode: {test_result['safety_mode']}")
    
    summary = test_result.get('summary', {})
    if summary:
        print(f"\nSummary:")
        ctrl_summary = summary['controllers']
        ns_summary = summary['namespaces']
        print(f"  Controllers: {ctrl_summary['passed']}/{ctrl_summary['total']} passed ({ctrl_summary['pass_rate']:.1f}%)")
        print(f"  Namespaces: {ns_summary['passed']}/{ns_summary['total']} passed ({ns_summary['pass_rate']:.1f}%)")
    
    if test_result.get('controller_results'):
        print(f"\nController Results:")
        for ctrl_result in test_result['controller_results']:
            print(f"  {ctrl_result['controller']}: {ctrl_result['status'].upper()}")
            
            field_counts = {}
            for validation in ctrl_result['field_validations']:
                status = validation['status']
                field_counts[status] = field_counts.get(status, 0) + 1
            
            if field_counts:
                status_str = ", ".join([f"{count} {status}" for status, count in field_counts.items()])
                print(f"    Field validation: {status_str}")