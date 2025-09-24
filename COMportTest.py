#!/usr/bin/env python3
"""
Port Debug Tool for CalypsoPy+
Run this separately to debug port detection issues
"""

import serial
import serial.tools.list_ports
import sys


def test_port_detection():
    """Test port detection methods"""
    print("=" * 60)
    print("CalypsoPy+ Port Detection Debug Tool")
    print("=" * 60)

    # Method 1: Using serial.tools.list_ports.comports()
    print("\n1. Using serial.tools.list_ports.comports():")
    try:
        ports = serial.tools.list_ports.comports()
        print(f"   Found {len(ports)} ports")
        for i, port in enumerate(ports):
            print(f"   Port {i + 1}:")
            print(f"     Device: {port.device}")
            print(f"     Description: {port.description}")
            print(f"     HWID: {port.hwid}")
            print(f"     Manufacturer: {getattr(port, 'manufacturer', 'N/A')}")
            print(f"     Product: {getattr(port, 'product', 'N/A')}")
            print(f"     Serial Number: {getattr(port, 'serial_number', 'N/A')}")
            print(f"     VID: {getattr(port, 'vid', 'N/A')}")
            print(f"     PID: {getattr(port, 'pid', 'N/A')}")
            print()
    except Exception as e:
        print(f"   Error: {e}")

    # Method 2: Manual COM port testing (Windows)
    print("2. Manual COM Port Testing (COM1-COM20):")
    working_ports = []
    for i in range(1, 21):
        com_port = f"COM{i}"
        try:
            # Try to open the port briefly
            with serial.Serial(com_port, baudrate=9600, timeout=0.1):
                working_ports.append(com_port)
                print(f"   ✓ {com_port} - Available")
        except serial.SerialException:
            # Port doesn't exist or is in use
            pass
        except Exception as e:
            print(f"   ⚠ {com_port} - Error: {e}")

    if working_ports:
        print(f"   Found {len(working_ports)} working COM ports: {', '.join(working_ports)}")
    else:
        print("   No working COM ports found")

    # Method 3: Test specific ports if provided
    if len(sys.argv) > 1:
        test_ports = sys.argv[1:]
        print(f"\n3. Testing specific ports: {', '.join(test_ports)}")
        for port in test_ports:
            try:
                with serial.Serial(port, baudrate=115200, timeout=1.0) as ser:
                    print(f"   ✓ {port} - Successfully opened")
                    print(f"     Baudrate: {ser.baudrate}")
                    print(f"     Timeout: {ser.timeout}")
                    print(f"     Is Open: {ser.is_open}")
            except Exception as e:
                print(f"   ✗ {port} - Failed: {e}")

    print("\n" + "=" * 60)
    print("Debug complete. If you see available ports above but CalypsoPy+ doesn't")
    print("detect them, there may be a permission or driver issue.")
    print("=" * 60)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--help':
        print("Usage: python port_debug_tool.py [COM1] [COM2] ...")
        print("Example: python port_debug_tool.py COM3 COM4")
        sys.exit(0)

    test_port_detection()