# GVMS Oracle Database & Dashboard Integration Guide

This document provides a comprehensive, step-by-step guide for connecting GVMS to an **Oracle Database**, creating/managing physical geochemical tables & views (including **CSIA Isotope**), syncing the dataset registries, and adding new custom tables and Plotly visualizations.

---

## Table of Contents
1. [Prerequisites & Environment Setup](#1-prerequisites--environment-setup)
2. [Step-by-Step: Adding a New Table to Oracle](#2-step-by-step-adding-a-new-table-to-oracle)
3. [Oracle DDL Reference (CSIA Isotope Example)](#3-oracle-ddl-reference-csia-isotope-example)
4. [Backend Registry & View Mapping](#4-backend-registry--view-mapping)
5. [Steps to Add a New Graph / Scientific Visualization](#5-steps-to-add-a-new-graph--scientific-visualization)
6. [Testing & Verification Commands](#6-testing--verification-commands)
7. [Troubleshooting & Common Oracle Pitfalls](#7-troubleshooting--common-oracle-pitfalls)

---

## 1. Prerequisites & Environment Setup

### 1.1 Configure `.env` for Oracle Connection
Edit `.env` (or `production.env`) in the root directory:

```env
# Database Provider
DATABASE_PROVIDER=oracle

# Oracle Connection String
# Format: oracle+oracledb://USERNAME:PASSWORD@HOST:PORT/?service_name=SERVICE_NAME
DATABASE_URL=oracle+oracledb://geochem_user:geochem_pass@10.200.1.50:1521/?service_name=EPINET

# Oracle Client Thick Mode (Set to true if using Oracle 11g/12c or specialized wallet security)
ORACLE_THICK_MODE=false
ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_19_19
```

### 1.2 Verify Oracle Connectivity
Test your connection before starting the server:
```cmd
cd backend
call venv\Scripts\activate.bat
python ..\scripts\ping_oracle.py
```

---

## 2. Step-by-Step: Adding a New Table to Oracle

Whenever you add a new geochemical or isotope table in Oracle, follow this 5-step workflow:

```
┌─────────────────────────────────┐
│ 1. Run DDL in Oracle Database   │ (CREATE TABLE DL_*_ and CREATE VIEW DL_*_VW)
└────────────────┬────────────────┘
                 │
┌────────────────▼────────────────┐
│ 2. Register Dataset in Backend  │ (Edit init_db.py DATASET_DEFINITIONS)
└────────────────┬────────────────┘
                 │
┌────────────────▼────────────────┐
│ 3. Map View in Ingestion Engine │ (Edit csv_processor.py VIEW_TO_TABLE)
└────────────────┬────────────────┘
                 │
┌────────────────▼────────────────┐
│ 4. Run Schema Sync Script       │ (python -c "init_db(db)")
└────────────────┬────────────────┘
                 │
┌────────────────▼────────────────┐
│ 5. Add Sidebar Route in UI      │ (Edit frontend/src/labs/registry.ts)
└─────────────────────────────────┘
```

---

## 3. Oracle DDL Reference (CSIA Isotope Example)

Execute the following SQL scripts in your Oracle Database (e.g. using SQL Developer or DBeaver):

### A. Physical Table (`DL_ISOTOPE_CSIA_`)
```sql
CREATE TABLE DL_ISOTOPE_CSIA_ (
    ID NUMBER(38) NOT NULL,
    UBHI VARCHAR2(64 BYTE),
    NAME VARCHAR2(200 CHAR),
    OBJECT_NUMBER VARCHAR2(200 CHAR),
    INTERVAL_TOP NUMBER(20,2),
    INTERVAL_BOTTOM NUMBER(20,2),
    FORMATION VARCHAR2(500 CHAR),
    MATERIAL_TYPE VARCHAR2(200 CHAR),
    COLLECTION_DATE DATE,
    NC15 NUMBER(20,2),
    NC16 NUMBER(20,2),
    NC17 NUMBER(20,2),
    NC18 NUMBER(20,2),
    NC19 NUMBER(20,2),
    NC20 NUMBER(20,2),
    NC21 NUMBER(20,2),
    NC22 NUMBER(20,2),
    NC23 NUMBER(20,2),
    NC24 NUMBER(20,2),
    NC25 NUMBER(20,2),
    NC26 NUMBER(20,2),
    NC27 NUMBER(20,2),
    NC28 NUMBER(20,2),
    NC29 NUMBER(20,2),
    NC30 NUMBER(20,2),
    NC31 NUMBER(20,2),
    NC32 NUMBER(20,2),
    NC33 NUMBER(20,2),
    NC34 NUMBER(20,2),
    ANALYSED_AT VARCHAR2(200 CHAR),
    REMARKS VARCHAR2(2000 CHAR),
    INSERT_USER VARCHAR2(64 BYTE),
    INSERT_DATE DATE,
    UPDATE_USER VARCHAR2(64 BYTE),
    UPDATE_DATE DATE,
    BOREHOLE_ID NUMBER(38) NOT NULL,
    CONSTRAINT DL_ISOTOPE_CSIA__PK PRIMARY KEY (ID)
);

CREATE UNIQUE INDEX DL_ISOTOPE_CSIA__PK ON DL_ISOTOPE_CSIA_ (ID);

GRANT SELECT, INSERT, UPDATE, DELETE ON DL_ISOTOPE_CSIA_ TO ROLE_LOAD;
GRANT SELECT ON DL_ISOTOPE_CSIA_ TO ROLE_VIEW;
```

### B. Relational View (`DL_ISOTOPE_CSIA_VW`)
```sql
CREATE OR REPLACE VIEW DL_ISOTOPE_CSIA_VW AS
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
    t.NC15, t.NC16, t.NC17, t.NC18, t.NC19, t.NC20,
    t.NC21, t.NC22, t.NC23, t.NC24, t.NC25, t.NC26,
    t.NC27, t.NC28, t.NC29, t.NC30, t.NC31, t.NC32,
    t.NC33, t.NC34,
    t.ANALYSED_AT,
    t.REMARKS,
    t.INSERT_USER, t.INSERT_DATE, t.UPDATE_USER, t.UPDATE_DATE,
    t.BOREHOLE_ID
FROM DL_ISOTOPE_CSIA_ t
LEFT JOIN W_BOREHOLE b ON t.BOREHOLE_ID = b.BOREHOLE_ID;

GRANT SELECT ON DL_ISOTOPE_CSIA_VW TO ROLE_VIEW;
GRANT SELECT, INSERT, UPDATE, DELETE ON DL_ISOTOPE_CSIA_VW TO ROLE_LOAD;
```

---

## 4. Backend Registry & View Mapping

### 4.1 Register in `backend/app/db/init_db.py`
1. **Dataset Metadata Definition:**
```python
"csia_isotope": {
    "display_name": "CSIA Isotope",
    "sql_table_name": "DL_ISOTOPE_CSIA_VW",
    "module": "isotope",
    "required_columns": ["name"],
    "primary_depth_column": "interval_top",
    "primary_well_column": "name",
    "description": "Stable Isotope Laboratory Compound Specific Isotope Analysis (CSIA) of n-alkanes.",
    "graph_config": [
        {"type": "csia_profile", "x_axis": "nc15", "y_axis": "interval_top", "title": "CSIA n-Alkanes Isotopic Profile"}
    ]
}
```

2. **View-to-Table Registry Mapping:**
```python
VIEW_DATASETS = {
    "DL_ISOTOPE_CSIA_VW": "DL_ISOTOPE_CSIA_",
    ...
}
```

3. **Variable Classification & Unit Assignment:**
```python
if name in ["gas_isotope", "oil_isotope", "csia_isotope"]:
    if col_name_lower.startswith("nc") or col_name_lower.startswith("delta_"):
        unit = "‰"
        category = "isotope"
```

### 4.2 Ingestion Target Mapping (`backend/app/services/csv_processor.py`)
Ensure spreadsheet/CSV insertions route to the underlying Oracle table:
```python
VIEW_TO_TABLE = {
    "DL_ISOTOPE_CSIA_VW": "dl_isotope_csia_",
    ...
}
```

### 4.3 Trigger Schema Sync
Run the registry sync command:
```cmd
cd backend
call venv\Scripts\activate.bat
python -c "from app.db.init_db import init_db; from app.core.database import SessionLocal; db = SessionLocal(); init_db(db); print('[SUCCESS] Oracle Schema Synced!')"
```

---

## 5. Steps to Add a New Graph / Scientific Visualization

### Option 1: Zero-Code Custom Chart (Built-in Dynamic Studio)
Any numeric column mapped from Oracle is instantly available in the **Interactive Custom Chart Builder** tab in the dashboard. Users can generate:
- 2D Bivariate Scatter Plots
- Multi-curve Depth Profiles (Inverted Y-axis)
- Frequency Histograms & Boxplots
- 3D Scatter & Correlation Heatmaps

---

### Option 2: Dedicated Scientific Diagram (Plotly Component)
To create a standard specialized scientific crossplot (like Bernard, Sofer, or Ternary charts):

1. **In your React Dashboard Component (`frontend/src/pages/YourDashboard.tsx`):**
```tsx
import Plot from 'react-plotly.js';

// 1. Map Oracle records to Plotly traces
const customPlotTraces = React.useMemo(() => {
  return data.map((row) => ({
    x: [row.nc15],
    y: [row.interval_top],
    mode: 'markers+lines',
    type: 'scatter',
    name: row.name,
    marker: { size: 8, color: '#0284c7' },
    text: `Well: ${row.name}<br>Depth: ${row.interval_top}m<br>δ13C: ${row.nc15} ‰`,
    hovertemplate: '%{text}<extra></extra>'
  }));
}, [data]);

// 2. Render Plot component
return (
  <Card className="p-5 rounded-2xl bg-white border border-slate-200">
    <div className="h-[700px] w-full">
      <Plot
        data={customPlotTraces}
        layout={{
          title: '<b>n-Alkane δ13C Profile</b>',
          xaxis: { title: 'n-Alkane' },
          yaxis: { title: 'δ13C (‰)', range: [-33, -23] },
          autosize: true
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  </Card>
);
```

2. **Add Top Collapsible Table:**
Place `<DashboardDatasetTable />` at the top of your dashboard layout:
```tsx
<DashboardDatasetTable
  title="CSIA Dataset Records"
  data={data}
  variables={dataset?.variables}
  isLoading={loading}
/>
```

3. **Report Export Engine (`backend/app/services/report_generator.py`):**
Add a handler under `generate_chart_figure()` to render the plot with Matplotlib when exporting PDF/Word executive summaries.

---

## 6. Testing & Verification Commands

| Action | Command |
| :--- | :--- |
| **Ping Oracle DB** | `python scripts/ping_oracle.py` |
| **Sync Registries** | `python -c "from app.db.init_db import init_db; from app.core.database import SessionLocal; init_db(SessionLocal())"` |
| **Start Backend API** | `start_backend.bat` (runs on `http://127.0.0.1:8000`) |
| **Start Frontend UI** | `start_frontend.bat` (runs on `http://localhost:5173`) |
| **Build Check** | `cd frontend && npm run build` |

---

## 7. Troubleshooting & Common Oracle Pitfalls

### 1. `ORA-00942: table or view does not exist`
* **Cause:** User does not have `GRANT SELECT` permission, or table was created with case-sensitive double quotes (`"dl_isotope_csia"` instead of uppercase `DL_ISOTOPE_CSIA_`).
* **Fix:** Ensure the user running GVMS has `ROLE_VIEW` / `ROLE_LOAD` grants on both the table and the view.

### 2. Column Names Casing in Queries
* GVMS automatically uses uppercase quoting `"{COLUMN_NAME}"` when `DATABASE_PROVIDER=oracle` to match standard Oracle catalog conventions.

### 3. Missing `W_BOREHOLE` Reference
* The view joins `W_BOREHOLE` via `BOREHOLE_ID`. If `W_BOREHOLE` is not populated, the view falls back gracefully to `t.UBHI` via `COALESCE(b.UBHI, t.UBHI)`.
