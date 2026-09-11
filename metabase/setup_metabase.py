#!/usr/bin/env python3
"""
Metabase Automation Provisioning Script for ONGC Chem Lab Data
Connects to Metabase REST API, registers the PostgreSQL database `ongc_lab`,
and verifies setup readiness.
"""

import time
import os
import requests

def load_env():
    for path in [".env", "../.env", "../../.env", "backend/.env"]:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        val = val.strip().strip('"').strip("'")
                        # Only set if not already present in environment
                        if key.strip() not in os.environ:
                            os.environ[key.strip()] = val

load_env()

METABASE_URL = os.getenv("METABASE_URL", "http://metabase:3000")
ADMIN_EMAIL = os.getenv("FIRST_SUPERUSER", "admin@ongc.co.in")
ADMIN_PASSWORD = os.getenv("FIRST_SUPERUSER_PASSWORD", "Admin@123456")

DB_PROVIDER = os.getenv("DATABASE_PROVIDER", "postgres").lower()

if DB_PROVIDER == "oracle":
    DB_ENGINE = "oracle"
    DB_HOST = os.getenv("ORACLE_HOST", "oracle_host")
    DB_PORT = int(os.getenv("ORACLE_PORT", "1521"))
    DB_NAME = os.getenv("ORACLE_SERVICE_NAME", "ORCL")
    DB_USER = os.getenv("ORACLE_USER", "ongc_user")
    DB_PASS = os.getenv("ORACLE_PASSWORD", "ONGC_Oracle_Pass2026!")
else:
    DB_ENGINE = "postgres"
    DB_HOST = os.getenv("POSTGRES_SERVER", "postgres")
    DB_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
    DB_NAME = os.getenv("POSTGRES_DB", "ongc_lab")
    DB_USER = os.getenv("POSTGRES_USER", "ongc_admin")
    DB_PASS = os.getenv("POSTGRES_PASSWORD", "ONGC_Lab_Secure_Pass2026!")

def wait_for_metabase():
    print(f"[*] Waiting for Metabase service at {METABASE_URL}...")
    for _ in range(30):
        try:
            r = requests.get(f"{METABASE_URL}/api/health", timeout=5)
            if r.status_code == 200 and r.json().get("status") == "ok":
                print("[+] Metabase is online!")
                return True
        except Exception:
            pass
        time.sleep(5)
    print("[-] Metabase timeout.")
    return False

def setup_metabase():
    if not wait_for_metabase():
        return

    session = requests.Session()
    
    # Check if setup is already completed
    r = session.get(f"{METABASE_URL}/api/session/properties")
    props = r.json() if r.status_code == 200 else {}
    
    if props.get("has-user-setup") is False:
        print(f"[*] Performing Metabase initial setup for provider: {DB_PROVIDER}...")
        # Get setup token
        setup_token = props.get("setup-token")
        db_details = {
            "host": DB_HOST,
            "port": DB_PORT,
            "user": DB_USER,
            "password": DB_PASS,
        }
        if DB_PROVIDER == "oracle":
            db_details["db"] = DB_NAME
            db_details["sid"] = DB_NAME
        else:
            db_details["db"] = DB_NAME
            db_details["ssl"] = False

        setup_payload = {
            "token": setup_token,
            "user": {
                "email": ADMIN_EMAIL,
                "first_name": "ONGC",
                "last_name": "Administrator",
                "password": ADMIN_PASSWORD
            },
            "prefs": {
                "site_name": "ONGC Chem Lab Analytics",
                "allow_tracking": False
            },
            "database": {
                "engine": DB_ENGINE,
                "name": "ONGC Geochem Lab DB",
                "details": db_details
            }
        }
        res = session.post(f"{METABASE_URL}/api/setup", json=setup_payload)
        if res.status_code in [200, 201]:
            print(f"[+] Metabase setup completed successfully with {DB_PROVIDER}!")
        else:
            print(f"[-] Setup failed: {res.text}")
    else:
        print("[*] Metabase is already configured.")

if __name__ == "__main__":
    setup_metabase()
