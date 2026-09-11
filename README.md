# GVMS — Graphical Visualization Management System

An enterprise-grade Graphical Visualization Management System (GVMS) engineered for petroleum geochemistry laboratories. Designed for **Oil & Natural Gas Corporation (ONGC)**, this application consumes authoritative laboratory datasets, provides Role-Based Access Control (RBAC), integrates private Metabase BI embed layouts, and renders interactive scientific Plotly depth profiles and crossplots.

---

## 🌟 Key Features

1. **Scientific Visualizations & Interactive Dashboards**:
   - Interactive subsurface **Depth Profiles** with inverted Y-axis.
   - **TOC vs S2 Kerogen Scatter Plots** with color-coded classification zones.
   - **Pearson Geochemical Correlation Heatmap Matrix**.
   - Database-connected **Tricyclic Terpane Ratio Plot** ($C_{19}TT/(C_{19}TT+C_{23}TT)$ vs $C_{24}TeT/(C_{24}TeT+C_{23}TT)$) inside the Oil Composition Dashboard.
   - **Pristane/nC17 vs Phytane/nC18 Crossplot** classifying depositional environments (marine, terrestrial, mixed) on the Gas Chromatography Dashboard.
   - **Modified Bernard Diagram** ($\delta^{13}C_1$ vs $C_1/(C_2+C_3)$) classifying gas genetic origin (bacterial vs thermogenic) with custom boundary zones, mixing curves, and migration/oxidation annotation overlays.
   - **Isotopic Maturity Plot** ($\delta^{13}C_{\text{ethane}}$ vs $\delta^{13}C_{\text{methane, propane}}$) with theoretical C1/C2 and C2/C3 maturity reference curves from $0.6\%$ to $3.0\%$ $R_o$.
   - **Isotopic Secondary Cracking Diagram** ($C_2/C_3$ vs $\delta^{13}C_2 - \delta^{13}C_3$) mapping primary cracking, secondary NSO cracking, liquid hydrocarbon cracking, and gas secondary cracking zones with background diagonal hatches.
2. **Automated Geological Classification**:
   - Classifies Total Organic Carbon (**TOC wt%**): Poor (<0.5), Fair (0.5-1.0), Good (1.0-2.0), Very Good (2.0-4.0), Excellent (>4.0).
   - Classifies Pyrolysis Hydrocarbon Yield (**S2 mg/g**): Poor (<2.5), Fair (2.5-5.0), Good (5.0-10.0), Very Good (10.0-20.0), Excellent (>20.0).
3. **Metabase BI Platform Integration**:
   - Renders private Metabase analytical dashboards dynamically inside secure, JWT-signed iframe frames.
4. **Technical Reports Export**:
   - Download executive PDF reports, styled multi-tab Excel workbooks, and CSV files filtered by active global criteria.
5. **Biomarker Laboratory Support**:
   - **Hopane Biomarkers**: Configured with dynamic double-header ingestion synonym resolvers, active database schemas, and interactive Plotly distributions.
   - **Sterane Biomarkers**: Structured with automated layout transpositions, metadata registries, and ratio distribution plots.
   - **Tricyclic Terpane**: Implemented specialized well depth profile plots and custom percentage distribution grids.
   - **Aromatic Biomarkers**: Configured with dynamic well filtering, source rock maturity crossplots, and DB view registries.
   - **Pristane / Phytane**: Custom ratio calculation algorithms, automated ingest routing, and cross-comparison plots.
6. **Enterprise Authentication & RBAC**:
   - JWT authentication with Access and Refresh tokens.
   - Password hashing using `bcrypt`.
   - Role-Based Access Control: `Admin` (Full System + Audits), `Researcher` (Read + Interactive Builders), `Viewer` (Read-only Visualization).

7. **Deletions & Layout Simplifications**:
   - **Completeness Report (Omission Log)**: The "Completeness Report" tabs and table views have been fully deleted and removed from all 8 active laboratory dashboards to clean up the user interfaces and focus exclusively on interactive scientific plotting.

---

## 🏗️ Architecture & Technology Stack

```
+-------------------------------------------------------------------------------+
|                             Nginx Reverse Proxy (:8080)                       |
+-------------------+---------------------------+-------------------------------+
                    |                           |
                    v                           v
+-------------------+-------+       +-----------+-------------------+
| React 18 Frontend (:3001) |       | FastAPI Python Backend (:8001)|
| TailwindCSS + Plotly.js   |       | SQLAlchemy 2.0 + Pandas       |
+---------------------------+       +-----------+-------------------+
                                                |
                                                v
                                    +-----------+-------------------+
                                    | Private Metabase BI (:3002)   |
                                    | (Signed JWT Dashboard Embed)  |
                                    +-------------------------------+
                                                |
                                                v
                                    +-----------+-------------------+
                                    | PostgreSQL Database (:5433)   |
                                    | DB: ongc_lab                  |
                                    +-------------------------------+
```

### **Backend**
- Framework: **FastAPI (Python 3.11)**
- Database ORM: **SQLAlchemy 2.0**
- Data Ingestion: **Pandas & OpenPyXL** (Dynamic column headers mapping engine)
- PDF Generation: **ReportLab**
- Security: **JWT (jose) + bcrypt (passlib)**

### **Frontend**
- Framework: **React 18 with Vite & TypeScript**
- Styling: **TailwindCSS v3 (ONGC Enterprise Theme)**
- State Management: **TanStack React Query v5**
- Scientific Charts: **Plotly.js (`react-plotly.js`)**

### **Database & Infrastructure**
- Database: **PostgreSQL 16** (`ongc_lab`)
- Business Intelligence: **Metabase** (Strictly private instance)
- Reverse Proxy: **Nginx** (Blocks setup, auth, and user administration paths)
- Containerization: **Docker & Docker Compose**

---

## 🚀 Port Mappings & Access Points

| Service | Port | Local URL | Public IP Proxy |
| :--- | :--- | :--- | :--- |
| **Nginx Single Entry Point** | `8080` | `http://localhost:8080/` | `http://SERVER_IP:8080` |
| **React Frontend** | `3001` | `http://localhost:3001/` | `http://SERVER_IP:3001/` |
| **FastAPI Backend API** | `8001` | `http://localhost:8001/` | `http://SERVER_IP:8001/api` |
| **FastAPI Swagger OpenAPI Docs** | `8001` | `http://localhost:8001/docs` | `http://SERVER_IP:8001/docs` |
| **Metabase (Private)** | `3002` | `http://localhost:3002/` | Private Container Network |
| **PostgreSQL Database** | `5433` | `localhost:5433` | Internal Bridge Network |

---

## 🔑 Default Initial Accounts

| Account | Email | Password | Role Permissions |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@ongc.co.in` | `Admin@123456` | Full Access + User Mgmt + Logs |
| **Senior Geochemist** | `researcher@ongc.co.in` | `Researcher@123` | Read + Interactive Dashboard Builders |
| **Lab Analyst** | `viewer@ongc.co.in` | `Viewer@123` | Read-only Dashboards & Reports |

---

## ⚡ Deployment Guide (Ubuntu VPS / Docker Compose)

### 1. Clone Repository
```bash
git clone https://github.com/ongc/gvms.git
cd gvms
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Launch Container Stack
```bash
docker compose up --build -d
```

### 4. Seed Initial Petroleum Geochemistry Dataset
```bash
python scripts/seed_data.py
```

### 5. Access Application
Open your web browser and navigate to:
- App Portal: `http://SERVER_IP`
- Secure Metabase Embed: Integrated seamlessly inside dashboard views.
- API Documentation: `http://SERVER_IP/docs`

---

## 🛠️ Troubleshooting

- **PostgreSQL Connection Issue**: Verify Docker container health (`docker ps`). PostgreSQL healthcheck executes `pg_isready` before launching FastAPI.
- **Metabase Initial Setup**: Run `python metabase/setup_metabase.py` to re-initialize Metabase database connections via REST API.
