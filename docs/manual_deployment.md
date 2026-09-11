# GVMS Bare-Metal / Manual Deployment Guide

This guide provides step-by-step instructions to fully deploy the **Graphical Visualization Management System (GVMS)** onto a new server or system *without* using Docker. 

---

## 🏗️ Architecture & Component Overview

GVMS consists of 5 core services that must be installed and configured individually:

| Component | Port | Software Required | Path | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Nginx Proxy** | `80` / `443` | Nginx Web Server | [`nginx/`](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/nginx) | Routes incoming traffic to frontend assets, FastAPI, and Metabase. |
| **Frontend UI** | Static | Node.js 18+ (React / Vite) | [`frontend/`](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/frontend) | Compiled HTML, CSS, and JS files served directly by Nginx. |
| **Backend API** | `8000` | Python 3.10+ (FastAPI) | [`backend/`](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/backend) | Handles computations, business logic, auth, and database operations. |
| **Metabase BI** | `3001` | Java JRE 11+ (Metabase JAR) | [`metabase/`](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/metabase) | Provisions SQL dashboards and signed iframe analytics. |
| **Database** | `5432` | PostgreSQL 16 | [`database/`](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/database) | System schemas and raw geochemistry tables. |

---

## 🛠️ Prerequisites

Before you begin, install the following tools natively on your target server:

*   **Python 3.10 or 3.11** (Ensure `pip` and `python3-venv` are installed).
*   **Node.js (v18 or v20)** and `npm`.
*   **Java Runtime Environment (JRE) 11 or 17** (Verify by running `java -version`).
*   **PostgreSQL 16** (Ensure PostgreSQL client utilities are available).
*   **Nginx Web Server**.

---

## 🚀 Deployment Steps

### Step 1: Environment Setup (`.env`)

In the root directory of your workspace, copy `.env.example` to a new file named `.env`:

```bash
cp .env.example .env
```

Open `.env` and update the settings for a local, non-Docker execution environment:

```ini
# General Setup
PROJECT_NAME="GVMS — Graphical Visualization Management System"
ENVIRONMENT=production
SECRET_KEY=ongc_lab_super_secret_jwt_key_32bytes_min_length_2026 # Change this!
ALGORITHM=HS256

# Database (Replace 'postgres' with '127.0.0.1')
POSTGRES_SERVER=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=ongc_lab
POSTGRES_USER=ongc_admin
POSTGRES_PASSWORD=ONGC_Lab_Secure_Pass2026!
DATABASE_URL=postgresql://ongc_admin:ONGC_Lab_Secure_Pass2026!@127.0.0.1:5432/ongc_lab

# Metabase Config
MB_DB_TYPE=postgres
MB_DB_DBNAME=metabase_metadata
MB_DB_PORT=5432
MB_DB_USER=ongc_admin
MB_DB_PASS=ONGC_Lab_Secure_Pass2026!
MB_DB_HOST=127.0.0.1
METABASE_URL=http://localhost:3001
METABASE_PUBLIC_URL=http://localhost/metabase
METABASE_EMBED_SECRET_KEY=23485ab9403816ca3de0927df8b461b3690d5fcd715456209be3cd1ef381da23
METABASE_DASHBOARD_ID=2

# Initial Admin
FIRST_SUPERUSER=admin@ongc.co.in
FIRST_SUPERUSER_PASSWORD=Admin@123456
```

### Step 2: Database Initialization

You can use a local database instance or connect to a completely different, external, or pre-existing database server on your target system. 

#### Option A: Initialize a New Database
1. Connect to your PostgreSQL server using the administration terminal (`psql` or pgAdmin) and create a user and the databases:
   ```sql
   CREATE USER your_user WITH PASSWORD 'your_password';
   CREATE DATABASE your_db OWNER your_user;
   CREATE DATABASE metabase_metadata OWNER your_user;
   ```
2. Make sure you update the variables in your `.env` file to match this configuration:
   ```ini
   POSTGRES_SERVER=127.0.0.1       # Or remote host IP
   POSTGRES_PORT=5432              # Your target database port
   POSTGRES_DB=your_db             # Database name
   POSTGRES_USER=your_user         # Database user
   POSTGRES_PASSWORD=your_password # Database password
   DATABASE_URL=postgresql://your_user:your_password@127.0.0.1:5432/your_db
   ```

#### Option B: Target an Existing / Different Remote Database
If the database is already running on a remote system:
1. Update `.env` with the remote host IP address, port, database name, and credentials:
   ```ini
   POSTGRES_SERVER=192.168.1.100   # Remote server IP
   POSTGRES_PORT=5432
   POSTGRES_DB=custom_ongc_db      # Custom DB name
   POSTGRES_USER=custom_user
   POSTGRES_PASSWORD=secure_pass!
   DATABASE_URL=postgresql://custom_user:secure_pass!@192.168.1.100:5432/custom_ongc_db
   ```
2. Ensure network access (firewalls, pg_hba.conf) allows incoming TCP traffic to the PostgreSQL port from the target system.

---

### Step 2.5: Create the Required Table Schema

Regardless of where the database is hosted or what it is named, the tables must be constructed identically to map to the GVMS backend services. 

To create the tables:
*   Connect to the target database and run the schema setup script [`database/init.sql`](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/database/init.sql):
    ```bash
    # Run from the project root directory
    psql -h <POSTGRES_SERVER> -p <POSTGRES_PORT> -U <POSTGRES_USER> -d <POSTGRES_DB> -f database/init.sql
    ```
    *(For example: `psql -h 127.0.0.1 -p 5432 -U ongc_admin -d ongc_lab -f database/init.sql`)*

---

### Step 3: Backend API Setup

1. Open your terminal, enter the `backend` directory, and initialize a Python virtual environment:
   ```bash
   cd backend
   python -m venv venv
   ```
2. Activate the virtual environment:
   * **Windows (PowerShell)**: `venv\Scripts\activate`
   * **Linux/macOS**: `source venv/bin/activate`
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI backend server using Uvicorn:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

---

### Step 4: Compile Frontend Assets

Instead of running Node.js in development mode, compile the React site to static files. Nginx will serve these files directly, which is more secure and performant.

1. Navigate to the `frontend` folder:
   ```bash
   cd ../frontend
   ```
2. Install npm dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. This creates a folder called `frontend/dist/` containing the index pages, CSS, and JS bundles.

---

### Step 5: Configure and Run Metabase BI

Metabase runs natively on Java JRE. 

1. Download the standalone Metabase `.jar` package to your server:
   ```bash
   wget https://downloads.metabase.com/v0.49.3/metabase.jar
   ```
2. Setup database and port variables to run Metabase on port `3001` and connect it to your database instance:
   * **Windows (PowerShell)**:
     ```powershell
     $env:MB_DB_TYPE="postgres"
     $env:MB_DB_DBNAME="metabase_metadata"
     $env:MB_DB_PORT="5432"
     $env:MB_DB_USER="ongc_admin"
     $env:MB_DB_PASS="ONGC_Lab_Secure_Pass2026!"
     $env:MB_DB_HOST="127.0.0.1"
     $env:MB_JETTY_PORT="3001"
     ```
   * **Linux/macOS**:
     ```bash
     export MB_DB_TYPE=postgres
     export MB_DB_DBNAME=metabase_metadata
     export MB_DB_PORT=5432
     export MB_DB_USER=ongc_admin
     export MB_DB_PASS=ONGC_Lab_Secure_Pass2026!
     export MB_DB_HOST=127.0.0.1
     export MB_JETTY_PORT=3001
     ```
3. Boot up the Metabase instance:
   ```bash
   java -jar metabase.jar
   ```

---

### Step 6: Nginx Proxy Setup

Replace your target server's Nginx configuration (usually `/etc/nginx/nginx.conf` or a Virtual Host file in `/etc/nginx/sites-available/`) with the following block:

```nginx
server {
    listen 80;
    server_name localhost;

    # 1. Serve React Static Assets directly
    location / {
        root /path/to/gvms/frontend/dist; # Replace with your absolute path
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 2. Route backend API calls
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /docs {
        proxy_pass http://127.0.0.1:8000/docs;
        proxy_set_header Host $host;
    }

    location /openapi.json {
        proxy_pass http://127.0.0.1:8000/openapi.json;
        proxy_set_header Host $host;
    }

    # 3. Route Metabase Frames securely
    location /metabase/ {
        if ($request_uri ~* "/metabase/(auth|setup|admin|api/session|api/user)") {
            return 403;
        }
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Frame-Options "SAMEORIGIN";
    }
}
```

Restart Nginx:
* **Linux**: `sudo systemctl restart nginx`
* **Windows**: Run `nginx.exe -s reload` in the Nginx terminal.

---

### Step 7: Run Provisioning & Seeding

Now that database, backend, and Metabase are up and running, you need to populate the tables and link the BI views.

1. Set your python path and run database registrations (with python environment activated):
   * **Windows (PowerShell)**:
     ```powershell
     $env:PYTHONPATH="backend"
     python scripts/db_setup.py
     python scripts/seed_data.py
     ```
   * **Linux/macOS**:
     ```bash
     export PYTHONPATH=backend
     python scripts/db_setup.py
     python scripts/seed_data.py
     ```
2. Provision Metabase embeds:
   ```bash
   pip install requests
   python metabase/setup_metabase.py
   python metabase/provision_bi_dashboard.py
   ```

---

## ⚡ Production recommendations (Services)

To ensure that the backend API and Metabase restart automatically on server restarts, run them as background daemons/services:

*   **On Linux**: Configure a Systemd service file (e.g., `/etc/systemd/system/gvms-backend.service` and `/etc/systemd/system/gvms-metabase.service`).
*   **On Windows**: Use tools like **NSSM** (Non-Sucking Service Manager) to convert the Python/Java run commands into native Windows Services, or install process manager **PM2** via npm:
    ```bash
    npm install pm2 -g
    pm2 start "uvicorn app.main:app --host 127.0.0.1 --port 8000" --name gvms-backend
    ```
