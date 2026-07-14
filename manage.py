#!/usr/bin/env python3
"""
MasterDnsVPN Client Management CLI (Complementary Layer)
Manage SQLite database (database.db) directly from your command line.
Optimized for complementary proxy accounting on up to 50 clients.
"""

import sys
import sqlite3
import os
import json

# Paths
DB_FILE = "/app/database.db" if os.path.exists("/app") else "database.db"
CONFIG_FILE = "/app/config.json" if os.path.exists("/app") else "config.json"

# Base Domain Fallback
BASE_TUNNEL_DOMAIN = "net.abrpars.filegear-sg.me"

def load_config_domain():
    """Loads configured NS domain from config.json if available."""
    global BASE_TUNNEL_DOMAIN
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                cfg = json.load(f)
                BASE_TUNNEL_DOMAIN = cfg.get("ns_domain", BASE_TUNNEL_DOMAIN).strip()
        except Exception as e:
            pass

def init_db():
    """Initializes SQLite database and tables with WAL mode enabled."""
    db_dir = os.path.dirname(os.path.abspath(DB_FILE))
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
        
    try:
        conn = sqlite3.connect(DB_FILE)
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
        print(f"✅ SQLite DB initialized at [{DB_FILE}] in WAL mode.")
    except Exception as e:
        print(f"❌ ERROR initializing database: {e}")

def parse_input_to_subdomain(input_val: str) -> str:
    """
    Converts a username or input string into a full valid subdomain.
    If 'input_val' is just a username (e.g., 'user1'), it appends our configured NS domain.
    """
    load_config_domain()
    cleaned = input_val.lower().strip()
    if not cleaned.endswith(BASE_TUNNEL_DOMAIN):
        username = cleaned.strip(".")
        return f"{username}.{BASE_TUNNEL_DOMAIN}"
    return cleaned

def add_user(username_or_sub: str, limit_mb: int):
    """Registers a new client with an automatic subdomain and sets limit."""
    subdomain = parse_input_to_subdomain(username_or_sub)
    username = subdomain.split(".")[0]
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (subdomain, limit_mb, used_mb, is_active) VALUES (?, ?, 0, 1)",
            (subdomain, limit_mb)
        )
        conn.commit()
        conn.close()
        print(f"✅ SUCCESS / موفقیت:")
        print(f"  • Username / نام کاربری: {username}")
        print(f"  • Subdomain / ساب‌دامین: {subdomain}")
        print(f"  • Bandwidth Limit / سقف حجم: {limit_mb} MB")
    except sqlite3.IntegrityError:
        print(f"❌ ERROR / خطا: Subdomain [{subdomain}] already exists in the database.")
    except Exception as e:
        print(f"❌ ERROR / خطا: SQLite error - {e}")

def disable_user(username_or_sub: str):
    """Sets is_active to 0 (False) for the user."""
    subdomain = parse_input_to_subdomain(username_or_sub)
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_active = 0 WHERE subdomain = ?", (subdomain,))
        if cursor.rowcount > 0:
            print(f"✅ SUCCESS / موفقیت: Subdomain [{subdomain}] is now DISABLED (suspended).")
        else:
            print(f"❌ ERROR / خطا: Subdomain [{subdomain}] not found in database.")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"❌ ERROR / خطا: {e}")

def enable_user(username_or_sub: str):
    """Sets is_active to 1 (True) for the user."""
    subdomain = parse_input_to_subdomain(username_or_sub)
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_active = 1 WHERE subdomain = ?", (subdomain,))
        if cursor.rowcount > 0:
            print(f"✅ SUCCESS / موفقیت: Subdomain [{subdomain}] is now ENABLED (active).")
        else:
            print(f"❌ ERROR / خطا: Subdomain [{subdomain}] not found in database.")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"❌ ERROR / خطا: {e}")

def delete_user(username_or_sub: str):
    """Deletes a user from the database."""
    subdomain = parse_input_to_subdomain(username_or_sub)
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE subdomain = ?", (subdomain,))
        if cursor.rowcount > 0:
            print(f"✅ SUCCESS / موفقیت: Subdomain [{subdomain}] deleted successfully.")
        else:
            print(f"❌ ERROR / خطا: Subdomain [{subdomain}] not found.")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"❌ ERROR / خطا: {e}")

def list_users():
    """Lists all users in a beautiful terminal table."""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id, subdomain, limit_mb, used_mb, is_active FROM users ORDER BY id ASC")
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            print("\n📭 Database is empty / دیتابیس خالی است.")
            print(f"Use command: python3 manage.py add <username> <limit_mb>\n")
            return
            
        print("\n" + "="*85)
        print(f"{'ID':<4} | {'Username':<12} | {'Subdomain':<38} | {'Limit':<10} | {'Used':<10} | {'Status':<10}")
        print("="*85)
        for row in rows:
            uid, sub, limit, used, active = row
            username = sub.split(".")[0]
            status_str = "ACTIVE" if active else "SUSPENDED"
            
            # Subdomain display logic
            sub_disp = sub if len(sub) <= 38 else sub[:35] + "..."
            limit_disp = f"{limit} MB"
            used_disp = f"{used:.2f} MB"
            
            # Check if exceeded
            if used >= limit and active:
                status_str = "EXCEEDED"
            
            print(f"{uid:<4} | {username:<12} | {sub_disp:<38} | {limit_disp:<10} | {used_disp:<10} | {status_str:<10}")
        print("="*85 + "\n")
    except Exception as e:
        print(f"❌ ERROR / خطا: SQLite error - {e}")

def print_usage():
    load_config_domain()
    print(f"""
==================================================================
                 MasterDnsVPN Management Console
==================================================================
Usage Commands / دستورات مدیریت کاربران:

  1. Add a user / افزودن کاربر جدید:
     python3 manage.py add <username> <limit_mb>
     Example: python3 manage.py add user1 500
     (This automatically maps to: user1.{BASE_TUNNEL_DOMAIN})

  2. Disable a user / غیرفعال کردن کاربر:
     python3 manage.py disable <username_or_subdomain>
     Example: python3 manage.py disable user1

  3. Enable a user / فعال کردن مجدد کاربر:
     python3 manage.py enable <username_or_subdomain>
     Example: python3 manage.py enable user1

  4. Delete a user / حذف کامل کاربر:
     python3 manage.py delete <username_or_subdomain>
     Example: python3 manage.py delete user1

  5. View Status & Lists / مشاهده لیست و وضعیت:
     python3 manage.py list
==================================================================
""")

def main():
    # Attempt to load NS domain first
    load_config_domain()
    
    if len(sys.argv) < 2:
        print_usage()
        sys.exit(0)
        
    action = sys.argv[1].lower()
    
    if action == "init-db":
        init_db()
        sys.exit(0)
        
    # Lazy init DB for other actions if file doesn't exist
    if not os.path.exists(DB_FILE):
        init_db()
        
    if action == "add":
        if len(sys.argv) < 4:
            print("❌ ERROR: Missing arguments.\nUsage: python3 manage.py add <username> <limit_mb>")
            sys.exit(1)
        username = sys.argv[2]
        try:
            limit_mb = int(sys.argv[3])
        except ValueError:
            print("❌ ERROR: Volume limit must be an integer (Megabytes).")
            sys.exit(1)
        add_user(username, limit_mb)
        
    elif action == "disable":
        if len(sys.argv) < 3:
            print("❌ ERROR: Missing username/subdomain.\nUsage: python3 manage.py disable <username>")
            sys.exit(1)
        disable_user(sys.argv[2])
        
    elif action == "enable":
        if len(sys.argv) < 3:
            print("❌ ERROR: Missing username/subdomain.\nUsage: python3 manage.py enable <username>")
            sys.exit(1)
        enable_user(sys.argv[2])

    elif action == "delete":
        if len(sys.argv) < 3:
            print("❌ ERROR: Missing username/subdomain.\nUsage: python3 manage.py delete <username>")
            sys.exit(1)
        delete_user(sys.argv[2])
        
    elif action in ["status", "list"]:
        list_users()
        
    else:
        print(f"❌ ERROR: Unknown command '{action}'")
        print_usage()
        sys.exit(1)

if __name__ == "__main__":
    main()
