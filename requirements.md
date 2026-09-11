# GVMS Offline Manual Deployment — Software and Library Requirements

Since the destination business computer has restricted internet access and cannot use Docker, all required engines, Python packages, and Node.js libraries must be downloaded on an internet-enabled development PC and transferred via a USB drive.

This document catalogs every single package, library, and system dependency required to run the portal natively on Windows.

---

## 💻 1. Core System Runtimes (Software Engines)

These installers must be downloaded on your development PC and copied to your USB drive:

| Software | Version | Purpose | Download Link |
| :--- | :--- | :--- | :--- |
| **Python** | `v3.13.x` | Backend runtime engine | [Windows Installer (x64)](https://www.python.org/ftp/python/3.13.7/python-3.13.7-amd64.exe) |
| **Node.js** | `v20.11.x` (LTS) | Frontend package manager/builder | [Windows Installer (x64)](https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi) |
| **Java JDK** | `v21.x` (LTS) | Metabase runtime environment | [Eclipse Temurin v21 Installer](https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_windows_hotspot_21.0.2_13.msi) |
| **Nginx** | `v1.26.1` (Stable) | Web server and secure reverse proxy | [Nginx for Windows Zip](https://nginx.org/download/nginx-1.26.1.zip) |
| **Metabase** | `v0.49.3` | Standalone analytics dashboard | [Metabase JAR Package](https://downloads.metabase.com/v0.49.3/metabase.jar) |
| **PostgreSQL** | `v16.x` or `v17.x` | Database engine (if not pre-existing) | [PostgreSQL Windows Installer](https://sbp.enterprisedb.com/getinstaller.php?fileid=12590) |

---

## 🐍 2. Python Backend Libraries (FastAPI)

These packages are installed in the Python virtual environment (`venv`). You do not need to download them one-by-one; they are defined in `backend/requirements.txt`.

### Package Catalog:
*   `fastapi` (v0.110.0+) — Core API web framework.
*   `uvicorn[standard]` (v0.28.0+) — ASGI server to run the FastAPI app.
*   `sqlalchemy` (v2.0.28+) — Database ORM (Object-Relational Mapping).
*   `psycopg2-binary` (v2.9.9+) — PostgreSQL database adapter.
*   `alembic` (v1.13.1+) — Database migrations manager.
*   `pydantic` (v2.6.4+) — Data validation and settings models.
*   `pydantic-settings` (v2.2.1+) — Environment variable parsing.
*   `python-jose[cryptography]` (v3.3.0+) — JWT auth token validation.
*   `types-python-jose` — Typing support for JWT operations.
*   `passlib[bcrypt]` (v1.7.4+) — Hashing utility for user passwords.
*   `python-multipart` (v0.0.9+) — Form data parsing for file uploads.
*   `pandas` (v2.2.1+) — CSV data ingestion, parsing, and dataframe building.
*   `openpyxl` (v3.1.2+) — Excel spreadsheet reading.
*   `reportlab` (v4.1.0+) — PDF export engine for lab analytics.
*   `requests` (v2.31.0+) — HTTP library used in Metabase API provisioning.
*   `python-dateutil` (v2.9.0+) — Date/time parser helpers.
*   `email-validator` (v2.0.0+) — Email string verification.
*   `bcrypt` (v4.0.1) — Cryptographic dependency for security.
*   `oracledb` (v2.0.0+) — Oracle database support (optional fallback).
*   `plotly` (v5.18.0+) — Analytical plot configuration structures.
*   `matplotlib` (v3.8.0+) — Secondary graphing rendering backend.

### How to Download & Install Offline:
1.  **On Development PC (with internet)**: In the `backend` folder, download all library package files (`.whl`) to a folder named `wheelhouse`:
    ```cmd
    pip download -r requirements.txt -d wheelhouse
    ```
2.  **Transfer**: Copy the `wheelhouse` directory to the target machine via USB (place it in `backend\`).
3.  **On Target PC (offline)**: In the target machine's virtual environment, run:
    ```cmd
    pip install --no-index --find-links=wheelhouse -r requirements.txt
    ```

---

## 🟢 3. Node.js Frontend Libraries (React/Vite)

These libraries compile your UI. They are defined in `frontend/package.json`.

### Production Dependencies (`dependencies`):
*   `react` (v18.2.0) — Frontend UI library.
*   `react-dom` (v18.2.0) — DOM rendering engine for React.
*   `react-router-dom` (v6.22.3) — Portal client-side page routing.
*   `react-hook-form` (v7.51.1) — Safe validation form handling.
*   `axios` (v1.6.8) — HTTP client to request API backend records.
*   `@tanstack/react-query` (v5.28.9) — State caching and API requests hooks.
*   `plotly.js-dist-min` (v2.30.0) — Interactive analytical plotting charts.
*   `react-plotly.js` (v2.6.0) — Plotly components wrapper for React.
*   `lucide-react` (v0.359.0) — Premium dashboard vector icons.
*   `clsx` (v2.1.0) & `tailwind-merge` (v2.2.2) — Dynamic layout styling utilities.

### Development Dependencies (`devDependencies`):
*   `typescript` (v5.4.3) — Static type safety compiler.
*   `vite` (v5.1.6) — Ultra-fast React application compiler.
*   `@vitejs/plugin-react` (v4.2.1) — Fast refresh integration for React.
*   `tailwindcss` (v3.4.1), `postcss` (v8.4.38), `autoprefixer` (v10.4.19) — Styling system compilers.
*   `@types/*` (node, react, react-dom, plotly) — TypeScript syntax auto-completion mappings.

### How to Download & Install Offline:
1.  **On Development PC (with internet)**: In the `frontend` folder, run:
    ```cmd
    npm install
    ```
    This downloads all libraries into a folder named `node_modules`.
2.  **Transfer**: Zip/Compress the `node_modules` folder (e.g., `node_modules.zip`) and copy it to your USB drive.
3.  **On Target PC (offline)**: Extract `node_modules.zip` directly inside your `frontend` directory, then run the compilation script:
    ```cmd
    npm run build
    ```
