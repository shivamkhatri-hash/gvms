# pyright: reportAttributeAccessIssue=false, reportGeneralTypeIssues=false
from typing import cast, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.config import settings
from app.crud.crud_user import crud_user
from app.schemas.user import UserCreate
from app.core.database import Base, engine
from app.models.registry import DatasetRegistry, VariableRegistry, VersionRecordMapping


class DDLFilterProxy:
    def __init__(self, db: Session, is_production: bool):
        self._db = db
        self._is_production = is_production

    def execute(self, statement, *args, **kwargs):
        stmt_str = str(statement).strip().upper()
        if self._is_production:
            if stmt_str.startswith("DROP") or stmt_str.startswith("CREATE"):
                print(f"[*] Skipping DDL execution in Production: {stmt_str[:60]}...")
                class MockResult:
                    def fetchone(self): return None
                    def fetchall(self): return []
                    def scalar(self): return None
                return MockResult()
        return self._db.execute(statement, *args, **kwargs)

    def commit(self):
        return self._db.commit()

    def rollback(self):
        return self._db.rollback()

    def query(self, *args, **kwargs):
        return self._db.query(*args, **kwargs)

    def add(self, *args, **kwargs):
        return self._db.add(*args, **kwargs)

    def refresh(self, *args, **kwargs):
        return self._db.refresh(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._db, name)


def init_db(db: Session) -> None:
    import os
    is_prod = os.getenv("GVMS_PRODUCTION", "false").lower() == "true"
    db = cast(Any, DDLFilterProxy(db, is_prod))

    # Ensure dataset_registry table has the new columns
    try:
        db.execute(text("ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS sql_table_name VARCHAR(100)"))
        db.execute(text("ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS module VARCHAR(100) DEFAULT 'geochemistry'"))
        db.execute(text("ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'"))
        db.execute(text("ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS version VARCHAR(50) DEFAULT '1.0'"))
        db.execute(text("ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS filter_config JSONB DEFAULT '[]'::jsonb"))
        db.execute(text("ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS primary_depth_column VARCHAR(100)"))
        db.execute(text("ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS primary_well_column VARCHAR(100)"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Alter dataset_registry table failed: {e}")

    # Ensure variable_registry table has the new columns
    try:
        db.execute(text("ALTER TABLE variable_registry ADD COLUMN IF NOT EXISTS synonyms TEXT[] DEFAULT '{}'"))
        db.execute(text("ALTER TABLE variable_registry ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT FALSE"))
        db.execute(text("ALTER TABLE variable_registry ADD COLUMN IF NOT EXISTS is_nullable BOOLEAN DEFAULT TRUE"))
        db.execute(text("ALTER TABLE variable_registry ADD COLUMN IF NOT EXISTS is_calculated BOOLEAN DEFAULT FALSE"))
        db.execute(text("ALTER TABLE variable_registry ADD COLUMN IF NOT EXISTS formula VARCHAR(255)"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Alter variable_registry table failed: {e}")

    # Ensure upload_logs table has quality_report column
    try:
        db.execute(text("ALTER TABLE upload_logs ADD COLUMN IF NOT EXISTS quality_report TEXT"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Alter upload_logs table failed: {e}")

    # Ensure tables are created
    if not is_prod:
        Base.metadata.create_all(bind=engine)

    # Ensure DL_CL_CORE_SOURCEROCK exists
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS DL_CL_CORE_SOURCEROCK (
            ID SERIAL PRIMARY KEY,
            UBHI VARCHAR(100),
            BOREHOLE_NAME VARCHAR(150),
            CORE_SAMPLE_ID VARCHAR(100),
            CORE_TOP DOUBLE PRECISION,
            CORE_BASE DOUBLE PRECISION,
            ACTIVITY_TYPE VARCHAR(100),
            ANALYSIS_TYPE VARCHAR(100),
            SAMPLE_TOP DOUBLE PRECISION,
            SAMPLE_BOTTOM DOUBLE PRECISION,
            SEGMENT_POSITION DOUBLE PRECISION,
            LITHOLOGY VARCHAR(100),
            LAYER_NAME VARCHAR(150),
            TOC DOUBLE PRECISION,
            S1 DOUBLE PRECISION,
            S2 DOUBLE PRECISION,
            S2_EXTRACTION DOUBLE PRECISION,
            S3 DOUBLE PRECISION,
            TMAX DOUBLE PRECISION,
            VRO DOUBLE PRECISION,
            PI DOUBLE PRECISION,
            OSI DOUBLE PRECISION,
            HI DOUBLE PRECISION,
            OI DOUBLE PRECISION,
            MINC DOUBLE PRECISION,
            OTHERS VARCHAR(255),
            SPECIAL_OBS VARCHAR(500),
            DESCRIPTION VARCHAR(500),
            YEAR INTEGER,
            AUTHOR VARCHAR(255),
            ANALYSED_AT TIMESTAMP WITH TIME ZONE,
            REMARKS VARCHAR(1000),
            INSERT_USER VARCHAR(100),
            INSERT_DATE TIMESTAMP WITH TIME ZONE,
            UPDATE_USER VARCHAR(100),
            UPDATE_DATE TIMESTAMP WITH TIME ZONE,
            TOP_DEPTH DOUBLE PRECISION,
            BOTTOM_DEPTH DOUBLE PRECISION,
            S2_S3 DOUBLE PRECISION,
            SEP_TEMP DOUBLE PRECISION,
            SEP_PRESS DOUBLE PRECISION,
            FTHP DOUBLE PRECISION,
            FTHT DOUBLE PRECISION,
            FRACTION_TYPE VARCHAR(100),
            DURATION DOUBLE PRECISION,
            LAYER_TYPE VARCHAR(100),
            STRAT_SCOPE_ID INTEGER,
            TEST_NO INTEGER,
            LAB_ANALYSIS_ONGC_ID INTEGER,
            BOREHOLE_ID INTEGER,
            CORE_ID INTEGER,
            CORE_SEGMENT_ID INTEGER
        )
    """))
    db.commit()

    # Recreate tables to force migration / schema updates
    db.execute(text("DROP TABLE IF EXISTS DL_GAS_CHROMATOGRAPHY CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_GCH_OIL_COMPOSITION CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_ISOTOPE_GAS CASCADE"))
    db.commit()

    # Ensure DL_GAS_CHROMATOGRAPHY exists
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS DL_GAS_CHROMATOGRAPHY (
            ID SERIAL PRIMARY KEY,
            UBHI TEXT,
            NAME TEXT,
            OBJECT_NUMBER TEXT,
            INTERVAL_TOP DOUBLE PRECISION,
            INTERVAL_BOTTOM DOUBLE PRECISION,
            FORMATION TEXT,
            MATERIAL_TYPE TEXT,
            ANALYSIS_DATE DATE,
            LOCATION TEXT,
            COLLECTION_DATE DATE,
            NC10 DOUBLE PRECISION, NC11 DOUBLE PRECISION, NC12 DOUBLE PRECISION, NC13 DOUBLE PRECISION,
            NC14 DOUBLE PRECISION, NC15 DOUBLE PRECISION, NC16 DOUBLE PRECISION, NC17 DOUBLE PRECISION,
            PR DOUBLE PRECISION, NC18 DOUBLE PRECISION, PH DOUBLE PRECISION, NC19 DOUBLE PRECISION,
            NC20 DOUBLE PRECISION, NC21 DOUBLE PRECISION, NC22 DOUBLE PRECISION, NC23 DOUBLE PRECISION,
            NC24 DOUBLE PRECISION, NC25 DOUBLE PRECISION, NC26 DOUBLE PRECISION, NC27 DOUBLE PRECISION,
            NC28 DOUBLE PRECISION, NC29 DOUBLE PRECISION, NC30 DOUBLE PRECISION, NC31 DOUBLE PRECISION,
            NC32 DOUBLE PRECISION, NC33 DOUBLE PRECISION, NC34 DOUBLE PRECISION, NC35 DOUBLE PRECISION,
            NC36 DOUBLE PRECISION, NC37 DOUBLE PRECISION, NC38 DOUBLE PRECISION, NC39 DOUBLE PRECISION,
            NC40 DOUBLE PRECISION,
            PR_BY_PH DOUBLE PRECISION,
            PR_BY_NC17 DOUBLE PRECISION,
            PH_BY_NC18 DOUBLE PRECISION,
            PR_NC17_BY_PH_NC18 DOUBLE PRECISION,
            NC21_NC22_BY_NC28_NC29 DOUBLE PRECISION,
            OEP_ODD_EVEN_PREF DOUBLE PRECISION,
            CP_INDEX DOUBLE PRECISION,
            TA_RATIO DOUBLE PRECISION,
            NC17_BY_NC29 DOUBLE PRECISION,
            PAQ DOUBLE PRECISION,
            NC17_BY_NC27 DOUBLE PRECISION,
            C_MAX DOUBLE PRECISION,
            ANALYSED_AT TEXT,
            REMARKS TEXT,
            INSERT_USER TEXT,
            INSERT_DATE DATE DEFAULT CURRENT_DATE,
            UPDATE_USER TEXT,
            UPDATE_DATE DATE DEFAULT CURRENT_DATE,
            BOREHOLE_ID INTEGER,
            uploaded_by UUID
        )
    """))
    db.commit()

    # Ensure DL_GCH_OIL_COMPOSITION exists
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS DL_GCH_OIL_COMPOSITION (
            ID SERIAL PRIMARY KEY,
            UBHI TEXT,
            WELL_NAME TEXT,
            OBJECT_NUMBER TEXT,
            INTERVAL_TOP DOUBLE PRECISION,
            INTERVAL_BOTTOM DOUBLE PRECISION,
            FORMATION TEXT,
            MATERIAL_TYPE TEXT,
            ANALYSIS_DATE DATE,
            LOCATION TEXT,
            COLLECTION_DATE DATE,
            IBP DOUBLE PRECISION,
            WATER_CONTENT DOUBLE PRECISION,
            API_GRAVITY DOUBLE PRECISION,
            POUR_POINT DOUBLE PRECISION,
            SULFUR DOUBLE PRECISION,
            SAT_BY_ARO DOUBLE PRECISION,
            SAT DOUBLE PRECISION,
            AR DOUBLE PRECISION,
            ASP DOUBLE PRECISION,
            NSO DOUBLE PRECISION,
            ANALYSED_AT TEXT,
            REMARKS TEXT,
            INSERT_USER TEXT,
            INSERT_DATE DATE DEFAULT CURRENT_DATE,
            UPDATE_USER TEXT,
            UPDATE_DATE DATE DEFAULT CURRENT_DATE,
            BOREHOLE_ID INTEGER,
            uploaded_by UUID
        )
    """))
    db.commit()

    # Ensure DL_ISOTOPE_GAS exists
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS DL_ISOTOPE_GAS (
            ID SERIAL PRIMARY KEY,
            UBHI TEXT,
            NAME TEXT,
            OBJECT_NUMBER TEXT,
            INTERVAL_TOP DOUBLE PRECISION,
            INTERVAL_BOTTOM DOUBLE PRECISION,
            FORMATION TEXT,
            MATERIAL_TYPE TEXT,
            COLLECTION_DATE DATE,
            C1 DOUBLE PRECISION,
            C2 DOUBLE PRECISION,
            C3 DOUBLE PRECISION,
            IC4 DOUBLE PRECISION,
            NC4 DOUBLE PRECISION,
            IC5 DOUBLE PRECISION,
            NC5 DOUBLE PRECISION,
            C6_PLUS DOUBLE PRECISION,
            C2_PLUS DOUBLE PRECISION,
            N2 DOUBLE PRECISION,
            CO2 DOUBLE PRECISION,
            HE DOUBLE PRECISION,
            HYDROGEN DOUBLE PRECISION,
            DELTA_C1 DOUBLE PRECISION,
            DELTA_C2 DOUBLE PRECISION,
            DELTA_C3 DOUBLE PRECISION,
            DELTA_IC4 DOUBLE PRECISION,
            DELTA_NC4 DOUBLE PRECISION,
            DELTA_IC5 DOUBLE PRECISION,
            DELTA_NC5 DOUBLE PRECISION,
            DELTA_CO2 DOUBLE PRECISION,
            C1_BY_C2_PLUS_C3 DOUBLE PRECISION,
            C2_BY_C3 DOUBLE PRECISION,
            DELTA_C2_BY_DELTA_C3 DOUBLE PRECISION,
            LN_C2_BY_C3 DOUBLE PRECISION,
            C1_BY_C2 DOUBLE PRECISION,
            LN_C1_BY_C2 DOUBLE PRECISION,
            ANALYSED_AT TEXT,
            REMARKS TEXT,
            INSERT_USER TEXT,
            INSERT_DATE DATE DEFAULT CURRENT_DATE,
            UPDATE_USER TEXT,
            UPDATE_DATE DATE DEFAULT CURRENT_DATE,
            BOREHOLE_ID INTEGER,
            uploaded_by UUID
        )
    """))
    db.commit()

    # Ensure W_BOREHOLE exists
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS W_BOREHOLE (
            BOREHOLE_ID SERIAL PRIMARY KEY,
            UBHI VARCHAR(64) UNIQUE,
            BOREHOLE_NAME VARCHAR(150) UNIQUE
        )
    """))
    db.commit()

    db.execute(text("DROP VIEW IF EXISTS DL_ISOTOPE_GAS_VW CASCADE"))
    db.execute(text("""
        CREATE VIEW DL_ISOTOPE_GAS_VW AS
        SELECT 
            t.ID,
            COALESCE(b.UBHI, t.UBHI) AS UBHI,
            t.NAME,
            t.OBJECT_NUMBER,
            t.INTERVAL_TOP,
            t.INTERVAL_BOTTOM,
            t.FORMATION,
            t.MATERIAL_TYPE,
            t.COLLECTION_DATE,
            t.C1, t.C2, t.C3, t.IC4, t.NC4, t.IC5, t.NC5, t.C6_PLUS, t.C2_PLUS, t.N2, t.CO2, t.HE, t.HYDROGEN,
            t.DELTA_C1, t.DELTA_C2, t.DELTA_C3, t.DELTA_IC4, t.DELTA_NC4, t.DELTA_IC5, t.DELTA_NC5, t.DELTA_CO2,
            t.C1_BY_C2_PLUS_C3, t.C2_BY_C3, t.DELTA_C2_BY_DELTA_C3, t.LN_C2_BY_C3, t.C1_BY_C2, t.LN_C1_BY_C2,
            t.ANALYSED_AT, t.REMARKS, t.INSERT_USER, t.INSERT_DATE, t.UPDATE_USER, t.UPDATE_DATE,
            t.BOREHOLE_ID, t.uploaded_by
        FROM DL_ISOTOPE_GAS t
        LEFT JOIN W_BOREHOLE b ON t.BOREHOLE_ID = b.BOREHOLE_ID;
    """))
    db.commit()

    # Recreate DL_ISOTOPE_OIL table and view
    db.execute(text("DROP VIEW IF EXISTS DL_ISOTOPE_OIL_VW CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_ISOTOPE_OIL CASCADE"))
    db.execute(text("""
        CREATE TABLE DL_ISOTOPE_OIL (
            ID SERIAL PRIMARY KEY,
            UBHI TEXT,
            NAME TEXT,
            INTERVAL_TOP DOUBLE PRECISION,
            INTERVAL_BOTTOM DOUBLE PRECISION,
            FORMATION TEXT,
            DELTA_SAT DOUBLE PRECISION,
            DELTA_ARO DOUBLE PRECISION,
            CV DOUBLE PRECISION,
            INSERT_USER TEXT,
            INSERT_DATE DATE DEFAULT CURRENT_DATE,
            UPDATE_USER TEXT,
            UPDATE_DATE DATE DEFAULT CURRENT_DATE,
            BOREHOLE_ID INTEGER,
            uploaded_by UUID
        )
    """))
    db.execute(text("""
        CREATE VIEW DL_ISOTOPE_OIL_VW AS
        SELECT 
            t.ID,
            COALESCE(b.UBHI, t.UBHI) AS UBHI,
            t.NAME,
            t.INTERVAL_TOP,
            t.INTERVAL_BOTTOM,
            t.FORMATION,
            t.DELTA_SAT,
            t.DELTA_ARO,
            t.CV,
            t.INSERT_USER, t.INSERT_DATE, t.UPDATE_USER, t.UPDATE_DATE,
            t.BOREHOLE_ID, t.uploaded_by
        FROM DL_ISOTOPE_OIL t
        LEFT JOIN W_BOREHOLE b ON t.BOREHOLE_ID = b.BOREHOLE_ID;
    """))
    db.commit()

    # Recreate DL_ISOTOPE_CSIA table and view
    db.execute(text("DROP VIEW IF EXISTS DL_ISOTOPE_CSIA_VW CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_ISOTOPE_CSIA CASCADE"))
    db.execute(text("""
        CREATE TABLE DL_ISOTOPE_CSIA (
            ID SERIAL PRIMARY KEY,
            UBHI TEXT,
            NAME TEXT,
            INTERVAL_TOP DOUBLE PRECISION,
            INTERVAL_BOTTOM DOUBLE PRECISION,
            FORMATION TEXT,
            NC15 DOUBLE PRECISION,
            NC16 DOUBLE PRECISION,
            NC17 DOUBLE PRECISION,
            NC18 DOUBLE PRECISION,
            NC19 DOUBLE PRECISION,
            NC20 DOUBLE PRECISION,
            NC21 DOUBLE PRECISION,
            NC22 DOUBLE PRECISION,
            NC23 DOUBLE PRECISION,
            NC24 DOUBLE PRECISION,
            NC25 DOUBLE PRECISION,
            NC26 DOUBLE PRECISION,
            NC27 DOUBLE PRECISION,
            NC28 DOUBLE PRECISION,
            NC29 DOUBLE PRECISION,
            NC30 DOUBLE PRECISION,
            NC31 DOUBLE PRECISION,
            NC32 DOUBLE PRECISION,
            NC33 DOUBLE PRECISION,
            NC34 DOUBLE PRECISION,
            INSERT_USER TEXT,
            INSERT_DATE DATE DEFAULT CURRENT_DATE,
            UPDATE_USER TEXT,
            UPDATE_DATE DATE DEFAULT CURRENT_DATE,
            BOREHOLE_ID INTEGER,
            uploaded_by UUID
        )
    """))
    db.execute(text("""
        CREATE VIEW DL_ISOTOPE_CSIA_VW AS
        SELECT 
            t.ID,
            COALESCE(b.UBHI, t.UBHI) AS UBHI,
            t.NAME,
            t.INTERVAL_TOP,
            t.INTERVAL_BOTTOM,
            t.FORMATION,
            t.NC15, t.NC16, t.NC17, t.NC18, t.NC19, t.NC20, t.NC21, t.NC22, t.NC23, t.NC24, t.NC25, t.NC26, t.NC27, t.NC28, t.NC29, t.NC30, t.NC31, t.NC32, t.NC33, t.NC34,
            t.INSERT_USER, t.INSERT_DATE, t.UPDATE_USER, t.UPDATE_DATE,
            t.BOREHOLE_ID, t.uploaded_by
        FROM DL_ISOTOPE_CSIA t
        LEFT JOIN W_BOREHOLE b ON t.BOREHOLE_ID = b.BOREHOLE_ID;
    """))
    db.commit()


    # Recreate DL_BIOMARKER_STERANE table and view to force updates
    db.execute(text("DROP VIEW IF EXISTS DL_BIOMARKER_STERANE_VW CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_BIOMARKER_STERANE CASCADE"))
    db.commit()

    db.execute(text("""
        CREATE TABLE DL_BIOMARKER_STERANE (
            ID SERIAL PRIMARY KEY,
            UBHI VARCHAR(64),
            NAME VARCHAR(200),
            OBJECT_NO VARCHAR(200),
            DEPTH_TOP DOUBLE PRECISION,
            DEPTH_BOTTOM DOUBLE PRECISION,
            FORMATION VARCHAR(500),
            C27_DIASTERANE_BETA_ALPHA_S DOUBLE PRECISION,
            C27_DIASTERANE_BETA_ALPHA_R DOUBLE PRECISION,
            C27_STERANE_S DOUBLE PRECISION,
            C27_STERANE_BETA_BETA_R DOUBLE PRECISION,
            C27_STERANE_BETA_BETA_S DOUBLE PRECISION,
            C27_STERANE_R DOUBLE PRECISION,
            C28_DIASTERANE_BETA_ALPHA_S DOUBLE PRECISION,
            C28_DIASTERANE_BETA_ALPHA_R DOUBLE PRECISION,
            C28_STERANE_S DOUBLE PRECISION,
            C28_STERANE_BETA_BETA_R DOUBLE PRECISION,
            C28_STERANE_BETA_BETA_S DOUBLE PRECISION,
            C28_STERANE_R DOUBLE PRECISION,
            C29_DIASTERANE_BETA_ALPHA_S DOUBLE PRECISION,
            C29_DIASTERANE_BETA_ALPHA_R DOUBLE PRECISION,
            C29_STERANE_S DOUBLE PRECISION,
            C29_STERANE_BETA_BETA_R DOUBLE PRECISION,
            C29_STERANE_BETA_BETA_S DOUBLE PRECISION,
            C29_STERANE_R DOUBLE PRECISION,
            C27_DIASTERANE_INDEX DOUBLE PRECISION,
            C29_DIASTERANE_INDEX DOUBLE PRECISION,
            C28ST_BY_C29ST DOUBLE PRECISION,
            C27ST_PLUS_C28ST_PLUS_C29ST DOUBLE PRECISION,
            PERC_C27ST_R DOUBLE PRECISION,
            PERC_C28ST_R DOUBLE PRECISION,
            PERC_C29ST_R DOUBLE PRECISION,
            TOTAL_STERANE DOUBLE PRECISION,
            PERC_C27_ST DOUBLE PRECISION,
            PERC_C28_ST DOUBLE PRECISION,
            PERC_C29_ST DOUBLE PRECISION,
            C29_S_BY_S_PLUS_R DOUBLE PRECISION,
            C29_BB_BY_AA_PLUS_BB DOUBLE PRECISION,
            C27_DIAST_BY_C29_DIAST DOUBLE PRECISION,
            C27_ST_BY_C29_ST DOUBLE PRECISION,
            DIAS_C27_BY_C27_PLUS_C29 DOUBLE PRECISION,
            C28BBS_BY_C29BBS_STERANE DOUBLE PRECISION,
            C27R_BY_C27R_PLUS_C29R DOUBLE PRECISION,
            REMARKS VARCHAR(2000),
            ANALYSED_AT VARCHAR(2000),
            INSERT_USER VARCHAR(64),
            INSERT_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UPDATE_USER VARCHAR(64),
            UPDATE_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            BOREHOLE_ID INTEGER REFERENCES W_BOREHOLE(BOREHOLE_ID) ON DELETE SET NULL,
            uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
    """))
    db.commit()

    db.execute(text("""
        CREATE VIEW DL_BIOMARKER_STERANE_VW AS
        SELECT 
            t.ID,
            COALESCE(b.UBHI, t.UBHI) AS UBHI,
            t.NAME,
            t.OBJECT_NO,
            t.DEPTH_TOP,
            t.DEPTH_BOTTOM,
            t.FORMATION,
            t.C27_DIASTERANE_BETA_ALPHA_S,
            t.C27_DIASTERANE_BETA_ALPHA_R,
            t.C27_STERANE_S,
            t.C27_STERANE_BETA_BETA_R,
            t.C27_STERANE_BETA_BETA_S,
            t.C27_STERANE_R,
            t.C28_DIASTERANE_BETA_ALPHA_S,
            t.C28_DIASTERANE_BETA_ALPHA_R,
            t.C28_STERANE_S,
            t.C28_STERANE_BETA_BETA_R,
            t.C28_STERANE_BETA_BETA_S,
            t.C28_STERANE_R,
            t.C29_DIASTERANE_BETA_ALPHA_S,
            t.C29_DIASTERANE_BETA_ALPHA_R,
            t.C29_STERANE_S,
            t.C29_STERANE_BETA_BETA_R,
            t.C29_STERANE_BETA_BETA_S,
            t.C29_STERANE_R,
            t.C27_DIASTERANE_INDEX,
            t.C29_DIASTERANE_INDEX,
            t.C28ST_BY_C29ST,
            t.C27ST_PLUS_C28ST_PLUS_C29ST,
            t.PERC_C27ST_R,
            t.PERC_C28ST_R,
            t.PERC_C29ST_R,
            t.TOTAL_STERANE,
            t.PERC_C27_ST,
            t.PERC_C28_ST,
            t.PERC_C29_ST,
            t.C29_S_BY_S_PLUS_R,
            t.C29_BB_BY_AA_PLUS_BB,
            t.C27_DIAST_BY_C29_DIAST,
            t.C27_ST_BY_C29_ST,
            t.DIAS_C27_BY_C27_PLUS_C29,
            t.C28BBS_BY_C29BBS_STERANE,
            t.C27R_BY_C27R_PLUS_C29R,
            t.REMARKS,
            t.ANALYSED_AT,
            t.INSERT_USER,
            t.INSERT_DATE,
            t.UPDATE_USER,
            t.UPDATE_DATE,
            t.BOREHOLE_ID,
            t.uploaded_by
        FROM DL_BIOMARKER_STERANE t
        LEFT JOIN W_BOREHOLE b ON t.BOREHOLE_ID = b.BOREHOLE_ID;
    """))
    db.commit()

    # Recreate DL_BIOMARKER_HOPANE table and view to force updates
    db.execute(text("DROP VIEW IF EXISTS DL_BIOMARKER_HOPANE_VW CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_BIOMARKER_HOPANE CASCADE"))
    db.commit()

    db.execute(text("""
        CREATE TABLE DL_BIOMARKER_HOPANE (
            ID SERIAL PRIMARY KEY,
            UBHI VARCHAR(64),
            NAME VARCHAR(200),
            DEPTH_TOP DOUBLE PRECISION,
            DEPTH_BOTTOM DOUBLE PRECISION,
            OBJECT_NO VARCHAR(200),
            FORMATION VARCHAR(500),
            C27_TS DOUBLE PRECISION,
            C27_TM DOUBLE PRECISION,
            BCD DOUBLE PRECISION,
            BNH DOUBLE PRECISION,
            C29H DOUBLE PRECISION,
            C29_TS DOUBLE PRECISION,
            DIAHOPANE DOUBLE PRECISION,
            C29_M DOUBLE PRECISION,
            OLA DOUBLE PRECISION,
            OLB DOUBLE PRECISION,
            C30H DOUBLE PRECISION,
            C30M DOUBLE PRECISION,
            C31HH_S DOUBLE PRECISION,
            C31HH_R DOUBLE PRECISION,
            C32HH_S DOUBLE PRECISION,
            C32HH_R DOUBLE PRECISION,
            C33HH_S DOUBLE PRECISION,
            C33HH_R DOUBLE PRECISION,
            C34HH_S DOUBLE PRECISION,
            C34HH_R DOUBLE PRECISION,
            C35HH_S DOUBLE PRECISION,
            C35HH_R DOUBLE PRECISION,
            TOTAL_HH DOUBLE PRECISION,
            TM_BY_TS DOUBLE PRECISION,
            C27TS_BY_TS_PLUS_TM DOUBLE PRECISION,
            C29H_BY_C30H DOUBLE PRECISION,
            C30M_BY_C30H DOUBLE PRECISION,
            C30H_BY_H_PLUS_M DOUBLE PRECISION,
            C31H_S_BY_S_PLUS_R DOUBLE PRECISION,
            C32H_S_BY_S_PLUS_R DOUBLE PRECISION,
            C33H_S_BY_S_PLUS_R DOUBLE PRECISION,
            C34H_S_BY_S_PLUS_R DOUBLE PRECISION,
            C35H_S_BY_S_PLUS_R DOUBLE PRECISION,
            HOMOHOPANE_INDEX DOUBLE PRECISION,
            C35_S_BY_C34_S DOUBLE PRECISION,
            BCD_INDEX DOUBLE PRECISION,
            OLEANANE_INDEX DOUBLE PRECISION,
            C29TS_BY_C29H_PLUS_C29TS DOUBLE PRECISION,
            DIAHOPANE_INDEX DOUBLE PRECISION,
            BNH_INDEX DOUBLE PRECISION,
            C31HH_R_BY_C30H DOUBLE PRECISION,
            C30_DIAHOPANE_BY_C29TS DOUBLE PRECISION,
            PERC_C31HH DOUBLE PRECISION,
            PERC_C32HH DOUBLE PRECISION,
            PERC_C33HH DOUBLE PRECISION,
            PERC_C34HH DOUBLE PRECISION,
            PERC_C35HH DOUBLE PRECISION,
            REMARKS VARCHAR(2000),
            INSERT_USER VARCHAR(64),
            INSERT_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UPDATE_USER VARCHAR(64),
            UPDATE_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            BOREHOLE_ID INTEGER REFERENCES W_BOREHOLE(BOREHOLE_ID) ON DELETE SET NULL,
            uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
    """))
    db.commit()

    db.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_load') THEN
                CREATE ROLE role_load;
            END IF;
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'role_view') THEN
                CREATE ROLE role_view;
            END IF;
        END $$;
    """))
    db.execute(text("CREATE OR REPLACE VIEW DL_BIOMARKER_HOPANE_ AS SELECT * FROM DL_BIOMARKER_HOPANE"))
    db.execute(text("CREATE OR REPLACE VIEW W_BOREHOLE_ AS SELECT borehole_id AS ID, ubhi AS UBHI, borehole_name AS BOREHOLE_NAME FROM W_BOREHOLE"))
    db.execute(text("DROP VIEW IF EXISTS DL_BIOMARKER_HOPANE_VW CASCADE"))
    db.execute(text("""
        CREATE VIEW DL_BIOMARKER_HOPANE_VW AS
        SELECT 
            BIOHP.ID,
            BH.UBHI,
            BIOHP.NAME,
            BIOHP.DEPTH_TOP,
            BIOHP.DEPTH_BOTTOM,
            BIOHP.OBJECT_NO,
            BIOHP.FORMATION,
            BIOHP.C27_TS,
            BIOHP.C27_TM,
            BIOHP.BCD,
            BIOHP.BNH,
            BIOHP.C29H,
            BIOHP.C29_TS,
            BIOHP.DIAHOPANE,
            BIOHP.C29_M,
            BIOHP.OLA,
            BIOHP.OLB,
            BIOHP.C30H,
            BIOHP.C30M,
            BIOHP.C31HH_S,
            BIOHP.C31HH_R,
            BIOHP.C32HH_S,
            BIOHP.C32HH_R,
            BIOHP.C33HH_S,
            BIOHP.C33HH_R,
            BIOHP.C34HH_S,
            BIOHP.C34HH_R,
            BIOHP.C35HH_S,
            BIOHP.C35HH_R,
            BIOHP.TOTAL_HH,
            BIOHP.TM_BY_TS,
            BIOHP.C27TS_BY_TS_PLUS_TM,
            BIOHP.C29H_BY_C30H,
            BIOHP.C30M_BY_C30H,
            BIOHP.C30H_BY_H_PLUS_M,
            BIOHP.C31H_S_BY_S_PLUS_R,
            BIOHP.C32H_S_BY_S_PLUS_R,
            BIOHP.C33H_S_BY_S_PLUS_R,
            BIOHP.C34H_S_BY_S_PLUS_R,
            BIOHP.C35H_S_BY_S_PLUS_R,
            BIOHP.HOMOHOPANE_INDEX,
            BIOHP.C35_S_BY_C34_S,
            BIOHP.BCD_INDEX,
            BIOHP.OLEANANE_INDEX,
            BIOHP.C29TS_BY_C29H_PLUS_C29TS,
            BIOHP.DIAHOPANE_INDEX,
            BIOHP.BNH_INDEX,
            BIOHP.C31HH_R_BY_C30H,
            BIOHP.C30_DIAHOPANE_BY_C29TS,
            BIOHP.PERC_C31HH,
            BIOHP.PERC_C32HH,
            BIOHP.PERC_C33HH,
            BIOHP.PERC_C34HH,
            BIOHP.PERC_C35HH,
            BIOHP.REMARKS,
            BIOHP.INSERT_USER,
            BIOHP.INSERT_DATE,
            BIOHP.UPDATE_USER,
            BIOHP.UPDATE_DATE,
            BIOHP.BOREHOLE_ID
        FROM DL_BIOMARKER_HOPANE_ BIOHP, W_BOREHOLE_ BH
        WHERE BH.ID = BIOHP.BOREHOLE_ID
    """))
    db.execute(text("GRANT DELETE, INSERT, SELECT, UPDATE ON DL_BIOMARKER_HOPANE_VW TO ROLE_LOAD"))
    db.execute(text("GRANT SELECT ON DL_BIOMARKER_HOPANE_VW TO ROLE_VIEW"))
    db.commit()

    # Recreate DL_TRICYCLIC_TERPANE_ table and DL_BIOM_TRICYCLIC_TERP_VW view to force updates
    db.execute(text("DROP VIEW IF EXISTS DL_BIOM_TRICYCLIC_TERP_VW CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_TRICYCLIC_TERPANE_ CASCADE"))
    db.commit()

    db.execute(text("""
        CREATE TABLE DL_TRICYCLIC_TERPANE_ (
            ID SERIAL PRIMARY KEY,
            UBHI VARCHAR(64),
            NAME VARCHAR(200),
            DEPTH DOUBLE PRECISION,
            C19 DOUBLE PRECISION,
            C20 DOUBLE PRECISION,
            C21 DOUBLE PRECISION,
            C22 DOUBLE PRECISION,
            C23 DOUBLE PRECISION,
            C24 DOUBLE PRECISION,
            C25R DOUBLE PRECISION,
            C25S DOUBLE PRECISION,
            C24TET DOUBLE PRECISION,
            C26R DOUBLE PRECISION,
            C26S DOUBLE PRECISION,
            TOTAL DOUBLE PRECISION,
            C19_RATIO DOUBLE PRECISION,
            C20_RATIO DOUBLE PRECISION,
            C21_RATIO DOUBLE PRECISION,
            C22_RATIO DOUBLE PRECISION,
            C23_RATIO DOUBLE PRECISION,
            C24_RATIO DOUBLE PRECISION,
            C25R_RATIO DOUBLE PRECISION,
            C25S_RATIO DOUBLE PRECISION,
            C24TET_RATIO DOUBLE PRECISION,
            C26R_RATIO DOUBLE PRECISION,
            C26S_RATIO DOUBLE PRECISION,
            REMARKS VARCHAR(2000),
            ANALYSED_AT VARCHAR(2000),
            INSERT_USER VARCHAR(64),
            INSERT_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UPDATE_USER VARCHAR(64),
            UPDATE_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            BOREHOLE_ID INTEGER REFERENCES W_BOREHOLE(BOREHOLE_ID) ON DELETE SET NULL,
            uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
    """))
    db.commit()

    db.execute(text("""
        CREATE VIEW DL_BIOM_TRICYCLIC_TERP_VW AS
        SELECT 
            t.ID,
            COALESCE(b.UBHI, t.UBHI) AS UBHI,
            t.NAME,
            t.DEPTH,
            t.C19 AS C19TT,
            t.C20 AS C20TT,
            t.C21 AS C21TT,
            t.C22 AS C22TT,
            t.C23 AS C23TT,
            t.C24 AS C24TT,
            t.C25R AS C25TT_R,
            t.C25S AS C25TT_S,
            t.C24TET AS C24TET_TT,
            t.C26R AS C26TT_R,
            t.C26S AS C26TT_S,
            t.TOTAL,
            t.C19_RATIO AS PERC_C19TT,
            t.C20_RATIO AS PERC_C20TT,
            t.C21_RATIO AS PERC_C21TT,
            t.C22_RATIO AS PERC_C22TT,
            t.C23_RATIO AS PERC_C23TT,
            t.C24_RATIO AS PERC_C24TT,
            t.C25R_RATIO AS PERC_C25TT_R,
            t.C25S_RATIO AS PERC_C25TT_S,
            t.C24TET_RATIO AS PERC_C24TET_TT,
            t.C26R_RATIO AS PERC_C26TT_R,
            t.C26S_RATIO AS PERC_C26TT_S,
            t.REMARKS,
            t.ANALYSED_AT,
            t.INSERT_USER,
            t.INSERT_DATE,
            t.UPDATE_USER,
            t.UPDATE_DATE,
            t.BOREHOLE_ID,
            t.uploaded_by
        FROM DL_TRICYCLIC_TERPANE_ t
        LEFT JOIN W_BOREHOLE b ON t.BOREHOLE_ID = b.BOREHOLE_ID;
    """))
    db.commit()

    # Recreate DL_BIOMARKER_AROMATIC_ table and DL_BIOMARKER_AROMATIC_VW view to force updates
    db.execute(text("DROP VIEW IF EXISTS DL_BIOMARKER_AROMATIC_VW CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_BIOMARKER_AROMATIC_ CASCADE"))
    db.commit()

    db.execute(text("""
        CREATE TABLE DL_BIOMARKER_AROMATIC_ (
            ID SERIAL PRIMARY KEY,
            UBHI VARCHAR(64),
            NAME VARCHAR(200),
            DEPTH DOUBLE PRECISION,
            OBJECT VARCHAR(200),
            FORMATION VARCHAR(500),
            DBT_DIBENZO DOUBLE PRECISION,
            PHE_PHENA DOUBLE PRECISION,
            DBT_BY_PHE DOUBLE PRECISION,
            MP_3 DOUBLE PRECISION,
            MP_2 DOUBLE PRECISION,
            MP_9 DOUBLE PRECISION,
            MP_1 DOUBLE PRECISION,
            MPI DOUBLE PRECISION,
            VRC DOUBLE PRECISION,
            NDR DOUBLE PRECISION,
            TMN_1_2_7 DOUBLE PRECISION,
            TMN_1_3_7 DOUBLE PRECISION,
            TMN_RATIO DOUBLE PRECISION,
            ETR DOUBLE PRECISION,
            ANALYSED_AT VARCHAR(2000),
            REMARKS VARCHAR(2000),
            INSERT_USER VARCHAR(64),
            INSERT_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UPDATE_USER VARCHAR(64),
            UPDATE_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            BOREHOLE_ID INTEGER REFERENCES W_BOREHOLE(BOREHOLE_ID) ON DELETE SET NULL,
            uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
    """))
    db.commit()

    db.execute(text("""
        CREATE VIEW DL_BIOMARKER_AROMATIC_VW AS
        SELECT 
            t.ID,
            COALESCE(b.UBHI, t.UBHI) AS UBHI,
            t.NAME,
            t.DEPTH,
            t.OBJECT,
            t.FORMATION,
            t.DBT_DIBENZO,
            t.PHE_PHENA,
            t.DBT_BY_PHE,
            t.MP_3,
            t.MP_2,
            t.MP_9,
            t.MP_1,
            t.MPI,
            t.VRC,
            t.NDR,
            t.TMN_1_2_7,
            t.TMN_1_3_7,
            t.TMN_RATIO,
            t.ETR,
            t.ANALYSED_AT,
            t.REMARKS,
            t.INSERT_USER,
            t.INSERT_DATE,
            t.UPDATE_USER,
            t.UPDATE_DATE,
            t.BOREHOLE_ID,
            t.uploaded_by
        FROM DL_BIOMARKER_AROMATIC_ t
        LEFT JOIN W_BOREHOLE b ON t.BOREHOLE_ID = b.BOREHOLE_ID;
    """))
    db.commit()

    # Recreate DL_BIOMARKER_PR_PH_ table and DL_BIOMARKER_PR_PH_VW view to force updates
    db.execute(text("DROP VIEW IF EXISTS DL_BIOMARKER_PR_PH_VW CASCADE"))
    db.execute(text("DROP TABLE IF EXISTS DL_BIOMARKER_PR_PH_ CASCADE"))
    db.commit()

    db.execute(text("""
        CREATE TABLE DL_BIOMARKER_PR_PH_ (
            ID SERIAL PRIMARY KEY,
            UBHI VARCHAR(64),
            NAME VARCHAR(200),
            DEPTH DOUBLE PRECISION,
            OBJECT VARCHAR(200),
            FORMATION VARCHAR(500),
            PRISTANE DOUBLE PRECISION,
            PHYTANE DOUBLE PRECISION,
            PR_BY_PH DOUBLE PRECISION,
            ANALYSED_AT VARCHAR(2000),
            REMARKS VARCHAR(2000),
            INSERT_USER VARCHAR(64),
            INSERT_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UPDATE_USER VARCHAR(64),
            UPDATE_DATE TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            BOREHOLE_ID INTEGER REFERENCES W_BOREHOLE(BOREHOLE_ID) ON DELETE SET NULL,
            uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL
        )
    """))
    db.commit()

    db.execute(text("""
        CREATE VIEW DL_BIOMARKER_PR_PH_VW AS
        SELECT 
            t.ID,
            COALESCE(b.UBHI, t.UBHI) AS UBHI,
            t.NAME,
            t.DEPTH,
            t.OBJECT,
            t.FORMATION,
            t.PRISTANE,
            t.PHYTANE,
            t.PR_BY_PH,
            t.ANALYSED_AT,
            t.REMARKS,
            t.INSERT_USER,
            t.INSERT_DATE,
            t.UPDATE_USER,
            t.UPDATE_DATE,
            t.BOREHOLE_ID,
            t.uploaded_by
        FROM DL_BIOMARKER_PR_PH_ t
        LEFT JOIN W_BOREHOLE b ON t.BOREHOLE_ID = b.BOREHOLE_ID;
    """))
    db.commit()

    # Seed Admin User
    admin = crud_user.get_by_email(db, email=settings.FIRST_SUPERUSER)
    if not admin:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            full_name=settings.FIRST_SUPERUSER_NAME,
            role="admin",
            is_active=True
        )
        crud_user.create(db, obj_in=user_in)
        print(f"Created initial admin user: {settings.FIRST_SUPERUSER}")

    # Seed Sample Researcher User
    researcher_email = "researcher@ongc.co.in"
    researcher = crud_user.get_by_email(db, email=researcher_email)
    if not researcher:
        user_in = UserCreate(
            email=researcher_email,
            password="Researcher@123",
            full_name="Senior Geochemist",
            role="researcher",
            is_active=True
        )
        crud_user.create(db, obj_in=user_in)
        print(f"Created initial researcher user: {researcher_email}")

    # Seed Sample Viewer User
    viewer_email = "viewer@ongc.co.in"
    viewer = crud_user.get_by_email(db, email=viewer_email)
    if not viewer:
        user_in = UserCreate(
            email=viewer_email,
            password="Viewer@123",
            full_name="Lab Analyst Viewer",
            role="viewer",
            is_active=True
        )
        crud_user.create(db, obj_in=user_in)
        print(f"Created initial viewer user: {viewer_email}")

    # ── Dynamic Automated Discovery of LIMS Tables ─────────────────────────────
    from sqlalchemy import inspect
    inspector = inspect(engine)
    db_tables = inspector.get_table_names() + inspector.get_view_names()
    
    # Vocabulary map of standard aliases for standard geochemistry columns
    SYNONYM_VOCAB = {
        "ubhi": ["ubhi", "unique borehole id", "unique_borehole_id", "uniqueboreholeid", "unique borehole identifier", "unique_borehole_identifier"],
        "borehole_name": ["well name", "well_name", "well", "borehole name", "borehole_name", "borehole"],
        "well_name": ["well_name", "well name", "well", "wellid", "well_id", "borehole"],
        "core_sample_id": ["sample_id", "core_sample_id", "sample id", "core sample id", "sample", "range"],
        "cuttings_sample_id": ["cuttings_sample_id", "cutting_sample_id", "cuttings sample id", "cutting sample id", "sample", "range"],
        "top_depth": ["depth_from", "top_depth", "depth from", "top depth", "depth", "depth (m)", "md", "cor top (m)", "core top (m)", "core_top", "core top", "cor top", "depth top", "depth top (m)", "top depth (m)"],
        "cuttings_top": ["cutting top (m)", "cuttings top (m)", "cutting_top", "cuttings_top", "cutting top"],
        "cuttings_base": ["cutting base (m)", "cuttings base (m)", "cutting_base", "cuttings_base", "cutting base"],
        "bottom_depth": ["depth_to", "bottom_depth", "depth to", "bottom depth", "depth_interval_end", "core base (m)", "core_base", "core base", "depth bottom", "depth bottom (m)", "bottom depth (m)"],
        "depth_from": ["depth_from", "depth from", "depth", "depth_m", "depth (m)", "md", "top_depth"],
        "depth_interval": ["depth_interval", "depth interval", "interval", "thickness", "step", "sample_interval"],
        "lithology": ["sample_type", "lithology", "sample type", "rock_type", "rock type", "lithology_desc"],
        "sample_type": ["sample_type", "sample type", "sampletype", "type", "rock_type", "lithology"],
        "layer_name": ["layer_name", "layer name", "formation", "member", "layer"],
        "formation": ["formation", "layer_name", "layer name", "member", "layer", "formation/age", "formation age"],
        "toc": ["toc", "toc%", "toc (wt%)", "toc_wt%", "total_organic_carbon", "toc%"],
        "s1": ["s1", "s1 (mg/g)", "s1_mg_g", "pyrolysis_s1"],
        "s2": ["s2", "s2 (mg/g)", "s2_mg_g", "pyrolysis_s2", "s2_peak"],
        "s3": ["s3", "s3 (mg/g)", "s3_mg_g", "pyrolysis_s3"],
        "tmax": ["tmax", "t_max", "tmax (deg c)", "tmax (°c)", "tmax(c)"],
        "hi": ["hi", "hydrogen_index", "hi (mg/g)", "hydrogen index"],
        "oi": ["oi", "oxygen_index", "oi (mg/g)", "oxygen index"],
        "vro": ["vro", "vro%", "mean_reflectance", "vitrinite_reflectance"],
        "average_vro": ["average vro (%)", "average vro", "average_vro", "average_vro (%)"],
        "no_of_readings": ["no. of readings", "no of readings", "no_of_readings", "readings", "no. of reading"],
        "pi": ["pi", "production_index"],
        "osi": ["osi", "oil_saturation_index"],
        "minc": ["minc", "mineral_carbon"],
        "author": ["author", "analyst", "operator"],
        "year": ["year", "publication_year", "date_year", "publication year", "date year"],
        "analysed_at": ["analysed_at", "analysis_date", "date_analysed", "analysed at", "analysis date", "date analysed"],
        "core_top": ["core\\ top (m)", "core top (m)", "core_top", "core top", "core\\ top"],
        "core_base": ["core base (m)", "core_base", "core base", "core_base (m)"],
        "activity_type": ["activity type", "activity_type", "activity"],
        "analysis_type": ["analysis type", "analysis_type", "analysis"],
        "sample_top": ["sample top (m)", "sample_top", "sample top", "sample_top (m)"],
        "sample_bottom": ["sample bottom (m)", "sample_bottom", "sample bottom", "sample_bottom (m)"],
        "segment_position": ["segment depth", "segment_position", "segment depth (m)", "segment position"],
        "s2_extraction": ["s2 after extraction", "s2_extraction", "s2 extraction", "s2 after ext"],
        "others": ["others", "other"],
        "special_obs": ["special observations", "special_obs", "special observation", "special_observations"],
        "description": ["report title", "description", "report_title", "title"],
        "remarks": ["remarks", "remark"],
        "insert_user": ["insert user", "insert_user"],
        "insert_date": ["insert date", "insert_date"],
        "update_user": ["update user", "update_user"],
        "update_date": ["update_date", "update date"],
        
        # Gas Chromatography synonyms
        "interval_top": ["interval top", "interval_top", "top interval", "top", "interval top (m)", "top depth", "top_depth", "depth"],
        "interval_bottom": ["interval bottom", "interval_bottom", "bottom interval", "bottom", "interval bottom (m)", "bottom depth", "bottom_depth"],
        "collection_date": ["collection date", "collection_date", "date collected", "collected date", "date_collected"],
        "analysis_date": ["analysis date", "analysis_date", "analysed_at", "analysed date", "date analysed", "date_analysed"],
        "material_type": ["material type", "material_type", "sample type", "sample_type", "type"],
        "location": ["location", "loc", "area", "field"],
        "object_number": ["object number", "object_number", "object no", "object_no", "object #", "sample id", "sample_id", "id", "depth(m)/object", "depth(m)/\nobject", "depth(m)object"],
        "name": ["name", "well name", "well_name", "sample name", "sample_name", "well", "borehole"],
        "pr": ["pr", "pristane", "pristane peak"],
        "ph": ["ph", "phytane", "phytane peak"],
        "pr_by_ph": ["pr/ph", "pr_by_ph", "pristane/phytane", "pr_ph", "pr ph"],
        "pr_by_nc17": ["pr/nc17", "pr_by_nc17", "pr/n-c17", "pr_nc17"],
        "ph_by_nc18": ["ph/nc18", "ph_by_nc18", "ph/n-c18", "ph_nc18"],
        "pr_nc17_by_ph_nc18": ["(pr/nc17)/(ph/nc18)", "pr_nc17_by_ph_nc18", "pr/nc17 / ph/nc18", "pr_nc17/ph_nc18"],
        "nc21_nc22_by_nc28_nc29": ["(nc21+nc22)/(nc28+nc29)", "nc21_nc22_by_nc28_nc29", "nc21+nc22/nc28+nc29", "nc21_nc22/nc28_nc29"],
        "oep_odd_even_pref": ["oep", "odd-even preference", "odd_even_pref", "oep_odd_even_pref"],
        "cp_index": ["cpi", "carbon preference index", "cp_index", "carbon_preference_index"],
        "ta_ratio": ["ta ratio", "ta_ratio", "taraxerol ratio", "ta"],
        "nc17_by_nc29": ["nc17/nc29", "nc17_by_nc29", "nc17_nc29"],
        "paq": ["paq", "paq ratio", "paq_ratio"],
        "nc17_by_nc27": ["nc17/nc27", "nc17_by_nc27", "nc17_nc27"],
        "c_max": ["cmax", "c_max", "c-max", "max carbon"],
        
        # Tricyclic Terpane synonyms
        "c19tt": ["c19tt", "c19", "c19 tt", "c19_tt"],
        "c20tt": ["c20tt", "c20", "c20 tt", "c20_tt"],
        "c21tt": ["c21tt", "c21", "c21 tt", "c21_tt"],
        "c22tt": ["c22tt", "c22", "c22 tt", "c22_tt"],
        "c23tt": ["c23tt", "c23", "c23 tt", "c23_tt"],
        "c24tt": ["c24tt", "c24", "c24 tt", "c24_tt"],
        "c25tt_r": ["c25tt_r", "c25r", "c25tt-r"],
        "c25tt_s": ["c25tt_s", "c25s", "c25tt-s"],
        "c24tet_tt": ["c24tet_tt", "c24tet", "c24tet-tt"],
        "c26tt_r": ["c26tt_r", "c26r", "c26tt-r"],
        "c26tt_s": ["c26tt_s", "c26s", "c26tt-s"],
        "perc_c19tt": ["perc_c19tt", "c19 ratio", "c19_ratio", "c19ratio", "perc c19tt", "perc_c19tt", "percc19tt", "perc c19 tt", "% c19 tt", "% c19_tt"],
        "perc_c20tt": ["perc_c20tt", "c20 ratio", "c20_ratio", "c20ratio", "perc c20tt", "perc_c20tt", "percc20tt", "perc c20 tt", "% c20 tt", "% c20_tt"],
        "perc_c21tt": ["perc_c21tt", "c21 ratio", "c21_ratio", "c21ratio", "perc c21tt", "perc_c21tt", "percc21tt", "perc c21 tt", "% c21 tt", "% c21_tt"],
        "perc_c22tt": ["perc_c22tt", "c22 ratio", "c22_ratio", "c22ratio", "perc c22tt", "perc_c22tt", "percc22tt", "perc c22 tt", "% c22 tt", "% c22_tt"],
        "perc_c23tt": ["perc_c23tt", "c23 ratio", "c23_ratio", "c23ratio", "perc c23tt", "perc_c23tt", "percc23tt", "perc c23 tt", "% c23 tt", "% c23_tt"],
        "perc_c24tt": ["perc_c24tt", "c24 ratio", "c24_ratio", "c24ratio", "perc c24tt", "perc_c24tt", "percc24tt", "perc c24 tt", "% c24 tt", "% c24_tt"],
        "perc_c25tt_r": ["perc_c25tt_r", "c25r_ratio", "perc_c25tt_r", "c25r ratio", "c25r_ratio", "perc c25tt r", "% c25 tt_r", "% c25tt_r", "percc25ttr"],
        "perc_c25tt_s": ["perc_c25tt_s", "c25s_ratio", "perc_c25tt_s", "c25s ratio", "c25s_ratio", "perc c25tt s", "% c25 tt_s", "% c25tt_s", "percc25tts"],
        "perc_c24tet_tt": ["perc_c24tet_tt", "c24tet_ratio", "perc_c24tet_tt", "c24tet ratio", "c24tet_ratio", "perc c24tet", "% c24tet", "percc24tet"],
        "perc_c26tt_r": ["perc_c26tt_r", "c26r_ratio", "perc_c26tt_r", "c26r ratio", "c26r_ratio", "perc c26tt r", "% c26 tt_r", "% c26tt_r", "percc26ttr"],
        "perc_c26tt_s": ["perc_c26tt_s", "c26s_ratio", "perc_c26tt_s", "c26s ratio", "c26s_ratio", "perc c26tt s", "% c26tt_s", "% c26tt_s", "percc26tts"],
        
        # Aromatic Biomarker synonyms
        "object": ["object", "object_no", "object no", "sample id", "sample_id", "id", "object_number"],
        "dbt_dibenzo": ["dbt_dibenzo", "dbt", "dbt dibenzo", "dbt_dibenzo", "dibenzo", "dibenzothiophene (dbt)"],
        "phe_phena": ["phe_phena", "phenanthrene", "phe", "phe phena", "phe_phena", "phena", "phenanthrene (phe)"],
        "mp_3": ["mp_3", "mp3", "mp-3", "3mp", "3-mp", "3-methylphenanthrene (3-mp)", "3-methylphenanthrene"],
        "mp_2": ["mp_2", "mp2", "mp-2", "2mp", "2-mp", "2-methylphenanthrene (2-mp)", "2-methylphenanthrene"],
        "mp_9": ["mp_9", "mp9", "mp-9", "9mp", "9-mp", "9-methylphenanthrene (9-mp)", "9-methylphenanthrene"],
        "mp_1": ["mp_1", "mp1", "mp-1", "1mp", "1-mp", "1-methylphenanthrene (1-mp)", "1-methylphenanthrene"],
        "dbt_by_phe": ["dbt_by_phe", "dbt/phe", "dbt_phe", "dbt / phe", "dbt/ph"],
        "mpi": ["mpi", "mpi ratio", "methylphenanthrene index", "mpi=1.5*(2mp+3mp)/(p+1mp+9mp)"],
        "vrc": ["vrc", "vrc ratio", "vrc calculated", "calculated vro", "vrc_vro", "vrc=0.4+(0.6*mpi)", "vrc=0.4+(0.6*mpi)"],
        "ndr": ["ndr", "ndr %", "ndr ratio", "ndr_ratio"],
        "tmn_1_2_7": ["1,2,7 tmn (trimethylnaphthalene)", "1,2,7 tmn", "1,2,7-tmn", "127tmn", "127 tmn", "tmn_127", "1,2,7 tmn (trimethylnaphthalene)", "1,2,7 tmn (trimethylnaphthalene)"],
        "tmn_1_3_7": ["1,3,7 tmn (trimethylnaphthalene)", "1,3,7 tmn", "1,3,7-tmn", "137tmn", "137 tmn", "tmn_137", "1,3,7 tmn (trimethylnaphthalene)", "1,3,7 tmn (trimethylnaphthalene)"],
        "tmn_ratio": ["1,2,7 tmn/1,3,7 tmn", "1,2,7-tmn/1,3,7-tmn", "tmn ratio", "tmn_ratio", "1,2,7 tmn / 1,3,7 tmn", "1,2,7 tmn/1,3,7 tmn", "1,2,7 tmn/1,3,7 tmn"],
        "etr": ["etr", "etr %", "etr ratio", "etr_ratio"],
        
        # Hopane synonyms
        "depth_top": ["depth_top", "depth top", "depth (m)", "depth", "depth_from", "depth from", "top depth", "top_depth"],
        "object_no": ["object_no", "object no", "object", "object_number", "sample id", "sample_id", "id", "object_no"],
        "c27_ts": ["c27_ts", "c27 ts", "c27ts", "c27 18α-trisnorhopane (c27 ts)", "c27 18α-trisnorhopane", "c27 18a-trisnorhopane"],
        "c27_tm": ["c27_tm", "c27 tm", "c27tm", "c27 17α-trisnorhopane (c27 tm)", "c27 17α-trisnorhopane", "c27 17a-trisnorhopane"],
        "bcd": ["bcd", "bicadinane", "bicadinane (bcd)"],
        "bnh": ["bnh", "bisnorhopane", "bisnorhopane (bnh)"],
        "c29h": ["c29h", "c29 h", "c29 hopane", "c29 hopane (c29h)"],
        "c29_ts": ["c29_ts", "c29 ts", "c29ts"],
        "diahopane": ["diahopane"],
        "c29_m": ["c29_m", "c29 m", "c29m", "c29 moretane", "c29 moretane c29m"],
        "ola": ["ola", "18α-oleanane", "18a-oleanane", "18α-oleanane (ola)", "18a-oleanane (ola)"],
        "olb": ["olb", "18β-oleanane", "18b-oleanane", "18β-oleanane (olb)", "18b-oleanane (olb)"],
        "c30h": ["c30h", "c30 h", "c30 hopane", "c30 hopane c30h", "c30hopane"],
        "c30m": ["c30m", "c30 m", "c30 moretane", "c30 hopane c30m", "c30moretane"],
        "c31hh_s": ["c31hh_s", "c31hh s", "c31hhs", "c31 homohopane s", "c31hh s isomer"],
        "c31hh_r": ["c31hh_r", "c31hh r", "c31hhr", "c31 homohopane r", "c31hh r isomer"],
        "c32hh_s": ["c32hh_s", "c32hh s", "c32hhs", "c32 homohopane s", "c32hh s isomer"],
        "c32hh_r": ["c32hh_r", "c32hh r", "c32hhr", "c32 homohopane r", "c32hh r isomer"],
        "c33hh_s": ["c33hh_s", "c33hh s", "c33hhs", "c33 homohopane s", "c33hh s isomer"],
        "c33hh_r": ["c33hh_r", "c33hh r", "c33hhr", "c33 homohopane r", "c33hh r isomer"],
        "c34hh_s": ["c34hh_s", "c34hh s", "c34hhs", "c34 homohopane s", "c34hh s isomer"],
        "c34hh_r": ["c34hh_r", "c34hh r", "c34hhr", "c34 homohopane r", "c34hh r isomer"],
        "c35hh_s": ["c35hh_s", "c35hh s", "c35hhs", "c35 homohopane s", "c35hh s isomer"],
        "c35hh_r": ["c35hh_r", "c35hh r", "c35hhr", "c35 homohopane r", "c35hh r isomer"],
        "tm_by_ts": ["tm_by_ts", "tm/ts", "tm ts", "tmts"],
        "c27ts_by_ts_plus_tm": ["c27ts_by_ts_plus_tm", "c27 ts/ts+tm", "c27 ts/(ts+tm)", "c27tststm", "c27tsts+tm", "c27ts/ts+tm"],
        "c29h_by_c30h": ["c29h_by_c30h", "c29h/c30h", "c29hc30h"],
        "c30m_by_c30h": ["c30m_by_c30h", "c30m/c30h", "c30mc30h"],
        "c30h_by_h_plus_m": ["c30h_by_h_plus_m", "c30h/(c30h+c30m)", "c30h/(h+m)", "c30hhhm", "c30hhh+m", "c30h/c30h+c30m", "c30h/h+m"],
        "c31h_s_by_s_plus_r": ["c31h_s_by_s_plus_r", "c31h s/(s+r)", "c31hh s/(s+r)", "c31hssr", "c31hss+r", "c31h/s+r", "c31hhs/s+r"],
        "c32h_s_by_s_plus_r": ["c32h_s_by_s_plus_r", "c32h s/(s+r)", "c32hh s/(s+r)", "c32hssr", "c32hss+r", "c32h/s+r", "c32hhs/s+r"],
        "c33h_s_by_s_plus_r": ["c33h_s_by_s_plus_r", "c33h s/(s+r)", "c33hh s/(s+r)", "c33hssr", "c33hss+r", "c33h/s+r", "c33hhs/s+r"],
        "c34h_s_by_s_plus_r": ["c34h_s_by_s_plus_r", "c34h s/(s+r)", "c34hh s/(s+r)", "c34hssr", "c34hss+r", "c34h/s+r", "c34hhs/s+r"],
        "c35h_s_by_s_plus_r": ["c35h_s_by_s_plus_r", "c35h s/(s+r)", "c35hh s/(s+r)", "c35hssr", "c35hss+r", "c35h/s+r", "c35hhs/s+r"],
        "homohopane_index": ["homohopane_index", "homohopane index", "homohopaneindex"],
        "c35_s_by_c34_s": ["c35_s_by_c34_s", "c35 s/c34s", "c35 s/c34s (homohopane)", "c35sc34s"],
        "bcd_index": ["bcd_index", "bcd index", "bcdindex"],
        "oleanane_index": ["oleanane_index", "oleanane index", "oleananeindex"],
        "c29ts_by_c29h_plus_c29ts": ["c29ts_by_c29h_plus_c29ts", "c29ts/(c29h+c29ts)", "c29tsc29hc29ts", "c29ts/c29h+c29ts"],
        "diahopane_index": ["diahopane_index", "diahopane index", "diahopaneindex"],
        "bnh_index": ["bnh_index", "bnh index", "bnhindex"],
        "c31hh_r_by_c30h": ["c31hh_r_by_c30h", "c31hh (r)/ c30h", "c31hh(r)/c30h", "c31hhrc30h", "c31hhr/c30h"],
        "c30_diahopane_by_c29ts": ["c30_diahopane_by_c29ts", "c30 diahopane/c29ts", "c30diahopane/c29ts", "c30diahopanec29ts"],
        "perc_c31hh": ["perc_c31hh", "%c31hh", "c31hh"],
        "perc_c32hh": ["perc_c32hh", "%c32hh", "c32hh"],
        "perc_c33hh": ["perc_c33hh", "%c33hh", "c33hh"],
        "perc_c34hh": ["perc_c34hh", "%c34hh", "c34hh"],
        "perc_c35hh": ["perc_c35hh", "%c35hh", "c35hh"],
        
        # Sterane synonyms
        "c27_diasterane_beta_alpha_s": ["c27_diasterane_beta_alpha_s", "c27 diasterane βαs", "c27diasteraneβαs", "c27 diasterane bas", "c27diasteranebas"],
        "c27_diasterane_beta_alpha_r": ["c27_diasterane_beta_alpha_r", "c27 diasterane βαr", "c27diasteraneβαr", "c27 diasterane bar", "c27diasteranebar"],
        "c27_sterane_s": ["c27_sterane_s", "c27 sterane s", "c27steranes", "s (c27st)", "c27 sterane s (c27st)", "c27steranes(c27st)"],
        "c27_sterane_beta_beta_r": ["c27_sterane_beta_beta_r", "c27 sterane ββr", "c27steraneββr", "ββr (c27st)", "c27 sterane ββr (c27st)", "c27steraneββr(c27st)", "c27 sterane bbr", "c27steranebbr", "bbr (c27st)"],
        "c27_sterane_beta_beta_s": ["c27_sterane_beta_beta_s", "c27 sterane ββs", "c27steraneββs", "ββs (c27st)", "c27 sterane ββs (c27st)", "c27steraneββs(c27st)", "c27 sterane bbs", "c27steranebbs", "bbs (c27st)"],
        "c27_sterane_r": ["c27_sterane_r", "c27 sterane r", "c27steraner", "r (c27st)", "c27 sterane r (c27st)", "c27steraner(c27st)"],
        
        "c28_diasterane_beta_alpha_s": ["c28_diasterane_beta_alpha_s", "c28 diasterane βαs", "c28diasteraneβαs", "c28 diasterane bas", "c28diasteranebas"],
        "c28_diasterane_beta_alpha_r": ["c28_diasterane_beta_alpha_r", "c28 diasterane βαr", "c28diasteraneβαr", "c28 diasterane bar", "c28diasteranebar"],
        "c28_sterane_s": ["c28_sterane_s", "c28 sterane s", "c28steranes", "s (c28st)", "c28 sterane s (c28st)", "c28steranes(c28st)"],
        "c28_sterane_beta_beta_r": ["c28_sterane_beta_beta_r", "c28 sterane ββr", "c28steraneββr", "ββr (c28st)", "c28 sterane ββr (c28st)", "c28steraneββr(c28st)", "c28 sterane bbr", "c28steranebbr", "bbr (c28st)"],
        "c28_sterane_beta_beta_s": ["c28_sterane_beta_beta_s", "c28 sterane ββs", "c28steraneββs", "ββs (c28st)", "c28 sterane ββs (c28st)", "c28steraneββs(c28st)", "c28 sterane bbs", "c28steranebbs", "bbs (c28st)"],
        "c28_sterane_r": ["c28_sterane_r", "c28 sterane r", "c28steraner", "r (c28st)", "c28 sterane r (c28st)", "c28steraner(c28st)"],

        "c29_diasterane_beta_alpha_s": ["c29_diasterane_beta_alpha_s", "c29 diasterane βαs", "c29diasteraneβαs", "c29 diasterane bas", "c29diasteranebas"],
        "c29_diasterane_beta_alpha_r": ["c29_diasterane_beta_alpha_r", "c29 diasterane βαr", "c29diasteraneβαr", "c29 diasterane bar", "c29diasteranebar"],
        "c29_sterane_s": ["c29_sterane_s", "c29 sterane s", "c29steranes", "s (c29st)", "c29 sterane s (c29st)", "c29steranes(c29st)"],
        "c29_sterane_beta_beta_r": ["c29_sterane_beta_beta_r", "c29 sterane ββr", "c29steraneββr", "ββr (c29st)", "c29 sterane ββr (c29st)", "c29steraneββr(c29st)", "c29 sterane bbr", "c29steranebbr", "bbr (c29st)", "ββr (c27st)", "c29 sterane ββr (c27st)"],
        "c29_sterane_beta_beta_s": ["c29_sterane_beta_beta_s", "c29 sterane ββs", "c29steraneββs", "ββs (c29st)", "c29 sterane ββs (c29st)", "c29steraneββs(c29st)", "c29 sterane bbs", "c29steranebbs", "bbs (c29st)"],
        "c29_sterane_r": ["c29_sterane_r", "c29 sterane r", "c29steraner", "r (c29st)", "c29 sterane r (c29st)", "c29steraner(c29st)"],

        "c27_diasterane_index": ["c27_diasterane_index", "c27 diasterane index", "c27diasteraneindex"],
        "c29_diasterane_index": ["c29_diasterane_index", "c29 diasterane index", "c29diasteraneindex"],
        "c28st_by_c29st": ["c28st_by_c29st", "c28st/c29 st", "c28st/c29st"],
        "c27st_plus_c28st_plus_c29st": ["c27st_plus_c28st_plus_c29st", "c27st r + c28st r + c29st r", "c27str+c28str+c29str"],
        "perc_c27st_r": ["perc_c27st_r", "% c27 st r", "%c27str"],
        "perc_c28st_r": ["perc_c28st_r", "% c28 st r", "%c28str"],
        "perc_c29st_r": ["perc_c29st_r", "% c29 st r", "%c29str"],
        
        "total_sterane": ["total_sterane", "toal sterane", "total sterane", "totalsterane", "toalsterane"],
        
        "perc_c27_st": ["perc_c27_st", "% c27 st ", "%c27st"],
        "perc_c28_st": ["perc_c28_st", "% c28 st ", "%c28st"],
        "perc_c29_st": ["perc_c29_st", "% c29 st ", "%c29st"],
        
        "c29_s_by_s_plus_r": ["c29_s_by_s_plus_r", "c29 s/(s+r)", "c29 s/s+r", "c29s/s+r", "c29s/(s+r)"],
        "c29_bb_by_aa_plus_bb": ["c29_bb_by_aa_plus_bb", "c29 ββ/(αα+ββ)", "c29 bb/(aa+bb)", "c29 ββ/αα+ββ", "c29ββ/(αα+ββ)"],
        "c27_diast_by_c29_diast": ["c27_diast_by_c29_diast", "c27 diasterane /c29 diasterane", "c27 diasterane/c29 diasterane", "c27diasterane/c29diasterane"],
        "c27_st_by_c29_st": ["c27_st_by_c29_st", "c27 st / c29 st", "c27 st/c29 st", "c27st/c29st", "c27st / c29st"],
        "dias_c27_by_c27_plus_c29": ["dias_c27_by_c27_plus_c29", "diasterane c27/(c27+c29)", "diasteranec27/(c27+c29)", "diasterane c27/c27+c29"],
        "c28bbs_by_c29bbs_sterane": ["c28bbs_by_c29bbs_sterane", "sterane c28ββs/c29ββs", "sterane c28bbs/c29bbs", "steranec28ββs/c29ββs"],
        "c27r_by_c27r_plus_c29r": ["c27r_by_c27r_plus_c29r", "sterane c27r/(c27r+c29r)", "steranec27r/(c27r+c29r)", "sterane c27r/c27r+c29r"],

        # Pristane / Phytane synonyms
        "pristane": ["pristane", "pr", "pristane peak", "pristane_conc"],
        "phytane": ["phytane", "ph", "phytane peak", "phytane_conc"],
        
        # Oil Composition synonyms
        "well_name": ["well name", "well_name", "wellname", "well", "borehole", "borehole_name", "name"],
        "api_gravity": ["api gravity", "api_gravity", "api", "gravity", "api_gravity_deg"],
        "water_content": ["water content", "water_content", "water", "water content (%)", "water_content_pct"],
        "pour_point": ["pour point", "pour_point", "pour point (°c)", "pour_point_c", "pp"],
        "sulfur": ["sulfur", "sulphur", "s", "sulfur (%)", "sulphur (%)", "sulfur_pct"],
        "sat": ["sat", "saturates", "saturate", "saturates (%)", "sat_pct"],
        "ar": ["ar", "aromatics", "aromatic", "aromatics (%)", "ar_pct"],
        "sat_by_aro": ["sat/aro", "sat_by_aro", "sat_aro", "saturate/aromatic", "saturates/aromatics"],
        "asp": ["asp", "asphaltens", "asphaltene", "asphaltenes", "asphaltenes (%)", "asp_pct"],
        "nso": ["nso", "resins", "resin", "polar", "polars", "nso (%)", "nso_pct"],
        "ibp": ["ibp", "initial boiling point", "initial_boiling_point", "ibp (°c)", "ibp_c"],

        # Stable Isotope synonyms
        "c1": ["c1", "methane", "c1 %", "c1 (%)"],
        "c2": ["c2", "ethane", "c2 %", "c2 (%)"],
        "c3": ["c3", "propane", "c3 %", "c3 (%)"],
        "ic4": ["ic4", "i-butane", "i-c4", "isobutane", "ic4 (%)"],
        "nc4": ["nc4", "n-butane", "n-c4", "normal butane", "nc4 (%)"],
        "ic5": ["ic5", "i-pentane", "i-c5", "isopentane", "ic5 (%)"],
        "nc5": ["nc5", "n-pentane", "n-c5", "normal pentane", "nc5 (%)"],
        "c6_plus": ["c6+", "c6_plus", "c6 plus", "c6+ (%)"],
        "c2_plus": ["c2+", "c2_plus", "c2 plus", "c2+ (%)", "wetness index (%), c2+", "wetness index c2+", "wetness index %, c2+"],
        "n2": ["n2", "nitrogen", "n2 (%)"],
        "co2": ["co2", "carbon dioxide", "co2 (%)"],
        "he": ["he", "helium", "he (%)"],
        "hydrogen": ["h2", "hydrogen", "h2 (%)"],
        "delta_c1": ["δ13c1", "del c1", "delta c1", "δ13c methane", "δ13c1 (‰)", "δ 13c1", "delta_c1", "δ13c1(‰)"],
        "delta_c2": ["δ13c2", "del c2", "delta c2", "δ13c ethane", "δ13c2 (‰)", "δ 13c2", "delta_c2", "δ13c2(‰)"],
        "delta_c3": ["δ13c3", "del c3", "delta c3", "δ13c propane", "δ13c3 (‰)", "δ 13c3", "delta_c3", "δ13c3(‰)"],
        "delta_ic4": ["δ13ic4", "del ic4", "delta ic4", "δ13c i-butane", "δ13ic4 (‰)", "δ 13ic4", "delta_ic4", "δ13ic4(‰)"],
        "delta_nc4": ["δ13nc4", "del nc4", "delta nc4", "δ13c n-butane", "δ13nc4 (‰)", "δ 13nc4", "delta_nc4", "δ13nc4(‰)"],
        "delta_ic5": ["δ13ic5", "del ic5", "delta ic5", "δ13c i-pentane", "δ13ic5 (‰)", "δ 13ic5", "delta_ic5", "δ13ic5(‰)"],
        "delta_nc5": ["δ13nc5", "del nc5", "delta nc5", "δ13c n-pentane", "δ13nc5 (‰)", "δ 13nc5", "delta_nc5", "δ13nc5(‰)"],
        "delta_co2": ["δ13co2", "del co2", "delta co2", "δ13c carbon dioxide", "δ13co2 (‰)", "δ 13co2", "delta_co2", "δ13co2(‰)"],
        
        # Calculated isotope synonyms
        "c1_by_c2_plus_c3": ["c1/c2+c3", "c1_by_c2_plus_c3", "c1/(c2+c3)"],
        "c2_by_c3": ["c2/c3", "c2_by_c3"],
        "delta_c2_by_delta_c3": ["delc2-delc3", "delta_c2 - delta_c3", "delc2_delc3", "delc2delc3", "delta_c2_by_delta_c3"],
        "ln_c2_by_c3": ["ln(c2/c3)", "ln_c2_by_c3", "ln_c2_c3"],
        "c1_by_c2": ["c1/c2", "c1_by_c2"],
        "ln_c1_by_c2": ["ln(c1/c2)", "ln_c1_by_c2", "ln_c1_c2"],
        # Oil isotopes synonyms
        "delta_sat": ["d13 sat", "delta_sat", "δ13c sat", "d13c sat"],
        "delta_aro": ["d13 aro", "delta_aro", "δ13c aro", "d13c aro"],
        "cv": ["cv", "canonical variable"]
    }

    # Pre-defined metadata for known datasets to ensure maximum backward compatibility
    KNOWN_DATASETS = {
        "oil_composition": {
            "display_name": "Oil Composition",
            "sql_table_name": "DL_GCH_OIL_COMPOSITION",
            "module": "oil",
            "required_columns": ["well_name", "object_number"],
            "primary_depth_column": "interval_top",
            "primary_well_column": "well_name",
            "description": "Oil Laboratory Oil Physical Properties and SARA Components dataset."
        },
        "gas_chromatography": {
            "display_name": "Gas Chromatography",
            "sql_table_name": "DL_GAS_CHROMATOGRAPHY",
            "module": "oil",
            "required_columns": ["name", "object_number"],
            "primary_depth_column": "interval_top",
            "primary_well_column": "name",
            "description": "Oil Laboratory Gas Chromatography (GC) raw and calculated biomarker dataset."
        },
        "gas_isotope": {
            "display_name": "Gas Isotope",
            "sql_table_name": "DL_ISOTOPE_GAS_VW",
            "module": "isotope",
            "required_columns": ["name", "object_number"],
            "primary_depth_column": "interval_top",
            "primary_well_column": "name",
            "description": "Stable Isotope Laboratory Gas Isotope composition and carbon isotope ratios dataset."
        },
        "oil_isotope": {
            "display_name": "Oil Isotope",
            "sql_table_name": "DL_ISOTOPE_OIL_VW",
            "module": "isotope",
            "required_columns": ["well_name"],
            "primary_depth_column": "depth",
            "primary_well_column": "well_name",
            "description": "Stable Isotope Laboratory Bulk Carbon isotopic composition of Oil saturates and aromatics."
        },
        "csia_isotope": {
            "display_name": "CSIA Isotope",
            "sql_table_name": "DL_ISOTOPE_CSIA_VW",
            "module": "isotope",
            "required_columns": ["well_name"],
            "primary_depth_column": "depth",
            "primary_well_column": "well_name",
            "description": "Stable Isotope Laboratory Compound Specific Isotope Analysis (CSIA) of n-alkanes."
        },
        "core_source_rock": {
            "display_name": "Core Source Rock",
            "sql_table_name": "DL_CL_CORE_SOURCEROCK",
            "module": "geochemistry",
            "required_columns": ["sample_top", "sample_bottom"],
            "primary_depth_column": "sample_top",
            "primary_well_column": "borehole_name",
            "description": "Source Rock Evaluation dataset from Core samples."
        },
        "cutting_source_rock": {
            "display_name": "Cutting Source Rock",
            "sql_table_name": "DL_CL_CUTTING_SOURCEROCK",
            "module": "geochemistry",
            "required_columns": ["top_depth", "bottom_depth"],
            "primary_depth_column": "top_depth",
            "primary_well_column": "borehole_name",
            "description": "Source Rock Evaluation dataset from Cutting samples."
        },
        "kinetics": {
            "display_name": "Kinetics",
            "sql_table_name": "DL_CL_KINETICS",
            "module": "geochemistry",
            "required_columns": ["depth", "frequency_factor"],
            "primary_depth_column": "depth",
            "primary_well_column": "well_name",
            "description": "Kinetics Activation Energy (Ei) Distribution dataset."
        },
        "vro": {
            "display_name": "VRo",
            "sql_table_name": "DL_CL_VRO",
            "module": "geochemistry",
            "required_columns": ["depth_top", "depth_bottom", "average_vro"],
            "primary_depth_column": "depth_top",
            "primary_well_column": "well_name",
            "description": "Vitrinite Reflectance (VRo) measurement dataset."
        },
        "petroleum_geochem": {
            "display_name": "Petroleum Geochemistry",
            "sql_table_name": "petroleum_data",
            "module": "geochemistry",
            "required_columns": ["well_name", "depth_from", "toc", "s2"],
            "primary_depth_column": "depth_from",
            "primary_well_column": "well_name",
            "description": "Source rock evaluation dataset with TOC (wt%) and Pyrolysis S2 (mg/g) for kerogen potential assessment."
        },
        "sterane": {
            "display_name": "Sterane",
            "sql_table_name": "DL_BIOMARKER_STERANE_VW",
            "module": "biomarker",
            "required_columns": ["name", "object_no"],
            "primary_depth_column": "depth_top",
            "primary_well_column": "name",
            "description": "Biomarker Laboratory Sterane mass chromatogram peak areas and calculated maturity indices dataset."
        },
        "hopane": {
            "display_name": "Hopane",
            "sql_table_name": "DL_BIOMARKER_HOPANE_VW",
            "module": "biomarker",
            "required_columns": ["name", "object_no"],
            "primary_depth_column": "depth_top",
            "primary_well_column": "name",
            "description": "Biomarker Laboratory Hopane mass chromatogram peak areas and calculated maturity indices dataset."
        },
        "tricyclic_terpane": {
            "display_name": "Tricyclic Terpane",
            "sql_table_name": "DL_BIOM_TRICYCLIC_TERP_VW",
            "module": "biomarker",
            "required_columns": ["name", "depth"],
            "primary_depth_column": "depth",
            "primary_well_column": "name",
            "description": "Biomarker Laboratory Tricyclic Terpane distributions and ratio percentage dataset."
        },
        "aromatic_biomarkers": {
            "display_name": "Aromatic Biomarkers",
            "sql_table_name": "DL_BIOMARKER_AROMATIC_VW",
            "module": "biomarker",
            "required_columns": ["name", "object"],
            "primary_depth_column": "depth",
            "primary_well_column": "name",
            "description": "Biomarker Laboratory Aromatic Phenanthrene and Dibenzothiophene parameters and maturity indices dataset."
        },
        "pr_ph": {
            "display_name": "Pristane / Phytane",
            "sql_table_name": "DL_BIOMARKER_PR_PH_VW",
            "module": "biomarker",
            "required_columns": ["name", "object"],
            "primary_depth_column": "depth",
            "primary_well_column": "name",
            "description": "Biomarker Laboratory Pristane and Phytane concentrations and calculated Pristane/Phytane ratio dataset."
        }
    }

    for table_name in db_tables:
        t_upper = table_name.upper()
        if not (t_upper.startswith("DL_CL_") or t_upper.startswith("DL_GAS_") or t_upper.startswith("DL_GCH_") or t_upper.startswith("DL_ISOTOPE_") or t_upper.startswith("DL_BIOMARKER_") or t_upper.startswith("DL_BIOM_") or t_upper == "PETROLEUM_DATA"):
            continue
            
        # Determine views that should be registered instead of tables
        VIEW_DATASETS = {
            "DL_BIOMARKER_STERANE_VW": "DL_BIOMARKER_STERANE",
            "DL_BIOMARKER_HOPANE_VW": "DL_BIOMARKER_HOPANE",
            "DL_BIOM_TRICYCLIC_TERP_VW": "DL_TRICYCLIC_TERPANE_",
            "DL_BIOMARKER_AROMATIC_VW": "DL_BIOMARKER_AROMATIC_",
            "DL_BIOMARKER_PR_PH_VW": "DL_BIOMARKER_PR_PH_",
            "DL_ISOTOPE_GAS_VW": "DL_ISOTOPE_GAS",
            "DL_ISOTOPE_OIL_VW": "DL_ISOTOPE_OIL",
            "DL_ISOTOPE_CSIA_VW": "DL_ISOTOPE_CSIA"
        }
        
        # If this is a raw table that has a view counterpart, skip it
        if t_upper in VIEW_DATASETS.values():
            continue
            
        # If this is a view that is not in our VIEW_DATASETS list, skip it
        if t_upper.endswith("_VW") and t_upper not in VIEW_DATASETS.keys():
            continue
            
        # Resolve dataset name
        if t_upper == "PETROLEUM_DATA":
            name = "petroleum_geochem"
        elif t_upper == "DL_CL_CORE_SOURCEROCK":
            name = "core_source_rock"
        elif t_upper == "DL_CL_CUTTING_SOURCEROCK":
            name = "cutting_source_rock"
        elif t_upper == "DL_CL_VRO":
            name = "vro"
        elif t_upper == "DL_CL_KINETICS":
            name = "kinetics"
        elif t_upper == "DL_GAS_CHROMATOGRAPHY":
            name = "gas_chromatography"
        elif t_upper == "DL_GCH_OIL_COMPOSITION":
            name = "oil_composition"
        elif t_upper in ["DL_ISOTOPE_GAS", "DL_ISOTOPE_GAS_VW"]:
            name = "gas_isotope"
        elif t_upper in ["DL_ISOTOPE_OIL", "DL_ISOTOPE_OIL_VW"]:
            name = "oil_isotope"
        elif t_upper in ["DL_ISOTOPE_CSIA", "DL_ISOTOPE_CSIA_VW"]:
            name = "csia_isotope"
        elif t_upper in ["DL_BIOMARKER_STERANE", "DL_BIOMARKER_STERANE_VW"]:
            name = "sterane"
        elif t_upper in ["DL_BIOMARKER_HOPANE", "DL_BIOMARKER_HOPANE_VW"]:
            name = "hopane"
        elif t_upper == "DL_BIOM_TRICYCLIC_TERP_VW":
            name = "tricyclic_terpane"
        elif t_upper in ["DL_BIOMARKER_AROMATIC_", "DL_BIOMARKER_AROMATIC_VW"]:
            name = "aromatic_biomarkers"
        elif t_upper in ["DL_BIOMARKER_PR_PH_", "DL_BIOMARKER_PR_PH_VW"]:
            name = "pr_ph"
        else:
            name = table_name.lower().replace("dl_cl_", "").replace("dl_gas_", "").replace("dl_gch_", "").replace("dl_isotope_", "").replace("dl_biomarker_", "").replace("dl_biom_", "")
            
        # Get defaults
        known = KNOWN_DATASETS.get(name, {})
        display_name = known.get("display_name", name.replace("_", " ").title())
        module = known.get("module", "geochemistry")
        required_cols = known.get("required_columns", [])
        primary_depth = known.get("primary_depth_column")
        primary_well = known.get("primary_well_column")
        description = known.get("description", f"Automatically registered dataset for table {table_name}")
        
        # Load columns metadata from db schema
        cols_meta = inspector.get_columns(table_name)
        
        # If dynamic (not KNOWN), guess depth, well, required columns, and graph/filter config
        if not known:
            for col in cols_meta:
                c_name = col["name"].lower()
                is_num = ("double" in str(col["type"]).lower() or "numeric" in str(col["type"]).lower() or "float" in str(col["type"]).lower() or "integer" in str(col["type"]).lower())
                if not primary_depth and is_num and ("depth" in c_name or "top" in c_name):
                    primary_depth = col["name"]
                if not primary_well and not is_num and ("well" in c_name or "borehole" in c_name or "ubhi" in c_name):
                    primary_well = col["name"]
                if not col["nullable"] and col["default"] is None and col["name"].upper() != "ID" and col["name"].lower() != "uploaded_by":
                    required_cols.append(col["name"])
            
        # Graph configs
        graph_config = []
        if name in ["petroleum_geochem", "core_source_rock", "cutting_source_rock"]:
            p_depth = primary_depth or ("depth_from" if name == "petroleum_geochem" else ("sample_top" if name == "core_source_rock" else "top_depth"))
            graph_config = [
                {"type": "s2_vs_toc", "x_axis": "toc", "y_axis": "s2", "title": "S2 vs TOC Geochemistry Interpretation", "color": "#003366"},
                {"type": "hi_vs_tmax", "x_axis": "tmax", "y_axis": "hi", "title": "HI vs Tmax Plot", "color": "#D97706"},
                {"type": "depth_profile", "x_axis": "toc", "y_axis": p_depth, "title": "TOC Depth Profile", "color": "#2563EB"},
                {"type": "depth_profile", "x_axis": "s2", "y_axis": p_depth, "title": "S2 Depth Profile", "color": "#10B981"}
            ]
        elif name == "gas_chromatography":
            graph_config = [
                {"type": "pr_nc17_vs_ph_nc18", "x_axis": "ph_by_nc18", "y_axis": "pr_by_nc17", "title": "Pristane/n-C17 vs Phytane/n-C18 Plot", "color": "#2563EB"},
                {"type": "pr_by_ph_vs_pr_by_nc17", "x_axis": "pr_by_nc17", "y_axis": "pr_by_ph", "title": "Pr/Ph vs Pr/n-C17 Plot", "color": "#10B981"}
            ]
        elif name == "oil_composition":
            graph_config = [
                {"type": "scatter", "x_axis": "sulfur", "y_axis": "api_gravity", "title": "API Gravity vs Sulfur", "color_by": "material_type", "color": "#EAB308"}
            ]
        elif name == "gas_isotope":
            graph_config = [
                {"type": "scatter", "x_axis": "c1_by_c2_plus_c3", "y_axis": "delta_c1", "title": "Bernard Diagram (C1/(C2+C3) vs δ13C1)", "color": "#EC4899"}
            ]
        elif name == "vro":
            graph_config = [
                {"type": "depth_profile", "x_axis": "average_vro", "y_axis": "depth_top", "title": "Average VRo Depth Profile", "color": "#2563EB"}
            ]
        elif name == "kinetics":
            graph_config = [
                {"type": "scatter", "x_axis": "hydrogen_index", "y_axis": "frequency_factor", "title": "Hydrogen Index vs Frequency Factor", "color": "#10B981"}
            ]
        else:
            if primary_depth:
                num_cols = [c["name"] for c in cols_meta if c["name"].upper() != "ID" and ("double" in str(c["type"]).lower() or "numeric" in str(c["type"]).lower() or "float" in str(c["type"]).lower()) and c["name"] != primary_depth]
                for nc in num_cols[:2]:
                    graph_config.append({
                        "type": "depth_profile",
                        "x_axis": nc,
                        "y_axis": primary_depth,
                        "title": f"{nc.upper()} Depth Profile"
                    })

        # Filter configs
        filter_config = []
        if primary_well:
            filter_config.append({"name": primary_well, "type": "select", "label": primary_well.replace("_", " ").title()})
        for col in cols_meta:
            c_lower = col["name"].lower()
            if c_lower in ["sample_type", "lithology"] and c_lower != primary_well:
                filter_config.append({"name": col["name"], "type": "select", "label": col["name"].replace("_", " ").title()})

        # Build mapping config
        mapping_config = {}
        for col in cols_meta:
            col_name_lower = col["name"].lower()
            if col_name_lower == "uploaded_by":
                continue
                
            syns = set()
            syns.add(col_name_lower)
            syns.add(col_name_lower.replace("_", " "))
            syns.add(col_name_lower.replace("_", ""))
            
            for k, aliases in SYNONYM_VOCAB.items():
                if k.lower() == col_name_lower or k.lower().replace("_", "") == col_name_lower.replace("_", ""):
                    for a in aliases:
                        syns.add(a.lower())
                        syns.add(a.lower().replace("_", " "))
                        syns.add(a.lower().replace("_", ""))
            
            mapping_config[col["name"]] = sorted(list(syns))
            
        # Register/Update the dataset
        ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == name).first()
        if not ds:
            ds = DatasetRegistry(
                name=name,
                display_name=display_name,
                sql_table_name=table_name.upper(),
                module=module,
                status="active",
                version="1.0",
                description=description,
                mapping_config=mapping_config,
                graph_config=graph_config,
                filter_config=filter_config,
                required_columns=required_cols,
                primary_depth_column=primary_depth,
                primary_well_column=primary_well,
                is_active=True
            )
            db.add(ds)
            db.commit()
            db.refresh(ds)
            print(f"[+] Automatically registered dataset '{display_name}' ({name}) for SQL table {table_name}.")
        else:
            setattr(ds, "sql_table_name", table_name.upper())
            setattr(ds, "mapping_config", mapping_config)
            setattr(ds, "required_columns", required_cols)
            setattr(ds, "primary_depth_column", primary_depth)
            setattr(ds, "primary_well_column", primary_well)
            setattr(ds, "graph_config", graph_config)
            setattr(ds, "filter_config", filter_config)
            db.add(ds)
            db.commit()
            db.refresh(ds)
            print(f"[*] Updated existing dataset configuration for '{display_name}' ({name}).")
            
        # Register/Update variables for this dataset
        db.execute(text("DELETE FROM variable_registry WHERE dataset_id = :ds_id"), {"ds_id": ds.id})
        db.commit()
        
        for col in cols_meta:
            col_name = col["name"]
            col_name_lower = col_name.lower()
            if col_name_lower == "uploaded_by":
                continue
                
            sql_type = str(col["type"]).upper()
            is_num = ("DOUBLE" in sql_type or "NUMERIC" in sql_type or "FLOAT" in sql_type or "INT" in sql_type)
            
            # Guess unit
            unit = None
            if name in ["gas_isotope", "oil_isotope", "csia_isotope"]:
                if col_name_lower.startswith("delta_") or col_name_lower.startswith("nc") or col_name_lower in ["cv"]:
                    unit = "‰" if not col_name_lower.startswith("cv") else ""
                elif col_name_lower in ["c1", "c2", "c3", "ic4", "nc4", "ic5", "nc5", "c6_plus", "c2_plus", "n2", "co2", "he", "hydrogen"]:
                    unit = "% Mol"
            else:
                if "depth" in col_name_lower or "top" in col_name_lower or "base" in col_name_lower:
                    unit = "m"
                elif "toc" in col_name_lower or "minc" in col_name_lower:
                    unit = "wt%"
                elif col_name_lower in ["s1", "s2", "s3", "s2_extraction", "s2_s3", "osi"]:
                    unit = "mg/g"
                elif col_name_lower in ["hi", "oi"]:
                    unit = "mg/g TOC"
                elif col_name_lower in ["tmax", "ibp", "pour_point"]:
                    unit = "°C"
                elif col_name_lower in ["vro", "water_content", "sulfur", "sat", "ar", "asp", "nso"]:
                    unit = "wt%"
                elif col_name_lower == "api_gravity":
                    unit = "°API"
                
            # Guess category
            category = "other"
            if name in ["gas_isotope", "oil_isotope", "csia_isotope"]:
                if "depth" in col_name_lower or "top" in col_name_lower or "base" in col_name_lower or "interval" in col_name_lower:
                    category = "depth"
                elif col_name_lower in ["well_name", "borehole_name", "ubhi", "name", "object_number", "formation", "material_type", "location", "borehole_id", "analysis_date", "collection_date", "analysed_at", "s_no"]:
                    category = "metadata"
                elif col_name_lower in ["insert_user", "insert_date", "update_user", "update_date"]:
                    category = "citation"
                else:
                    category = "isotope"
            else:
                if "depth" in col_name_lower or "top" in col_name_lower or "base" in col_name_lower or "interval" in col_name_lower:
                    category = "depth"
                elif col_name_lower in ["well_name", "borehole_name", "ubhi", "sample_type", "lithology", "cuttings_sample_id", "core_sample_id", "name", "object_number", "formation", "material_type", "location", "borehole_id", "analysis_date", "collection_date"]:
                    category = "metadata"
                elif col_name_lower in ["toc", "s1", "s2", "s3", "tmax", "hi", "oi", "vro", "pi", "osi", "minc"]:
                    category = "geochemistry"
                elif col_name_lower in ["author", "year", "analysed_at", "insert_user", "insert_date", "update_user", "update_date"]:
                    category = "citation"
                elif col_name_lower.startswith("nc") or col_name_lower in ["pr", "ph", "pr_by_ph", "pr_by_nc17", "ph_by_nc18", "pr_nc17_by_ph_nc18", "nc21_nc22_by_nc28_nc29", "oep_odd_even_pref", "cp_index", "ta_ratio", "nc17_by_nc29", "paq", "nc17_by_nc27", "c_max"]:
                    category = "chromatography"
                elif col_name_lower in ["ibp", "water_content", "api_gravity", "pour_point", "sulfur", "sat_by_aro", "sat", "ar", "asp", "nso"]:
                    category = "oil_composition"
                
            # Title display name
            display = col_name.replace("_", " ").title()
            if name in ["gas_isotope", "oil_isotope", "csia_isotope"]:
                if col_name_lower == "delta_c1":
                    display = "δ13C1"
                elif col_name_lower == "delta_c2":
                    display = "δ13C2"
                elif col_name_lower == "delta_c3":
                    display = "δ13C3"
                elif col_name_lower == "delta_ic4":
                    display = "δ13CiC4"
                elif col_name_lower == "delta_nc4":
                    display = "δ13CnC4"
                elif col_name_lower == "delta_ic5":
                    display = "δ13CiC5"
                elif col_name_lower == "delta_nc5":
                    display = "δ13CnC5"
                elif col_name_lower == "delta_co2":
                    display = "δ13CO2"
                elif col_name_lower == "c1_by_c2_plus_c3":
                    display = "C1/(C2+C3)"
                elif col_name_lower == "c2_by_c3":
                    display = "C2/C3"
                elif col_name_lower == "delta_c2_by_delta_c3":
                    display = "δ13C2 - δ13C3"
                elif col_name_lower == "ln_c2_by_c3":
                    display = "Ln(C2/C3)"
                elif col_name_lower == "c1_by_c2":
                    display = "C1/C2"
                elif col_name_lower == "ln_c1_by_c2":
                    display = "Ln(C1/C2)"
                elif col_name_lower == "delta_sat":
                    display = "δ13C Sat"
                elif col_name_lower == "delta_aro":
                    display = "δ13C Aro"
                elif col_name_lower == "cv":
                    display = "CV"
                elif col_name_lower.startswith("nc") and len(col_name_lower) > 2 and col_name_lower[2:].isdigit():
                    display = f"δ13C n-C{col_name_lower[2:]}"
                elif col_name_lower in ["c1", "c2", "c3", "ic4", "nc4", "ic5", "nc5", "c6_plus", "c2_plus", "n2", "co2", "he", "hydrogen"]:
                    display = col_name_lower.upper()
            else:
                if col_name_lower == "toc":
                    display = "TOC"
                elif col_name_lower == "s1":
                    display = "S1"
                elif col_name_lower == "s2":
                    display = "S2"
                elif col_name_lower == "s3":
                    display = "S3"
                elif col_name_lower == "tmax":
                    display = "Tmax"
                elif col_name_lower == "hi":
                    display = "Hydrogen Index"
                elif col_name_lower == "oi":
                    display = "Oxygen Index"
                elif col_name_lower == "vro":
                    display = "VRo"
                elif col_name_lower == "pi":
                    display = "Production Index"
                elif col_name_lower == "osi":
                    display = "Oil Saturation Index"
                elif col_name_lower.startswith("nc") and len(col_name_lower) > 2 and col_name_lower[2:].isdigit():
                    display = f"n-C{col_name_lower[2:]}"
                elif col_name_lower == "pr":
                    display = "Pristane"
                elif col_name_lower == "ph":
                    display = "Phytane"
                elif col_name_lower == "pr_by_ph":
                    display = "Pr/Ph"
                elif col_name_lower == "pr_by_nc17":
                    display = "Pr/n-C17"
                elif col_name_lower == "ph_by_nc18":
                    display = "Ph/n-C18"
                elif col_name_lower == "pr_nc17_by_ph_nc18":
                    display = "(Pr/n-C17)/(Ph/n-C18)"
                elif col_name_lower == "nc21_nc22_by_nc28_nc29":
                    display = "(n-C21+n-C22)/(n-C28+n-C29)"
                elif col_name_lower == "oep_odd_even_pref":
                    display = "Odd-Even Predominance"
                elif col_name_lower == "cp_index":
                    display = "Carbon Preference Index"
                elif col_name_lower == "ta_ratio":
                    display = "Taraxerol Ratio"
                elif col_name_lower == "nc17_by_nc29":
                    display = "n-C17/n-C29"
                elif col_name_lower == "nc17_by_nc27":
                    display = "n-C17/n-C27"
                elif col_name_lower == "paq":
                    display = "Paq Ratio"
                elif col_name_lower == "c_max":
                    display = "C_Max"
                elif col_name_lower == "sat_by_aro":
                    display = "Saturates/Aromatics Ratio"
                elif col_name_lower == "sat":
                    display = "Saturates"
                elif col_name_lower == "ar":
                    display = "Aromatics"
                elif col_name_lower == "asp":
                    display = "Asphaltens"
                elif col_name_lower == "nso":
                    display = "NSO (Polars)"
                elif col_name_lower == "api_gravity":
                    display = "API Gravity"
                elif col_name_lower == "pour_point":
                    display = "Pour Point"
                elif col_name_lower == "water_content":
                    display = "Water Content"
                elif col_name_lower == "sulfur":
                    display = "Sulfur"
                elif col_name_lower == "ibp":
                    display = "Initial Boiling Point (IBP)"
                elif col_name_lower == "tm_by_ts":
                    display = "Tm/Ts"
                elif col_name_lower == "c27ts_by_ts_plus_tm":
                    display = "C27 Ts/(Ts+Tm)"
                elif col_name_lower == "c29h_by_c30h":
                    display = "C29H/C30H"
                elif col_name_lower == "c30m_by_c30h":
                    display = "C30M/C30H"
                elif col_name_lower == "c30h_by_h_plus_m":
                    display = "C30H/(H+M)"
                elif col_name_lower == "c35_s_by_c34_s":
                    display = "C35S/C34S Homohopane"
                elif col_name_lower == "homohopane_index":
                    display = "Homohopane Index"
                elif col_name_lower == "oleanane_index":
                    display = "Oleanane Index"
                elif col_name_lower == "diahopane_index":
                    display = "Diahopane Index"
                elif col_name_lower == "bnh_index":
                    display = "BNH Index"
                elif col_name_lower == "bcd_index":
                    display = "BCD INDEX"
                elif col_name_lower == "c31hh_r_by_c30h":
                    display = "C31HH(R)/C30H"
                elif col_name_lower == "c30_diahopane_by_c29ts":
                    display = "C30 Diahopane/C29Ts"
                elif col_name_lower == "c29_s_by_s_plus_r":
                    display = "C29 S/(S+R)"
                elif col_name_lower == "c29_bb_by_aa_plus_bb":
                    display = "C29 ββ/(αα+ββ)"
                elif col_name_lower == "c27_diast_by_c29_diast":
                    display = "C27 DiaSterane/C29 DiaSterane"
                elif col_name_lower == "c27_st_by_c29_st":
                    display = "C27 St/C29 St"
                elif col_name_lower == "dias_c27_by_c27_plus_c29":
                    display = "DiaSterane C27/(C27+C29)"
                elif col_name_lower == "c28bbs_by_c29bbs_sterane":
                    display = "Sterane C28ββS/C29ββS"
                elif col_name_lower == "c27r_by_c27r_plus_c29r":
                    display = "Sterane C27R/(C27R+C29R)"
                elif col_name_lower == "total_sterane":
                    display = "Total Sterane"
                elif col_name_lower == "dbt_dibenzo":
                    display = "Dibenzothiophene (DBT)"
                elif col_name_lower == "phe_phena":
                    display = "Phenanthrene (Phe)"
                elif col_name_lower == "dbt_by_phe":
                    display = "DBT/Phe"
                elif col_name_lower == "mp_3":
                    display = "3-Methylphenanthrene (3-MP)"
                elif col_name_lower == "mp_2":
                    display = "2-Methylphenanthrene (2-MP)"
                elif col_name_lower == "mp_9":
                    display = "9-Methylphenanthrene (9-MP)"
                elif col_name_lower == "mp_1":
                    display = "1-Methylphenanthrene (1-MP)"
                elif col_name_lower == "mpi":
                    display = "MPI"
                elif col_name_lower == "vrc":
                    display = "VRc"
                
            syns = mapping_config.get(col_name, [col_name_lower])
            
            # Formulas configuration for calculated parameters
            formulas = {
                "pi": "S1 / (S1 + S2)",
                "hi": "(S2 / TOC) * 100",
                "oi": "(S3 / TOC) * 100",
                "osi": "(S1 / TOC) * 100",
                "toc": "PC + RC",
                "s2_s3": "S2 / S3",
                "pr_by_ph": "PRISTANE / PHYTANE",
                "pr_by_nc17": "PR / NC17",
                "ph_by_nc18": "PH / NC18",
                "pr_nc17_by_ph_nc18": "(PR / NC17) / (PH / NC18)",
                "nc21_nc22_by_nc28_nc29": "(NC21 + NC22) / (NC28 + NC29)",
                "oep_odd_even_pref": "(NC25 + 6*NC27 + NC29) / (4*NC26 + 4*NC28)",
                "cp_index": "Carbon Preference Index formula",
                "ta_ratio": "Taraxerol Ratio",
                "nc17_by_nc29": "NC17 / NC29",
                "paq": "(NC23 + NC25) / (NC23 + NC25 + NC29 + NC31)",
                "nc17_by_nc27": "NC17 / NC27",
                "c_max": "Max concentration carbon number",
                "sat_by_aro": "SAT / AR",
                "c1_by_c2_plus_c3": "C1 / (C2 + C3)",
                "c2_by_c3": "C2 / C3",
                "delta_c2_by_delta_c3": "delta_c2 - delta_c3",
                "ln_c2_by_c3": "ln(C2 / C3)",
                "c1_by_c2": "C1 / C2",
                "ln_c1_by_c2": "ln(C1 / C2)",
                "dbt_by_phe": "DBT_DIBENZO / PHE_PHENA",
                "mpi": "1.5 * (MP_2 + MP_3) / (PHE_PHENA + MP_1 + MP_9)",
                "vrc": "0.6 * MPI + 0.4"
            }
            formula_val = formulas.get(col_name_lower)
            is_calc = formula_val is not None
 
            # Enforce that derived and calculated parameters are never mandatory
            non_mandatory = {"top_depth", "bottom_depth", "pi", "hi", "oi", "osi", "toc", "minc", "s2_s3", "pr_by_ph", "pr_by_nc17", "ph_by_nc18", "pr_nc17_by_ph_nc18", "nc21_nc22_by_nc28_nc29", "oep_odd_even_pref", "cp_index", "ta_ratio", "nc17_by_nc29", "paq", "nc17_by_nc27", "c_max", "sat_by_aro", "c1_by_c2_plus_c3", "c2_by_c3", "delta_c2_by_delta_c3", "ln_c2_by_c3", "c1_by_c2", "ln_c1_by_c2", "dbt_by_phe", "mpi", "vrc", "ndr", "tmn_1_2_7", "tmn_1_3_7", "tmn_ratio", "etr"}
            is_req = (col_name_lower in required_cols) and (col_name_lower not in non_mandatory)
            is_nullable = col["nullable"]
            
            var = db.query(VariableRegistry).filter(
                VariableRegistry.dataset_id == ds.id,
                VariableRegistry.sql_column_name == col_name
            ).first()
            if not var:
                var = VariableRegistry(
                    dataset_id=ds.id,
                    name=col_name_lower,
                    display_name=display,
                    sql_column_name=col_name,
                    sql_data_type=sql_type,
                    display_unit=unit,
                    is_numeric=is_num,
                    is_visible=True,
                    is_filterable=True,
                    chart_enabled=is_num,
                    kpi_enabled=is_num,
                    export_enabled=True,
                    description=f"Automatically Calculated from formula: {formula_val}" if is_calc else f"{display} parameter",
                    category=category,
                    synonyms=syns,
                    is_required=is_req,
                    is_nullable=is_nullable,
                    is_calculated=is_calc,
                    formula=formula_val
                )
                db.add(var)
            else:
                setattr(var, "sql_data_type", sql_type)
                setattr(var, "is_numeric", is_num)
                setattr(var, "display_unit", unit)
                setattr(var, "category", category)
                setattr(var, "synonyms", syns)
                setattr(var, "is_required", is_req)
                setattr(var, "is_nullable", is_nullable)
                setattr(var, "is_calculated", is_calc)
                setattr(var, "formula", formula_val)
                if is_calc:
                    setattr(var, "description", f"Automatically Calculated from formula: {formula_val}")
                db.add(var)
                
        db.commit()

    # Seed default sample data for gas_isotope if table is empty
    try:
        res = db.execute(text("SELECT count(*) from DL_ISOTOPE_GAS")).scalar()
        if res == 0:
            print("[*] DL_ISOTOPE_GAS is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "sample_gas_isotope.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                
                processed = CSVProcessor.process_file(
                    file_bytes=file_bytes,
                    filename="EDS_Table_And_plot_Format9.csv",
                    db=db,
                    uploader_id=cast(Any, admin_id)
                )
                print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} stable isotope gas records on startup!")
            else:
                print(f"[-] sample_gas_isotope.csv not found at {csv_path}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_ISOTOPE_GAS on startup: {str(seed_err)}")

    # Seed default sample data for oil_isotope if table is empty
    try:
        res = db.execute(text("SELECT count(*) from DL_ISOTOPE_OIL")).scalar()
        if res == 0:
            print("[*] DL_ISOTOPE_OIL is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "sample_oil_isotope.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "oil_isotope").first()
                if ds:
                    processed = CSVProcessor.process_file(
                        file_bytes=file_bytes,
                        filename="sample_oil_isotope.csv",
                        db=db,
                        uploader_id=cast(Any, admin_id),
                        dataset_id=cast(int, ds.id)
                    )
                    print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} stable isotope oil records on startup!")
            else:
                print(f"[-] sample_oil_isotope.csv not found at {csv_path}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_ISOTOPE_OIL on startup: {str(seed_err)}")

    # Seed default sample data for csia_isotope if table is empty
    try:
        res = db.execute(text("SELECT count(*) from DL_ISOTOPE_CSIA")).scalar()
        if res == 0:
            print("[*] DL_ISOTOPE_CSIA is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "sample_csia_isotope.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "csia_isotope").first()
                if ds:
                    processed = CSVProcessor.process_file(
                        file_bytes=file_bytes,
                        filename="sample_csia_isotope.csv",
                        db=db,
                        uploader_id=cast(Any, admin_id),
                        dataset_id=cast(int, ds.id)
                    )
                    print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} stable isotope CSIA records on startup!")
            else:
                print(f"[-] sample_csia_isotope.csv not found at {csv_path}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_ISOTOPE_CSIA on startup: {str(seed_err)}")

    # Seed default sample data for Hopane
    try:
        res = db.execute(text("SELECT count(*) from DL_BIOMARKER_HOPANE")).scalar()
        if res == 0:
            print("[*] DL_BIOMARKER_HOPANE is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "HopaneData.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "hopane").first()
                if ds:
                    processed = CSVProcessor.process_file(
                        file_bytes=file_bytes,
                        filename="HopaneData.csv",
                        db=db,
                        uploader_id=cast(Any, admin_id),
                        dataset_id=cast(int, ds.id)
                    )
                    print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} Hopane records on startup!")
            else:
                print(f"[-] HopaneData.csv not found at {csv_path}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_BIOMARKER_HOPANE on startup: {str(seed_err)}")

    # Seed default sample data for Sterane
    try:
        res = db.execute(text("SELECT count(*) from DL_BIOMARKER_STERANE")).scalar()
        if res == 0:
            print("[*] DL_BIOMARKER_STERANE is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "Strene_data.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "sterane").first()
                if ds:
                    processed = CSVProcessor.process_file(
                        file_bytes=file_bytes,
                        filename="Strene_data.csv",
                        db=db,
                        uploader_id=cast(Any, admin_id),
                        dataset_id=cast(int, ds.id)
                    )
                    print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} Sterane records on startup!")
            else:
                print(f"[-] Strene_data.csv not found at {csv_path}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_BIOMARKER_STERANE on startup: {str(seed_err)}")

    # Seed default sample data for Tricyclic Terpane
    try:
        res = db.execute(text("SELECT count(*) from DL_TRICYCLIC_TERPANE_")).scalar()
        if res == 0:
            print("[*] DL_TRICYCLIC_TERPANE_ is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "tricyclicdata.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "tricyclic_terpane").first()
                if ds:
                    processed = CSVProcessor.process_file(
                        file_bytes=file_bytes,
                        filename="tricyclicdata.csv",
                        db=db,
                        uploader_id=cast(Any, admin_id),
                        dataset_id=cast(int, ds.id)
                    )
                    print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} Tricyclic Terpane records on startup!")
            else:
                print(f"[-] tricyclicdata.csv not found at {csv_path}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_TRICYCLIC_TERPANE_ on startup: {str(seed_err)}")

    # Seed default sample data for Aromatic
    try:
        res = db.execute(text("SELECT count(*) from DL_BIOMARKER_AROMATIC_")).scalar()
        if res == 0:
            print("[*] DL_BIOMARKER_AROMATIC_ is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "aromaticdata.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "aromatic_biomarkers").first()
                if ds:
                    processed = CSVProcessor.process_file(
                        file_bytes=file_bytes,
                        filename="aromaticdata.csv",
                        db=db,
                        uploader_id=cast(Any, admin_id),
                        dataset_id=cast(int, ds.id)
                    )
                    print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} Aromatic records on startup!")
            else:
                print(f"[-] aromaticdata.csv not found at {csv_path}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_BIOMARKER_AROMATIC_ on startup: {str(seed_err)}")

    # Seed default sample data for Pristane / Phytane
    try:
        res = db.execute(text("SELECT count(*) from DL_BIOMARKER_PR_PH_")).scalar()
        if res == 0:
            print("[*] DL_BIOMARKER_PR_PH_ is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "pr_ph_dataa.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "pr_ph").first()
                if ds:
                    processed = CSVProcessor.process_file(
                        file_bytes=file_bytes,
                        filename="pr_ph_dataa.csv",
                        db=db,
                        uploader_id=cast(Any, admin_id),
                        dataset_id=cast(int, ds.id)
                    )
                    print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} Pristane/Phytane records on startup!")
            else:
                print(f"[-] pr_ph_dataa.csv not found at {csv_path}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_BIOMARKER_PR_PH_ on startup: {str(seed_err)}")

    # Seed default sample data for Cutting Source Rock if table is empty
    try:
        res = db.execute(text("SELECT count(*) from DL_CL_CUTTING_SOURCEROCK")).scalar()
        if res == 0:
            print("[*] DL_CL_CUTTING_SOURCEROCK is empty. Seeding default sample dataset...")
            import os
            csv_path = os.path.join(os.path.dirname(__file__), "S2_vs_TOC_CT-8.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    file_bytes = f.read()
                from app.services.csv_processor import CSVProcessor
                from app.models.user import User
                admin_user = db.query(User).filter(User.email == "admin@ongc.co.in").first()
                admin_id = admin_user.id if admin_user else None
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == "cutting_source_rock").first()
                if ds:
                    processed = CSVProcessor.process_file(
                        file_bytes=file_bytes,
                        filename="S2_vs_TOC_CT-8.csv",
                        db=db,
                        uploader_id=cast(Any, admin_id),
                        dataset_id=cast(int, ds.id)
                    )
                    print(f"[+] Successfully seeded {processed.get('imported_rows', 0)} Cutting Source Rock records on startup!")
            else:
                print(f"[-] S2_vs_TOC_CT-8.csv not found at {csv_path}. Skipping seed.")

        # Seed 5_Source_Rock_Data_Cutting.csv if the count is only 505 (only base dataset was seeded)
        res = db.execute(text("SELECT count(*) from dl_cl_cutting_sourcerock")).scalar()
        if res == 505:
            print("[*] Seeding additional 13 Cutting records from 5_Source_Rock_Data_Cutting.csv...")
            import csv
            csv_path_new = os.path.join(os.path.dirname(__file__), "5_Source_Rock_Data_Cutting.csv")
            if os.path.exists(csv_path_new):
                with open(csv_path_new, mode='r', encoding='utf-8-sig') as f:
                    reader = csv.reader(f)
                    header = [h.strip() for h in next(reader)]
                    for r in reader:
                        r = r + [''] * (len(header) - len(r))
                        r_dict = dict(zip(header, r))
                        depth_val = float(r_dict['Cutting Top (m)'].strip()) if r_dict.get('Cutting Top (m)') and r_dict['Cutting Top (m)'].strip() else None
                        base_val = float(r_dict['Cutting Base (m)'].strip()) if r_dict.get('Cutting Base (m)') and r_dict['Cutting Base (m)'].strip() else None
                        db.execute(
                            text("""
                                INSERT INTO dl_cl_cutting_sourcerock (
                                    ubhi, borehole_name, cuttings_sample_id, top_depth, bottom_depth,
                                    cuttings_top, cuttings_base, activity_type, analysis_type, segment_position,
                                    lithology, layer_name, toc, s1, s2, s2_extraction, s3, pi, tmax, hi, oi, minc, osi, vro,
                                    others, special_obs, description, year, author, analysed_at, remarks,
                                    insert_user, update_user
                                ) VALUES (
                                    :ubhi, :borehole_name, :cuttings_sample_id, :top_depth, :bottom_depth,
                                    :cuttings_top, :cuttings_base, :activity_type, :analysis_type, :segment_position,
                                    :lithology, :layer_name, :toc, :s1, :s2, :s2_extraction, :s3, :pi, :tmax, :hi, :oi, :minc, :osi, :vro,
                                    :others, :special_obs, :description, :year, :author, :analysed_at, :remarks,
                                    :insert_user, :update_user
                                )
                            """),
                            {
                                "ubhi": r_dict.get('UBHI') if r_dict.get('UBHI') and r_dict['UBHI'].strip() else None,
                                "borehole_name": r_dict.get('Borehole Name') if r_dict.get('Borehole Name') and r_dict['Borehole Name'].strip() else None,
                                "cuttings_sample_id": f"{int(depth_val)}-{int(base_val)}" if depth_val is not None and base_val is not None else None,
                                "top_depth": depth_val,
                                "bottom_depth": base_val,
                                "cuttings_top": depth_val,
                                "cuttings_base": base_val,
                                "activity_type": r_dict.get('Activity Type') if r_dict.get('Activity Type') and r_dict['Activity Type'].strip() else None,
                                "analysis_type": r_dict.get('Analysis Type') if r_dict.get('Analysis Type') and r_dict['Analysis Type'].strip() else None,
                                "segment_position": r_dict.get('Segment Depth') if r_dict.get('Segment Depth') and r_dict['Segment Depth'].strip() else None,
                                "lithology": (r_dict.get('Lithology') if r_dict.get('Lithology') and r_dict['Lithology'].strip() else None) or "cuttings",
                                "layer_name": r_dict.get('Layer Name') if r_dict.get('Layer Name') and r_dict['Layer Name'].strip() else None,
                                "toc": float(r_dict['TOC'].strip()) if r_dict.get('TOC') and r_dict['TOC'].strip() else None,
                                "s1": float(r_dict['S1'].strip()) if r_dict.get('S1') and r_dict['S1'].strip() else None,
                                "s2": float(r_dict['S2'].strip()) if r_dict.get('S2') and r_dict['S2'].strip() else None,
                                "s2_extraction": float(r_dict['S2 after Extraction'].strip()) if r_dict.get('S2 after Extraction') and r_dict['S2 after Extraction'].strip() else None,
                                "s3": float(r_dict['S3'].strip()) if r_dict.get('S3') and r_dict['S3'].strip() else None,
                                "pi": float(r_dict['PI'].strip()) if r_dict.get('PI') and r_dict['PI'].strip() else None,
                                "tmax": float(r_dict['Tmax'].strip()) if r_dict.get('Tmax') and r_dict['Tmax'].strip() else None,
                                "hi": float(r_dict['HI'].strip()) if r_dict.get('HI') and r_dict['HI'].strip() else None,
                                "oi": float(r_dict['OI'].strip()) if r_dict.get('OI') and r_dict['OI'].strip() else None,
                                "minc": float(r_dict['MinC'].strip()) if r_dict.get('MinC') and r_dict['MinC'].strip() else None,
                                "osi": float(r_dict['OSI'].strip()) if r_dict.get('OSI') and r_dict['OSI'].strip() else None,
                                "vro": float(r_dict['VRo'].strip()) if r_dict.get('VRo') and r_dict['VRo'].strip() else None,
                                "others": r_dict.get('Others') if r_dict.get('Others') and r_dict['Others'].strip() else None,
                                "special_obs": r_dict.get('Special Observations') if r_dict.get('Special Observations') and r_dict['Special Observations'].strip() else None,
                                "description": r_dict.get('Report Title') if r_dict.get('Report Title') and r_dict['Report Title'].strip() else None,
                                "year": r_dict.get('Year') if r_dict.get('Year') and r_dict['Year'].strip() else None,
                                "author": r_dict.get('Author') if r_dict.get('Author') and r_dict['Author'].strip() else None,
                                "analysed_at": r_dict.get('Analysed At') if r_dict.get('Analysed At') and r_dict['Analysed At'].strip() else None,
                                "remarks": r_dict.get('Remarks') if r_dict.get('Remarks') and r_dict['Remarks'].strip() else None,
                                "insert_user": r_dict.get('Insert User') if r_dict.get('Insert User') and r_dict['Insert User'].strip() else None,
                                "update_user": r_dict.get('Update User') if r_dict.get('Update User') and r_dict['Update User'].strip() else None
                            }
                        )
                db.commit()
                print("[+] Successfully seeded 13 additional Cutting records on startup!")

        # Seed default sample data for Core Source Rock if table is empty
        res = db.execute(text("SELECT count(*) from dl_cl_core_sourcerock")).scalar()
        if res == 0:
            print("[*] dl_cl_core_sourcerock is empty. Seeding 6_Source_Rock_Data_Core.csv...")
            import csv
            csv_path_new = os.path.join(os.path.dirname(__file__), "6_Source_Rock_Data_Core.csv")
            if os.path.exists(csv_path_new):
                with open(csv_path_new, mode='r', encoding='utf-8-sig') as f:
                    reader = csv.reader(f)
                    header = [h.strip() for h in next(reader)]
                    for r in reader:
                        r = r + [''] * (len(header) - len(r))
                        r_dict = dict(zip(header, r))
                        top_val = float(r_dict['Core Top (m)'].strip()) if r_dict.get('Core Top (m)') and r_dict['Core Top (m)'].strip() else None
                        base_val = float(r_dict['Core Base (m)'].strip()) if r_dict.get('Core Base (m)') and r_dict['Core Base (m)'].strip() else None
                        db.execute(
                            text("""
                                INSERT INTO dl_cl_core_sourcerock (
                                    ubhi, borehole_name, core_sample_id, core_top, core_base,
                                    top_depth, bottom_depth, activity_type, analysis_type,
                                    sample_top, sample_bottom, segment_position,
                                    lithology, layer_name, toc, s1, s2, s2_extraction, s3, pi, tmax, hi, oi, minc, osi, vro,
                                    others, special_obs, description, year, author, remarks,
                                    insert_user, update_user
                                ) VALUES (
                                    :ubhi, :borehole_name, :core_sample_id, :core_top, :core_base,
                                    :top_depth, :bottom_depth, :activity_type, :analysis_type,
                                    :sample_top, :sample_bottom, :segment_position,
                                    :lithology, :layer_name, :toc, :s1, :s2, :s2_extraction, :s3, :pi, :tmax, :hi, :oi, :minc, :osi, :vro,
                                    :others, :special_obs, :description, :year, :author, :remarks,
                                    :insert_user, :update_user
                                )
                            """),
                            {
                                "ubhi": r_dict.get('UBHI') if r_dict.get('UBHI') and r_dict['UBHI'].strip() else None,
                                "borehole_name": r_dict.get('Borehole Name') if r_dict.get('Borehole Name') and r_dict['Borehole Name'].strip() else None,
                                "core_sample_id": r_dict.get('Core Sample ID') if r_dict.get('Core Sample ID') and r_dict['Core Sample ID'].strip() else None,
                                "core_top": top_val,
                                "core_base": base_val,
                                "top_depth": top_val,
                                "bottom_depth": base_val,
                                "activity_type": r_dict.get('Activity Type') if r_dict.get('Activity Type') and r_dict['Activity Type'].strip() else None,
                                "analysis_type": r_dict.get('Analysis Type') if r_dict.get('Analysis Type') and r_dict['Analysis Type'].strip() else None,
                                "sample_top": float(r_dict['Sample Top (m)'].strip()) if r_dict.get('Sample Top (m)') and r_dict['Sample Top (m)'].strip() else None,
                                "sample_bottom": float(r_dict['Sample Bottom (m)'].strip()) if r_dict.get('Sample Bottom (m)') and r_dict['Sample Bottom (m)'].strip() else None,
                                "segment_position": float(r_dict['Segment Depth'].strip()) if r_dict.get('Segment Depth') and r_dict['Segment Depth'].strip() else None,
                                "lithology": (r_dict.get('Lithology') if r_dict.get('Lithology') and r_dict['Lithology'].strip() else None) or "core",
                                "layer_name": r_dict.get('Layer Name') if r_dict.get('Layer Name') and r_dict['Layer Name'].strip() else None,
                                "toc": float(r_dict['TOC'].strip()) if r_dict.get('TOC') and r_dict['TOC'].strip() else None,
                                "s1": float(r_dict['S1'].strip()) if r_dict.get('S1') and r_dict['S1'].strip() else None,
                                "s2": float(r_dict['S2'].strip()) if r_dict.get('S2') and r_dict['S2'].strip() else None,
                                "s2_extraction": float(r_dict['S2 after Extraction'].strip()) if r_dict.get('S2 after Extraction') and r_dict['S2 after Extraction'].strip() else None,
                                "s3": float(r_dict['S3'].strip()) if r_dict.get('S3') and r_dict['S3'].strip() else None,
                                "pi": float(r_dict['PI'].strip()) if r_dict.get('PI') and r_dict['PI'].strip() else None,
                                "tmax": float(r_dict['Tmax'].strip()) if r_dict.get('Tmax') and r_dict['Tmax'].strip() else None,
                                "hi": float(r_dict['HI'].strip()) if r_dict.get('HI') and r_dict['HI'].strip() else None,
                                "oi": float(r_dict['OI'].strip()) if r_dict.get('OI') and r_dict['OI'].strip() else None,
                                "minc": float(r_dict['MinC'].strip()) if r_dict.get('MinC') and r_dict['MinC'].strip() else None,
                                "osi": float(r_dict['OSI'].strip()) if r_dict.get('OSI') and r_dict['OSI'].strip() else None,
                                "vro": float(r_dict['VRo'].strip()) if r_dict.get('VRo') and r_dict['VRo'].strip() else None,
                                "others": r_dict.get('Others') if r_dict.get('Others') and r_dict['Others'].strip() else None,
                                "special_obs": r_dict.get('Special Observations') if r_dict.get('Special Observations') and r_dict['Special Observations'].strip() else None,
                                "description": r_dict.get('Report Title') if r_dict.get('Report Title') and r_dict['Report Title'].strip() else None,
                                "year": int(r_dict['Year'].strip()) if r_dict.get('Year') and r_dict['Year'].strip() else None,
                                "author": r_dict.get('Author') if r_dict.get('Author') and r_dict['Author'].strip() else None,
                                "remarks": r_dict.get('Remarks') if r_dict.get('Remarks') and r_dict['Remarks'].strip() else None,
                                "insert_user": r_dict.get('Insert User') if r_dict.get('Insert User') and r_dict['Insert User'].strip() else None,
                                "update_user": r_dict.get('Update User') if r_dict.get('Update User') and r_dict['Update User'].strip() else None
                            }
                        )
                db.commit()
                print("[+] Successfully seeded Core records on startup!")
    except Exception as seed_err:
        print(f"[-] Error seeding dl_cl_core_sourcerock on startup: {str(seed_err)}")
        
        # Auto-merge Tmax and HI if they are missing
        tmax_null_count = db.execute(text("SELECT COUNT(*) FROM dl_cl_cutting_sourcerock WHERE tmax IS NULL")).scalar()
        if tmax_null_count > 0:
            print("[*] Tmax values are missing in dl_cl_cutting_sourcerock. Merging 4_HI_vs_Tmax_Plot.csv...")
            import csv
            hi_tmax_csv = os.path.join(os.path.dirname(__file__), "4_HI_vs_Tmax_Plot.csv")
            if os.path.exists(hi_tmax_csv):
                with open(hi_tmax_csv, mode='r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    csv_rows = list(reader)
                db_rows = db.execute(text("SELECT id, top_depth FROM dl_cl_cutting_sourcerock ORDER BY id")).fetchall()
                for idx, db_row in enumerate(db_rows):
                    if idx >= len(csv_rows):
                        break
                    csv_row = csv_rows[idx]
                    tmax_val = float(csv_row['Tmax']) if csv_row['Tmax'] and csv_row['Tmax'].strip() else None
                    hi_val = float(csv_row['HI']) if csv_row['HI'] and csv_row['HI'].strip() else None
                    db.execute(
                        text("UPDATE dl_cl_cutting_sourcerock SET tmax = :tmax, hi = :hi WHERE id = :id"),
                        {"tmax": tmax_val, "hi": hi_val, "id": db_row.id}
                    )
                db.commit()
                print("[+] Successfully merged Tmax and HI into dl_cl_cutting_sourcerock!")
            else:
                print(f"[-] 4_HI_vs_Tmax_Plot.csv not found at {hi_tmax_csv}. Skipping merge.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_CL_CUTTING_SOURCEROCK on startup: {str(seed_err)}")

    # Seed default sample data for Gas Chromatography if table is empty
    try:
        res = db.execute(text("SELECT count(*) from DL_GAS_CHROMATOGRAPHY")).scalar()
        if res == 0:
            print("[*] DL_GAS_CHROMATOGRAPHY is empty. Seeding default gc.csv dataset...")
            import csv
            gc_csv = os.path.join(os.path.dirname(__file__), "gc.csv")
            if os.path.exists(gc_csv):
                with open(gc_csv, mode='r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        formation_val = row.get("Formation")
                        if not formation_val or formation_val.strip() == "" or formation_val.lower() == "nan":
                            formation_val = None

                        db.execute(
                            text("""
                                INSERT INTO dl_gas_chromatography (
                                    name, object_number, formation, pr_by_ph, pr_by_nc17, ph_by_nc18
                                ) VALUES (
                                    :name, :object_number, :formation, :pr_by_ph, :pr_by_nc17, :ph_by_nc18
                                )
                            """),
                            {
                                "name": row["Well No."].strip() if row.get("Well No.") else "",
                                "object_number": row["Obj"].strip() if row.get("Obj") else "",
                                "formation": formation_val,
                                "pr_by_ph": float(row["Pr/Ph"]) if row.get("Pr/Ph") and row["Pr/Ph"].strip() else None,
                                "pr_by_nc17": float(row["Pr/nC17"]) if row.get("Pr/nC17") and row["Pr/nC17"].strip() else None,
                                "ph_by_nc18": float(row["Ph/nC18"]) if row.get("Ph/nC18") and row["Ph/nC18"].strip() else None
                            }
                        )
                    db.commit()
                    print("[+] Successfully seeded DL_GAS_CHROMATOGRAPHY from gc.csv!")
            else:
                print(f"[-] gc.csv not found at {gc_csv}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_GAS_CHROMATOGRAPHY on startup: {str(seed_err)}")

    # Seed default sample data for Oil Composition if table is empty
    try:
        res = db.execute(text("SELECT count(*) from DL_GCH_OIL_COMPOSITION")).scalar()
        if res == 0:
            print("[*] DL_GCH_OIL_COMPOSITION is empty. Seeding default Api.csv dataset...")
            import csv
            api_csv = os.path.join(os.path.dirname(__file__), "Api.csv")
            if os.path.exists(api_csv):
                with open(api_csv, mode='r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        object_val = row.get("Object")
                        if not object_val or object_val.strip() == "" or object_val.lower() == "nan":
                            object_val = None

                        db.execute(
                            text("""
                                INSERT INTO dl_gch_oil_composition (
                                    well_name, object_number, interval_top, api_gravity
                                ) VALUES (
                                    :well_name, :object_number, :interval_top, :api_gravity
                                )
                            """),
                            {
                                "well_name": row["Well No."].strip() if row.get("Well No.") else "",
                                "object_number": object_val,
                                "interval_top": float(row["Depth (m)"]) if row.get("Depth (m)") and row["Depth (m)"].strip() else None,
                                "api_gravity": float(row["API Gravity"]) if row.get("API Gravity") and row["API Gravity"].strip() else None
                            }
                        )
                    db.commit()
                    print("[+] Successfully seeded DL_GCH_OIL_COMPOSITION from Api.csv!")
            else:
                print(f"[-] Api.csv not found at {api_csv}. Skipping seed.")
    except Exception as seed_err:
        print(f"[-] Error seeding DL_GCH_OIL_COMPOSITION on startup: {str(seed_err)}")

    print("[+] Dynamic database discovery and seeding completed.")


