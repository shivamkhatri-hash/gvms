#!/usr/bin/env python3
"""
GVMS Oracle Database Ping & Diagnostic Tool
Tests TCP socket connectivity and Oracle DB authentication / ping.
"""

import sys
import os
import time
import socket
import argparse

# Add workspace root, backend directory, and site-packages to sys.path
base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(base_dir)
sys.path.append(os.path.join(base_dir, "backend"))

for venv_path in [
    os.path.join(base_dir, "backend", "venv", "Lib", "site-packages"),
    os.path.join(base_dir, ".venv", "Lib", "site-packages"),
    os.path.join(base_dir, "venv", "Lib", "site-packages"),
]:
    if os.path.exists(venv_path):
        sys.path.insert(0, venv_path)


# Try loading python-dotenv if present
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(base_dir, ".env"))
except ImportError:
    pass

def ping_oracle(host: str = None, port: int = None, user: str = None, password: str = None, service_name: str = None, sid: str = None):
    host = host or os.getenv("ORACLE_HOST", "oracle_host")
    port = int(port or os.getenv("ORACLE_PORT", "1521"))
    user = user or os.getenv("ORACLE_USER", "ongc_user")
    password = password or os.getenv("ORACLE_PASSWORD", "ONGC_Oracle_Pass2026!")
    service_name = service_name or os.getenv("ORACLE_SERVICE_NAME", "ORCL")

    print("=" * 60)
    print("           GVMS Oracle Database Connectivity Ping")
    print("=" * 60)
    print(f"  Target Host        : {host}")
    print(f"  Target Port        : {port}")
    print(f"  Username           : {user}")
    print(f"  Service Name / SID : {service_name or sid}")
    print("=" * 60)

    # 1. TCP Socket Ping Test
    print("\n[*] Phase 1: TCP Socket Reachability Test...")
    tcp_success = False
    start_time = time.time()
    try:
        sock = socket.create_connection((host, port), timeout=5)
        latency_ms = (time.time() - start_time) * 1000
        sock.close()
        tcp_success = True
        print(f"    [SUCCESS] Port {port} on {host} is OPEN. Latency: {latency_ms:.2f} ms")
    except socket.gaierror as e:
        print(f"    [FAIL] Host Resolution Error: Cannot resolve '{host}' (getaddrinfo failed).")
        print("           --> Please check ORACLE_HOST in your .env file or local DNS / hosts file.")
    except socket.timeout:
        print(f"    [FAIL] Connection Timeout: '{host}:{port}' did not respond within 5s.")
        print("           --> Please verify network connectivity, VPN, or firewall settings.")
    except ConnectionRefusedError:
        print(f"    [FAIL] Connection Refused: '{host}:{port}' refused the connection.")
        print("           --> Ensure the Oracle Listener service is running on the host.")
    except Exception as e:
        print(f"    [FAIL] Socket Error: {e}")

    if not tcp_success:
        print("\n[-] TCP Ping failed. Skipping Oracle DB authentication test.")
        print("=" * 60)
        return False

    # 2. Oracle DB Driver Connection Test
    print("\n[*] Phase 2: Oracle DB Authentication & Query Test...")
    driver_type = None
    try:
        import oracledb
        driver_type = "oracledb"
    except ImportError:
        try:
            import cx_Oracle as oracledb
            driver_type = "cx_Oracle"
        except ImportError:
            try:
                from sqlalchemy import create_engine, text
                driver_type = "sqlalchemy"
            except ImportError:
                print(f"    [FAIL] Missing database driver ('oracledb' or 'sqlalchemy'). Install via: pip install oracledb sqlalchemy")
                return False

    try:
        start_time = time.time()
        if driver_type in ("oracledb", "cx_Oracle"):
            print(f"    Connecting using driver '{driver_type}'...")
            
            # Use direct parameters or DSN with connect timeout
            if sid:
                dsn = oracledb.makedsn(host, port, sid=sid)
                print(f"    DSN: {dsn}")
                connection = oracledb.connect(
                    user=user,
                    password=password,
                    dsn=dsn,
                    tcp_connect_timeout=10
                )
            else:
                print(f"    Host: {host}:{port}, Service: {service_name}, User: {user}")
                connection = oracledb.connect(
                    user=user,
                    password=password,
                    host=host,
                    port=port,
                    service_name=service_name,
                    tcp_connect_timeout=10
                )
                
            query_start = time.time()
            cursor = connection.cursor()
            cursor.execute("SELECT 1 FROM DUAL")
            row = cursor.fetchone()
            db_latency = (time.time() - start_time) * 1000
            query_latency = (time.time() - query_start) * 1000

            print(f"    [SUCCESS] Oracle DB Connection Established!")
            print(f"    [SUCCESS] Query Output (SELECT 1 FROM DUAL): {row}")
            print(f"    [INFO] Total Connection Latency: {db_latency:.2f} ms")
            print(f"    [INFO] Query Latency: {query_latency:.2f} ms")

            try:
                cursor.execute("SELECT banner FROM v$version WHERE ROWNUM = 1")
                version_row = cursor.fetchone()
                if version_row:
                    print(f"    [INFO] Oracle Version: {version_row[0]}")
            except Exception:
                pass

            cursor.close()
            connection.close()
        else:
            from sqlalchemy import create_engine, text
            url = f"oracle+oracledb://{user}:{password}@{host}:{port}/?service_name={service_name}"
            print(f"    Connecting via SQLAlchemy: oracle+oracledb://{user}:***@{host}:{port}/?service_name={service_name} ...")
            engine = create_engine(url)
            with engine.connect() as conn:
                query_start = time.time()
                res = conn.execute(text("SELECT 1 FROM DUAL")).fetchone()
                db_latency = (time.time() - start_time) * 1000
                query_latency = (time.time() - query_start) * 1000
                print(f"    [SUCCESS] Oracle DB Connection Established via SQLAlchemy!")
                print(f"    [SUCCESS] Query Output: {res}")
                print(f"    [INFO] Connection Latency: {db_latency:.2f} ms")

        print("\n[+] Oracle Database is ONLINE and HEALTHY.")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"    [FAIL] Oracle Database Connection Failed!")
        print(f"    Details: {e}")
        print("=" * 60)
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GVMS Oracle DB Ping Utility")
    parser.add_argument("--host", help="Oracle Host / IP Address")
    parser.add_argument("--port", type=int, help="Oracle Listener Port (default: 1521)")
    parser.add_argument("--user", help="Oracle DB Username")
    parser.add_argument("--password", help="Oracle DB Password")
    parser.add_argument("--service", help="Oracle Service Name (e.g. ORCL)")
    parser.add_argument("--sid", help="Oracle SID")

    args = parser.parse_args()
    success = ping_oracle(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        service_name=args.service,
        sid=args.sid
    )
    sys.exit(0 if success else 1)
