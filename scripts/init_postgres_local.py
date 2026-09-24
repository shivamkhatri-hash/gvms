import os
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def setup():
    print("[1] Connecting to local PostgreSQL server...")
    conn = psycopg2.connect(host='127.0.0.1', port=5432, user='postgres', dbname='postgres')
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    # Create/update user ongc_admin
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname='ongc_admin'")
    if not cur.fetchone():
        cur.execute("CREATE USER ongc_admin WITH SUPERUSER PASSWORD 'ONGC_Lab_Secure_Pass2026!';")
        print("[+] Created user ongc_admin")
    else:
        cur.execute("ALTER USER ongc_admin WITH SUPERUSER PASSWORD 'ONGC_Lab_Secure_Pass2026!';")
        print("[+] User ongc_admin password confirmed")

    # Create ongc_lab db
    cur.execute("SELECT 1 FROM pg_database WHERE datname='ongc_lab'")
    if not cur.fetchone():
        cur.execute("CREATE DATABASE ongc_lab OWNER ongc_admin;")
        print("[+] Created database ongc_lab")
    else:
        print("[*] Database ongc_lab already exists")

    # Create metabase_db
    cur.execute("SELECT 1 FROM pg_database WHERE datname='metabase_db'")
    if not cur.fetchone():
        cur.execute("CREATE DATABASE metabase_db OWNER ongc_admin;")
        print("[+] Created database metabase_db")
    else:
        print("[*] Database metabase_db already exists")

    cur.close()
    conn.close()

    # Connect to ongc_lab
    print("[2] Executing database/init.sql on ongc_lab...")
    conn_lab = psycopg2.connect(host='127.0.0.1', port=5432, user='ongc_admin', password='ONGC_Lab_Secure_Pass2026!', dbname='ongc_lab')
    conn_lab.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur_lab = conn_lab.cursor()

    # Drop old variable_registry and dataset_registry if column types differed
    cur_lab.execute("DROP TABLE IF EXISTS version_record_mapping CASCADE;")
    cur_lab.execute("DROP TABLE IF EXISTS variable_registry CASCADE;")
    cur_lab.execute("DROP TABLE IF EXISTS generic_dataset_records CASCADE;")
    cur_lab.execute("DROP TABLE IF EXISTS dataset_versions CASCADE;")
    cur_lab.execute("DROP TABLE IF EXISTS dataset_registry CASCADE;")

    # Enable uuid-ossp
    cur_lab.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

    # Create sequences
    seqs = [
        'dataset_registry_seq',
        'dataset_version_seq',
        'generic_record_seq',
        'variable_registry_seq',
        'version_record_seq'
    ]
    for s in seqs:
        cur_lab.execute(f'CREATE SEQUENCE IF NOT EXISTS {s};')

    init_sql_path = os.path.join(os.path.dirname(__file__), "..", "database", "init.sql")
    with open(init_sql_path, "r", encoding="utf-8") as f:
        sql_content = f.read()

    # Clean psql commands like \c or \gexec
    cleaned_statements = []
    for stmt in sql_content.split(";"):
        stmt = stmt.strip()
        if not stmt:
            continue
        if stmt.startswith("\\c") or stmt.startswith("\\gexec") or "CREATE DATABASE" in stmt:
            continue
        # Remove any lingering backslash commands
        lines = [l for l in stmt.splitlines() if not l.strip().startswith("\\")]
        stmt_cleaned = "\n".join(lines).strip()
        if stmt_cleaned:
            cleaned_statements.append(stmt_cleaned)

    for stmt in cleaned_statements:
        try:
            cur_lab.execute(stmt)
        except Exception as e:
            print(f"[-] DDL note: {e} in statement: {stmt[:60]}...")

    cur_lab.close()
    conn_lab.close()
    print("[+] database/init.sql execution complete.")

if __name__ == "__main__":
    setup()
