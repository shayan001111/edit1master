#!/usr/bin/env python3
"""
MasterDnsVPN Lightweight TCP Gateway & Bandwidth Middleware
A highly optimized, asynchronous TCP reverse proxy designed for 1GB RAM servers.
Sniffs SNI from TLS Client Hello without decryption, checks SQLite DB, and batches traffic accounting.
"""

import asyncio
import sqlite3
import struct
import sys
import logging
import os
import time

# Configurable constants
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 443
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8080
DB_FILE = "users.db"
FLUSH_INTERVAL_SEC = 5.0  # Database batch update frequency
MAX_BUFFER_SIZE = 16384    # 16KB TCP buffer for optimal performance

# Set up clean logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("gateway")

# Global tracking variables for batch-accounting
# Structure: { subdomain: pending_bytes_to_flush }
pending_traffic = {}
traffic_lock = asyncio.Lock()

def init_db():
    """Initializes SQLite database and tables if they do not exist."""
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
        cursor.execute("PRAGMA journal_mode=WAL")
        conn.commit()
        conn.close()
        logger.info("SQLite Database initialized successfully in WAL mode.")
    except Exception as e:
        logger.error(f"Failed to initialize database in gateway.py: {e}")

def check_user_access_sync(subdomain: str) -> tuple[bool, str]:
    """
    Synchronously queries SQLite to check if a user is active and within limit.
    Runs inside a threadpool to keep the asyncio event loop fully non-blocking.
    """
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
            return False, "Subdomain not found in database"
        
        limit_mb, used_mb, is_active = row
        if not is_active:
            return False, "User account is suspended"
        if used_mb >= limit_mb:
            return False, f"Bandwidth limit exceeded ({used_mb:.2f}MB / {limit_mb}MB)"
            
        return True, "Access granted"
    except Exception as e:
        logger.error(f"Database error during access check: {e}")
        return False, "Internal database error"

def flush_traffic_sync(updates: dict):
    """Writes accumulated usage data to SQLite database in a single transaction."""
    if not updates:
        return
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10.0)
        cursor = conn.cursor()
        for subdomain, bytes_transferred in updates.items():
            mb_transferred = bytes_transferred / (1024 * 1024)
            cursor.execute(
                "UPDATE users SET used_mb = used_mb + ? WHERE subdomain = ?",
                (mb_transferred, subdomain)
            )
        conn.commit()
        conn.close()
        logger.debug(f"Flushed batch usage for {len(updates)} subdomains.")
    except Exception as e:
        logger.error(f"Failed to flush batch traffic stats to database: {e}")

async def periodic_db_flush():
    """Background task to flush accumulated traffic data to SQLite at intervals."""
    while True:
        await asyncio.sleep(FLUSH_INTERVAL_SEC)
        async with traffic_lock:
            if not pending_traffic:
                continue
            # Take a copy and clear the global dictionary for non-blocking writes
            updates_to_flush = pending_traffic.copy()
            pending_traffic.clear()
            
        # Run DB flush in executor so we don't block the async event loop
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, flush_traffic_sync, updates_to_flush)

def parse_sni(data: bytes) -> str | None:
    """
    Parses SNI (Server Name Indication) directly from raw TLS Client Hello bytes.
    Zero decrypts, zero certificate validation. Extremely fast.
    """
    try:
        if len(data) < 5:
            return None
        
        # 1. Validate TLS Record: Must be Handshake (0x16) and Version 3.x (0x03 0x01/02/03)
        if data[0] != 0x16 or data[1] != 0x03:
            return None
        
        record_len = int.from_bytes(data[3:5], byteorder='big')
        
        # 2. Validate Handshake Message: Must be Client Hello (0x01)
        if len(data) < 9 or data[5] != 0x01:
            return None
        
        # Handshake Header Length (3 bytes at indices 6, 7, 8)
        
        # 3. Skip Handshake Client Hello fields
        # Client Version (2 bytes) + Client Random (32 bytes) = 34 bytes starting at index 9
        pos = 43 # 5 (record header) + 4 (handshake header) + 34 (version + random)
        
        # Session ID Length (1 byte)
        if len(data) < pos + 1:
            return None
        session_id_len = data[pos]
        pos += 1 + session_id_len
        
        # Cipher Suites Length (2 bytes)
        if len(data) < pos + 2:
            return None
        cipher_suites_len = int.from_bytes(data[pos:pos+2], byteorder='big')
        pos += 2 + cipher_suites_len
        
        # Compression Methods Length (1 byte)
        if len(data) < pos + 1:
            return None
        comp_len = data[pos]
        pos += 1 + comp_len
        
        # Extensions Length (2 bytes)
        if len(data) < pos + 2:
            return None
        extensions_len = int.from_bytes(data[pos:pos+2], byteorder='big')
        pos += 2
        
        extensions_end = pos + extensions_len
        # Ensure we have received enough bytes for all extensions
        if len(data) < extensions_end:
            return None
        
        # 4. Iterate over extensions to find Server Name extension (Type 0x0000)
        while pos + 4 <= extensions_end:
            ext_type = int.from_bytes(data[pos:pos+2], byteorder='big')
            ext_len = int.from_bytes(data[pos+2:pos+4], byteorder='big')
            pos += 4
            
            if ext_type == 0:  # Server Name Extension
                server_name_end = pos + ext_len
                if server_name_end > extensions_end:
                    return None
                
                # Server Name List Length (2 bytes)
                if pos + 2 > server_name_end:
                    return None
                list_len = int.from_bytes(data[pos:pos+2], byteorder='big')
                pos += 2
                
                # Check server name entry
                while pos + 3 <= server_name_end:
                    name_type = data[pos]
                    name_len = int.from_bytes(data[pos+1:pos+3], byteorder='big')
                    pos += 3
                    
                    if name_type == 0:  # Hostname (0 is host_name type)
                        if pos + name_len > server_name_end:
                            return None
                        hostname = data[pos:pos+name_len].decode('utf-8', errors='ignore')
                        return hostname
                    pos += name_len
                break
            pos += ext_len
    except Exception:
        pass
    return None

async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, subdomain: str):
    """Pipes traffic from reader to writer and accumulates metrics."""
    try:
        while True:
            data = await reader.read(MAX_BUFFER_SIZE)
            if not data:
                break
            
            writer.write(data)
            await writer.drain()
            
            # Accumulate accounting data safely
            bytes_count = len(data)
            async with traffic_lock:
                pending_traffic[subdomain] = pending_traffic.get(subdomain, 0) + bytes_count
                
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.debug(f"Piping exception for {subdomain}: {e}")
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

async def handle_connection(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter):
    """Handles incoming client TCP connections, sniffs SNI, and proxies if authorized."""
    client_address = client_writer.get_extra_info('peername')
    logger.info(f"New connection received from {client_address}")
    
    subdomain = None
    try:
        # 1. Read Client Hello peak payload
        # Read the TLS Client Hello payload. Generally fits in the first 2-4KB.
        initial_data = await client_reader.read(4096)
        if not initial_data:
            client_writer.close()
            return
        
        # 2. Extract SNI
        subdomain = parse_sni(initial_data)
        if not subdomain:
            logger.warning(f"Connection from {client_address} rejected: Invalid TLS Client Hello or missing SNI.")
            client_writer.close()
            return
            
        subdomain = subdomain.lower()
        logger.info(f"SNI detected: {subdomain} from {client_address}")
        
        # 3. Access verification (SQLite checked inside thread executor)
        loop = asyncio.get_running_loop()
        is_allowed, reason = await loop.run_in_executor(None, check_user_access_sync, subdomain)
        
        if not is_allowed:
            logger.warning(f"Access DENIED for {subdomain} ({client_address}): {reason}")
            client_writer.close()
            return
        
        logger.info(f"Access GRANTED for {subdomain} ({client_address}) -> Tunneling to core...")
        
        # 4. Open connection to upstream proxy core
        try:
            backend_reader, backend_writer = await asyncio.open_connection(BACKEND_HOST, BACKEND_PORT)
        except Exception as e:
            logger.error(f"Backend proxy core is down ({BACKEND_HOST}:{BACKEND_PORT}): {e}")
            client_writer.close()
            return
            
        # 5. Flush the initial TLS Client Hello chunk we read for SNI parsing to backend core
        backend_writer.write(initial_data)
        await backend_writer.drain()
        
        # 6. Spawn bidirectional piping tasks
        client_to_backend = asyncio.create_task(pipe(client_reader, backend_writer, subdomain))
        backend_to_client = asyncio.create_task(pipe(backend_reader, client_writer, subdomain))
        
        # Wait for either to finish
        await asyncio.any_completed([client_to_backend, backend_to_client])
        
    except Exception as e:
        logger.error(f"Error handling connection: {e}")
    finally:
        try:
            client_writer.close()
            await client_writer.wait_closed()
        except Exception:
            pass
        if subdomain:
            logger.info(f"Connection closed for {subdomain} ({client_address})")

async def main():
    # Setup base database
    init_db()
    
    # Start background database writer
    asyncio.create_task(periodic_db_flush())
    
    # Run Gateway Server
    server = await asyncio.start_server(handle_connection, LISTEN_HOST, LISTEN_PORT)
    addr = server.sockets[0].getsockname()
    logger.info(f"=== Gateway Started successfully ===")
    logger.info(f"Listening persistent proxy lines on: {addr[0]}:{addr[1]}")
    logger.info(f"Forwarding verified traffic to: {BACKEND_HOST}:{BACKEND_PORT}")
    
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Gateway server shutting down gracefully.")
