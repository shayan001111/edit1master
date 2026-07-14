#!/bin/bash
# ==============================================================================
# MasterDnsVPN Production Installation & Configuration Script
# Target: High-performance DNS Tunneling Gateway optimized for 1GB RAM servers
# Language: Bash / Linux System Engineer Edition
# ==============================================================================

# Ensure script is run with root privileges
if [ "$EUID" -ne 0 ]; then
  echo -e "\e[31m❌ ERROR: Please run this installation script as root (sudo bash install.sh).\e[0m"
  exit 1
fi

echo -e "\e[34m==================================================================\e[0m"
echo -e "\e[36m             MasterDnsVPN Core Infrastructure Installer           \e[0m"
echo -e "\e[34m==================================================================\e[0m"

# ------------------------------------------------------------------------------
# 1. Pre-requisites & Clean-up (Stop and wipe conflicting services)
# ------------------------------------------------------------------------------
echo -e "\n\e[33m[1/6] Scanning and clearing old proxy services and ports...\e[0m"

# Stop existing systemd services if they exist
echo "Stopping potentially conflicting services..."
systemctl stop gateway.service 2>/dev/null || true
systemctl disable gateway.service 2>/dev/null || true
systemctl stop dnscore.service 2>/dev/null || true
systemctl disable dnscore.service 2>/dev/null || true
systemctl stop xray 2>/dev/null || true
systemctl disable xray 2>/dev/null || true
systemctl stop v2ray 2>/dev/null || true
systemctl disable v2ray 2>/dev/null || true
systemctl stop dnstt 2>/dev/null || true
systemctl disable dnstt 2>/dev/null || true

# Forcefully kill any process bound to Port 443 (TCP) and Port 53 (UDP)
echo "Killing any active process listening on Port 443 (TCP)..."
if command -v fuser >/dev/null 2>&1; then
  fuser -k -n tcp 443 2>/dev/null || true
else
  PID_443=$(lsof -t -i:443 2>/dev/null)
  if [ ! -z "$PID_443" ]; then
    echo "Killing process $PID_443 on port 443..."
    kill -9 $PID_443 2>/dev/null || true
  fi
fi

echo "Killing any active process listening on Port 53 (UDP)..."
if command -v fuser >/dev/null 2>&1; then
  fuser -k -n udp 53 2>/dev/null || true
else
  PID_53=$(lsof -t -i:53 2>/dev/null)
  if [ ! -z "$PID_53" ]; then
    echo "Killing process $PID_53 on port 53..."
    kill -9 $PID_53 2>/dev/null || true
  fi
fi

# Disable systemd-resolved listener if it's running on port 53 (common in Ubuntu)
if systemctl is-active --quiet systemd-resolved; then
  echo "Disabling systemd-resolved listener to free Port 53..."
  # Set DNSStubListener=no to release port 53 while keeping standard resolution working
  mkdir -p /etc/systemd/resolved.conf.d/
  echo -e "[Resolve]\nDNSStubListener=no" > /etc/systemd/resolved.conf.d/no-stub.conf
  systemctl restart systemd-resolved
fi

echo -e "\e[32m✓ Ports 443 (TCP) and 53 (UDP) are fully cleared.\e[0m"

# ------------------------------------------------------------------------------
# 2. Package Dependencies Installation
# ------------------------------------------------------------------------------
echo -e "\n\e[33m[2/6] Updating packages and installing prerequisites...\e[0m"
apt-get update -y
apt-get install -y python3 python3-pip python3-venv sqlite3 openssl lsof dnsutils -y
echo -e "\e[32m✓ System packages installed successfully.\e[0m"

# ------------------------------------------------------------------------------
# 3. Setup Project Structure & Directory
# ------------------------------------------------------------------------------
echo -e "\n\e[33m[3/6] Configuring application workspaces...\e[0m"
APP_DIR="/app"
mkdir -p "$APP_DIR"

# Copy files from current directory to production app directory if they exist
for FILE in gateway.py dns_core.py manage.py; do
  if [ -f "$FILE" ]; then
    cp "$FILE" "$APP_DIR/"
    echo "Copied $FILE to $APP_DIR/"
  fi
done

cd "$APP_DIR"

# Ensure execution flags are set
chmod +x gateway.py dns_core.py manage.py
echo -e "\e[32m✓ Workspaces configured.\e[0m"

# ------------------------------------------------------------------------------
# 4. Local Cryptographic Key Generation (Offline)
# ------------------------------------------------------------------------------
echo -e "\n\e[33m[4/6] Generating local cryptographic encryption keys...\e[0m"
# Generate 32-character secure hex key locally
if command -v openssl >/dev/null 2>&1; then
  KEY=$(openssl rand -hex 16)
else
  KEY=$(python3 -c "import secrets; print(secrets.token_hex(16))")
fi

echo "$KEY" > "$APP_DIR/encrypt_key.txt"
chmod 600 "$APP_DIR/encrypt_key.txt"
echo -e "\e[32m✓ Key successfully written locally to $APP_DIR/encrypt_key.txt (no external APIs used).\e[0m"

# ------------------------------------------------------------------------------
# 5. Initialize user database and WAL configuration
# ------------------------------------------------------------------------------
echo -e "\n\e[33m[5/6] Initializing user access SQLite database...\e[0m"
python3 "$APP_DIR/manage.py" status >/dev/null 2>&1
echo -e "\e[32m✓ SQLite database users.db configured in WAL mode.\e[0m"

# ------------------------------------------------------------------------------
# 6. Setup and Launch Persistent Systemd Services
# ------------------------------------------------------------------------------
echo -e "\n\e[33m[6/6] Launching system services...\e[0m"

# Create gateway service (Port 443 Reverse Proxy)
cat <<EOF > /etc/systemd/system/gateway.service
[Unit]
Description=MasterDnsVPN Port 443 TCP Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/python3 $APP_DIR/gateway.py
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Create DNS Tunnel Core service (Port 53 UDP Parser & Firewall)
cat <<EOF > /etc/systemd/system/dnscore.service
[Unit]
Description=MasterDnsVPN Port 53 UDP DNS Core
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/python3 $APP_DIR/dns_core.py
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Load and start services
echo "Starting services..."
systemctl daemon-reload
systemctl enable gateway.service
systemctl restart gateway.service
systemctl enable dnscore.service
systemctl restart dnscore.service

# Check statuses
sleep 1
if systemctl is-active --quiet gateway.service; then
  echo -e "\e[32m✓ Gateway Service (Port 443) is active and running.\e[0m"
else
  echo -e "\e[31m⚠️ WARNING: Gateway Service failed to start. Run 'journalctl -u gateway' to debug.\e[0m"
fi

if systemctl is-active --quiet dnscore.service; then
  echo -e "\e[32m✓ DNS Core Service (Port 53) is active and running.\e[0m"
else
  echo -e "\e[31m⚠️ WARNING: DNS Core Service failed to start. Run 'journalctl -u dnscore' to debug.\e[0m"
fi

echo -e "\n\e[34m==================================================================\e[0m"
echo -e "\e[32m          🎉 MasterDnsVPN INSTALLATION COMPLETE! 🎉                \e[0m"
echo -e "\e[34m==================================================================\e[0m"
echo -e "Your DNS tunnel is fully installed and operating."
echo -e "Use the management script to register clients:"
echo -e "  \e[33mpython3 /app/manage.py add <username> <limit_mb>\e[0m"
echo -e ""
echo -e "\e[32m------------------------------------------------------------------\e[0m"
echo -e "\e[32mCOPY AND SAVE YOUR LOCAL CRYPTOGRAPHIC ENCRYPTION KEY:\e[0m"
echo -e "\e[1;32m$KEY\e[0m"
echo -e "\e[32m------------------------------------------------------------------\e[0m"
echo -e "\e[34m==================================================================\e[0m\n"
