import os
import sys
from typing import cast
from uuid import UUID

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.core.database import SessionLocal
from app.models.registry import DatasetRegistry
from app.models.user import User
from app.services.csv_processor import CSVProcessor

def import_all():
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
        admin_id = cast(UUID, admin_user.id) if admin_user else None

        csv_mappings = [
            ("petroleum_geochem", "backend/app/db/S2_vs_TOC_CT-8.csv"),
            ("cutting_source_rock", "backend/app/db/5_Source_Rock_Data_Cutting.csv"),
            ("core_source_rock", "backend/app/db/6_Source_Rock_Data_Core.csv"),
            ("hopane", "backend/app/db/HopaneData.csv"),
            ("sterane", "backend/app/db/Strene_data.csv"),
            ("tricyclic_terpane", "backend/app/db/tricyclicdata.csv"),
            ("aromatic_biomarkers", "backend/app/db/aromaticdata.csv"),
            ("pr_ph", "backend/app/db/pr_ph_dataa.csv"),
            ("gas_chromatography", "backend/app/db/gc.csv"),
            ("oil_composition", "backend/app/db/Api.csv"),
            ("gas_isotope", "backend/app/db/sample_gas_isotope.csv"),
            ("oil_isotope", "backend/app/db/sample_oil_isotope.csv"),
            ("csia_isotope", "backend/app/db/sample_csia_isotope.csv"),
            ("trace_metal_", "backend/app/db/sample_trace_metal.csv"),
            ("microbiology", "backend/app/db/sample_microbiology.csv"),
        ]

        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

        for ds_name, rel_path in csv_mappings:
            full_path = os.path.join(base_dir, rel_path)
            if not os.path.exists(full_path):
                print(f"[-] File not found: {rel_path}")
                continue

            ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == ds_name).first()
            if not ds:
                print(f"[-] Dataset {ds_name} not registered in database.")
                continue

            with open(full_path, "rb") as f:
                content = f.read()

            filename = os.path.basename(full_path)
            try:
                res = CSVProcessor.process_file(content, filename, db, admin_id, cast(int, ds.id))
                db.commit()
                print(f"[+] [{ds.display_name}] Successfully imported {res.get('imported_rows', 0)} rows from {filename}")
            except Exception as e:
                db.rollback()
                print(f"[-] [{ds.display_name}] Import note: {e}")

    finally:
        db.close()

if __name__ == "__main__":
    import_all()
