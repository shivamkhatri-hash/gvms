#!/usr/bin/env python3
"""
Seed script for populating ONGC Chem Lab database with initial geochemistry datasets.
"""

import sys
import os
from typing import cast
from uuid import UUID

# Add backend directory and workspace root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.core.database import SessionLocal
from app.crud.crud_sample import crud_sample
from app.crud.crud_user import crud_user
from app.services.csv_processor import CSVProcessor
from scripts.generate_sample_csv import generate_csv


def seed_database():
    csv_file = "sample_petroleum_data.csv"
    if not os.path.exists(csv_file):
        generate_csv(csv_file, total_records=150)

    db = SessionLocal()
    try:
        # Check existing data count
        stats = crud_sample.get_stats(db)
        if stats["total_samples"] > 0:
            print(f"[*] Database already contains {stats['total_samples']} samples. Skipping seed.")
            return

        admin_user = crud_user.get_by_email(db, email="admin@ongc.co.in")
        admin_id = cast(UUID, admin_user.id) if admin_user else None

        with open(csv_file, "rb") as f:
            file_bytes = f.read()

        processed = CSVProcessor.process_file(file_bytes, csv_file, db, uploader_id=admin_id)
        if processed.get("imported_rows", 0) > 0:
            print(f"[+] Successfully seeded {processed['imported_rows']} petroleum geochemical samples into database via CSVProcessor!")
        else:
            records = processed.get("records", [])
            if records:
                inserted = crud_sample.bulk_create(db, records=records, uploader_id=admin_id)
                print(f"[+] Successfully seeded {inserted} petroleum geochemical samples into database via bulk_create!")
    except Exception as e:
        print(f"[-] Database seed error: {str(e)}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
