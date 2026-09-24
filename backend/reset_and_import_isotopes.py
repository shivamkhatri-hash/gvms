import io
import os
import sys
from typing import cast
from uuid import UUID

import pandas as pd
from sqlalchemy import text

from app.core.database import SessionLocal
from app.models.registry import DatasetRegistry
from app.models.user import User
from app.services.csv_processor import CSVProcessor


def main():
    db = SessionLocal()
    try:
        # 1. Clear existing isotope data
        print("[*] Clearing existing Stable Isotope tables...")
        db.execute(text("TRUNCATE TABLE DL_ISOTOPE_GAS CASCADE;"))
        db.execute(text("TRUNCATE TABLE DL_ISOTOPE_OIL CASCADE;"))
        db.execute(text("TRUNCATE TABLE DL_ISOTOPE_CSIA CASCADE;"))
        db.commit()
        print("[+] Isotope tables truncated successfully.")

        # 2. Locate admin user
        admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
        admin_id = cast(UUID, admin_user.id) if admin_user else None
        print(f"[*] Admin user ID: {admin_id}")

        # 3. Locate dataset registry for gas_isotope
        ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "gas_isotope").first()
        if not ds:
            print("[-] Dataset registry 'gas_isotope' not found!")
            sys.exit(1)
        ds_id = cast(int, ds.id)
        print(f"[*] Found Dataset registry: ID={ds_id}, Name={ds.name}")

        # 4. Read and clean woff.csv
        csv_path = "/app/app/db/woff.csv"
        if not os.path.exists(csv_path):
            print(f"[-] woff.csv not found at {csv_path}!")
            sys.exit(1)

        df_raw = pd.read_csv(csv_path, header=None)
        print(f"[*] Original CSV shape: {df_raw.shape}")

        # Keep double-header rows and rows where first column is a digit
        clean_rows = []
        clean_rows.append(df_raw.iloc[0])
        clean_rows.append(df_raw.iloc[1])
        for idx in range(2, len(df_raw)):
            val = str(df_raw.iloc[idx, 0]).strip()
            if val.isdigit():
                clean_rows.append(df_raw.iloc[idx])

        df_clean = pd.DataFrame(clean_rows)
        print(f"[*] Cleaned CSV shape: {df_clean.shape}")

        # Convert clean dataframe back to CSV bytes
        out_buf = io.StringIO()
        df_clean.to_csv(out_buf, index=False, header=False)
        file_bytes = out_buf.getvalue().encode("utf-8")

        # 5. Process and Ingest file
        print("[*] Ingesting cleaned woff.csv using CSVProcessor...")
        processed = CSVProcessor.process_file(
            file_bytes=file_bytes,
            filename="woff.csv",
            db=db,
            uploader_id=admin_id,
            dataset_id=ds_id,
        )
        print(f"[+] Successfully imported {processed.get('imported_rows', 0)} rows.")
        print(f"[+] Status details: {processed}")
    except Exception as e:
        db.rollback()
        print(f"[-] Error: {str(e)}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
