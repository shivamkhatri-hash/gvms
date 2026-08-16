-- GVMS - PostgreSQL Database Initialization Script

-- Create metabase database if it doesn't exist
SELECT 'CREATE DATABASE metabase_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'metabase_db')\gexec

-- Connect to ongc_lab (the primary database)
\c ongc_lab;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer', -- 'admin', 'researcher', 'viewer'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: petroleum_data
CREATE TABLE IF NOT EXISTS petroleum_data (
    id SERIAL PRIMARY KEY,
    sample_type VARCHAR(100) NOT NULL,
    well_name VARCHAR(100) NOT NULL,
    depth_from DOUBLE PRECISION NOT NULL,
    depth_interval DOUBLE PRECISION NOT NULL,
    toc DOUBLE PRECISION NOT NULL,
    s2 DOUBLE PRECISION NOT NULL,
    toc_classification VARCHAR(50) NOT NULL,
    s2_classification VARCHAR(50) NOT NULL,
    interpretation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Table 3: upload_logs
CREATE TABLE IF NOT EXISTS upload_logs (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    total_rows INTEGER NOT NULL,
    imported_rows INTEGER NOT NULL,
    skipped_rows INTEGER NOT NULL,
    error_summary TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Table 4: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_petroleum_well_name ON petroleum_data(well_name);
CREATE INDEX IF NOT EXISTS idx_petroleum_depth ON petroleum_data(depth_from);
CREATE INDEX IF NOT EXISTS idx_petroleum_toc ON petroleum_data(toc);
CREATE INDEX IF NOT EXISTS idx_petroleum_s2 ON petroleum_data(s2);
CREATE INDEX IF NOT EXISTS idx_petroleum_sample_type ON petroleum_data(sample_type);
CREATE INDEX IF NOT EXISTS idx_petroleum_well_depth ON petroleum_data(well_name, depth_from);

-- Audit Log index
CREATE INDEX IF NOT EXISTS idx_audit_user_action ON audit_logs(user_id, action);

-- ==================================================================================
-- Enterprise Dataset Registry & Versioning Tables
-- ==================================================================================

-- Table 5: dataset_registry
-- Stores configurable dataset definitions with dynamic column mappings and graph configs
CREATE TABLE IF NOT EXISTS dataset_registry (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    sql_table_name VARCHAR(100),
    module VARCHAR(100) DEFAULT 'geochemistry',
    status VARCHAR(50) DEFAULT 'active',
    version VARCHAR(50) DEFAULT '1.0',
    description TEXT,
    mapping_config JSONB NOT NULL DEFAULT '{}',
    graph_config JSONB NOT NULL DEFAULT '[]',
    filter_config JSONB NOT NULL DEFAULT '[]',
    required_columns TEXT[] NOT NULL DEFAULT '{}',
    primary_depth_column VARCHAR(100),
    primary_well_column VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Table 6: dataset_versions
-- Tracks versioned file uploads per registered dataset
CREATE TABLE IF NOT EXISTS dataset_versions (
    id SERIAL PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES dataset_registry(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    skipped_rows INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'rolled_back'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    error_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(dataset_id, version_number)
);

-- Table 7: generic_dataset_records
-- High-throughput JSONB document store for arbitrary dataset rows
CREATE TABLE IF NOT EXISTS generic_dataset_records (
    id BIGSERIAL PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES dataset_registry(id) ON DELETE CASCADE,
    version_id INTEGER NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 8: variable_registry
-- Stores variables definitions associated with datasets configuration
CREATE TABLE IF NOT EXISTS variable_registry (
    id SERIAL PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES dataset_registry(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    sql_column_name VARCHAR(100) NOT NULL,
    sql_data_type VARCHAR(50) NOT NULL,
    display_unit VARCHAR(50),
    is_numeric BOOLEAN NOT NULL DEFAULT TRUE,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    is_filterable BOOLEAN NOT NULL DEFAULT TRUE,
    chart_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    kpi_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    export_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    validation_rule TEXT,
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(dataset_id, sql_column_name)
);

-- Table 9: version_record_mapping
-- Maps dynamic record IDs in target tables to versions for rollbacks
CREATE TABLE IF NOT EXISTS version_record_mapping (
    id SERIAL PRIMARY KEY,
    version_id INTEGER NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    record_id INTEGER NOT NULL
);

-- Table 10: DL_CL_CORE_SOURCEROCK
-- Official table for Core Source Rock dataset
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
);

-- Performance Indexes for Registry Tables
CREATE INDEX IF NOT EXISTS idx_registry_name ON dataset_registry(name);
CREATE INDEX IF NOT EXISTS idx_versions_dataset ON dataset_versions(dataset_id);
CREATE INDEX IF NOT EXISTS idx_versions_active ON dataset_versions(dataset_id, is_active);
CREATE INDEX IF NOT EXISTS idx_records_dataset ON generic_dataset_records(dataset_id);
CREATE INDEX IF NOT EXISTS idx_records_version ON generic_dataset_records(version_id);
CREATE INDEX IF NOT EXISTS idx_records_data_gin ON generic_dataset_records USING GIN (data);

-- Table 10 (modified): DL_CL_CORE_SOURCEROCK
-- Keep core table definition as is.

-- Table 11: DL_CL_CUTTING_SOURCEROCK
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

-- Table 12: DL_CL_KINETICS
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

-- Table 13: DL_CL_VRO
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

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_registry_name ON dataset_registry(name);
CREATE INDEX IF NOT EXISTS idx_versions_dataset ON dataset_versions(dataset_id);
CREATE INDEX IF NOT EXISTS idx_versions_active ON dataset_versions(dataset_id, is_active);
CREATE INDEX IF NOT EXISTS idx_records_dataset ON generic_dataset_records(dataset_id);
CREATE INDEX IF NOT EXISTS idx_records_version ON generic_dataset_records(version_id);
CREATE INDEX IF NOT EXISTS idx_records_data_gin ON generic_dataset_records USING GIN (data);

-- Seed metadata configs (Datasets & Variables are seeded via Python scripts in practice,
-- but we include a basic SQL seed matching petroleum_geochem for backward compatibility and fallback)
INSERT INTO dataset_registry (name, display_name, sql_table_name, module, description, mapping_config, graph_config, filter_config, required_columns, primary_depth_column, primary_well_column)
VALUES (
    'petroleum_geochem',
    'Petroleum Geochemistry',
    'petroleum_data',
    'geochemistry',
    'Source rock evaluation dataset with TOC (wt%) and Pyrolysis S2 (mg/g) for kerogen potential assessment.',
    '{
        "sample_type": ["sample_type", "sample type", "sampletype", "type", "rock_type", "lithology"],
        "well_name": ["well_name", "well name", "well", "wellid", "well_id", "borehole"],
        "depth_from": ["depth_from", "depth from", "depth", "depth_m", "depth (m)", "md", "top_depth"],
        "depth_interval": ["depth_interval", "depth interval", "interval", "thickness", "step", "sample_interval"],
        "toc": ["toc", "toc%", "toc (wt%)", "toc_wt%", "total_organic_carbon"],
        "s2": ["s2", "s2 (mg/g)", "s2_mg_g", "pyrolysis_s2", "s2_peak"]
    }'::jsonb,
    '[
        {"type": "depth_profile", "x_axis": "toc", "y_axis": "depth_from", "title": "TOC Depth Profile", "color": "#003366"},
        {"type": "depth_profile", "x_axis": "s2", "y_axis": "depth_from", "title": "S2 Depth Profile", "color": "#D97706"},
        {"type": "scatter", "x_axis": "toc", "y_axis": "s2", "title": "TOC vs S2 Crossplot", "color_by": "toc_classification"},
        {"type": "histogram", "x_axis": "toc_classification", "title": "TOC Quality Distribution"},
        {"type": "histogram", "x_axis": "s2_classification", "title": "S2 Quality Distribution"}
    ]'::jsonb,
    '[
        {"name": "well_name", "type": "select", "label": "Well Name"},
        {"name": "sample_type", "type": "select", "label": "Lithology"}
    ]'::jsonb,
    ARRAY['well_name', 'depth_from', 'toc', 's2'],
    'depth_from',
    'well_name'
) ON CONFLICT (name) DO NOTHING;


