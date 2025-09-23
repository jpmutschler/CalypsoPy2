#!/usr/bin/env python3
"""
CalypsoPy+ Quick Start Script
Automatically sets up and runs the server with network access
"""

import os
import sys
import socket
import subprocess
import webbrowser
from pathlib import Path


def get_local_ip():
    """Get the local IP address"""
    try:
        # Connect to a remote server to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"


def check_dependencies():
    """Check if required dependencies are installed"""
    required_packages = [
        'flask',
        'flask_socketio',
        'serial',
        'eventlet'
    ]

    missing_packages = []
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)

    if missing_packages:
        print("❌ Missing required packages:")
        for package in missing_packages:
            print(f"   - {package}")
        print("\n📦 Installing missing packages...")

        try:
            subprocess.check_call([
                sys.executable, "-m", "pip", "install",
                "Flask==3.0.0",
                "Flask-SocketIO==5.3.6",
                "pyserial==3.5",
                "python-socketio==5.9.0",
                "eventlet==0.33.3"
            ])
            print("✅ Dependencies installed successfully!")
        except subprocess.CalledProcessError:
            print("❌ Failed to install dependencies. Please install manually:")
            print("pip install Flask Flask-SocketIO pyserial eventlet")
            return False

    return True


def create_directory_structure():
    """Create necessary directories"""
    directories = ['templates', 'logs', 'static']

    for directory in directories:
        Path(directory).mkdir(exist_ok=True)

    print("✅ Directory structure created")


def check_files():
    """Check if required files exist"""
    required_files = {
        'app.py': 'CalypsoPy+ server file',
        'templates/index.html': 'Web interface template'
    }

    missing_files = []
    for file_path, description in required_files.items():
        if not Path(file_path).exists():
            missing_files.append((file_path, description))

    if missing_files:
        print("❌ Missing required files:")
        for file_path, description in missing_files:
            print(f"   - {file_path} ({description})")
        print("\n📝 Please ensure all files are in place before running.")
        return False

    return True


def display_network_info():
    """Display network access information"""
    local_ip = get_local_ip()

    print("\n" + "=" * 60)
    print("🚀 CalypsoPy+ by Serial Cables")
    print("Professional Hardware Development Interface")
    print("=" * 60)
    print(f"🌐 Local Access:     http://localhost:5000")
    print(f"🌐 Network Access:   http://{local_ip}:5000")
    print(f"📱 Mobile Access:    http://{local_ip}:5000")
    print("=" * 60)
    print("📊 Available Dashboards:")
    print("   • Device Connection & Port Management")
    print("   • Device Information & Identification")
    print("   • Link Status & Communication Quality")
    print("   • Port Configuration & Serial Settings")
    print("   • I2C/I3C Interface & Communication")
    print("   • Advanced Diagnostics & Register Access")
    print("   • System Resets & Recovery Operations")
    print("   • Firmware Updates & Version Management")
    print("   • Analytics & Performance Metrics")
    print("=" * 60)
    print("🔧 Quick Tips:")
    print("   • Use Ctrl+1-9 for dashboard shortcuts")
    print("   • Press Escape to clear command inputs")
    print("   • Right-click preset buttons for descriptions")
    print("   • Check console (F12) for debug information")
    print("=" * 60)


def main():
    """Main setup and start function"""
    print("🔧 CalypsoPy+ Quick Start Setup")
    print("-" * 40)

    # Check dependencies
    print("📦 Checking dependencies...")
    if not check_dependencies():
        sys.exit(1)

    # Create directory structure
    print("📁 Creating directory structure...")
    create_directory_structure()

    # Check required files
    print("📝 Checking required files...")
    if not check_files():
        sys.exit(1)

    # Display network information
    display_network_info()

    # Ask user if they want to start the server
    try:
        response = input("\n🚀 Start CalypsoPy+ server? (Y/n): ").strip().lower()
        if response in ['', 'y', 'yes']:
            print("\n⚡ Starting CalypsoPy+ server...")

            # Try to open browser
            local_ip = get_local_ip()
            try:
                webbrowser.open(f'http://{local_ip}:5000')
                print(f"🌐 Opening browser to http://{local_ip}:5000")
            except:
                print("🌐 Please manually open your browser and navigate to the URL above")

            # Import and run the main application
            try:
                from app import socketio, app
                print("\n✅ CalypsoPy+ server is now running!")
                print("   Press Ctrl+C to stop the server")
                print("-" * 60)

                socketio.run(
                    app,
                    host='0.0.0.0',
                    port=5000,
                    debug=False,
                    use_reloader=False,
                    allow_unsafe_werkzeug=True
                )
            except ImportError as e:
                print(f"❌ Error importing app.py: {e}")
                print("   Please ensure app.py is in the current directory")
                sys.exit(1)
            except Exception as e:
                print(f"❌ Error starting server: {e}")
                sys.exit(1)
        else:
            print("👋 Setup complete! Run 'python app.py' when ready to start.")

    except KeyboardInterrupt:
        print("\n👋 Setup cancelled.")
        sys.exit(0)


if __name__ == "__main__":
    main()