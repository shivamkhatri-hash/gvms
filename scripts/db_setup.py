#!/usr/bin/env python3
import sys
import os
from sqlalchemy import create_engine, text, inspect

# Add backend directory and workspace root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.core.config import settings

def run_setup():
    print(f"Connecting to database: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    
    # 1. Create target SQL Tables
    with engine.begin() as conn:
        print("Creating table DL_CL_CUTTING_SOURCEROCK...")
        conn.execute(text("""
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
            INSERT_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UPDATE_USER VARCHAR(100),
            UPDATE_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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
            uploaded_by UUID
        );
        """))

        print("Creating table DL_CL_KINETICS...")
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS DL_CL_KINETICS (
            ID SERIAL PRIMARY KEY,
            WELL_NAME VARCHAR(100),
            DEPTH DOUBLE PRECISION,
            FORMATION VARCHAR(150),
            FREQUENCY_FACTOR DOUBLE PRECISION,
            HYDROGEN_INDEX DOUBLE PRECISION,
            EI40 DOUBLE PRECISION, EI41 DOUBLE PRECISION, EI42 DOUBLE PRECISION, EI43 DOUBLE PRECISION, EI44 DOUBLE PRECISION,
            EI45 DOUBLE PRECISION, EI46 DOUBLE PRECISION, EI47 DOUBLE PRECISION, EI48 DOUBLE PRECISION, EI49 DOUBLE PRECISION,
            EI50 DOUBLE PRECISION, EI51 DOUBLE PRECISION, EI52 DOUBLE PRECISION, EI53 DOUBLE PRECISION, EI54 DOUBLE PRECISION,
            EI55 DOUBLE PRECISION, EI56 DOUBLE PRECISION, EI57 DOUBLE PRECISION, EI58 DOUBLE PRECISION, EI59 DOUBLE PRECISION,
            EI60 DOUBLE PRECISION, EI61 DOUBLE PRECISION, EI62 DOUBLE PRECISION, EI63 DOUBLE PRECISION, EI64 DOUBLE PRECISION,
            EI65 DOUBLE PRECISION, EI66 DOUBLE PRECISION, EI67 DOUBLE PRECISION, EI68 DOUBLE PRECISION, EI69 DOUBLE PRECISION,
            EI70 DOUBLE PRECISION,
            uploaded_by UUID
        );
        """))

        print("Creating table DL_CL_VRO...")
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS DL_CL_VRO (
            ID SERIAL PRIMARY KEY,
            WELL_NAME VARCHAR(100),
            SAMPLE_TYPE VARCHAR(100),
            DEPTH_TOP DOUBLE PRECISION,
            DEPTH_BOTTOM DOUBLE PRECISION,
            FORMATION VARCHAR(150),
            VRO_RANGE VARCHAR(255),
            NO_OF_READINGS INTEGER,
            AVERAGE_VRO DOUBLE PRECISION,
            uploaded_by UUID
        );
        """))

        # Clean old seeding of petroleum_geochem from dataset_registry to avoid conflicts
        conn.execute(text("DELETE FROM dataset_registry WHERE name = 'petroleum_geochem';"))

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

    import json
    with engine.begin() as conn:
        for ds in datasets_meta:
            print(f"Registering dataset: {ds['display_name']} ({ds['name']})")
            
            # Check if dataset already exists
            res = conn.execute(text("SELECT id FROM dataset_registry WHERE name = :name"), {"name": ds["name"]})
            row = res.fetchone()
            if row:
                dataset_id = row[0]
                # Update existing registry info
                conn.execute(text("""
                UPDATE dataset_registry 
                SET display_name = :display_name, sql_table_name = :sql_table_name, module = :module,
                    description = :description, mapping_config = :mapping_config, graph_config = :graph_config,
                    required_columns = :required_columns, primary_depth_column = :primary_depth_column,
                    primary_well_column = :primary_well_column, is_active = TRUE, updated_at = NOW()
                WHERE id = :id
                """), {
                    "display_name": ds["display_name"],
                    "sql_table_name": ds["sql_table_name"],
                    "module": ds["module"],
                    "description": ds["description"],
                    "mapping_config": json.dumps(ds["mapping_config"]),
                    "graph_config": json.dumps(ds["graph_config"]),
                    "required_columns": ds["required_columns"],
                    "primary_depth_column": ds["primary_depth_column"],
                    "primary_well_column": ds["primary_well_column"],
                    "id": dataset_id
                })
            else:
                # Insert new dataset registry record
                res = conn.execute(text("""
                INSERT INTO dataset_registry (
                    name, display_name, sql_table_name, module, description, mapping_config, graph_config,
                    required_columns, primary_depth_column, primary_well_column, is_active
                ) VALUES (
                    :name, :display_name, :sql_table_name, :module, :description, :mapping_config, :graph_config,
                    :required_columns, :primary_depth_column, :primary_well_column, TRUE
                ) RETURNING id
                """), {
                    "name": ds["name"],
                    "display_name": ds["display_name"],
                    "sql_table_name": ds["sql_table_name"],
                    "module": ds["module"],
                    "description": ds["description"],
                    "mapping_config": json.dumps(ds["mapping_config"]),
                    "graph_config": json.dumps(ds["graph_config"]),
                    "required_columns": ds["required_columns"],
                    "primary_depth_column": ds["primary_depth_column"],
                    "primary_well_column": ds["primary_well_column"]
                })
                dataset_id = res.scalar()
            
            # Clean old variables for this dataset
            conn.execute(text("DELETE FROM variable_registry WHERE dataset_id = :ds_id"), {"ds_id": dataset_id})
            
            # Insert variables
            for var in ds["variables"]:
                name, display_name, sql_col, sql_type, unit, nullable, required = var
                is_numeric = (sql_type == "numeric")
                conn.execute(text("""
                INSERT INTO variable_registry (
                    dataset_id, name, display_name, sql_column_name, sql_data_type, display_unit,
                    is_numeric, is_visible, is_filterable, chart_enabled, kpi_enabled, export_enabled,
                    description, validation_rule, category
                ) VALUES (
                    :dataset_id, :name, :display_name, :sql_column_name, :sql_data_type, :display_unit,
                    :is_numeric, TRUE, TRUE, TRUE, TRUE, TRUE,
                    :description, NULL, NULL
                )
                """), {
                    "dataset_id": dataset_id,
                    "name": name,
                    "display_name": display_name,
                    "sql_column_name": sql_col,
                    "sql_data_type": "DOUBLE PRECISION" if is_numeric else "VARCHAR(100)",
                    "display_unit": unit,
                    "is_numeric": is_numeric,
                    "description": f"{display_name} variable for {ds['display_name']}"
                })
                
    print("Database setup and seeding completed successfully!")

if __name__ == "__main__":
    run_setup()
