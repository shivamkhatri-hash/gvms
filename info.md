# GVMS — Project Presentation & Architecture Guide

Welcome to the **Graphical Visualization Management System (GVMS)** documentation hub. This guide provides a detailed overview of the project's purpose, scientific capabilities, software architecture, file structure, and technical flows to help you present this system confidently to stakeholders.

---

## 1. Executive Summary

**GVMS** is an enterprise-grade Laboratory Information Management System (LIMS) and data visualization portal engineered for petroleum geochemistry laboratories. It was designed to support geochemists at **Oil & Natural Gas Corporation (ONGC)** in analyzing, correlating, and interpreting geological/subsurface geochemical datasets.

### The Problem it Solves:
1. **Fragmented Data**: Geochemical data historically resides in disparate, inconsistent Excel spreadsheets across various labs (Source Rock, Oil, Biomarkers, Gas Isotopes).
2. **Manual Ingestion**: Parsing laboratory outputs is labor-intensive and prone to column/unit name variations.
3. **Complex Plotting**: Creating specialized geochemistry diagrams (e.g., Bernard genetic gas plots, Sofer isotope plots, kerogen classification zones) is traditionally done manually in third-party software.
4. **Security & Governance**: Geological data is highly confidential. Access controls (RBAC) and audit trails are mandatory.

### The GVMS Solution:
* A **Dynamic Ingestion Engine** that automatically detects, parses, maps, and normalizes Excel/CSV spreadsheets using database-driven synonym registries.
* A suite of **8 Specialized Lab Dashboards** featuring interactive, publication-quality **Plotly** charts (subsurface depth profiles, crossplots with classification zones, ratio grids).
* **Enterprise Security** (JWT + bcrypt + RBAC) protecting all endpoints and analytical routes.
* **Metabase BI Integration** via cryptographically signed JWT embedding for custom, ad-hoc business intelligence reports.
* **Automated Scientific Classifications** based on recognized geochemical literature (e.g., Peters & Cassa kerogen evaluation).

---

## 2. System Architecture

The application is deployed as a microservices stack orchestrated via **Docker Compose**:

```
                                  +---------------------------------------+
                                  |         Nginx Reverse Proxy           |
                                  |              (Port 8080)              |
                                  +-------------------+-------------------+
                                                      |
                          +---------------------------+---------------------------+
                          |                                                       |
                          v                                                       v
        +-----------------------------------+                   +-----------------------------------+
        |          React Frontend           |                   |          FastAPI Backend          |
        |            (Port 3001)            |                   |            (Port 8001)            |
        |-----------------------------------|                   |-----------------------------------|
        | UI Components, Plotly.js charts,   |                   | SQLAlchemy ORM, Pandas Parser,    |
        | Axios client, TanStack Query.     |                   | ReportLab PDF, Formula Engine.    |
        +-----------------------------------+                   +-----------------------------------+
                                                                                  |
                                              +-----------------------------------+-------------------+
                                              |                                                       |
                                              v                                                       v
                            +-----------------------------------+                   +-----------------------------------+
                            |        Metabase BI Engine         |                   |        PostgreSQL Database        |
                            |            (Port 3002)            |                   |            (Port 5433)            |
                            |-----------------------------------|                   |-----------------------------------|
                            | Signed JWT embeds, ad-hoc tables, |                   | DB name: `ongc_lab`               |
                            | pre-filtered dashboards.          |                   | Holds tables, views, audit logs.  |
                            +-----------------------------------+                   +-----------------------------------+
```

### Key Architectural Layers:
1. **Nginx (Reverse Proxy)**: Acts as the single entry point (`port 8080`). It routes client requests to the React frontend or FastAPI backend, handles URL routing, and serves as an additional layer of security.
2. **React Frontend (`port 3001`)**: A lightweight Single Page Application (SPA) built using React 18, Vite, TypeScript, and TailwindCSS. It utilizes `Plotly.js` to render highly interactive charts with client-side zoom, pan, hover, and filter features.
3. **FastAPI Backend (`port 8001`)**: High-performance Python backend. Handles authentication, Excel/CSV ingestion pipelines via **Pandas**, geochemical formula calculations, and PDF/Excel exports.
4. **PostgreSQL Database (`port 5433`)**: The unified transactional store. It maintains core tables (e.g., `W_BOREHOLE`, `DL_SOURCE_ROCK`), intermediate alias views, audit logs, and the dynamic synonym registry mappings.
5. **Metabase BI (`port 3002`)**: Handles secure embedding. The backend generates a signed JSON Web Token (JWT) containing the Metabase dashboard ID and filters, which the frontend loads securely via an iframe.

---

## 3. Core Laboratories & Scientific Capabilities

GVMS supports four major laboratory disciplines, each with dedicated dashboards:

### A. Source Rock Laboratory
* **Scientific Basis**: Peters & Cassa (1994) guidelines for evaluating organic richness, kerogen type, and thermal maturity.
* **Calculations**: Automatically computes Hydrogen Index (HI = $S_2 \times 100 / \text{TOC}$), Oxygen Index (OI = $S_3 \times 100 / \text{TOC}$), and Production Index (PI = $S_1 / (S_1 + S_2)$).
* **Charts**:
  * **TOC vs S2 Scatter Plot**: Classifies kerogen quality (Poor, Fair, Good, Very Good, Excellent) using dynamic shaded overlays.
  * **Depth Profiles**: Interactive plots detailing parameters like TOC, $S_2$, $T_{\text{max}}$, and HI relative to well depth.

### B. Oil Geochemistry Laboratory
* **Scientific Basis**: Gas Chromatography (GC) fingerprints and biomarker fingerprints.
* **Charts**:
  * **Pristane/nC17 vs Phytane/nC18 Crossplot**: Classifies organic matter source (marine vs terrestrial) and depositional redox environments (reducing vs oxidizing).
  * **Gas Chromatography Dashboard**: Depth logs tracking Pristane/Phytane ($Pr/Ph$) ratios, $Pr/nC_{17}$, and $Ph/nC_{18}$.

### C. Stable Isotope Laboratory
* **Scientific Basis**: Reconstructing gas genetics (biogenic vs thermogenic origin, gas cracking, and alteration) using carbon isotopes ($\delta^{13}C$).
* **Charts**:
  * **Modified Bernard Diagram**: Plots $\delta^{13}C_{\text{methane}}$ vs dryness ratio ($C_1/(C_2+C_3)$) to detect microbial vs thermogenic gas origins.
  * **Isotopic Maturity Plot**: Plots $\delta^{13}C_{\text{ethane}}$ vs $\delta^{13}C_{\text{methane, propane}}$ to evaluate gas source maturity ($R_o\%$).
  * **Isotopic Secondary Cracking Plot**: Uses isotopic differences ($\delta^{13}C_2 - \delta^{13}C_3$) against gas dryness to identify oil cracking thresholds.

### D. Biomarker Laboratory
* **Scientific Basis**: Sterane, Hopane, Terpane, and Aromatic biomarker compound ratios to deduce thermal maturity and depositional lithologies.
* **Dashboards**:
  * **Hopane Biomarkers**: Renders hopane ratios ($C_{29}H/C_{30}H$, $Ts/Tm$) and homohopane index.
  * **Sterane Biomarkers**: Renders sterane configurations ($C_{27}$, $C_{28}$, $C_{29}$ Diasteranes/Regular Steranes).
  * **Tricyclic Terpane**: Specialized distribution plots comparing tricyclic and tetracyclic terpanes.
  * **Aromatic Biomarkers**: Renders maturity indicators like Methylphenanthrene Index (MPI-1).
  * **Pristane/Phytane Biomarkers**: High-resolution distribution grids.

---

## 4. Technical File & Folder Map

### Backend Directory Layout (`/backend/`)
* [backend/app/main.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/main.py) — Application entry point. Configures CORS, initializes middleware, and handles application lifespan hooks (startup/shutdown).
* **`/backend/app/api/`** — Routing and Authentication Dependencies:
  * [deps.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/api/deps.py) — OAuth2 authentication schemas, current user verification, and role-based permissions (`has_role`).
  * [v1/router.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/api/v1/router.py) — Central router registering endpoint groups.
  * **`v1/endpoints/`**:
    * [auth.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/api/v1/endpoints/auth.py) — User login, registration, and refresh-token cycles.
    * [upload.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/api/v1/endpoints/upload.py) — Ingestion triggers, file parsing status check.
    * [dashboard.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/api/v1/endpoints/dashboard.py) — Specialized query endpoints returning calculated aggregates for Plotly charts.
    * [registry.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/api/v1/endpoints/registry.py) — CRUD operations to configure variables, datasets, and column synonyms.
* **`/backend/app/services/`** — Core Business Logic:
  * [csv_processor.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/services/csv_processor.py) — **Ingestion Engine**. Reads CSV/Excel sheets, resolves synonyms from the DB registry, applies geochemical formula validations, and saves raw data into the corresponding lab tables.
  * [geochemistry_engine.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/services/geochemistry_engine.py) — Peters & Cassa classification engine (TOC, S2, HI boundaries).
  * [formula_engine.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/services/formula_engine.py) — Specialized math calculators for ratio indices.
  * [metabase_service.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/services/metabase_service.py) — Signs JWT authentication objects to allow secure Metabase iframe embedding.
  * [report_generator.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/services/report_generator.py) — Compiles custom styled PDF reports, multi-tab Excel workbooks, and CSV extracts.
* **`/backend/app/db/`** — Database Initializations:
  * [init_db.py](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend/app/db/init_db.py) — Drops/recreates active views, seeds sample wells (boreholes), setups security roles (`ROLE_LOAD`, `ROLE_VIEW`), and populates the default variable registry.

### Frontend Directory Layout (`/frontend/`)
* **`/frontend/src/components/`** — UI & Reusable Components:
  * **`charts/`**:
    * [CustomPlot.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/components/charts/CustomPlot.tsx) — Wrapper around React-Plotly providing scrollable legends, localized UI settings, and layout boundaries.
    * [DynamicPlotlyChart.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/components/charts/DynamicPlotlyChart.tsx) — Generates customized graphs based on the configurations retrieved from `graph_config.py`.
  * **`layout/`** — Main dashboard header, sidebar menus, and logo brand elements.
* **`/frontend/src/pages/`** — Dashboard Page Modules:
  * [Dashboard.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/Dashboard.tsx) — Source Rock Dashboard.
  * [GasChromatographyDashboard.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/GasChromatographyDashboard.tsx) — Oil GC Dashboard.
  * [GasIsotopeDashboard.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/GasIsotopeDashboard.tsx) — Gas Genetics and Secondary Cracking Dashboards.
  * [HopaneDashboard.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/HopaneDashboard.tsx) — Hopane Biomarker Dashboard.
  * [SteraneDashboard.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/SteraneDashboard.tsx) — Sterane Biomarker Dashboard.
  * [TricyclicDashboard.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/TricyclicDashboard.tsx) — Tricyclic Terpane Dashboard.
  * [AromaticDashboard.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/AromaticDashboard.tsx) — Aromatic Biomarker Dashboard.
  * [PrPhDashboard.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/PrPhDashboard.tsx) — Pristane / Phytane Biomarker Dashboard.
  * [Upload.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/Upload.tsx) — Ingestion page supporting drag-and-drop file upload, sheet selection, and real-time validation feedback.
  * [DatasetRegistry.tsx](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend/src/pages/DatasetRegistry.tsx) — Admin settings page to map new synonyms, column headers, and customize geochemical variables.

---

## 5. Key Presentation Flows

Use these walkthroughs to explain how data and actions move through the system:

### Ingestion Pipeline Flow
```
[User uploads Excel file]
           │
           ▼
[FastAPI receives file in /upload endpoint]
           │
           ▼
[csv_processor.py parses columns]
           │
           ▼
[Resolves headers against dynamic Synonyms Registry in PostgreSQL]
           │
           ▼
[Calculates calculated columns using formula_engine.py]
           │
           ▼
[Validates constraints (e.g., depth, format)]
           │
           ▼
[Inserts cleaned rows to DB and registers upload version]
```

### Metabase Signed Embedded Flow
```
[User visits BI Analytics Page]
           │
           ▼
[Frontend requests JWT from backend API: /metabase/embed-token]
           │
           ▼
[Backend retrieves Metabase Embed Key from environment variables]
           │
           ▼
[Signs payload containing: Dashboard ID, Filters, Expiration]
           │
           ▼
[Returns cryptographically signed token]
           │
           ▼
[Frontend embeds iframe pointing to Nginx proxy -> Metabase embed URL]
```

---

## 6. Common Presentation Q&A

**Q: How does the system handle different column names in Excel uploads?**
* **A:** GVMS features a database-driven **Synonyms Registry**. If a lab researcher uploads a file with `Depth (m)` instead of `DEPTH_TOP`, the system maps the name using the registered synonyms. Admins can add new synonyms dynamically in the **Dataset Registry** settings page without writing code.

**Q: How are classification boundary zones rendered on the plots?**
* **A:** Plotly's `shapes` layout array is utilized. We overlay custom rectangles and polygons with transparent fills (e.g. green for "Excellent", red for "Poor") corresponding to standard values defined in scientific literature, keeping the scatter plots interactive.

**Q: What roles are supported out of the box?**
* **A:** Three roles: 
  * `Admin`: Can register new column synonyms, add variables, and view system audits.
  * `Researcher`: Can upload datasets, customize plots, and export PDF/Excel reports.
  * `Viewer`: Can view dashboards and interact with the plots but cannot upload data.
