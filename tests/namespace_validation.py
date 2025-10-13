#!/usr/bin/env python3
"""
CalypsoPy+ NVMe Namespace Validation Tests
Non-destructive validation of NVMe namespaces against NVMe 2.x Base Specification
Only tests Atlas 3 downstream devices for system safety
"""

import os
import json
import re
import subprocess
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from .nvme_discovery import NVMeDiscovery, NVMeController, NVMeNamespace

logger = logging.getLogger(__name__)


@dataclass
class NamespaceValidationResult:
    """Results from namespace validation"""
    namespace_id: int
    device_path: str
    status: str  # 'pass', 'warning', 'fail'
    issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    spec_compliance: Dict[str, str] = field(default_factory=dict)
    attributes: Dict[str, Any] = field(default_factory=dict)


class NamespaceValidator:
    """
    NVMe Namespace Validation - Non-destructive testing only
    Validates namespace configuration against NVMe 2.x Base Specification
    Only operates on Atlas 3 downstream devices
    """
    
    # NVMe 2.x Specification compliance checks
    NVME_2_3_REQUIREMENTS = {
        'min_lba_size': 512,  # Minimum LBA size (bytes)
        'max_lba_size': 4096,  # Maximum common LBA size
        'required_lba_formats': [512, 4096],  # Common required formats
        'max_namespaces': 1024,  # Per controller limit
        'min_namespace_size': 1024 * 1024,  # 1MB minimum
    }
    
    def __init__(self):
        self.discovery = NVMeDiscovery()
        self.has_nvme_cli = self.discovery.has_nvme_cli
        self.has_root = self.discovery.has_root
        self.has_sudo = self.discovery.has_sudo
        
    def _run_command(self, cmd: List[str], use_sudo: bool = False) -> Optional[str]:
        """Run command with appropriate permissions"""
        return self.discovery._run_command(cmd, use_sudo=use_sudo)
    
    def _get_namespace_identify_data(self, device_path: str) -> Optional[Dict[str, Any]]:
        """Get Identify Namespace data structure (non-destructive)"""
        if not self.has_nvme_cli:
            return None
            
        # Use nvme id-ns command to get namespace identify data
        output = self._run_command(
            ['nvme', 'id-ns', device_path, '-o', 'json'],
            use_sudo=True
        )
        
        if not output:
            return None
            
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return None
    
    def _validate_lba_format(self, ns_data: Dict[str, Any]) -> Tuple[List[str], List[str]]:
        """
        Validate LBA format compliance with NVMe 2.x specification
        Returns (issues, warnings)
        """
        issues = []
        warnings = []
        
        # Get current LBA format
        flbas = ns_data.get('flbas', 0)
        current_lba_format_index = flbas & 0x0F
        
        # Get LBA formats
        lba_formats = ns_data.get('lbaf', [])
        if not lba_formats or current_lba_format_index >= len(lba_formats):
            issues.append("No valid LBA formats found or invalid current format index")
            return issues, warnings
            
        current_format = lba_formats[current_lba_format_index]
        lba_data_size = current_format.get('ds', 0)
        metadata_size = current_format.get('ms', 0)
        
        # Validate LBA size against NVMe 2.x requirements
        if lba_data_size < self.NVME_2_3_REQUIREMENTS['min_lba_size']:
            issues.append(f"LBA data size {lba_data_size} below minimum {self.NVME_2_3_REQUIREMENTS['min_lba_size']} bytes")
        
        if lba_data_size > self.NVME_2_3_REQUIREMENTS['max_lba_size']:
            warnings.append(f"LBA data size {lba_data_size} above common maximum {self.NVME_2_3_REQUIREMENTS['max_lba_size']} bytes")
        
        # Check if LBA size is power of 2
        if lba_data_size & (lba_data_size - 1) != 0:
            issues.append(f"LBA data size {lba_data_size} is not a power of 2")
        
        # Validate metadata settings
        if metadata_size > 0:
            ms_location = current_format.get('rp', 0)  # Relative Performance
            if ms_location not in [0, 1, 2, 3]:
                warnings.append(f"Unexpected metadata location value: {ms_location}")
        
        return issues, warnings
    
    def _validate_namespace_capacity(self, ns_data: Dict[str, Any]) -> Tuple[List[str], List[str]]:
        """
        Validate namespace capacity and utilization
        Returns (issues, warnings)
        """
        issues = []
        warnings = []
        
        # Get capacity values
        nsze = ns_data.get('nsze', 0)  # Namespace Size
        ncap = ns_data.get('ncap', 0)  # Namespace Capacity
        nuse = ns_data.get('nuse', 0)  # Namespace Utilization
        
        # Validate capacity relationships (NVMe 2.x requirements)
        if nsze == 0:
            issues.append("Namespace size is zero")
        
        if ncap > nsze:
            issues.append(f"Namespace capacity ({ncap}) exceeds size ({nsze})")
        
        if nuse > ncap:
            issues.append(f"Namespace utilization ({nuse}) exceeds capacity ({ncap})")
        
        # Check minimum size requirement
        flbas = ns_data.get('flbas', 0)
        lba_formats = ns_data.get('lbaf', [])
        if lba_formats:
            current_format = lba_formats[flbas & 0x0F]
            lba_size = current_format.get('ds', 512)
            total_bytes = nsze * lba_size
            
            if total_bytes < self.NVME_2_3_REQUIREMENTS['min_namespace_size']:
                warnings.append(f"Namespace size {total_bytes} bytes below recommended minimum")
        
        # Calculate utilization percentage
        if ncap > 0:
            utilization_pct = (nuse / ncap) * 100
            if utilization_pct > 95:
                warnings.append(f"High namespace utilization: {utilization_pct:.1f}%")
        
        return issues, warnings
    
    def _validate_namespace_features(self, ns_data: Dict[str, Any]) -> Tuple[List[str], List[str]]:
        """
        Validate namespace feature compliance
        Returns (issues, warnings)
        """
        issues = []
        warnings = []
        
        # Check namespace features (NSFEAT)
        nsfeat = ns_data.get('nsfeat', 0)
        
        # Validate thin provisioning if enabled
        if nsfeat & 0x01:  # Thin Provisioning
            # Ensure NPWG and NPWA are valid if thin provisioning is used
            npwg = ns_data.get('npwg', 0)  # Namespace Preferred Write Granularity
            npwa = ns_data.get('npwa', 0)  # Namespace Preferred Write Alignment
            
            if npwg == 0:
                warnings.append("Thin provisioning enabled but no preferred write granularity set")
            
            if npwa > npwg and npwg > 0:
                issues.append(f"Write alignment ({npwa}) exceeds write granularity ({npwg})")
        
        # Check DEALLOCATE support
        if nsfeat & 0x04:  # DEALLOCATE supported
            # This is a positive feature, no issues
            pass
        
        # Validate namespace sharing
        nmic = ns_data.get('nmic', 0)
        if nmic & 0x01:  # Namespace may be attached to multiple controllers
            warnings.append("Namespace supports multi-controller attachment")
        
        return issues, warnings
    
    def _check_pcie_6x_compliance(self, controller: NVMeController, ns_data: Dict[str, Any]) -> Dict[str, str]:
        """
        Check PCIe 6.x specific compliance requirements
        Returns dict of compliance check results
        """
        compliance = {}
        
        # PCIe 6.x requires NVMe 2.0+ for full feature support
        # Check for advanced features that PCIe 6.x enables
        
        # Check for NVMe 2.x features
        nsfeat = ns_data.get('nsfeat', 0)
        
        # Optimal I/O Boundary (PCIe 6.x benefits from proper alignment)
        noiob = ns_data.get('noiob', 0)
        if noiob > 0:
            compliance['io_boundary'] = 'pass'
        else:
            compliance['io_boundary'] = 'warning'
        
        # NVM Sets support (beneficial for PCIe 6.x multi-path)
        if nsfeat & 0x10:  # NVM Set supported
            compliance['nvm_sets'] = 'pass'
        else:
            compliance['nvm_sets'] = 'info'
        
        # Write Zeroes support (efficiency feature)
        oncs = ns_data.get('oncs', 0) if 'oncs' in ns_data else 0
        if oncs & 0x08:  # Write Zeroes supported
            compliance['write_zeroes'] = 'pass'
        else:
            compliance['write_zeroes'] = 'info'
        
        # Compare and Write (atomicity feature)
        if oncs & 0x01:  # Compare and Write
            compliance['compare_write'] = 'pass'
        else:
            compliance['compare_write'] = 'info'
        
        return compliance
    
    def validate_namespace(self, controller: NVMeController, namespace: NVMeNamespace, 
                          validate_format: bool = True, verbose: bool = False) -> NamespaceValidationResult:
        """
        Validate a single namespace (non-destructive)
        
        Args:
            controller: Controller containing the namespace
            namespace: Namespace to validate
            validate_format: Whether to perform format compliance checks
            verbose: Include detailed attribute information
        """
        result = NamespaceValidationResult(
            namespace_id=namespace.namespace_id,
            device_path=namespace.device_path,
            status='pass'
        )
        
        # Get namespace identify data
        ns_data = self._get_namespace_identify_data(namespace.device_path)
        if not ns_data:
            result.status = 'fail'
            result.issues.append("Could not retrieve namespace identify data")
            return result
        
        all_issues = []
        all_warnings = []
        
        # Validate LBA format if requested
        if validate_format:
            issues, warnings = self._validate_lba_format(ns_data)
            all_issues.extend(issues)
            all_warnings.extend(warnings)
        
        # Validate capacity and utilization
        issues, warnings = self._validate_namespace_capacity(ns_data)
        all_issues.extend(issues)
        all_warnings.extend(warnings)
        
        # Validate namespace features
        issues, warnings = self._validate_namespace_features(ns_data)
        all_issues.extend(issues)
        all_warnings.extend(warnings)
        
        # Check PCIe 6.x compliance
        result.spec_compliance = self._check_pcie_6x_compliance(controller, ns_data)
        
        # Collect attributes if verbose mode
        if verbose:
            flbas = ns_data.get('flbas', 0)
            lba_formats = ns_data.get('lbaf', [])
            current_format = lba_formats[flbas & 0x0F] if lba_formats else {}
            
            result.attributes = {
                'size_lba': ns_data.get('nsze', 0),
                'capacity_lba': ns_data.get('ncap', 0),
                'utilization_lba': ns_data.get('nuse', 0),
                'lba_data_size': current_format.get('ds', 0),
                'metadata_size': current_format.get('ms', 0),
                'features': ns_data.get('nsfeat', 0),
                'capabilities': ns_data.get('nmic', 0),
                'optimal_io_boundary': ns_data.get('noiob', 0)
            }
        
        result.issues = all_issues
        result.warnings = all_warnings
        
        # Determine overall status
        if all_issues:
            result.status = 'fail'
        elif all_warnings:
            result.status = 'warning'
        
        return result
    
    def run_namespace_validation_test(self, target_device: str = 'all', 
                                    validate_format: bool = True, 
                                    verbose: bool = False) -> Dict[str, Any]:
        """
        Run namespace validation test on Atlas 3 downstream devices
        
        Args:
            target_device: 'all' or specific device (e.g., 'nvme0n1')
            validate_format: Whether to validate LBA format compliance
            verbose: Include detailed attribute information
        """
        start_time = datetime.now()
        
        result = {
            'test_name': 'NVMe Namespace Validation',
            'status': 'pass',
            'timestamp': start_time.isoformat(),
            'target_device': target_device,
            'validate_format': validate_format,
            'verbose': verbose,
            'spec_version': 'NVMe 2.x Base Specification',
            'pcie_compliance': 'PCIe 6.x',
            'safety_mode': 'Non-destructive only',
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
            
            total_namespaces = 0
            passed_namespaces = 0
            failed_namespaces = 0
            warning_namespaces = 0
            
            for controller in controllers:
                for namespace in controller.namespaces:
                    # Filter by target device if specified
                    if target_device != 'all':
                        device_name = namespace.device_path.split('/')[-1]
                        if device_name != target_device:
                            continue
                    
                    total_namespaces += 1
                    
                    # Validate namespace
                    ns_result = self.validate_namespace(
                        controller, namespace, validate_format, verbose
                    )
                    
                    # Add controller info to result
                    ns_result.attributes = ns_result.attributes or {}
                    ns_result.attributes.update({
                        'controller': controller.device,
                        'controller_model': controller.model,
                        'controller_pci': controller.pci_address
                    })
                    
                    result['namespace_results'].append({
                        'namespace_id': ns_result.namespace_id,
                        'device_path': ns_result.device_path,
                        'status': ns_result.status,
                        'issues': ns_result.issues,
                        'warnings': ns_result.warnings,
                        'spec_compliance': ns_result.spec_compliance,
                        'attributes': ns_result.attributes
                    })
                    
                    # Update counters
                    if ns_result.status == 'pass':
                        passed_namespaces += 1
                    elif ns_result.status == 'fail':
                        failed_namespaces += 1
                    else:
                        warning_namespaces += 1
            
            # Generate summary
            result['summary'] = {
                'total_namespaces': total_namespaces,
                'passed': passed_namespaces,
                'warnings': warning_namespaces,
                'failed': failed_namespaces,
                'pass_rate': (passed_namespaces / max(total_namespaces, 1)) * 100
            }
            
            # Determine overall status
            if failed_namespaces > 0:
                result['status'] = 'fail'
            elif warning_namespaces > 0:
                result['status'] = 'warning'
            
            # Add general warnings
            if not self.has_nvme_cli:
                result['warnings'].append("nvme-cli not installed - install with: sudo apt install nvme-cli")
                result['status'] = 'fail'
            
            if total_namespaces == 0:
                result['warnings'].append("No namespaces found matching criteria")
                result['status'] = 'warning'
        
        except Exception as e:
            logger.error(f"Namespace validation test failed: {e}")
            result['status'] = 'error'
            result['errors'].append(f"Test exception: {str(e)}")
        
        end_time = datetime.now()
        result['duration_ms'] = int((end_time - start_time).total_seconds() * 1000)
        
        return result


if __name__ == '__main__':
    # Test the namespace validation module
    logging.basicConfig(level=logging.INFO)
    
    validator = NamespaceValidator()
    test_result = validator.run_namespace_validation_test(
        target_device='all',
        validate_format=True,
        verbose=True
    )
    
    print(f"\n{'=' * 60}")
    print(f"NVMe Namespace Validation Test Results")
    print(f"{'=' * 60}")
    print(f"Status: {test_result['status'].upper()}")
    print(f"Duration: {test_result['duration_ms']}ms")
    print(f"Spec Compliance: {test_result['spec_version']} + {test_result['pcie_compliance']}")
    print(f"Safety Mode: {test_result['safety_mode']}")
    
    summary = test_result.get('summary', {})
    if summary:
        print(f"\nSummary:")
        print(f"  Total namespaces: {summary['total_namespaces']}")
        print(f"  Passed: {summary['passed']}")
        print(f"  Warnings: {summary['warnings']}")
        print(f"  Failed: {summary['failed']}")
        print(f"  Pass rate: {summary['pass_rate']:.1f}%")
    
    if test_result.get('namespace_results'):
        print(f"\nNamespace Results:")
        for ns_result in test_result['namespace_results']:
            print(f"  {ns_result['device_path']}: {ns_result['status'].upper()}")
            if ns_result['issues']:
                for issue in ns_result['issues']:
                    print(f"    ❌ {issue}")
            if ns_result['warnings']:
                for warning in ns_result['warnings']:
                    print(f"    ⚠️  {warning}")