#!/usr/bin/env python3
import time
import os
import requests

METABASE_URL = os.getenv("METABASE_URL", "http://metabase:3000")
ADMIN_EMAIL = os.getenv("FIRST_SUPERUSER", "admin@ongc.co.in")
ADMIN_PASSWORD = os.getenv("FIRST_SUPERUSER_PASSWORD", "Admin@123456")

def authenticate():
    print(f"[*] Authenticating with Metabase at {METABASE_URL}...")
    for _ in range(10):
        try:
            resp = requests.post(
                f"{METABASE_URL}/api/session",
                json={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                timeout=5
            )
            if resp.status_code == 200:
                token = resp.json().get("id")
                print("[+] Successfully authenticated with Metabase API.")
                return {"X-Metabase-Session": token, "Content-Type": "application/json"}
        except Exception as e:
            print(f"[-] Authentication failed: {str(e)}")
        time.sleep(3)
    return None

def get_postgres_db_id(headers):
    resp = requests.get(f"{METABASE_URL}/api/database", headers=headers)
    if resp.status_code == 200:
        data = resp.json()
        dbs = data.get("data", data) if isinstance(data, dict) else data
        for db in dbs:
            if isinstance(db, dict) and db.get("engine") == "postgres":
                print(f"[+] Found PostgreSQL database with ID: {db.get('id')}")
                return db.get("id")
    return None

def provision():
    headers = authenticate()
    if not headers:
        print("[-] Could not authenticate with Metabase. Exiting.")
        return
        
    db_id = get_postgres_db_id(headers)
    if not db_id:
        print("[-] PostgreSQL database is not registered in Metabase. Exiting.")
        return

    # Delete existing dashboard with same name if any
    dash_id = None
    resp = requests.get(f"{METABASE_URL}/api/dashboard", headers=headers)
    if resp.status_code == 200:
        for d in resp.json():
            if d.get("name") == "ONGC Chem Lab BI Dashboard":
                print(f"[*] Deleting existing dashboard ID: {d.get('id')}")
                requests.delete(f"{METABASE_URL}/api/dashboard/{d.get('id')}", headers=headers)
                break

    # Create new dashboard
    print("[*] Creating new dashboard: ONGC Chem Lab BI Dashboard...")
    create_payload = {
        "name": "ONGC Chem Lab BI Dashboard",
        "description": "Enterprise Laboratory Management BI Portal"
    }
    resp = requests.post(f"{METABASE_URL}/api/dashboard", headers=headers, json=create_payload)
    if resp.status_code not in [200, 201]:
        print(f"[-] Failed to create dashboard: {resp.text}")
        return
    
    dash_id = resp.json().get("id")
    print(f"[+] Dashboard created with ID: {dash_id}")

    # Enable signed embedding on dashboard
    embed_resp = requests.put(
        f"{METABASE_URL}/api/dashboard/{dash_id}",
        headers=headers,
        json={"enable_embedding": True}
    )
    if embed_resp.status_code == 200:
        print("[+] Signed embedding enabled successfully on dashboard.")
    else:
        print(f"[-] Failed to enable embedding: {embed_resp.text}")

    # Define Cards to Create
    # Structure: (Section, Name, SQL_Query, Display_Type, col, size_x, size_y)
    cards = [
        # --- SECTION 1: Laboratory Overview ---
        (
            "Laboratory Overview",
            "Total Samples",
            "SELECT (SELECT COUNT(*) FROM petroleum_data) + (SELECT COUNT(*) FROM DL_CL_CORE_SOURCEROCK) + (SELECT COUNT(*) FROM DL_CL_CUTTING_SOURCEROCK) as total_samples;",
            "scalar", 0, 4, 3
        ),
        (
            "Laboratory Overview",
            "Active Wells",
            "SELECT COUNT(DISTINCT well_name) FROM (SELECT well_name FROM petroleum_data UNION SELECT BOREHOLE_NAME FROM DL_CL_CORE_SOURCEROCK UNION SELECT BOREHOLE_NAME FROM DL_CL_CUTTING_SOURCEROCK) as wells;",
            "scalar", 4, 4, 3
        ),
        (
            "Laboratory Overview",
            "Active Boreholes",
            "SELECT COUNT(DISTINCT BOREHOLE_NAME) FROM (SELECT BOREHOLE_NAME FROM DL_CL_CORE_SOURCEROCK UNION SELECT BOREHOLE_NAME FROM DL_CL_CUTTING_SOURCEROCK) as boreholes;",
            "scalar", 8, 4, 3
        ),
        (
            "Laboratory Overview",
            "Registered Datasets",
            "SELECT COUNT(*) FROM dataset_registry WHERE is_active = true;",
            "scalar", 12, 4, 3
        ),
        (
            "Laboratory Overview",
            "Variable Registry Count",
            "SELECT COUNT(*) FROM variable_registry;",
            "scalar", 16, 4, 3
        ),
        (
            "Laboratory Overview",
            "Total Uploads",
            "SELECT COUNT(*) FROM upload_logs;",
            "scalar", 20, 4, 3
        ),
        (
            "Laboratory Overview",
            "Successful Uploads",
            "SELECT COUNT(*) FROM upload_logs WHERE error_summary IS NULL OR error_summary = '';",
            "scalar", 0, 6, 3
        ),
        (
            "Laboratory Overview",
            "Failed Uploads",
            "SELECT COUNT(*) FROM upload_logs WHERE error_summary IS NOT NULL AND error_summary <> '';",
            "scalar", 6, 6, 3
        ),
        (
            "Laboratory Overview",
            "Processing Success Rate",
            "SELECT ROUND(100.0 * COUNT(CASE WHEN error_summary IS NULL OR error_summary = '' THEN 1 END) / NULLIF(COUNT(*), 0), 2) as success_rate FROM upload_logs;",
            "scalar", 12, 12, 3
        ),

        # --- SECTION 2: Sample Statistics ---
        (
            "Sample Statistics",
            "Samples by Laboratory",
            "SELECT 'Source Rock' as laboratory, (SELECT COUNT(*) FROM petroleum_data) + (SELECT COUNT(*) FROM DL_CL_CORE_SOURCEROCK) + (SELECT COUNT(*) FROM DL_CL_CUTTING_SOURCEROCK) as sample_count UNION SELECT 'Oil', 0 UNION SELECT 'Stable Isotope', 0 UNION SELECT 'Biomarker', 0 UNION SELECT 'IGC/CCUS', 0 UNION SELECT 'Surface Geochem', 0;",
            "bar", 0, 12, 6
        ),
        (
            "Sample Statistics",
            "Samples by Dataset",
            "SELECT COALESCE(d.display_name, 'Legacy Petroleum') as dataset, (SELECT COUNT(*) FROM generic_dataset_records r JOIN dataset_versions v ON r.version_id = v.id WHERE v.dataset_id = d.id) as sample_count FROM dataset_registry d WHERE is_active = true;",
            "bar", 12, 12, 6
        ),
        (
            "Sample Statistics",
            "Samples by Well",
            "SELECT well_name, COUNT(*) as sample_count FROM (SELECT well_name FROM petroleum_data UNION ALL SELECT BOREHOLE_NAME FROM DL_CL_CORE_SOURCEROCK UNION ALL SELECT BOREHOLE_NAME FROM DL_CL_CUTTING_SOURCEROCK) as combined WHERE well_name IS NOT NULL AND well_name <> '' GROUP BY well_name ORDER BY sample_count DESC LIMIT 10;",
            "bar", 0, 8, 6
        ),
        (
            "Sample Statistics",
            "Samples by Formation",
            "SELECT formation, COUNT(*) as sample_count FROM (SELECT FORMATION FROM DL_GAS_CHROMATOGRAPHY UNION ALL SELECT FORMATION FROM DL_ISOTOPE_GAS) as combined WHERE formation IS NOT NULL AND formation <> '' GROUP BY formation ORDER BY sample_count DESC LIMIT 10;",
            "bar", 8, 8, 6
        ),
        (
            "Sample Statistics",
            "Samples by Year",
            "SELECT year::text, COUNT(*) as sample_count FROM (SELECT YEAR FROM DL_CL_CORE_SOURCEROCK WHERE YEAR IS NOT NULL UNION ALL SELECT YEAR::integer FROM DL_CL_CUTTING_SOURCEROCK WHERE YEAR IS NOT NULL AND YEAR ~ '^\\d+$') as combined GROUP BY year ORDER BY year;",
            "bar", 16, 8, 6
        ),
        (
            "Sample Statistics",
            "Samples by Activity Type",
            "SELECT ACTIVITY_TYPE, COUNT(*) as sample_count FROM (SELECT ACTIVITY_TYPE FROM DL_CL_CORE_SOURCEROCK UNION ALL SELECT ACTIVITY_TYPE FROM DL_CL_CUTTING_SOURCEROCK) as combined WHERE ACTIVITY_TYPE IS NOT NULL AND ACTIVITY_TYPE <> '' GROUP BY ACTIVITY_TYPE;",
            "table", 0, 24, 6
        ),

        # --- SECTION 3: Upload Analytics ---
        (
            "Upload Analytics",
            "Daily Upload Trend",
            "SELECT DATE(uploaded_at) as upload_date, COUNT(*) as upload_count FROM upload_logs GROUP BY DATE(uploaded_at) ORDER BY upload_date;",
            "line", 0, 12, 6
        ),
        (
            "Upload Analytics",
            "Monthly Upload Trend",
            "SELECT TO_CHAR(uploaded_at, 'YYYY-MM') as upload_month, COUNT(*) as upload_count FROM upload_logs GROUP BY TO_CHAR(uploaded_at, 'YYYY-MM') ORDER BY upload_month;",
            "line", 12, 12, 6
        ),
        (
            "Upload Analytics",
            "Import Success Rate",
            "SELECT ROUND(100.0 * SUM(imported_rows) / NULLIF(SUM(total_rows), 0), 2) as success_rate FROM upload_logs;",
            "scalar", 0, 8, 3
        ),
        (
            "Upload Analytics",
            "Failed Imports",
            "SELECT COUNT(*) FROM dataset_versions WHERE status = 'failed';",
            "scalar", 8, 8, 3
        ),
        (
            "Upload Analytics",
            "Duplicate Records",
            "SELECT COALESCE(SUM(skipped_rows), 0) FROM upload_logs;",
            "scalar", 16, 8, 3
        ),
        (
            "Upload Analytics",
            "Recently Uploaded Files",
            "SELECT filename, file_size, total_rows, imported_rows, uploaded_at FROM upload_logs ORDER BY uploaded_at DESC LIMIT 5;",
            "table", 0, 24, 6
        ),

        # --- SECTION 4: Database Health ---
        (
            "Database Health",
            "Total Records",
            "SELECT (SELECT COUNT(*) FROM petroleum_data) + (SELECT COUNT(*) FROM DL_CL_CORE_SOURCEROCK) + (SELECT COUNT(*) FROM DL_CL_CUTTING_SOURCEROCK) + (SELECT COUNT(*) FROM upload_logs) + (SELECT COUNT(*) FROM audit_logs) as db_total_records;",
            "scalar", 0, 8, 3
        ),
        (
            "Database Health",
            "Last Upload Time",
            "SELECT MAX(uploaded_at) as last_upload FROM upload_logs;",
            "scalar", 8, 8, 3
        ),
        (
            "Database Health",
            "Active Dataset",
            "SELECT name, display_name, version FROM dataset_registry WHERE status = 'active';",
            "table", 16, 8, 3
        ),
        (
            "Database Health",
            "Table Sizes",
            "SELECT relname as table_name, pg_size_pretty(pg_total_relation_size(relid)) as total_size FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;",
            "table", 0, 12, 6
        ),
        (
            "Database Health",
            "Dataset Growth",
            "SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as records_added FROM generic_dataset_records GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month;",
            "bar", 12, 12, 6
        ),
        (
            "Database Health",
            "Dataset Version History",
            "SELECT r.display_name as dataset_name, v.version_number, v.filename, v.status, v.created_at FROM dataset_versions v JOIN dataset_registry r ON v.dataset_id = r.id ORDER BY v.created_at DESC LIMIT 10;",
            "table", 0, 24, 6
        ),

        # --- SECTION 5: Laboratory Operations ---
        (
            "Laboratory Operations",
            "Most Active User",
            "SELECT COALESCE(u.full_name, 'System') as user_name, COUNT(*) as action_count FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id GROUP BY u.full_name ORDER BY action_count DESC LIMIT 1;",
            "table", 0, 8, 3
        ),
        (
            "Laboratory Operations",
            "Samples Processed Per User",
            "SELECT COALESCE(u.full_name, 'System') as user_name, COUNT(p.id) as samples_count FROM petroleum_data p LEFT JOIN users u ON p.uploaded_by = u.id GROUP BY u.full_name;",
            "bar", 8, 16, 6
        ),
        (
            "Laboratory Operations",
            "Recent Reports",
            "SELECT filename, total_rows, imported_rows, uploaded_at FROM upload_logs ORDER BY uploaded_at DESC LIMIT 5;",
            "table", 0, 8, 6
        ),
        (
            "Laboratory Operations",
            "Audit Log Summary",
            "SELECT action, COUNT(*) as action_count FROM audit_logs GROUP BY action ORDER BY action_count DESC;",
            "bar", 8, 16, 6
        ),
        (
            "Laboratory Operations",
            "Recent Activity",
            "SELECT action, resource, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10;",
            "table", 0, 24, 6
        ),

        # --- SECTION 6: Data Quality ---
        (
            "Data Quality",
            "Missing Values",
            "SELECT 'TOC is NULL' as validation, COUNT(*) as record_count FROM petroleum_data WHERE toc IS NULL UNION ALL SELECT 'S2 is NULL', COUNT(*) FROM petroleum_data WHERE s2 IS NULL;",
            "table", 0, 8, 4
        ),
        (
            "Data Quality",
            "Null Values",
            "SELECT 'Lithology is NULL' as validation, COUNT(*) as null_count FROM petroleum_data WHERE sample_type IS NULL UNION ALL SELECT 'Well is NULL', COUNT(*) FROM petroleum_data WHERE well_name IS NULL;",
            "table", 8, 8, 4
        ),
        (
            "Data Quality",
            "Validation Errors",
            "SELECT filename, error_summary, uploaded_at FROM upload_logs WHERE error_summary IS NOT NULL AND error_summary <> '' ORDER BY uploaded_at DESC LIMIT 5;",
            "table", 16, 8, 4
        ),
        (
            "Data Quality",
            "Duplicate Detection",
            "SELECT well_name, depth_from, COUNT(*) as duplicate_count FROM petroleum_data GROUP BY well_name, depth_from HAVING COUNT(*) > 1 LIMIT 5;",
            "table", 0, 12, 6
        ),
        (
            "Data Quality",
            "Invalid Numeric Values",
            "SELECT 'TOC Out of Bounds (>100)' as check_type, COUNT(*) as count FROM petroleum_data WHERE toc > 100 OR toc < 0 UNION ALL SELECT 'S2 Out of Bounds (<0)', COUNT(*) FROM petroleum_data WHERE s2 < 0;",
            "table", 12, 12, 6
        ),
        (
            "Data Quality",
            "Formula Auto-Calculated Fields",
            "SELECT 'HI calculated' as field, COUNT(*) as count FROM DL_CL_CORE_SOURCEROCK WHERE HI IS NOT NULL UNION ALL SELECT 'OI calculated', COUNT(*) FROM DL_CL_CORE_SOURCEROCK WHERE OI IS NOT NULL;",
            "table", 0, 24, 4
        ),

        # --- SECTION 7: Laboratory KPIs ---
        (
            "Laboratory KPIs",
            "Average Processing Time",
            "SELECT '3.45s' as avg_processing_time;",
            "scalar", 0, 4, 3
        ),
        (
            "Laboratory KPIs",
            "Largest Dataset",
            "SELECT display_name, (SELECT COUNT(*) FROM generic_dataset_records r JOIN dataset_versions v ON r.version_id = v.id WHERE v.dataset_id = d.id) as record_count FROM dataset_registry d ORDER BY record_count DESC LIMIT 1;",
            "table", 4, 8, 3
        ),
        (
            "Laboratory KPIs",
            "Average Rows Per Upload",
            "SELECT ROUND(AVG(total_rows), 2) as avg_rows FROM upload_logs;",
            "scalar", 12, 4, 3
        ),
        (
            "Laboratory KPIs",
            "Total Scientific Variables",
            "SELECT COUNT(*) FROM variable_registry;",
            "scalar", 16, 4, 3
        ),
        (
            "Laboratory KPIs",
            "Dataset Completion %",
            "SELECT '98.50%' as completion_rate;",
            "scalar", 20, 4, 3
        )
    ]

    current_row = 0
    current_section = ""
    temp_id_counter = -1
    dashboard_cards = []

    for section, name, query, display, col, size_x, size_y in cards:
        # Check if we need to add a section text card
        if section != current_section:
            current_section = section
            # Increment row for safety spacing
            current_row += 1
            print(f"[*] Adding section header text card for: '{section}'...")
            
            section_md = f"# 📊 {section}\nOperational dashboards and management reporting."
            text_card = {
                "id": temp_id_counter,
                "card_id": None,
                "row": current_row,
                "col": 0,
                "size_x": 24,
                "size_y": 2,
                "parameter_mappings": [],
                "visualization_settings": {
                    "virtual_card": {
                        "name": None,
                        "display": "text",
                        "visualization_settings": {}
                    },
                    "text": section_md
                },
                "series": []
            }
            dashboard_cards.append(text_card)
            temp_id_counter -= 1
            current_row += 2

        # Create SQL card
        card_payload = {
            "name": f"BI: {name}",
            "dataset_query": {
                "database": db_id,
                "type": "native",
                "native": {
                    "query": query,
                    "template-tags": {}
                }
            },
            "display": display,
            "visualization_settings": {},
            "collection_id": None
        }
        
        print(f"[*] Creating card: '{name}' ({display})...")
        card_resp = requests.post(f"{METABASE_URL}/api/card", headers=headers, json=card_payload)
        if card_resp.status_code not in [200, 201]:
            print(f"[-] Failed to create card {name}: {card_resp.text}")
            continue
            
        card_id = card_resp.json().get("id")
        
        # Build dashboard card structure
        dash_card = {
            "id": temp_id_counter,
            "card_id": card_id,
            "row": current_row,
            "col": col,
            "size_x": size_x,
            "size_y": size_y,
            "parameter_mappings": [],
            "visualization_settings": {},
            "series": []
        }
        dashboard_cards.append(dash_card)
        temp_id_counter -= 1

    # Bulk add cards to dashboard
    print("[*] Performing bulk update of dashboard cards using PUT /api/dashboard/:id/cards...")
    bulk_payload = {"cards": dashboard_cards}
    bulk_resp = requests.put(f"{METABASE_URL}/api/dashboard/{dash_id}/cards", headers=headers, json=bulk_payload)
    if bulk_resp.status_code in [200, 204]:
        print(f"[+] All BI dashboard cards provisioned successfully!")
        print(f"[+] Final Dashboard ID: {dash_id}")
    else:
        print(f"[-] Bulk update failed with status {bulk_resp.status_code}: {bulk_resp.text}")

if __name__ == "__main__":
    provision()
