import os
import re
import sys
import json
import io
import logging
from datetime import datetime, timezone
from typing import cast, Any, Dict, List, Set, Optional
from uuid import UUID
import pandas as pd
from sqlalchemy import create_engine, text, inspect, func
from sqlalchemy.orm import Session

# Override database URL to connect to local host port 5433 where docker port is mapped
os.environ["DATABASE_URL"] = "postgresql://ongc_admin:ONGC_Lab_Secure_Pass2026!@localhost:5433/ongc_lab"

from app.core.database import SessionLocal
from app.models.registry import DatasetRegistry, VariableRegistry, DatasetVersion, VersionRecordMapping
from app.models.user import User
from app.services.csv_processor import CSVProcessor
from app.crud.crud_registry import crud_registry
from app.crud.crud_log import crud_log
from app.services.metabase_service import metabase_service
from app.db.init_db import init_db

# Setup logger
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

csv_dir = r"E:\Ongc\Petroleum_Labs_Data\03_Biomarker_Lab\csv_Biomarker"

# View to table mapping for direct physical table insertion
VIEW_TO_TABLE = {
    "DL_BIOMARKER_STERANE_VW": "dl_biomarker_sterane",
    "DL_BIOMARKER_HOPANE_VW": "dl_biomarker_hopane",
    "DL_BIOM_TRICYCLIC_TERP_VW": "dl_tricyclic_terpane_",
    "DL_BIOMARKER_AROMATIC_VW": "dl_biomarker_aromatic_",
    "DL_BIOMARKER_PR_PH_VW": "dl_biomarker_pr_ph_"
}

# Physical column name mapping for Tricyclic Terpane view variables
TRICYCLIC_PHYSICAL_MAPPING = {
    "c19tt": "c19",
    "c20tt": "c20",
    "c21tt": "c21",
    "c22tt": "c22",
    "c23tt": "c23",
    "c24tt": "c24",
    "c25tt_r": "c25r",
    "c25tt_s": "c25s",
    "c24tet_tt": "c24tet",
    "c26tt_r": "c26r",
    "c26tt_s": "c26s",
    "perc_c19tt": "c19_ratio",
    "perc_c20tt": "c20_ratio",
    "perc_c21tt": "c21_ratio",
    "perc_c22tt": "c22_ratio",
    "perc_c23tt": "c23_ratio",
    "perc_c24tt": "c24_ratio",
    "perc_c25tt_r": "c25r_ratio",
    "perc_c25tt_s": "c25s_ratio",
    "perc_c24tet_tt": "c24tet_ratio",
    "perc_c26tt_r": "c26r_ratio",
    "perc_c26tt_s": "c26s_ratio"
}


def main():
    db: Session = SessionLocal()
    
    print("[*] Reinitializing database schema and variable registry...")
    init_db(db)
    
    biomarker_ds_ids = [8, 9, 10, 14, 15, 17] # all biomarker datasets to process
    reset_ds_ids = [8, 10, 14, 15, 17] # biomarker datasets to truncate/reset (aromatic_biomarkers excluded)
    biomarker_tables = [
        "dl_tricyclic_terpane_",
        "dl_biomarker_pr_ph_",
        "dl_biomarker_sterane",
        "dl_biomarker_hopane"
    ]
    
    try:
        # 1. Fetch initial record counts for report
        print("[*] Retrieving initial record counts...")
        initial_counts = {}
        total_before_reset = 0
        for table in biomarker_tables:
            scalar_cnt = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            cnt = int(scalar_cnt) if scalar_cnt is not None else 0
            initial_counts[table] = cnt
            total_before_reset += cnt
            print(f"  Table {table}: {cnt} records")
            
        # 2. Reset database tables for Biomarker Laboratory only
        print("[*] Resetting Biomarker Laboratory data...")
        
        # Clear version record mappings and generic records
        db.execute(text("DELETE FROM version_record_mapping WHERE version_id IN (SELECT id FROM dataset_versions WHERE dataset_id IN (8,10,14,15,17))"))
        db.execute(text("DELETE FROM generic_dataset_records WHERE dataset_id IN (8,10,14,15,17)"))
        db.execute(text("DELETE FROM dataset_versions WHERE dataset_id IN (8,10,14,15,17)"))
        
        # Truncate primary base tables
        for table in biomarker_tables:
            db.execute(text(f"TRUNCATE TABLE {table} CASCADE;"))
            
        db.commit()
        print("[+] Biomarker Laboratory data reset completed successfully.")
        
        # 3. Locate admin user ID
        admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
        admin_id = cast(UUID, admin_user.id) if admin_user else None
        print(f"[*] Uploader (Admin) ID: {admin_id}")
        
        # 4. Scan source directory for CSV files
        print(f"[*] Scanning CSV directory: {csv_dir}")
        if not os.path.exists(csv_dir):
            print(f"[-] Error: Directory {csv_dir} does not exist!")
            sys.exit(1)
            
        csv_files = [f for f in os.listdir(csv_dir) if f.endswith(".csv")]
        print(f"[*] Found {len(csv_files)} CSV files to process.")
        
        ingestion_results = []
        unmapped_csv_files = []
        total_records_imported = 0
        
        for filename in csv_files:
            filepath = os.path.join(csv_dir, filename)
            print(f"\nProcessing file: {filename}")
            
            with open(filepath, "rb") as f:
                file_bytes = f.read()
                
            # 4.1 Detect target dataset
            ds = None
            try:
                ds, header_row_idx = CSVProcessor.detect_dataset(file_bytes, filename, db)
                print(f"  -> Detected dataset: '{ds.display_name}' (ID: {ds.id}, Table: '{ds.sql_table_name}')")
            except Exception as e:
                # If cannot be confidently mapped, report details and skip
                print(f"  [!] Cannot confidently map {filename}: {e}")
                # Attempt to read headers to report columns
                try:
                    df_raw_err = pd.read_csv(io.BytesIO(file_bytes), header=None, nrows=2)
                    err_cols = list(df_raw_err.iloc[0])
                except:
                    err_cols = ["Unreadable"]
                unmapped_csv_files.append({
                    "filename": filename,
                    "columns": err_cols,
                    "error": str(e)
                })
                ingestion_results.append({
                    "filename": filename,
                    "dataset": "None",
                    "rows": 0,
                    "unmapped_cols": [],
                    "status": "Unmapped / Pending Decision"
                })
                continue
                
            ds_id = cast(int, ds.id)
            # Check if dataset belongs to Biomarker Lab
            if ds_id not in biomarker_ds_ids:
                print(f"  [!] Detected dataset '{ds.name}' is not in Biomarker Laboratory module. Skipping.")
                continue
                
            # Create Dataset Version for audit trails
            next_version = crud_registry.get_next_version_number(db, ds_id)
            version_obj = crud_registry.create_version(
                db,
                dataset_id=ds_id,
                version_number=next_version,
                filename=filename,
                file_size=len(file_bytes),
                uploader_id=admin_id
            )
            version = cast(Any, version_obj)
            version.status = "processing"
            db.add(version)
            db.commit()
            
            try:
                # 4.2 Load raw data with pandas
                df_raw = None
                for enc in ['utf-8', 'latin1', 'cp1252', 'utf-8-sig']:
                    try:
                        df_raw = pd.read_csv(io.BytesIO(file_bytes), header=None, encoding=enc)
                        break
                    except Exception:
                        pass
                
                if df_raw is None:
                    raise ValueError("Failed to parse CSV with all standard encodings.")
                    
                # Clean leading empty rows
                while len(df_raw) > 0 and df_raw.iloc[0].isna().all():
                    df_raw = df_raw.iloc[1:].reset_index(drop=True)
                    
                # 4.3 Handle double headers exactly as CSVProcessor does
                df_raw = CSVProcessor.preprocess_isotope_multi_header(df_raw)
                if len(df_raw) > 0:
                    row0_str = " ".join([str(x).lower() for x in df_raw.iloc[0] if x is not None])
                    if "hopane" in row0_str or "homohopane" in row0_str:
                        df_raw = CSVProcessor.preprocess_hopane_header(df_raw)
                    elif "sterane" in row0_str or "diasterane" in row0_str:
                        df_raw = CSVProcessor.preprocess_sterane_header(df_raw)
                        
                # Extract and normalize headers
                raw_headers = [str(df_raw.iloc[header_row_idx, col_idx]).strip() for col_idx in range(len(df_raw.columns))]
                df = df_raw.iloc[header_row_idx + 1:].copy()
                df.columns = raw_headers
                df = df.reset_index(drop=True)
                
                # Retrieve variable registry and schema columns
                variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == ds_id).all()
                var_map = {str(v.sql_column_name): v for v in variables}
                
                target_table = str(ds.sql_table_name)
                if target_table.upper() in VIEW_TO_TABLE:
                    target_table = VIEW_TO_TABLE[target_table.upper()]
                    
                # Inspect database table columns
                bind = db.get_bind()
                inspector = inspect(bind)
                columns_meta = inspector.get_columns(target_table)
                db_columns = {c['name'].lower() for c in columns_meta}
                
                # Column rename matching using variable synonyms
                rename_map = {}
                mapped_vars = {}
                unmapped_cols = {c for c in df.columns if not str(c).strip().startswith("Unnamed:")}
                
                # Pass 1: Exact matches
                for var in variables:
                    var_sql_col = str(var.sql_column_name)
                    var_name = str(var.name)
                    canonical_names = {CSVProcessor.normalize_header(var_sql_col), CSVProcessor.normalize_header(var_name)}
                    for col_name in list(unmapped_cols):
                        if CSVProcessor.normalize_header(col_name) in canonical_names:
                            rename_map[col_name] = var_sql_col
                            mapped_vars[var_sql_col] = col_name
                            unmapped_cols.remove(col_name)
                            break
                            
                # Pass 2: Synonym matches
                for var in variables:
                    var_sql_col = str(var.sql_column_name)
                    if var_sql_col in mapped_vars:
                        continue
                    target_syns = {CSVProcessor.normalize_header(str(syn)) for syn in (var.synonyms or [])}
                    mapping = ds.mapping_config or {}
                    if var_sql_col in mapping:
                        for alias in mapping[var_sql_col]:
                            target_syns.add(CSVProcessor.normalize_header(str(alias)))
                            
                    for col_name in list(unmapped_cols):
                        if CSVProcessor.normalize_header(col_name) in target_syns:
                            rename_map[col_name] = var_sql_col
                            mapped_vars[var_sql_col] = col_name
                            unmapped_cols.remove(col_name)
                            break
                            
                df = df.rename(columns=rename_map)
                
                # Load existing keys for duplicate check
                existing_keys = set()
                well_col = cast(Optional[str], ds.primary_well_column)
                depth_col = cast(Optional[str], ds.primary_depth_column)
                if well_col and depth_col:
                    try:
                        res_keys = db.execute(text(f'SELECT "{well_col}", "{depth_col}" FROM {ds.sql_table_name}')).fetchall()
                        existing_keys = {
                            (str(r[0]).strip().upper(), float(r[1]))
                            for r in res_keys
                            if r[0] is not None and r[1] is not None
                        }
                        print(f"  -> Loaded {len(existing_keys)} existing keys for duplicate check.")
                    except Exception as e:
                        print(f"  [-] Failed to load duplicate keys: {e}")

                # 4.4 Process rows and insert
                valid_records = []
                skipped_rows = 0
                quality_report_list = []
                warnings = []
                
                required_cols = [str(v.sql_column_name) for v in variables if v.is_required]
                
                for index, row in df.iterrows():
                    row_num = int(str(index)) + 2 + header_row_idx
                    try:
                        record = {}
                        for col_name, var_def in var_map.items():
                            if col_name not in df.columns:
                                record[col_name] = None
                                continue
                                
                            val = row[col_name]
                            
                            # Check for null placeholders
                            null_placeholders = {"-", "--", "na", "n/a", "null", "nan", "blank", "empty", ""}
                            val_str_clean = str(val).strip().lower() if val is not None and not pd.isna(val) else ""
                            is_null_placeholder = (val is None) or (pd.isna(val)) or (val_str_clean in null_placeholders)
                            
                            if is_null_placeholder:
                                record[col_name] = None
                                if var_def.is_numeric:
                                    warnings.append(f"Row {row_num}: Expected numeric value for '{col_name}' but got '{val}'. Set to NULL.")
                            else:
                                if var_def.is_numeric:
                                    try:
                                        val_str = str(val).strip()
                                        is_range = False
                                        check_str = val_str
                                        if check_str.startswith('-'):
                                            check_str = check_str[1:]
                                        if '-' in check_str and not any(x in check_str.lower() for x in ['e-', 'e+']):
                                            is_range = True
                                            
                                        if is_range:
                                            parts = [float(p.strip()) for p in val_str.split("-") if p.strip()]
                                            if len(parts) == 2:
                                                if col_name in ["depth_interval", "interval", "thickness"]:
                                                    float_val = abs(parts[1] - parts[0])
                                                else:
                                                    float_val = parts[0]
                                            elif len(parts) == 1:
                                                float_val = parts[0]
                                            else:
                                                raise ValueError("Invalid range format")
                                        else:
                                            float_val = float(val)
                                            
                                        record[col_name] = float_val
                                    except ValueError:
                                        if col_name in required_cols:
                                            raise ValueError(f"Required numeric column '{col_name}' could not be parsed: Got '{val}'")
                                        record[col_name] = None
                                        warnings.append(f"Row {row_num}: Failed to parse float value for '{col_name}': Got '{val}'. Set to NULL.")
                                else:
                                    val_str = str(val).strip()
                                    is_date_col = ("date" in col_name.lower()) or (var_def.sql_data_type and "DATE" in var_def.sql_data_type.upper())
                                    if is_date_col and val_str and val_str.lower() not in ["none", "nan", "null"]:
                                        try:
                                            parsed_date = pd.to_datetime(val_str, dayfirst=True)
                                            record[col_name] = parsed_date.strftime("%Y-%m-%d")
                                        except Exception:
                                            record[col_name] = val_str
                                    else:
                                        record[col_name] = val_str
                                        
                        # Ensure borehole_id & ubhi are resolved dynamically
                        well_key = "borehole_name" if "borehole_name" in var_map else ("well_name" if "well_name" in var_map else ("name" if "name" in var_map else None))
                        if well_key:
                            well_name_val = record.get(well_key)
                            if not well_name_val or str(well_name_val).strip().lower() in ["", "none", "nan"]:
                                well_name_val = f"TMP_WELL_{row_num}"
                                record[well_key] = well_name_val
                                
                            # Query or insert W_BOREHOLE
                            res_bh = db.execute(text("SELECT borehole_id, ubhi FROM W_BOREHOLE WHERE BOREHOLE_NAME = :name"), {"name": str(well_name_val)}).fetchone()
                            if res_bh:
                                bh_id, bh_ubhi = res_bh
                            else:
                                bh_ubhi = f"TMP_UBHI_{str(well_name_val).upper().replace(' ', '_').replace('-', '_')}"
                                insert_res = db.execute(text("INSERT INTO W_BOREHOLE (BOREHOLE_NAME, UBHI) VALUES (:name, :ubhi) RETURNING BOREHOLE_ID"), {"name": str(well_name_val), "ubhi": bh_ubhi})
                                bh_id = insert_res.scalar()
                                db.flush()
                                
                            record["borehole_id"] = bh_id
                            record["ubhi"] = bh_ubhi
                            
                        # Duplicate Check
                        if well_col and depth_col:
                            w_val = str(record.get(well_col, "")).strip().upper()
                            d_val = record.get(depth_col)
                            if d_val is not None:
                                key = (w_val, float(d_val))
                                if key in existing_keys:
                                    skipped_rows += 1
                                    continue
                                existing_keys.add(key)

                        # If a column was mapped to variable registry name, but database column requires different name (e.g. Tricyclic Terpane)
                        if str(ds.sql_table_name).upper() == "DL_BIOM_TRICYCLIC_TERP_VW":
                            mapped_rec = {}
                            for k, v in record.items():
                                mapped_rec[TRICYCLIC_PHYSICAL_MAPPING.get(k.lower(), k.lower())] = v
                            record = mapped_rec
                            
                        valid_records.append(record)
                    except Exception as row_err:
                        skipped_rows += 1
                        warnings.append(f"Row {row_num}: Skipped due to error: {row_err}")
                        
                # Perform database insert
                inserted_count = 0
                inserted_ids = []
                if valid_records:
                    sample_rec = valid_records[0]
                    cols_to_insert = [c for c in sample_rec.keys() if (c.lower() in db_columns) and c.lower() != "id"]
                    
                    if "uploaded_by" in db_columns:
                        cols_to_insert.append("uploaded_by")
                        
                    col_list_str = ", ".join([f'"{c}"' for c in cols_to_insert])
                    val_list_str = ", ".join([f":{c}" for c in cols_to_insert])
                    insert_query = text(f"INSERT INTO {target_table} ({col_list_str}) VALUES ({val_list_str}) RETURNING id")
                    
                    for rec in valid_records:
                        if "uploaded_by" in db_columns:
                            rec["uploaded_by"] = admin_id
                        if "insert_user" in db_columns:
                            rec["insert_user"] = "SYSTEM"
                        if "insert_date" in db_columns:
                            rec["insert_date"] = datetime.now(timezone.utc)
                        if "update_user" in db_columns:
                            rec["update_user"] = "SYSTEM"
                        if "update_date" in db_columns:
                            rec["update_date"] = datetime.now(timezone.utc)
                            
                        # Ensure all insert keys are in the sql bind parameters
                        rec_filtered = {k: v for k, v in rec.items() if k in cols_to_insert}
                        res = db.execute(insert_query, rec_filtered)
                        inserted_ids.append(res.scalar())
                        
                    inserted_count = len(valid_records)
                    
                    # Link version mapping
                    if inserted_ids:
                        mapping_objs = [
                            VersionRecordMapping(version_id=int(version.id), record_id=rid)
                            for rid in inserted_ids if rid is not None
                        ]
                        db.bulk_save_objects(mapping_objs)
                        
                # 4.5 Save log information
                error_summary = "; ".join(warnings[:15]) if warnings else None
                crud_log.create_upload_log(
                    db=db,
                    filename=filename,
                    file_size=len(file_bytes),
                    total_rows=len(df),
                    imported_rows=inserted_count,
                    skipped_rows=skipped_rows,
                    error_summary=error_summary,
                    quality_report=json.dumps(quality_report_list),
                    uploader_id=admin_id
                )
                crud_log.create_audit_log(
                    db=db,
                    user_id=admin_id,
                    action="UPLOAD",
                    resource="BIOMARKER",
                    details=f"Uploaded '{filename}' under dataset '{ds.name}' ({inserted_count} rows imported)."
                )
                
                # Sync Metabase
                try:
                    metabase_service.sync_dataset(ds, db)
                except Exception as mb_err:
                    logger.warning(f"Metabase sync failed: {mb_err}")
                    
                version.status = "completed"
                version.total_rows = len(df)
                version.imported_rows = inserted_count
                version.skipped_rows = skipped_rows
                version.error_summary = error_summary
                db.add(version)
                db.commit()
                
                print(f"  [+] Success: Imported {inserted_count} rows. (Skipped: {skipped_rows})")
                total_records_imported += inserted_count
                
                ingestion_results.append({
                    "filename": filename,
                    "dataset": ds.display_name,
                    "rows": inserted_count,
                    "unmapped_cols": sorted(list(unmapped_cols)),
                    "status": "Success"
                })
                
            except Exception as ing_err:
                db.rollback()
                version.status = "failed"
                version.error_summary = str(ing_err)
                db.add(version)
                db.commit()
                print(f"  [-] Failed to ingest {filename}: {ing_err}")
                ingestion_results.append({
                    "filename": filename,
                    "dataset": ds.display_name if ds else "Unknown",
                    "rows": 0,
                    "unmapped_cols": [],
                    "status": f"Failed: {ing_err}"
                })
                
        # 5. Final verification of rows in base tables
        print("\n[*] Verifying database table counts after ingestion...")
        final_counts = {}
        for table in biomarker_tables:
            scalar_cnt = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            cnt = int(scalar_cnt) if scalar_cnt is not None else 0
            final_counts[table] = cnt
            print(f"  Table {table}: {cnt} records")
            
        print("\n" + "="*60)
        print("                 BIOMARKER INGESTION REPORT")
        print("="*60)
        print(f"Total existing records before reset: {total_before_reset}")
        print(f"Total records removed:               {total_before_reset}")
        print(f"Total records imported:              {total_records_imported}")
        print(f"Any CSVs left unmapped:              {len(unmapped_csv_files)}")
        for uc in unmapped_csv_files:
            print(f"  - File: {uc['filename']}")
            print(f"    Columns: {uc['columns']}")
            print(f"    Closest Dataset matches failed: {uc['error']}")
            
        print("\nCSV Filename -> Dataset/Table -> Imported Rows -> Unmapped Columns -> Status")
        print("-"*80)
        for res in ingestion_results:
            unmapped_str = ", ".join(res["unmapped_cols"]) if res["unmapped_cols"] else "None"
            print(f"{res['filename']} \n  -> {res['dataset']} \n  -> {res['rows']} rows \n  -> unmapped: {unmapped_str} \n  -> {res['status']}")
        print("="*60)
        
    except Exception as e:
        db.rollback()
        print(f"[-] Critical script execution error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
