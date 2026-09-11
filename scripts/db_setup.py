#!/usr/bin/env python3
import sys
import os
from sqlalchemy import create_engine, text, inspect

# Add backend directory and workspace root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.core.config import settings
from app.core.database import engine, SessionLocal
from app.db.init_db import execute_dialect_sql, init_db

def run_setup():
    print(f"Connecting to database: {settings.sqlalchemy_database_url}")
    db = SessionLocal()
    try:
        print("[*] Running core database schema initialization...")
        init_db(db)
        
        # 1. Create target SQL Tables
        print("Creating table DL_CL_CUTTING_SOURCEROCK...")
        execute_dialect_sql(db, """
        CREATE TABLE IF NOT EXISTS DL_CL_CUTTING_SOURCEROCK (
            ID SERIAL PRIMARY KEY,
            UBHI VARCHAR(100),
            BOREHOLE_NAME VARCHAR(150),
            CUTTINGS_SAMPLE_ID VARCHAR(100),
            TOP_DEPTH DOUBLE PRECISION,
            BOTTOM_DEPTH DOUBLE PRECISION,
            ACTIVITY_TYPE VARCHAR(100),
            ANALYSIS_TYPE VARCHAR(100),
            SEGMENT_POSITION VARCHAR(100),
            LITHOLOGY VARCHAR(100),
            LAYER_NAME VARCHAR(150),
            TOC DOUBLE PRECISION,
            S1 DOUBLE PRECISION,
            S2 DOUBLE PRECISION,
            S2_EXTRACTION DOUBLE PRECISION,
            S3 DOUBLE PRECISION,
            TMAX DOUBLE PRECISION,
            VRO DOUBLE PRECISION,
            S2_S3 DOUBLE PRECISION,
            PI DOUBLE PRECISION,
            OSI DOUBLE PRECISION,
            HI DOUBLE PRECISION,
            OI DOUBLE PRECISION,
            MINC DOUBLE PRECISION,
            OTHERS VARCHAR(255),
            SPECIAL_OBS VARCHAR(255),
            DESCRIPTION TEXT,
            YEAR VARCHAR(100),
            AUTHOR VARCHAR(255),
            ANALYSED_AT VARCHAR(100),
            REMARKS TEXT,
            INSERT_USER VARCHAR(100),
            INSERT_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UPDATE_USER VARCHAR(100),
            UPDATE_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            SEP_TEMP DOUBLE PRECISION,
            SEP_PRESS DOUBLE PRECISION,
            FTHP DOUBLE PRECISION,
            FTHT DOUBLE PRECISION,
            FRACTION_TYPE VARCHAR(100),
            DURATION DOUBLE PRECISION,
            CUTTINGS_TOP DOUBLE PRECISION,
            CUTTINGS_BASE DOUBLE PRECISION,
            LAYER_TYPE VARCHAR(100),
            STRAT_SCOPE_ID DOUBLE PRECISION,
            TEST_NO VARCHAR(255),
            LAB_ANALYSIS_ONGC_ID INTEGER,
            BOREHOLE_ID INTEGER,
            CUTTINGS_ID INTEGER,
            PROPOSED_CODE VARCHAR(255),
            uploaded_by VARCHAR(36)
        )
        """)

        # Clean old seeding of petroleum_geochem from dataset_registry to avoid conflicts
        try:
            db.execute(text("DELETE FROM dataset_registry WHERE name = 'petroleum_geochem'"))
            db.commit()
        except Exception:
            db.rollback()

        # 2. Seed Dataset Registries and Variable Registries
        datasets_meta = [
            {
                "name": "cutting_source_rock",
                "display_name": "Cutting Source Rock",
                "sql_table_name": "dl_cl_cutting_sourcerock",
                "module": "geochemistry",
                "description": "Source Rock Evaluation dataset from Cutting samples.",
                "mapping_config": {
                    "ubhi": ["ubhi"],
                    "borehole_name": ["borehole name", "borehole_name"],
                    "cuttings_sample_id": ["cuttings sample id", "cuttings_sample_id", "cutting sample id", "cutting_sample_id", "cuttings_sample"],
                    "top_depth": ["top depth (m)", "top depth", "top_depth", "top_depth (m)", "top_depth", "segment depth"],
                    "bottom_depth": ["bottom depth (m)", "bottom depth", "bottom_depth", "bottom_depth (m)", "bottom_depth"],
                    "activity_type": ["activity type", "activity_type"],
                    "analysis_type": ["analysis type", "analysis_type"],
                    "lithology": ["lithology"],
                    "layer_name": ["layer name", "layer_name"],
                    "toc": ["toc"], "s1": ["s1 ", "s1"], "s2": ["s2"], "s3": ["s3 ", "s3"],
                    "tmax": ["tmax"], "hi": ["hi"], "oi": ["oi"], "vro": ["vro"],
                    "pi": ["pi"], "osi": ["osi"], "minc": ["minc"], "others": ["others"],
                    "special_obs": ["special observations", "special_obs"],
                    "year": ["year"], "author": ["author"], "analysed_at": ["analysed at", "analysed_at"], "remarks": ["remarks"]
                },
                "graph_config": [
                    {"type": "depth_profile", "x_axis": "toc", "y_axis": "top_depth", "title": "TOC Depth Profile", "color": "#003366"},
                    {"type": "depth_profile", "x_axis": "s2", "y_axis": "top_depth", "title": "S2 Depth Profile", "color": "#D97706"},
                    {"type": "scatter", "x_axis": "toc", "y_axis": "s2", "title": "TOC vs S2 Crossplot", "color_by": "lithology"}
                ],
                "required_columns": ["top_depth", "bottom_depth"],
                "primary_depth_column": "top_depth",
                "primary_well_column": "borehole_name",
                "variables": [
                    ("ubhi", "UBHI", "ubhi", "string", None, False, True),
                    ("borehole_name", "Borehole Name", "borehole_name", "string", None, True, False),
                    ("cuttings_sample_id", "Cuttings Sample ID", "cuttings_sample_id", "string", None, True, False),
                    ("top_depth", "Top Depth", "top_depth", "numeric", "m", True, False),
                    ("bottom_depth", "Bottom Depth", "bottom_depth", "numeric", "m", True, False),
                    ("activity_type", "Activity Type", "activity_type", "string", None, True, False),
                    ("analysis_type", "Analysis Type", "analysis_type", "string", None, True, False),
                    ("lithology", "Lithology", "lithology", "string", None, True, False),
                    ("layer_name", "Layer Name", "layer_name", "string", None, True, False),
                    ("toc", "TOC", "toc", "numeric", "wt%", True, False),
                    ("s1", "S1", "s1", "numeric", "mg/g", True, False),
                    ("s2", "S2", "s2", "numeric", "mg/g", True, False),
                    ("s3", "S3", "s3", "numeric", "mg/g", True, False),
                    ("tmax", "Tmax", "tmax", "numeric", "°C", True, False),
                    ("hi", "HI", "hi", "numeric", "mg/g", True, False),
                    ("oi", "OI", "oi", "numeric", "mg/g", True, False),
                    ("vro", "VRo", "vro", "numeric", "%", True, False),
                    ("pi", "PI", "pi", "numeric", None, True, False),
                    ("osi", "OSI", "osi", "numeric", None, True, False),
                    ("minc", "MinC", "minc", "numeric", None, True, False),
                    ("others", "Others", "others", "string", None, True, False),
                    ("special_obs", "Special Observations", "special_obs", "string", None, True, False),
                    ("year", "Year", "year", "string", None, True, False),
                    ("author", "Author", "author", "string", None, True, False),
                    ("analysed_at", "Analysed At", "analysed_at", "string", None, True, False),
                    ("remarks", "Remarks", "remarks", "string", None, True, False)
                ]
            }
        ]

        from app.models.registry import DatasetRegistry, VariableRegistry

        for ds in datasets_meta:
            print(f"Registering dataset: {ds['display_name']} ({ds['name']})")
            ds_obj = db.query(DatasetRegistry).filter(DatasetRegistry.name == ds["name"]).first()
            if not ds_obj:
                ds_obj = DatasetRegistry(name=ds["name"])
                db.add(ds_obj)
            
            ds_obj.display_name = ds["display_name"]
            ds_obj.sql_table_name = ds["sql_table_name"]
            ds_obj.module = ds["module"]
            ds_obj.description = ds["description"]
            ds_obj.mapping_config = ds["mapping_config"]
            ds_obj.graph_config = ds["graph_config"]
            ds_obj.required_columns = ds["required_columns"]
            ds_obj.primary_depth_column = ds["primary_depth_column"]
            ds_obj.primary_well_column = ds["primary_well_column"]
            ds_obj.is_active = True
            db.commit()
            db.refresh(ds_obj)

            dataset_id = ds_obj.id

            # Clean old variables for this dataset
            db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id).delete()
            db.commit()

            # Insert variables
            for var in ds["variables"]:
                name, display_name, sql_col, sql_type, unit, nullable, required = var
                is_numeric = (sql_type == "numeric")
                var_obj = VariableRegistry(
                    dataset_id=dataset_id,
                    name=name,
                    display_name=display_name,
                    sql_column_name=sql_col,
                    sql_data_type="NUMBER" if is_numeric else "VARCHAR(100)",
                    display_unit=unit,
                    is_numeric=is_numeric,
                    is_visible=True,
                    is_filterable=True,
                    chart_enabled=True,
                    kpi_enabled=True,
                    export_enabled=True,
                    description=f"{display_name} variable for {ds['display_name']}"
                )
                db.add(var_obj)
            db.commit()

        print("Database setup and seeding completed successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    run_setup()
