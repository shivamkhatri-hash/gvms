#!/usr/bin/env python3
"""
Import script to ingest full Trace Metal and Microbiology datasets into GVMS.
"""

import sys
import os
import io
import csv
import re
from typing import cast
from uuid import UUID

# Add backend directory and workspace root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.core.database import SessionLocal
from app.services.csv_processor import CSVProcessor
from app.models.user import User
from app.models.registry import DatasetRegistry
from sqlalchemy import text

def import_data():
    db = SessionLocal()
    try:
        # Retrieve Admin User
        admin_user = db.query(User).filter(User.email == 'admin@ongc.co.in').first()
        admin_id = cast(UUID, admin_user.id) if admin_user else None

        # 1. Ingest Trace Metal Data
        print("[*] Processing Trace Metal data from LAB_GCH-trace_metal.csv...")
        trace_metal_csv = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "LAB_GCH-trace_metal.csv"))
        if not os.path.exists(trace_metal_csv):
            print(f"[-] Error: {trace_metal_csv} not found.")
            sys.exit(1)

        ds_metal = db.query(DatasetRegistry).filter(DatasetRegistry.name == 'trace_metal_').first()
        if not ds_metal:
            print("[-] Error: trace_metal_ dataset not registered in registry. Run scripts/db_setup.py first.")
            sys.exit(1)

        with open(trace_metal_csv, 'r', encoding='utf-8-sig') as f:
            reader = list(csv.reader(f))

        new_headers = []
        for h in reader[0]:
            m = re.match(r'^(\d+)([a-zA-Z]+)', h.strip())
            if m:
                new_headers.append(f'{m.group(2).lower()}{m.group(1)}')
            elif h.strip().lower() == 'id':
                new_headers.append('Row ID')
            elif h.strip().lower() in ['object number', 'object_number', 'object no']:
                new_headers.append('object_no')
            elif h.strip().lower() in ['interval top(m)', 'interval top', 'interval_top']:
                new_headers.append('interval_top')
            elif h.strip().lower() in ['interval bottom(m)', 'interval bottom', 'interval_bottom']:
                new_headers.append('inetrval_bottom')
            elif h.strip().lower() in ['layer name', 'layer_name', 'formation']:
                new_headers.append('formation')
            else:
                new_headers.append(h.strip())

        try:
            ubhi_idx = [x.lower().strip() for x in new_headers].index('ubhi')
        except ValueError:
            ubhi_idx = -1
        
        if ubhi_idx != -1:
            new_headers.append('name')

        new_rows = [new_headers]
        for r in reader[1:]:
            if ubhi_idx != -1:
                r.append(r[ubhi_idx])
            new_rows.append(r)

        out = io.StringIO()
        csv.writer(out).writerows(new_rows)

        # Clear existing records first to avoid duplicates when re-seeding
        db.execute(text(re.sub(r'VW$', '', f"DELETE FROM {ds_metal.sql_table_name}")))
        db.commit()

        processed_metal = CSVProcessor.process_file(
            out.getvalue().encode('utf-8'), 
            'LAB_GCH-trace_metal.csv', 
            db, 
            admin_id, 
            cast(int, ds_metal.id)
        )
        db.commit()
        print(f"[+] Trace Metal Ingestion Success: Imported {processed_metal.get('imported_rows', 0)} rows.")

        # 2. Ingest Microbiology Data
        print("[*] Processing Microbiology data from surfacelab.csv...")
        microbiology_csv = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "surfacelab.csv"))
        if not os.path.exists(microbiology_csv):
            print(f"[-] Error: {microbiology_csv} not found.")
            sys.exit(1)

        ds_micro = db.query(DatasetRegistry).filter(DatasetRegistry.name == 'microbiology').first()
        if not ds_micro:
            print("[-] Error: microbiology dataset not registered in registry.")
            sys.exit(1)

        with open(microbiology_csv, 'r', encoding='utf-8-sig') as f:
            reader = list(csv.reader(f))

        mapping = {
            'SAMPLE NO': 'sample_no', 'LAT (DD)': 'latitude', 'LONG (DD)': 'longitude',
            'Methane\nC1(ppm)': 'methane_c1', 'Ethane\nC2 (ppm)': 'ethane_c2', 'Propane\nC3 (ppm)': 'propane_c3',
            'Iso Butane\nIC4 (ppm)': 'iso_butane_ic4', 'N Butane\nNC4 (ppm)': 'n_butane_nc4',
            'Iso Pentane\nIC5 (ppm)': 'iso_pentane_ic5', 'N Pentane\nNC5 (ppm)': 'n_pentane_nc5',
            'Wet Gas, (ppm)\nC2+= (C2+C3+IC4+NC4+IC5+NC5)': 'wet_gas_c2plus',
            'Total Gas, (ppm)\nC1+ = (C1+C2+C3+IC4+NC4+IC5+NC5)': 'total_gas_c1plus',
            'C1/C2': 'c1_by_c2', 'C1/(C2+C3)': 'c1_by_c2_plus_c3', 'C2/C3': 'c2_by_c3',
            '(C3/C1)*1000': 'c3_by_c1', 'C1/(C1+)*100': 'c1_by_c1plus',
            'Propane Oxidiser Count (10-3)': 'propane_oxi_count', 'Propane Oxidiser Count (10-4)': 'propane_oxi_count1',
            'Propanotrophs Count (cfu/gm)': 'propanotrophs_count', 'Butane Oxidiser Count (10-3)': 'butane_oxi_count',
            'Butane Oxidiser Count (10-4)': 'butane_oxi_count1', 'Butanotrophs Count (cfu/gm)': 'butanotrophs_count'
        }

        new_headers = []
        for h in reader[0]:
            h_norm = h.replace('\r\n', '\n').replace('\r', '\n').strip()
            new_headers.append(mapping.get(h_norm, h_norm))

        new_headers.extend(['borehole_id', 'ubhi'])
        new_rows = [new_headers]
        for r in reader[1:]:
            r.extend(['1', 'TMP_UBHI_B-157N-10'])
            new_rows.append(r)

        out = io.StringIO()
        csv.writer(out).writerows(new_rows)

        # Clear existing records first to avoid duplicates when re-seeding
        db.execute(text(re.sub(r'VW$', '', f"DELETE FROM {ds_micro.sql_table_name}")))
        db.commit()

        processed_micro = CSVProcessor.process_file(
            out.getvalue().encode('utf-8'), 
            'surfacelab.csv', 
            db, 
            admin_id, 
            cast(int, ds_micro.id)
        )
        db.commit()
        print(f"[+] Microbiology Ingestion Success: Imported {processed_micro.get('imported_rows', 0)} rows.")

    except Exception as e:
        print(f"[-] Data import error: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    import_data()
