# GVMS Local Setup & Non-Docker Deployment Guide

This guide provides exact, verified configuration details and step-by-step instructions for running the **Graphical Visualization Management System (GVMS)** locally on bare-metal (Windows / Linux / macOS) without Docker, using direct **Uvicorn** for the FastAPI backend and **Vite dev server** for the React frontend.

---

## 1. BACKEND (Python / FastAPI)

### Software & Python Version
- **Python Version Required:** `Python 3.10` to `Python 3.13` (Tested and verified on Python `3.13.0` x64).
- **Package Manager:** `pip` (bundled with Python).

### Virtual Environment & Dependency Installation

#### Option A: Online Setup (With Internet Connection)
```bash
# Navigate to the backend directory
cd backend

# Create virtual environment named 'venv'
python -m venv venv

# Activate virtual environment
# Windows CMD:
call venv\Scripts\activate.bat
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install all dependencies
pip install -r requirements.txt
```

#### Option B: Offline Setup (Air-Gapped / Intranet Restricted Machine)
The repository includes pre-downloaded wheels in `backend/wheelhouse/`:
```cmd
# Windows CMD:
cd backend
python -m venv venv
call venv\Scripts\activate.bat
pip install --no-index --find-links=wheelhouse -r requirements.txt

# Or execute the automated installer script:
install_backend_offline.bat
```

### Exact Uvicorn Startup Command
From `start_backend.bat` and `start_backend.ps1`:
```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **Host:** `127.0.0.1` (localhost)
- **Port:** `8000`
- **Reload:** `--reload` enabled for hot reloading in development.

### Required Environment Variables (`.env` in Project Root)
The backend loads configuration from `.env` in the root directory via `pydantic-settings` in `backend/app/core/config.py`:

```ini
# Application Setup
PROJECT_NAME="GVMS — Graphical Visualization Management System"
ENVIRONMENT=development
SECRET_KEY=your_jwt_secret_key_minimum_32_characters_long
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
REFRESH_TOKEN_EXPIRE_DAYS=7

# Database Provider ("oracle", "postgres", or "sqlite")
DATABASE_PROVIDER=oracle

# 1. If DATABASE_PROVIDER=oracle (Active ONGC Regional Database)
ORACLE_USER=PRJDDN
ORACLE_PASSWORD=your_oracle_password
ORACLE_HOST=10.203.10.44
ORACLE_PORT=1521
ORACLE_SERVICE_NAME=EPIDDN

# 2. If DATABASE_PROVIDER=postgres (Local PostgreSQL)
POSTGRES_SERVER=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=ongc_lab
POSTGRES_USER=ongc_admin
POSTGRES_PASSWORD=your_postgres_password
DATABASE_URL=postgresql://ongc_admin:your_postgres_password@127.0.0.1:5432/ongc_lab

# 3. If DATABASE_PROVIDER=sqlite (Zero-Configuration Local Standalone)
DATABASE_URL=sqlite:///./gvms_local.db

# Initial Admin Credentials (Created automatically on startup if missing)
FIRST_SUPERUSER=admin@ongc.co.in
FIRST_SUPERUSER_PASSWORD=Admin@123456
FIRST_SUPERUSER_NAME="GVMS Chief Geochemist"

# Optional Metabase Integration
METABASE_URL=http://localhost:3001
METABASE_PUBLIC_URL=http://localhost/metabase
METABASE_EMBED_SECRET_KEY=23485ab9403816ca3de0927df8b461b3690d5fcd715456209be3cd1ef381da23
METABASE_DASHBOARD_ID=1
```

### Database Engines & Connection String Formats
The system supports three database backends resolved dynamically in `backend/app/core/database.py`:
1. **Oracle (Production/Regional):** `oracle+oracledb://{user}:{password}@{host}:{port}/?service_name={service_name}`
2. **PostgreSQL (Local Dev/Dedicated):** `postgresql://{user}:{password}@{host}:{port}/{dbname}`
3. **SQLite (Offline Standalone):** `sqlite:///./gvms_local.db`

### Database Initialization & Migrations
- **Automatic Lifecycle Initialization:** When the backend starts, the `lifespan()` hook in `backend/app/main.py` calls `init_db(db)` from `backend/app/db/init_db.py`. This automatically verifies connection, creates missing tables/views, registers dataset schema definitions, and seeds default user accounts.
- **Manual Metadata Registration (Optional):**
  ```bash
  python scripts/db_setup.py
  ```
- **Ingest Full Sample Datasets (Optional):**
  ```bash
  python scripts/import_full_data.py
  ```

---

## 2. FRONTEND (Vite / React)

### Software & Node.js Version
- **Node.js Version Required:** `Node.js v18.x` or `Node.js v20.x` (Tested with npm `v9.x` / `v10.x`).

### Installation & Development Commands
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies (from package.json)
npm install

# Start Vite Development Server
npm run dev
```

### Vite Configuration & Proxy Setup (`frontend/vite.config.ts`)
The Vite development server runs on port **3005** and automatically proxies API calls starting with `/api` to the FastAPI backend running on `http://127.0.0.1:8000`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3005,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3005,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
```

### Frontend Environment Variables
- In `frontend/src/utils/constants.ts`:
  ```typescript
  export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  ```
- **Local Dev Default:** No frontend `.env` file is necessary because `API_BASE_URL` defaults to `/api/v1`, which is forwarded by Vite's proxy directly to `http://127.0.0.1:8000/api/v1`.
- **Optional Direct Override (`frontend/.env`):**
  ```ini
  VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
  ```

---

## 3. METABASE (Local Standalone Usage)

- **Status in Non-Docker Local Setup:** Metabase is **optional**. The primary scientific visualization workflows (S2 vs TOC, Van Krevelen, Whiticar/Schoell gas isotope, cross-dataset plots) run natively in the browser via **Plotly.js** and do not require Metabase.
- **If Running Standalone Metabase:**
  - Requires **Java JDK/JRE 11 or 21**.
  - Download `metabase.jar` (v0.49.3) into the project's `metabase/` folder.
  - Launch from command prompt:
    ```cmd
    set MB_DB_TYPE=postgres
    set MB_DB_DBNAME=metabase_metadata
    set MB_DB_PORT=5432
    set MB_DB_USER=ongc_admin
    set MB_DB_PASS=your_password
    set MB_DB_HOST=127.0.0.1
    set MB_JETTY_PORT=3001
    java -jar metabase.jar
    ```
  - Metabase will be accessible at `http://localhost:3001`.

---

## 4. FULL STARTUP SEQUENCE (Getting Started)

Follow these exact steps from a fresh clone to a running local instance:

### Step 1: Clone and Configure Environment
```bash
git clone <repository_url>
cd "GVMS(Graphical Visualization Management System)"

# Create .env from template
cp .env.example .env
# Edit .env with your database credentials (Oracle / Postgres / SQLite)
```

### Step 2: Initialize & Start Backend API Server
```bash
# Open Terminal 1
cd backend
python -m venv venv

# Windows:
call venv\Scripts\activate.bat
# Linux / macOS:
source venv/bin/activate

pip install -r requirements.txt

# Start backend on 127.0.0.1:8000
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
*(Alternative shortcut on Windows: Double-click `start_backend.bat` or run `powershell -ExecutionPolicy Bypass -File .\start_backend.ps1`)*

### Step 3: Initialize & Start Frontend Dev Server
```bash
# Open Terminal 2
cd frontend
npm install

# Start Vite dev server on 127.0.0.1:3005
npm run dev
```
*(Alternative shortcut on Windows: Double-click `start_frontend.bat` or run `powershell -ExecutionPolicy Bypass -File .\start_frontend.ps1`)*

### Step 4: Access Application
1. Open your browser and navigate to: **`http://localhost:3005`**
2. Backend API Documentation (Swagger UI) is available at: **`http://127.0.0.1:8000/docs`**

---

## 5. DEFAULT LOGIN CREDENTIALS

These credentials are automatically seeded upon first database startup by `backend/app/db/init_db.py`:

| Role | Email | Password | Full Name | Permissions |
|---|---|---|---|---|
| **Administrator** | `admin@ongc.co.in` | `Admin@123456` | GVMS Chief Geochemist | Full system access, user management, dataset registration, audit logs, backup/restore |
| **Researcher** | `researcher@ongc.co.in` | `Researcher@123` | Senior Geochemist | File ingestion (CSV/Excel), interactive chart builders, report generation, scientific plots |
| **Viewer** | `viewer@ongc.co.in` | `Viewer@123` | Lab Analyst Viewer | Read-only access to datasets, predefined charts, and report downloads |
