# GVMS — Geochemistry LIMS Progress & Architecture Documentation

This document serves as the comprehensive technical "project memory" and architectural context for the **GVMS** application. It describes the design patterns, repository layout, data schemas, upload pipelines, and interpretation plot algorithms in detail.

---

## 1. Project Overview

*   **Project Name:** GVMS - Graphical Visualization Management System
*   **Purpose:** Secure, scalable Laboratory Information Management System (LIMS) for organizing and analyzing organic geochemistry data.
*   **Target Users:** GVMS Chief Geochemists, Lab Researchers, Scientific Technicians, and System Administrators.
*   **Target Laboratory Environment:** Multi-disciplinary laboratories including Source Rock, Oil, Stable Isotope, Biomarker, CCUS, and Surface Geochemistry.
*   **Primary Business / Scientific Purpose:** Automate geochemical data ingestion, classify organic richness and kerogen potential (e.g., Peters & Cassa, 1994), reconstruct gas genetics (e.g., Schoell, Bernard), evaluate maturity cracking, and correlate oil biomarker properties.
*   **Major Capabilities:**
    *   **Dynamic File Ingestion:** CSV and Excel upload parsing with automated sheet detection, variable synonym header mappings, and CSIA layout transpositions.
    *   **Enterprise registries:** Database-configurable registries for datasets, variables, synonyms, and upload versions.
    *   **Scientific Plotting:** Plotly-based interactive diagrams (e.g., Bernard crossplots, Sofer plots, CSIA line charts) linked to live filters.
    *   **Metabase Embedding:** Cryptographically signed JWT dashboard embedding with strict Nginx route containment.
    *   **Enterprise Security:** Role-Based Access Control (RBAC), database audits, and secure local enterprise auth overrides.
*   **Technology Stack:**
    *   *Frontend:* React v18.2.0, Vite v5.1.6, TypeScript v5.4.3, TailwindCSS v3.4.1, TanStack React Query v5.28.9, Axios v1.6.8, Plotly.js-dist-min v2.30.0, Lucide React v0.359.0.
    *   *Backend:* FastAPI >=0.110.0, SQLAlchemy >=2.0.28, Uvicorn >=0.28.0, PostgreSQL (pg_isready), Pandas >=2.2.1, openpyxl >=3.1.2, ReportLab v4.1.0 (PDF reports).
    *   *Infrastructure:* Docker, Docker Compose, Nginx.
*   **Current Development Status:** Fully operational for Source Rock, Oil, Stable Isotope, and Biomarker laboratories. IGC/CCUS and Surface Geochemistry labs are planned.

---

## 2. Complete Directory Tree

```
gvms/
├── backend/
│   ├── app/
│   │   ├── api/             # API routes and authentication dependencies
│   │   │   ├── deps.py      # OAuth2 dependencies, session, and role checks
│   │   │   └── v1/
│   │   │       ├── endpoints/ # Route handlers (auth, upload, dashboard, registry)
│   │   │       └── router.py # FastAPI central routing register
│   │   ├── core/            # Configuration settings, logging, and database setup
│   │   │   ├── config.py    # Pydantic configuration environment bindings
│   │   │   ├── database.py  # SQLAlchemy engine creation & connection sessions
│   │   │   └── logging.py   # Uvicorn and custom logger definitions
│   │   ├── crud/            # Database CRUD utilities for registry, logs, and users
│   │   ├── db/              # Startup database migrations and seeding routines
│   │   │   └── init_db.py   # DDL views setup, table structures, and CSV seeder
│   │   ├── labs/            # Backend laboratory module folders
│   │   ├── models/          # SQLAlchemy SQL models
│   │   ├── schemas/         # Pydantic JSON schemas
│   │   └── services/        # Business logic engines (ingestion, math, metabase, reports)
│   │       ├── csv_processor.py      # Dynamic ingestion pipeline
│   │       ├── formula_engine.py     # Geochemical formulas calculations
│   │       ├── geochemistry_engine.py# Peters & Cassa TOC/S2 classifications
│   │       ├── metabase_service.py   # Embed token signing and sync APIs
│   │       └── report_generator.py   # PDF, Excel, and CSV export generators
│   └── requirements.txt     # Python backend dependencies
│
├── frontend/
│   ├── dist/                # Production React assets compilation output
│   ├── src/
│   │   ├── components/      # UI components (charts, layouts, spinner, buttons)
│   │   ├── context/         # AuthContext handles JWT sessions
│   │   ├── labs/            # Laboratory registry definitions (registry.ts)
│   │   ├── pages/           # Page modules (Dashboard, Upload, DatasetRegistry)
│   │   ├── services/        # Axios API clients
│   │   └── utils/           # Helper constants and UI utilities
│   ├── package.json         # npm dependencies and script aliases
│   └── tailwind.config.js   # Style utilities configurations
│
├── database/
│   └── init.sql             # SQL file initialized on postgres startup
│
├── metabase/
│   └── provision_bi_dashboard.py # Metabase REST API auto-provisioning script
│
├── nginx/
│   └── nginx.conf           # Reverse proxy routing rules
│
├── backups/                 # Auto-created backups directory for LIMS archives
├── scripts/                 # Administration scripts (db_setup.py, verify_uploads.py)
├── .env                     # Local environment settings
└── docker-compose.yml       # Docker orchestrator configuration file
```

---

## 3. File-by-File Documentation

### FILE: `backend/app/main.py`
*   **Purpose:** Central entry point for the FastAPI application. Registers FastAPI middlewares (CORS), includes the API router, and initializes a database lifecycle `lifespan` context manager.
*   **Used By:** Docker backend service runner (`uvicorn`).
*   **Depends On:** `app/core/config.py`, `app/api/v1/router.py`, `app/db/init_db.py`.
*   **Provides:** FastAPI app object, database startup hook, health probe binding.
*   **Important Logic:** The `@asynccontextmanager` lifepan calls `init_db(db)` to recreate views and seed sample geochemical tables on startup.

### FILE: `backend/app/core/config.py`
*   **Purpose:** Configures global application settings, environment variables, database URLs, superuser defaults, and default CSV column synonym structures.
*   **Used By:** All backend modules requiring credentials or setting parameters.
*   **Depends On:** `pydantic-settings`, `.env` file.
*   **Provides:** `settings` object containing Pydantic schemas.
*   **Important Logic:** Computes `sqlalchemy_database_url` dynamically based on `DATABASE_PROVIDER` ("postgres" or "oracle").

### FILE: `backend/app/db/init_db.py`
*   **Purpose:** Prepares PostgreSQL schemas by recreating physical tables, left-joining borehole views on `W_BOREHOLE`, mapping variable registrations, and seeding initial geochem records.
*   **Used By:** Application lifespan initialization.
*   **Depends On:** `SQLAlchemy`, `psycopg2`, `app/services/csv_processor.py`.
*   **Provides:** Table DDL definitions and seeder triggers.
*   **Important Logic:** Registers variables and synonyms for biomarker, chromatography, composition, and stable isotope datasets. Reads `sample_*.csv` templates and inserts records via the ingestion engine.

### FILE: `backend/app/services/csv_processor.py`
*   **Purpose:** Implements the Dynamic File Ingestion system, including multi-sheet matching, CSIA transpositions, synonym header resolutions, and SQL inserts.
*   **Used By:** Upload endpoint routes.
*   **Depends On:** `Pandas`, `SQLAlchemy`, `app/services/formula_engine.py`.
*   **Provides:** `CSVProcessor.process_geochemical_upload`.
*   **Important Logic:** For Excel uploads, iterates all sheets and matches headers against registry synonyms to select the best dataset. If CSIA is detected, checks if `nc15` and `nc16` are in a single column to transpose components. Reroutes insertions to physical tables instead of views.

### FILE: `backend/app/services/formula_engine.py`
*   **Purpose:** Calculation library that derives geochemical ratios from measured parameters (pyrolysis, gas chromatography, composition, and isotopes).
*   **Used By:** Ingestion processor quality audits and formula engines.
*   **Depends On:** `math`, Python standard libraries.
*   **Provides:** `calculate_derived_parameters`, `calculate_chromatography_ratios`, `calculate_isotope_ratios`.
*   **Important Logic:** Derives `c1_by_c2_plus_c3`, `c2_by_c3`, `delta_c2_by_delta_c3`, `ln_c2_by_c3`, `c1_by_c2`, and `ln_c1_by_c2` using safe divisions and natural log bounds.

### FILE: `backend/app/services/metabase_service.py`
*   **Purpose:** Controls Metabase synchronization via its REST API, performing sync triggers, Collection provisioning, Model generation, KPI cards setup, and Dashboard layout locks.
*   **Used By:** Dataset registry management.
*   **Depends On:** `requests`, `app/core/config.py`.
*   **Provides:** `MetabaseService.sync_dataset`, `MetabaseService.get_dashboard_id_by_name`.

### FILE: `backend/app/api/v1/endpoints/dashboard.py`
*   **Purpose:** Serves data queries for scientificinterpretation plots, including dynamic WHERE clause mapping, and generates signed Metabase JWT embed tokens.
*   **Used By:** Frontend Plotly components.
*   **Depends On:** `jose.jwt`, `SQLAlchemy`, `app/api/deps.py`.
*   **Provides:** `/api/v1/dashboard/scientific-plots`, `/api/v1/dashboard/embed-url`.

---

## 4. Frontend Architecture

The frontend is constructed using React 18, Vite, TypeScript, and TailwindCSS:

```
[Browser]
   │
   ▼ (React Router / App.tsx)
[Protected Route Checks Session]
   │
   ▼ (AuthContext.tsx / localStorage access_token)
[Dashboard Page Loaded]
   │
   ▼ (React Query Hook Triggers)
[Axios API Request] ──(Injects Bearer Token)──► [FastAPI Backend]
                                                      │
[Plotly Chart Renders] ◄──(JSON Response)─────────────┘
```

*   **Session Management:** `AuthContext.tsx` handles tokens in `localStorage`. On `401 Unauthorized` responses, an Axios response interceptor fetches `/auth/refresh` using the refresh token, replacing keys transparently.
*   **Modular Component Scoping:** Dashboard page views (e.g., `Samples.tsx`, `Upload.tsx`, `DatasetRegistry.tsx`) accept a `module` prop (e.g. `oil`, `isotope`, `biomarker`, defaulting to `source-rock`) to scope headings, variable bindings, and queries dynamically.

---

## 5. Backend Architecture

Built with FastAPI using dependency-injected route controllers:

### Router Mappings & Endpoints
*   **Authentication (`/auth`):**
    *   `POST /login`: OAuth2 password flow, returns access/refresh tokens.
    *   `POST /refresh`: Uses refresh token to reissue credentials.
    *   `GET /me`: Returns current user profile details.
*   **User Management (`/users`):**
    *   `GET /`: List registered users (Admin only).
    *   `POST /`: Create a user profile (Admin only).
*   **Petroleum Data / Samples (`/samples`):**
    *   `GET /`: Fetches list of samples with search/filter parameters.
*   **Data Ingestion (`/upload`):**
    *   `POST /`: Synchronously uploads and processes geochemical Excel/CSV data.
    *   `GET /logs`: Retrieve upload activity audit reports.
*   **Analytics / Dashboard (`/dashboard`):**
    *   `GET /scientific-plots`: Query geochemical variables with well/depth filter clauses.
    *   `GET /embed-url`: Signs and returns a Metabase dashboard JWT embed token.
*   **Dataset Registry (`/registry`):**
    *   `GET /`: Lists registered datasets and active record counts.
    *   `POST /`: Register a new dataset configuration (Admin only).
*   **Dynamic Geochemistry (`/datasets`, `/variables`, `/upload`):**
    *   Geochem routing controllers supporting registries metadata discovery and uploads auto-detection.

---

## 6. Database Architecture

The database is PostgreSQL, structured with core metadata registries, log tables, and physical laboratory-specific tables:

```
┌────────────────────────┐      ┌────────────────────────┐
│    dataset_registry    │◄─────│    dataset_versions    │
├────────────────────────┤      ├────────────────────────┤
│ id (PK)                │      │ id (PK)                │
│ name (Unique)          │      │ dataset_id (FK)        │
│ mapping_config (JSONB) │      │ version_number         │
└────────────────────────┘      └────────────────────────┘
          ▲                                 ▲
          │                                 │
┌────────────────────────┐      ┌────────────────────────┐
│   variable_registry    │      │ version_record_mapping │
├────────────────────────┤      ├────────────────────────┤
│ id (PK)                │      │ version_id (FK)        │
│ dataset_id (FK)        │      │ record_id              │
│ sql_column_name        │      └────────────────────────┘
└────────────────────────┘
```

*   **`W_BOREHOLE` Master Table:** Stores master borehole metadata (`BOREHOLE_ID`, `UBHI`, `BOREHOLE_NAME`).
*   **Registry Tables:**
    *   `dataset_registry`: Defines target physical tables, columns, and graph configs.
    *   `dataset_versions`: Tracks file uploads per dataset.
    *   `variable_registry`: Stores column-specific variables, units, and synonym rules.
    *   `version_record_mapping`: Maps dynamic row IDs to version IDs, supporting clean rollbacks.
*   **Physical Geochemical Tables:** `DL_CL_CORE_SOURCEROCK`, `DL_CL_CUTTING_SOURCEROCK`, `DL_CL_KINETICS`, `DL_CL_VRO`, `DL_GAS_CHROMATOGRAPHY`, `DL_GCH_OIL_COMPOSITION`, `DL_ISOTOPE_GAS`, `DL_ISOTOPE_OIL`, `DL_ISOTOPE_CSIA`, `DL_BIOMARKER_STERANE`, `DL_BIOMARKER_HOPANE`, `DL_TRICYCLIC_TERPANE_`, `DL_BIOMARKER_AROMATIC_`, `DL_BIOMARKER_PR_PH_`.

---

## 7. Laboratory Architecture

| Laboratory | Datasets | SQL Table / View | Variables Status | Frontend Route / Component | status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Source Rock** | Core, Cutting, Kinetics, VRo, Petroleum Geochem | `DL_CL_CORE_SOURCEROCK`, `DL_CL_CUTTING_SOURCEROCK`, `DL_CL_KINETICS`, `DL_CL_VRO`, `petroleum_data` | Fully Configured | `/` (Dashboard.tsx) | **IMPLEMENTED** |
| **Oil** | Gas Chromatography, Oil Composition | `DL_GAS_CHROMATOGRAPHY` / view, `DL_GCH_OIL_COMPOSITION` / view | Fully Configured | `/oil/dashboard`, `/oil/composition-dashboard` | **IMPLEMENTED** |
| **Stable Isotope** | Gas Isotope, Oil Isotope, CSIA Isotope | `dl_isotope_gas` / view, `dl_isotope_oil` / view, `dl_isotope_csia` / view | Fully Configured | `/isotope/dashboard` | **IMPLEMENTED** |
| **Biomarker** | Sterane, Hopane, Tricyclic Terpane, Aromatic Biomarkers, Pristane/Phytane | `DL_BIOMARKER_STERANE` / view, `DL_BIOMARKER_HOPANE` / view, `DL_TRICYCLIC_TERPANE_` / view, `DL_BIOMARKER_AROMATIC_` / view, `DL_BIOMARKER_PR_PH_` / view | Fully Configured | `/biomarker/sterane-dashboard`, etc. | **IMPLEMENTED** |
| **IGC / CCUS** | N/A | N/A | N/A | `/igc/dashboard` | **PLANNED** |
| **Surface Geochem**| Surface Geochemistry | N/A | N/A | `/surface/dashboard` | **PLANNED** |

---

## 8. Source Rock Laboratory

The Source Rock laboratory organizes rock pyrolysis and thermal evaluation data:
*   **Datasets:** `core_source_rock`, `cutting_source_rock`, `vro`, `kinetics`, `petroleum_geochem` (legacy).
*   **Database Tables:** `DL_CL_CORE_SOURCEROCK`, `DL_CL_CUTTING_SOURCEROCK`, `DL_CL_VRO`, `DL_CL_KINETICS`, `petroleum_data`.
*   **Automated Interpretations:** Derived via Peters & Cassa (1994) definitions using `GeochemistryEngine.classify_toc` and `GeochemistryEngine.classify_s2`.
*   **Dashboard Visualizations (`Dashboard.tsx`):**
    *   TOC vs. S2 Crossplot.
    *   TOC Depth Profile (linear scale, depth reversed).
    *   S2 Depth Profile (linear scale, depth reversed).
    *   TOC Richness Bar Chart (Poor, Fair, Good, Very Good, Excellent).
    *   S2 Potential Bar Chart (Poor, Fair, Good, Very Good, Excellent).

---

## 9. Dataset Registry

The Dataset Registry drives LIMS configurability by storing schema configurations in the database.
*   **JSONB Configurations:**
    *   `mapping_config`: Maps database fields to lists of CSV header synonyms.
    *   `graph_config`: Configures interactive interpretation plots.
    *   `filter_config`: Configures filter options (e.g. Well Name, Formation) on the dashboard.
*   **Selection Mechanics:** When navigating LIMS modules, components fetch registered datasets via the registry API. The dataset's `mapping_config` is used during file uploads to resolve CSV headers to SQL columns dynamically.

---

## 10. Variable Registry

Variables are registered in the `variable_registry` table, defining parameters for ingestion validation and plotting.

### Core Geochemical Variables Definitions
*   `toc`: Display Name: `TOC`, Data Type: `DOUBLE PRECISION`, Unit: `wt%`.
*   `s1`: Display Name: `S1`, Data Type: `DOUBLE PRECISION`, Unit: `mg HC/g rock`.
*   `s2`: Display Name: `S2`, Data Type: `DOUBLE PRECISION`, Unit: `mg HC/g rock`.
*   `s3`: Display Name: `S3`, Data Type: `DOUBLE PRECISION`, Unit: `mg HC/g rock`.
*   `tmax`: Display Name: `Tmax`, Data Type: `DOUBLE PRECISION`, Unit: `°C`.
*   `vro`: Display Name: `VRo`, Data Type: `DOUBLE PRECISION`, Unit: `%`.
*   `c1`: Display Name: `Methane (C1)`, Data Type: `DOUBLE PRECISION`, Unit: `vol%`.
*   `c2_plus`: Display Name: `Gas Wetness (C2+)`, Data Type: `DOUBLE PRECISION`, Unit: `%`.
*   `delta_c1`: Display Name: `d13C Methane`, Data Type: `DOUBLE PRECISION`, Unit: `‰`.
*   `delta_c2`: Display Name: `d13C Ethane`, Data Type: `DOUBLE PRECISION`, Unit: `‰`.
*   `delta_sat`: Display Name: `d13C Saturates`, Data Type: `DOUBLE PRECISION`, Unit: `‰`.
*   `delta_aro`: Display Name: `d13C Aromatics`, Data Type: `DOUBLE PRECISION`, Unit: `‰`.
*   `nc15` to `nc34`: Display Name: `n-C15` to `n-C34` carbon isotopes, Data Type: `DOUBLE PRECISION`, Unit: `‰`.

---

## 11. Upload Pipeline

Ingests geochemical files securely with dynamic mapping:

```
[CSV / Excel File Uploaded]
        │
        ▼ (FastAPI /api/v1/upload)
[Inspect Sheet Header Synonym Matches Score]
        │
        ▼ (Identify Target Dataset Registry Config)
[Transpose CSIA columns to rows if nc15 & nc16 in same column]
        │
        ▼ (Map Headers to SQL Columns)
[Calculate Derived Parameters via FormulaEngine]
        │
        ▼ (Check Required Fields & Check for Duplicates)
[Insert into Physical Target Table (Transaction Open)]
        │
        ▼ (Map Version Records Mapping IDs)
[Commit SQL Transaction & Write Audit Logs]
```

---

## 12. Graph / Plotly Architecture

Plotly interpretation crossplots are bound to dynamic filters (Well, Formation, Depth):

1.  **Bernard Diagram:** Plot of `delta_c1` (Y-axis, range `[-90, -20]`) vs `c1_by_c2_plus_c3` (X-axis, logarithmic, range `[1, 100000]`). Includes biogenic and thermogenic zones.
2.  **Modified Bernard Diagram:** Plot of `c1_by_c2_plus_c3` (Y-axis, logarithmic, range `[0.1, 100000]`) vs `delta_c1` (X-axis, linear, range `[-90, 10]`).
3.  **Type of Gas:** Plot of `delta_c2` (Y-axis, range `[-34, -20]`) vs `delta_c1` (X-axis, range `[-50, -20]`).
4.  **Maturity Diagram:** Crossplots `delta_c2` on the X-axis (`[-42, -18]`) and plots Methane (`delta_c1`) and Propane (`delta_c3`) on the Y-axis (`[-55, -15]`) with vertical spread lines connecting them.
5.  **Maturity Plot:** Plot of `delta_c3` (Y-axis, range `[-30, -16]`) vs `delta_c2` (X-axis, range `[-35, -15]`) with maturity reference line `[-32.1, -28.0] -> [-17.5, -16.5]`.
6.  **Secondary Cracking:** Plot of `delta_c2_by_delta_c3` (Y-axis, range `[-15, 4]`) vs `c2_by_c3` (X-axis, range `[0, 18]`).
7.  **Schoell Wetness Plot:** Plot of `delta_c1` (Y-axis, reversed range `[-80, -20]`) vs `c2_plus` (X-axis, range `[0, 50]`).
8.  **Wetness Plot:** Plot of `delta_c1` (Y-axis, reversed range `[-75, -20]`) vs `c2_plus` (X-axis, range `[0, 80]`).
9.  **CSIA Gas Profile:** Component line chart (C1, C2, C3, iC4, nC4, iC5, nC5) on the X-axis vs Carbon isotope ratio (Y-axis, range `[-55, -15]`).
10. **Carbon Isotope Depth Profile:** Reverse depth profile plotting `delta_c1`, `delta_c2`, `delta_c3` vs depth.
11. **Sofer Plot:** Plot of `delta_aro` (Y-axis, range `[-33, -22]`) vs `delta_sat` (X-axis, range `[-33, -22]`) with Sofer diagonal boundary line `Y = X`.
12. **CSIA Oil Profile:** Component line chart (nC15 to nC34) on the X-axis vs Alkane isotope ratio (Y-axis, range `[-33, -23]`).

---

## 13. Metabase Embedding

Metabase runs in a secure, isolated service container:
*   **Signed JWT URL Generation:** FastAPI signs requests using HMAC-SHA256 (`METABASE_EMBED_SECRET_KEY`), packaging the dashboard ID, filter queries, and expiration timestamp.
*   **Security Controls:** Nginx locks down `/metabase/` routing and rejects setup, session, user management, and administrative API calls with `403 Forbidden`.
*   **"Message seems corrupt or manipulated" Diagnosis:** In Metabase, database setting configurations (saved in the Metabase database `setting` table) override environment variables (`MB_EMBED_SECRET_KEY`). If the secret is regenerated or modified in the Metabase admin UI, backend JWT signatures fail. To resolve, reset the embedding key in the Metabase Admin settings to match `METABASE_EMBED_SECRET_KEY`.

---

## 14. Docker Architecture

The application is orchestrated into 5 service containers:

1.  **`gvms-postgres` (`postgres:16-alpine`):** Stores schemas and credentials. Mapped to host port `5433` (internal `5432`).
2.  **`gvms-backend` (`fastapi` build):** Implements endpoints and processing logic. Mapped to host port `8001` (internal `8000`). Dependent on database healthchecks.
3.  **`gvms-frontend` (`react` build):** Serves compiled UI static files. Mapped to host port `3001` (internal `3000`).
4.  **`gvms-metabase` (`metabase/metabase:latest`):** Analytics engine. Mapped to host port `3002` (internal `3000`).
5.  **`gvms-nginx` (`nginx:alpine`):** Reverse proxy listening on host port `8080` (internal `80`), routing traffic to the frontend, backend, or metabase containers.

---

## 15. Nginx Configuration

Nginx acts as the reverse proxy. Host port 8080 is forwarded:
*   `/` -> Proxies to React frontend.
*   `/api` -> Proxies to FastAPI backend.
*   `/docs` & `/openapi.json` -> Proxies to Swagger OpenAPI documentation.
*   `/metabase/` -> Proxies to Metabase, returning `403 Forbidden` for administrative, administrative user creation, and auth session routes.

---

## 16. Environment Variables

*   `PROJECT_NAME`: Configures LIMS title headers (Default: `"ONGC Chem Lab Data"`).
*   `ENVIRONMENT`: Set to `production` or `development`.
*   `DATABASE_PROVIDER`: Selected dialect, `postgres` or `oracle`.
*   `SECRET_KEY`: `[SECRET — NOT DOCUMENTED]`.
*   `DATABASE_URL`: `[SECRET — NOT DOCUMENTED]`.
*   `ORACLE_PASSWORD`: `[SECRET — NOT DOCUMENTED]`.
*   `METABASE_EMBED_SECRET_KEY`: `[SECRET — NOT DOCUMENTED]`.
*   `METABASE_ADMIN_PASSWORD`: `[SECRET — NOT DOCUMENTED]`.
*   `FIRST_SUPERUSER_PASSWORD`: `[SECRET — NOT DOCUMENTED]`.

---

## 17. Authentication and RBAC

The system secures access using JWT session tokens:
*   **Login Flow:** Authenticates passwords against bcrypt hashes in the database. Returns access/refresh tokens. Supports enterprise `@ongc.co.in` overrides.
*   **Role Permissions:**
    *   `admin`: Full privileges (User management, registry modification, backups, uploads).
    *   `researcher`: Ingestion uploads, variables configuration modifications, and viewing reports.
    *   `viewer`: Read-only access to scientific plots and dashboards.

---

## 18. Security

*   *Password Cryptography:* Passwords hashed using bcrypt.
*   *JWT Signature:* Expiration bounds, signed with HMAC-SHA256.
*   *Registry Ingestion Sanitization:* Validates file headers, types, and scopes. Reroutes writes to physical tables.
*   *Nginx Lockdown:* Restricts Metabase API routes.
*   *CORS Policies:* Configures allowed origins list in FastAPI backend settings.

---

## 19. Reports and Exports

Dynamic report exports query records based on active filters and generate files on-the-fly:
*   **PDF Exports:** Styled utilizing ReportLab, generating tabular listings and geochemical summaries.
*   **Excel/CSV Exports:** Generated utilizing Pandas and openpyxl.

---

## 20. Backup / Restore

*   **Backup Creation:** `BackupService.create_backup` dumps configurations, registry settings, and data records into a zip archive inside the `/backups` directory.
*   **Restore Operation:** Reads LIMS zip archives, clears existing table states, and inserts the backed-up configurations.

---

## 21. Monitoring

*   **Health Check API:** `/api/v1/health` checks database connection response and queries Metabase's `/api/health` status.
*   **Audit logs:** Tracks LIMS actions in `audit_logs` (User ID, IP, Action, Details, Timestamp).

---

## 22. Current Status

| Component | Status | Notes |
| :--- | :--- | :--- |
| **Frontend** | Active | React application compiled without type errors. |
| **Backend** | Active | FastAPI uvicorn server online. |
| **PostgreSQL**| Active | Database tables initialized and seeded. |
| **Docker** | Active | Orchestration layers online. |
| **Nginx** | Active | Reverse proxy actively routing traffic. |
| **Authentication**| Active | JWT session validations active. |
| **RBAC** | Active | Privileges correctly checked. |
| **Source Rock**| Active | Tables populated, crossplots operational. |
| **Oil Lab** | Active | Chromatography and composition pages online. |
| **Stable Isotope**| Active | All 11 scientific plots online, default templates seeded. |
| **Biomarker** | Active | Hopane, Sterane, Tricyclic, Aromatic, Pr/Ph operational. |
| **Dataset Registry**| Active | Configuration models mapped in database. |
| **Variable Registry**| Active | Synonyms and variable attributes active. |
| **Plotly** | Active | Custom configurations, boundaries, and reversed depth profiles active. |
| **Metabase** | Degraded | Dynamic dashboards operational, JWT iframe subject to embedding key match. |
| **Upload** | Active | File ingestion, sheet detection, and CSIA transposition active. |
| **Reports** | Active | PDF, Excel, and CSV download generators active. |
| **Backup** | Active | Zip compression utilities active. |
| **Monitoring** | Active | Health and audit logs operational. |

---

## 23. Known Issues

*   **Metabase Setting Override:** Mismatch of the JWT signing key occurs if modified inside the Metabase dashboard admin UI, overriding `MB_EMBED_SECRET_KEY`.
*   **Dynamic Dashboard breadcrumb scoping:** Breadcrumbs dynamically show laboratory context names based on the active route dataset to prevent showing Source Rock laboratory titles globally.

---

## 24. Hard-Coded / Mock / Sample Data

*   **Seed templates:** `sample_gas_isotope.csv`, `sample_oil_isotope.csv`, `sample_csia_isotope.csv` are used as seeding files on database initialization.
*   **Maturity Diagrams Curves:** Reference coordinates for `maturityRefC1vsC2` and `maturityRefC2vsC3` are statically defined in `GasIsotopeDashboard.tsx` for scientific benchmarking.

---

## 25. Dependencies

*   **Frontend:** React (v18.2.0), Axios (v1.6.8), Plotly.js (v2.30.0), Tailwind (v3.4.1), TypeScript (v5.4.3).
*   **Backend:** FastAPI (v0.110.0), SQLAlchemy (v2.0.28), Psycopg2 (v2.9.9), Pandas (v2.2.1), Openpyxl (v3.1.2), ReportLab (v4.1.0).

---

## 26. Run / Build / Deployment

*   **Start Local Development:**
    *   *Backend:* `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`
    *   *Frontend:* `cd frontend && npm install && npm run dev`
*   **Orchestrate Containers (Production):**
    *   Build & Start: `docker compose up --build -d`
    *   Stop: `docker compose down`
    *   View Logs: `docker compose logs -f`
*   **Database Setup & Seeding:**
    *   Manual Initial Setup: `docker compose exec -T backend python scripts/db_setup.py`
    *   Execute Initial Seeding: `docker compose exec -T backend python -c "import app.db.init_db as init; from app.core.database import SessionLocal; init.init_db(SessionLocal())"`

---

## 27. Rules for Future AI / Developer Changes

1.  **Registry Preservation:** Always define new geochemical variables inside the Variable Registry database tables. Never bypass the mappings configurations.
2.  **Transposition Safety:** Transposition of CSIA or similar datasets must occur dynamically in `csv_processor.py` during ingestion, maintaining a flat-row relational database schema.
3.  **Write Interception:** Do not attempt direct writes on SQL views containing joins (e.g. `DL_ISOTOPE_GAS_VW`). Always resolve view targets to physical tables (e.g. `dl_isotope_gas`) before executing insertions.
4.  **No Duplicate Plot Engines:** Interactive Plotly configurations belong on the frontend. Do not build custom server-side graph renderers unless creating static exports.
5.  **Audit Logs:** Log LIMS uploads and administrative changes utilizing `crud_log` helpers.
6.  **Secrets Management:** Never hardcode passwords or private keys. Do not expose private keys in documentation.

---

## 28. Dependency Map

```
[React Router (App.tsx)]
         │
         ▼
[Protected Route Wrapper]
         │
         ▼
[Lab Dashboard (GasIsotopeDashboard.tsx)]
         │
         ▼ (React Query Hook)
[Axios API Client (api.ts)] ──► [FastAPI Router (router.py)]
                                        │
                                        ▼
                                [Endpoints Route (dashboard.py)]
                                        │
                                        ▼
                                [SQLAlchemy Session (deps.py)]
                                        │
                                        ▼
                                [PostgreSQL Database (Postgres)]
```

---

## 29. Change History

### 2026-08-21
- **Change:** Repaired blank scientific plot rendering on the Source Rock Cuttings dashboard. Tied coordinate data series mappings to dynamic colors toggles (wells/formations). Implemented automatic fallback to a single uniform trace (rendered as clean blue circles without a legend) when unique groups exceed 12 (such as 506 wells), while maintaining color-coded grouping when groups are small (such as 8 formations).
- **Files:** [Dashboard.tsx](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/src/pages/Dashboard.tsx), [DynamicPlotlyChart.tsx](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/src/components/charts/DynamicPlotlyChart.tsx).
- **Reason:** Resolve layout crashes and restore clean, standard geochemical plotting alignment matching the core dashboard aesthetics.
- **Validation:** Frontend production compilation and Docker container builds exited successfully (code 0).
- **Status:** Completed.

### 2026-08-20
- **Change:** Removed Pyright type checking configurations, Playwright automated testing dependencies (spec tests, browsers config, and browser docs), and redundant/historical backend python imports and database scripts.
- **Files:** `pyrightconfig.json` (deleted), `frontend/playwright.config.ts` (deleted), `frontend/tests/` (deleted), `docs/browser-verification.md` (deleted), `backend/reset_and_import_isotopes.py` (deleted), `backend/reset_and_import_biomarkers.py` (deleted), `database/add_hopane_vw.sql` (deleted), [package.json](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/package.json), [tsconfig.node.json](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/tsconfig.node.json), [README.md](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/README.md).
- **Reason:** Clean up development environment, prune devDependencies, and delete redundant/obsolete files to simplify the codebase for production deployment and presentation.
- **Validation:** Clean build on frontend and backend, verified workspace state using git status and npm install to prune package-lock.json.
- **Status:** Completed.

### 2026-08-16
- **Change:** Implemented a unified, scrollable horizontal HTML/CSS legend system for all Plotly charts. Removed native vertical/wrapped legends. Handled dashboard viewport bounds and conditional dataset trace exceptions. Completely deleted the "Completeness Report" (omission log) tab and views from all 8 laboratory dashboards to simplify layouts. Updated all project port mappings in configs and documentation (Nginx `8080`, React `3001`, FastAPI `8001`, Postgres `5433`, Metabase `3002`).
- **Files:** [CustomPlot.tsx](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/src/components/charts/CustomPlot.tsx), [DynamicPlotlyChart.tsx](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/src/components/charts/DynamicPlotlyChart.tsx), [README.md](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/README.md), [progress.md](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/progress.md), and dashboard files (`TricyclicDashboard.tsx`, `SteraneDashboard.tsx`, `PrPhDashboard.tsx`, `HopaneDashboard.tsx`, `AromaticDashboard.tsx`, `OilCompositionDashboard.tsx`, `GasChromatographyDashboard.tsx`, `GasIsotopeDashboard.tsx`).
- **Reason:** Standardize clean scrollable layout for growing legends, prevent dashboard crashes/table overlaps, and fulfill user requirements to remove completeness logs and update deployment ports.
- **Validation:** Production compilation and Docker Compose container builds completed successfully (exit code 0) and redeployed to host ports.
- **Status:** Completed.

### 2026-08-11
- **Change:** Implemented all five Biomarker Laboratory modules (Aromatic, Hopane, Sterane, Pristane/Phytane, Tricyclic Terpane) database schemas, double-header preprocessors, collision-proof synonym normalizations, and Plotly dashboards. Developed project-wide local browser verification via Playwright to bypass Azure CDN 404 outages.
- **Files:** [init_db.py](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/backend/app/db/init_db.py), [csv_processor.py](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/backend/app/services/csv_processor.py), [tsconfig.node.json](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/tsconfig.node.json), [playwright.config.ts](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/playwright.config.ts), [verify-dashboards.spec.ts](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/tests/verify-dashboards.spec.ts), [tsconfig.json](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/tests/tsconfig.json), [browser-verification.md](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/docs/browser-verification.md).
- **Reason:** Complete all outstanding Biomarker modules data ingestion and scientific plots, and establish reliable enterprise-grade test tooling.
- **Validation:** 18 records ingested successfully per dataset; Vite production bundle built in 40.85s; Playwright Chrome test suite completed in 1.3m capturing 9 authenticated screenshots with zero console errors.
- **Status:** Completed.

### 2026-08-08
- **Change:** Implemented Stable Isotope Laboratory variables, DDL database schemas, multi-sheet ingestion selectors, CSIA transposition engine, and all 11 scientific Plotly interpretation charts.
- **Files:** [init_db.py](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/backend/app/db/init_db.py), [csv_processor.py](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/backend/app/services/csv_processor.py), [GasIsotopeDashboard.tsx](file:///e:/GVMS(Graphical%20Visualization%20Management%20System)/frontend/src/pages/GasIsotopeDashboard.tsx).
- **Reason:** Add comprehensive isotope analysis capabilities matching reference Excel workbook specifications.
- **Validation:** Verified via successful production compilation and automated startup database migrations and data seeding.
- **Status:** Completed.

### Future Change Log

---

## 30. Unknown / Needs Verification

*   **Oracle Production Setup:** Oracle database connection parameters are defined, but Oracle-specific production tests were not validated locally (postgres provider used for development environments).
*   **Active Directory credentials:** SSO identity configurations are disabled and require coordination with corporate IT.

---

# Documentation Generation Status

Generated:
2026-08-16

Repository inspected:
YES

Frontend inspected:
YES

Backend inspected:
YES

Database inspected:
YES

Docker inspected:
YES

Nginx inspected:
YES

Metabase inspected:
YES

Laboratories inspected:
YES

Graphs inspected:
YES

Registry systems inspected:
YES

Secrets exposed:
NO

Files modified:
progress.md, README.md, frontend dashboard files, CustomPlot.tsx, DynamicPlotlyChart.tsx
