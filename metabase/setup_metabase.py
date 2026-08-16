#!/usr/bin/env python3
"""
Metabase Automation Provisioning Script for ONGC Chem Lab Data
Connects to Metabase REST API, registers the PostgreSQL database `ongc_lab`,
and verifies setup readiness.
"""

import time
import os
import requests

METABASE_URL = os.getenv("METABASE_URL", "http://metabase:3000")
ADMIN_EMAIL = os.getenv("FIRST_SUPERUSER", "admin@ongc.co.in")
ADMIN_PASSWORD = os.getenv("FIRST_SUPERUSER_PASSWORD", "Admin@123456")

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
        print("[*] Performing Metabase initial setup...")
        # Get setup token
        setup_token = props.get("setup-token")
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
                "engine": "postgres",
                "name": "ONGC Geochem Lab DB",
                "details": {
                    "host": DB_HOST,
                    "port": DB_PORT,
                    "db": DB_NAME,
                    "user": DB_USER,
                    "password": DB_PASS,
                    "ssl": False
                }
            }
        }
        res = session.post(f"{METABASE_URL}/api/setup", json=setup_payload)
        if res.status_code in [200, 201]:
            print("[+] Metabase setup completed successfully!")
        else:
            print(f"[-] Setup failed: {res.text}")
    else:
        print("[*] Metabase is already configured.")

if __name__ == "__main__":
    setup_metabase()
