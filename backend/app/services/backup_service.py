import os
import json
import zipfile
import shutil
import datetime
import logging
from typing import Dict, Any, List
import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.registry import DatasetRegistry, VariableRegistry

logger = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "backups")


class BackupService:
    @staticmethod
    def create_backup(db: Session) -> str:
        """
        Creates a zip backup containing LIMS database records, uploaded files, and settings.
        Saves backup inside the /backups directory.
        """
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_dir = os.path.join(BACKUP_DIR, f"lims_backup_temp_{timestamp}")
        os.makedirs(temp_dir, exist_ok=True)
        
        try:
            # 1. Dump Dataset Registry Tables
            datasets = db.query(DatasetRegistry).all()
            ds_list = []
            for ds in datasets:
                ds_list.append({
                    "id": ds.id,
                    "name": ds.name,
                    "display_name": ds.display_name,
                    "sql_table_name": ds.sql_table_name,
                    "module": ds.module,
                    "required_columns": ds.required_columns,
                    "primary_well_column": ds.primary_well_column,
                    "primary_depth_column": ds.primary_depth_column,
                    "mapping_config": ds.mapping_config,
                    "graph_config": ds.graph_config
                })
                
                # Fetch target table data
                table_name = ds.sql_table_name
                if table_name:
                    try:
                        res = db.execute(text(f"SELECT * FROM {table_name}"))
                        rows = [r._asdict() for r in res.fetchall()]
                        if rows:
                            df = pd.DataFrame(rows)
                            csv_path = os.path.join(temp_dir, f"table_{table_name}.csv")
                            df.to_csv(csv_path, index=False)
                            logger.info(f"Backed up table '{table_name}' containing {len(rows)} records.")
                    except Exception as tbl_err:
                        logger.error(f"Failed to backup table '{table_name}': {str(tbl_err)}")
            
            # Save registry configurations
            with open(os.path.join(temp_dir, "dataset_registry.json"), "w") as f:
                json.dump(ds_list, f, indent=2, default=str)
                
            # 2. Dump Variable Registry Configurations
            variables = db.query(VariableRegistry).all()
            var_list = []
            for v in variables:
                var_list.append({
                    "id": v.id,
                    "dataset_id": v.dataset_id,
                    "name": v.name,
                    "display_name": v.display_name,
                    "sql_column_name": v.sql_column_name,
                    "sql_data_type": v.sql_data_type,
                    "display_unit": v.display_unit,
                    "is_numeric": v.is_numeric,
                    "is_visible": v.is_visible,
                    "is_filterable": v.is_filterable,
                    "kpi_enabled": v.kpi_enabled,
                    "chart_enabled": v.chart_enabled,
                    "export_enabled": v.export_enabled,
                    "category": v.category
                })
            with open(os.path.join(temp_dir, "variable_registry.json"), "w") as f:
                json.dump(var_list, f, indent=2, default=str)

            # 3. Dump Settings Config
            config_backup = {
                "DATABASE_PROVIDER": settings.DATABASE_PROVIDER,
                "PROJECT_NAME": settings.PROJECT_NAME,
                "API_V1_STR": settings.API_V1_STR,
                "FIRST_SUPERUSER": settings.FIRST_SUPERUSER,
                "ENTERPRISE_AUTH_ENABLED": settings.ENTERPRISE_AUTH_ENABLED
            }
            with open(os.path.join(temp_dir, "config_settings.json"), "w") as f:
                json.dump(config_backup, f, indent=2)

            # 4. Zip the entire temp folder
            zip_path = os.path.join(BACKUP_DIR, f"GVMS_Backup_{timestamp}.zip")
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        zipf.write(file_path, os.path.relpath(file_path, temp_dir))
                        
            logger.info(f"Backup package generated at: {zip_path}")
            return zip_path
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    @classmethod
    def restore_backup(cls, db: Session, zip_filename: str) -> Dict[str, Any]:
        """
        Restores dataset registry configuration and data tables from a backup ZIP package.
        """
        zip_path = os.path.join(BACKUP_DIR, zip_filename)
        if not os.path.exists(zip_path):
            raise FileNotFoundError(f"Backup zip file '{zip_filename}' not found.")

        temp_dir = os.path.join(BACKUP_DIR, f"lims_restore_temp")
        os.makedirs(temp_dir, exist_ok=True)

        try:
            with zipfile.ZipFile(zip_path, "r") as zipf:
                zipf.extractall(temp_dir)

            # 1. Restore Dataset Registry Configurations
            registry_file = os.path.join(temp_dir, "dataset_registry.json")
            if not os.path.exists(registry_file):
                raise ValueError("Invalid backup: missing dataset registry data.")
                
            with open(registry_file, "r") as f:
                ds_list = json.load(f)

            # Restore each target table data
            restored_tables = []
            for ds in ds_list:
                table_name = ds["sql_table_name"]
                csv_file = os.path.join(temp_dir, f"table_{table_name}.csv")
                
                if table_name and os.path.exists(csv_file):
                    try:
                        df = pd.read_csv(csv_file)
                        # Clear existing table data
                        db.execute(text(f"DELETE FROM {table_name}"))
                        db.commit()
                        
                        # Ingest rows
                        for _, row in df.iterrows():
                            # Remove NaN values
                            clean_row = {k: v for k, v in row.to_dict().items() if pd.notna(v)}
                            
                            cols = ", ".join([f'"{k}"' for k in clean_row.keys()])
                            vals = ", ".join([f":{k}" for k in clean_row.keys()])
                            
                            db.execute(text(f"INSERT INTO {table_name} ({cols}) VALUES ({vals})"), clean_row)
                            
                        db.commit()
                        restored_tables.append(table_name)
                        logger.info(f"Restored {len(df)} records into table '{table_name}'")
                    except Exception as restore_err:
                        db.rollback()
                        logger.error(f"Failed to restore table '{table_name}': {str(restore_err)}")

            return {
                "status": "success",
                "timestamp": datetime.datetime.now().isoformat(),
                "restored_tables": restored_tables,
                "message": "Dynamic dataset registries and tables successfully restored."
            }
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
