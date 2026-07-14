#!/usr/bin/env python3
"""
MasterDnsVPN UDP Port 53 DNS Tunnel Core / Firewall
Listens on UDP Port 53, sniffs subdomains to authenticate and authorize users,
tracks real-time bandwidth consumption, and forwards valid packets to the local tunnel backend.
Highly optimized for low-resource servers (1GB RAM).
"""

import socket
import sqlite3
import sys
import os
import time
import threading
import logging

# Configurable constants
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 53
BACKEND_DNS_HOST = "127.0.0.1"
BACKEND_DNS_PORT = 5353       # Port where the real DNS Tunneling daemon (e.g., dnstt-server) runs
FALLBACK_DNS_HOST = "1.1.1.1" # Standard resolver for non-tunnel DNS queries
FALLBACK_DNS_PORT = 53
DB_FILE = "users.db"
KEY_FILE = "encrypt_key.txt"
FLUSH_INTERVAL_SEC = 5.0      # SQLite batch update frequency

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("dns_core")

# Global variables for batch-accounting
pending_traffic = {}
traffic_lock = threading.Lock()

def init_db():
    """Ensures SQLite is initialized and in WAL mode for safe concurrent access."""
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10.0)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subdomain TEXT UNIQUE NOT NULL,
                limit_mb INTEGER NOT NULL,
                used_mb INTEGER DEFAULT 0 NOT NULL,
                is_active BOOLEAN DEFAULT 1 NOT NULL
            )
        """)
        # Set WAL mode for concurrent write/read access without locking
        cursor.execute("PRAGMA journal_mode=WAL")
        conn.commit()
        conn.close()
        logger.info("SQLite Database initialized and configured in WAL mode.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

def load_encryption_key() -> str:
    """Loads local encryption key if present."""
    if os.path.exists(KEY_FILE):
        try:
            with open(KEY_FILE, "r") as f:
                key = f.read().strip()
                logger.info(f"Loaded local cryptographic key: {key[:4]}...{key[-4:]}")
                return key
        except Exception as e:
            logger.error(f"Error reading encryption key file: {e}")
    else:
        logger.warning(f"No encryption key found at {KEY_FILE}. Running without crypto validation.")
    return ""

def check_user_access(subdomain: str) -> tuple[bool, str]:
    """Queries SQLite to check if a subdomain is registered, active, and within limit."""
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10.0)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT limit_mb, used_mb, is_active FROM users WHERE subdomain = ?",
            (subdomain.lower(),)
        )
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return False, "Not a registered client subdomain"
        
        limit_mb, used_mb, is_active = row
        if not is_active:
            return False, "Account suspended/disabled"
        if used_mb >= limit_mb:
            return False, f"Bandwidth limit exceeded ({used_mb:.2f}MB / {limit_mb}MB)"
            
        return True, "Access granted"
    except Exception as e:
        logger.error(f"Database lookup error: {e}")
        return False, f"Internal database error: {e}"

def flush_traffic_worker():
    """Background thread to flush accumulated traffic to SQLite periodically."""
    while True:
        time.sleep(FLUSH_INTERVAL_SEC)
        updates = {}
        with traffic_lock:
            if pending_traffic:
                updates = pending_traffic.copy()
                pending_traffic.clear()
        
        if not updates:
            continue
            
        try:
            conn = sqlite3.connect(DB_FILE, timeout=10.0)
            cursor = conn.cursor()
            for subdomain, bytes_count in updates.items():
                mb_count = bytes_count / (1024.0 * 1024.0)
                cursor.execute(
                    "UPDATE users SET used_mb = used_mb + ? WHERE subdomain = ?",
                    (mb_count, subdomain)
                )
            conn.commit()
            conn.close()
            logger.info(f"Flushed DNS batch stats for {len(updates)} clients.")
        except Exception as e:
            logger.error(f"Error flushing traffic stats to SQLite: {e}")

def parse_qname(data: bytes, offset: int = 12) -> tuple[str, int]:
    """Parses DNS query QNAME (domain name) from raw DNS bytes."""
    labels = []
    curr = offset
    try:
        while curr < len(data):
            length = data[curr]
            if length == 0:
                curr += 1
                break
            if (length & 0xC0) == 0xC0: # Compressed label pointer
                curr += 2
                break
            curr += 1
            if curr + length > len(data):
                break
            label = data[curr:curr+length].decode('utf-8', errors='ignore')
            labels.append(label)
            curr += length
    except Exception:
        pass
    return ".".join(labels).lower(), curr

def extract_client_subdomain(qname: str) -> str | None:
    """
    Extracts the registered user subdomain from the queried domain name.
    Example:
      QNAME: 'v25-encoded-payload.user1.net.abrpars.filegear-sg.me'
      Result: 'user1.net.abrpars.filegear-sg.me'
    """
    base_domain = "net.abrpars.filegear-sg.me"
    if not qname.endswith(base_domain):
        return None
        
    # Split the qname into parts
    parts = qname.split(".")
    base_parts = base_domain.split(".")
    
    # We want to isolate '<username>.net.abrpars.filegear-sg.me'
    # By counting parts from the right
    n_base = len(base_parts)
    if len(parts) < n_base + 1:
        return None
        
    # The username label is immediately to the left of the base domain
    username_index = len(parts) - n_base - 1
    username = parts[username_index]
    
    return f"{username}.{base_domain}"

def main():
    init_db()
    key = load_encryption_key()
    
    # Start periodic stats database flusher
    flusher = threading.Thread(target=flush_traffic_worker, daemon=True)
    flusher.start()
    
    # Bind socket to UDP Port 53
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.bind((LISTEN_HOST, LISTEN_PORT))
    except Exception as e:
        logger.error(f"CRITICAL: Failed to bind to {LISTEN_HOST}:{LISTEN_PORT}. Is another DNS server running? {e}")
        sys.exit(1)
        
    logger.info(f"=== DNS Tunnel Core / Firewall Started ===")
    logger.info(f"Listening on UDP {LISTEN_HOST}:{LISTEN_PORT}")
    logger.info(f"Forwarding authorized tunnel lines to: {BACKEND_DNS_HOST}:{BACKEND_DNS_PORT}")
    logger.info(f"Forwarding normal queries to fallback resolver: {FALLBACK_DNS_HOST}:{FALLBACK_DNS_PORT}")
    
    # Upstream communication socket
    forward_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    forward_sock.settimeout(2.5)
    
    while True:
        try:
            data, addr = sock.recvfrom(4096)
            if len(data) < 12:
                continue # Malformed DNS packet
                
            qname, _ = parse_qname(data)
            if not qname:
                continue
                
            subdomain = extract_client_subdomain(qname)
            
            if subdomain:
                # Tunnel client query
                is_allowed, reason = check_user_access(subdomain)
                if is_allowed:
                    logger.debug(f"Authorized tunnel query from {addr} for {subdomain} (QNAME: {qname})")
                    
                    # Forward raw query to backend tunnel daemon
                    forward_sock.sendto(data, (BACKEND_DNS_HOST, BACKEND_DNS_PORT))
                    
                    try:
                        resp, _ = forward_sock.recvfrom(4096)
                        # Relay answer back to client
                        sock.sendto(resp, addr)
                        
                        # Account for bandwidth (request + response)
                        total_bytes = len(data) + len(resp)
                        with traffic_lock:
                            pending_traffic[subdomain] = pending_traffic.get(subdomain, 0) + total_bytes
                    except socket.timeout:
                        logger.warning(f"Timeout waiting for backend tunnel response on {BACKEND_DNS_HOST}:{BACKEND_DNS_PORT}")
                else:
                    logger.warning(f"Blocked tunnel query from {addr} for {subdomain}: {reason}")
                    # Silently ignore or forward to fallback to keep connection disguised?
                    # Let's send NXDOMAIN (Name Error) response so the client knows it's rejected
                    # DNS Header: QR=1, AA=1, RCODE=3 (NXDomain)
                    if len(data) >= 2:
                        tx_id = data[0:2]
                        # Create a basic NXDomain response header
                        # Flags: Standard query response, Authoritative, Name error (0x8183)
                        flags = b'\x81\x83'
                        # Copy Questions, Answer RRs, Authority RRs, Additional RRs from request
                        qd_count = data[4:6]
                        an_count = b'\x00\x00'
                        ns_count = b'\x00\x00'
                        ar_count = b'\x00\x00'
                        # Assemble DNS header + Question section
                        # The question section starts at byte 12 and ends after the QNAME + QTYPE (2B) + QCLASS (2B)
                        _, qname_end = parse_qname(data)
                        question_section = data[12:qname_end + 4]
                        nx_resp = tx_id + flags + qd_count + an_count + ns_count + ar_count + question_section
                        sock.sendto(nx_resp, addr)
            else:
                # Normal/standard DNS query. Forward to Fallback DNS (Cloudflare/Google)
                # This ensures the server functions like a real, helpful DNS resolver for other domains
                forward_sock.sendto(data, (FALLBACK_DNS_HOST, FALLBACK_DNS_PORT))
                try:
                    resp, _ = forward_sock.recvfrom(4096)
                    sock.sendto(resp, addr)
                except socket.timeout:
                    pass
                    
        except KeyboardInterrupt:
            logger.info("Shutting down DNS core.")
            break
        except Exception as e:
            logger.error(f"Error processing packet: {e}")

if __name__ == "__main__":
    main()
