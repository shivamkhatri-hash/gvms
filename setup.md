# GVMS Bare-Metal Windows Deployment Guide (Command Prompt)

This guide provides step-by-step instructions to deploy the **Graphical Visualization Management System (GVMS)** onto a Windows environment *without* Docker. 

This guide assumes that the target database and its geochemical tables **are already pre-existing** on the destination device. The setup focuses on copying the codebase, configuring the database connections, building/running the services, and linking the interactive BI dashboard.

---

## 🏗️ Architecture & Component Overview

In a bare-metal deployment, all components run natively on the target host machine:

| Component | Port | Software Required | Description |
| :--- | :--- | :--- | :--- |
| **Nginx Proxy** | `80` | Nginx for Windows | Routes incoming traffic to React assets, FastAPI backend, and Metabase. |
| **Frontend UI** | Static | Node.js | Built React/Vite assets served as static files by Nginx. |
| **Backend API** | `8000` | Python | FastAPI backend handling business logic and database queries. |
| **Metabase BI** | `3001` | Java JDK/JRE | Standalone BI environment providing cryptographically signed dashboard frames. |
| **Database** | `5432` | PostgreSQL (or compatible) | Pre-existing LIMS database containing LIMS tables. |

---

## 📋 Software Version Requirements

The GVMS LIMS platform has been verified and tested under the following environment versions:
*   **Python**: `v3.10` to `v3.13` (Current Development PC: `v3.13`)
*   **Node.js**: `v18.x` or `v20.x` (with npm)
*   **Java JDK/JRE**: `v11` or `v21` (Current Development PC: `v21`)
*   **Nginx for Windows**: `v1.26.1 (Stable)`
*   **Metabase**: `v0.49.3 (Standalone JAR)`
*   **PostgreSQL**: `v16.x` (or compatible)
## 🛠️ Prerequisites & Offline Transfer

If the destination device does not have internet access or does not have Python, Node.js, Java, and Nginx installed/updated, you can copy the installation folders from your development PC and transfer them via a USB/shared folder:

### 1. Copy Folders from Development PC:
*   📂 **Python 3.13**: Copy `C:\Users\msi 16\AppData\Local\Programs\Python\Python313`
*   📂 **Node.js**: Copy `C:\Program Files\nodejs`
*   📂 **Java (JDK 21)**: Copy `C:\Program Files\Java\jdk-21.0.11`
*   📂 **Nginx**: Download the stable Windows zip file [nginx-1.26.1.zip](https://nginx.org/download/nginx-1.26.1.zip) (only 1.8 MB) and copy it to your transfer folder.

### 2. Paste on Destination Device:
Create a folder named `C:\programs` on the target device and paste the folders there:
*   `C:\programs\Python313`
*   `C:\programs\nodejs`
*   `C:\programs\jdk-21.0.11`
*   Extract the Nginx zip package directly to `C:\nginx` (so that `nginx.exe` is located at `C:\nginx\nginx.exe`).

### 3. Register Environment Paths:
Create a batch script `start_env.bat` in your project folder on the target device:
```cmd
@echo off
set PATH=%PATH%;C:\programs\Python313;C:\programs\Python313\Scripts;C:\programs\nodejs;C:\programs\jdk-21.0.11\bin;C:\nginx
python --version
node -v
java -version
cmd.exe
```
Double-click `start_env.bat` on the destination device to open a configured Command Prompt session.

---


## 1. Environment Configuration (`.env`)

Copy the entire project folder to the destination device. In the project root directory, create a `.env` file (copied from `.env.example`) and edit it to connect to the pre-existing database. Use backslashes for path structures and customize your settings:

```ini
# =========================================================================
# GVMS Configuration Settings (Manual Deployment)
# =========================================================================

PROJECT_NAME="GVMS — Graphical Visualization Management System"
ENVIRONMENT=production

# Backend Security Keys (Change these for production)
SECRET_KEY=ongc_lab_super_secret_jwt_key_32bytes_min_length_2026
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
REFRESH_TOKEN_EXPIRE_DAYS=7

# =========================================================================
# Database Settings (Targeting Pre-existing Database)
# =========================================================================
POSTGRES_SERVER=127.0.0.1                     # Pre-existing database host IP
POSTGRES_PORT=5432                            # Database port
POSTGRES_DB=your_preexisting_db               # Name of the database
POSTGRES_USER=your_username                   # Database username
POSTGRES_PASSWORD=your_password               # Database password
DATABASE_URL=postgresql://your_username:your_password@127.0.0.1:5432/your_preexisting_db

# =========================================================================
# Metabase BI Analytics Config
# =========================================================================
MB_DB_TYPE=postgres
MB_DB_DBNAME=metabase_metadata
MB_DB_PORT=5432
MB_DB_USER=your_username
MB_DB_PASS=your_password
MB_DB_HOST=127.0.0.1
METABASE_URL=http://localhost:3001
METABASE_PUBLIC_URL=http://localhost/metabase
METABASE_DASHBOARD_ID=2

# Metabase Signed Embedding Secret (Must match what is inside Metabase UI)
METABASE_EMBED_SECRET_KEY=23485ab9403816ca3de0927df8b461b3690d5fcd715456209be3cd1ef381da23

# Initial Admin Credentials (Created automatically on startup)
FIRST_SUPERUSER=admin@ongc.co.in
FIRST_SUPERUSER_PASSWORD=Admin@123456
FIRST_SUPERUSER_NAME="GVMS Chief Geochemist"
```
## 2. Backend API Setup & Dependency Installation

Open a Command Prompt (`cmd.exe`) and configure the Python application:

### Step 1: Create Virtual Environment
```cmd
cd backend
python -m venv venv
```

### Step 2: Activate the Virtual Environment
```cmd
call venv\Scripts\activate.bat
```

### Step 3: Install Dependencies

#### Option A: Online Installation (With Internet)
```cmd
pip install -r requirements.txt
```

#### Option B: Offline Installation (No Internet / Restricted Computer)
If the target computer has network restrictions and cannot download from python/pip libraries:
1.  **On your Development PC (with internet)**, open Command Prompt in the `backend` folder and download all dependency packages (`.whl` files) into a local `wheelhouse` directory:
    ```cmd
    pip download -r requirements.txt -d wheelhouse
    ```
2.  **Transfer** the entire `wheelhouse` folder to the target machine using your USB drive (place it inside the `backend` directory).
3.  **On the target machine (offline)**, activate the virtual environment and install the packages directly from the local folder:
    ```cmd
    pip install --no-index --find-links=wheelhouse -r requirements.txt
    ```

### Step 4: Run the Backend Server
Start the FastAPI server using Uvicorn:
```cmd
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

---
## 3. Frontend Compilation & Serving

Compile the React assets to static HTML/JS/CSS and serve them directly via Nginx.

### Step 1: Navigate and Install Dependencies

#### Option A: Online Installation (With Internet)
Open a new Command Prompt window:
```cmd
cd frontend
npm install
npm run build
```

#### Option B: Offline Installation (No Internet / Restricted Computer)
If the target computer is restricted from running `npm install`:
1.  **On your Development PC (with internet)**, open Command Prompt in the `frontend` folder and run:
    ```cmd
    npm install
    ```
    This downloads all required libraries into a folder named `node_modules` inside your `frontend` directory.
2.  **Zip/Compress** the `node_modules` folder (e.g., `node_modules.zip`) and copy it to your USB drive.
3.  **On the target machine (offline)**, paste and extract `node_modules.zip` directly inside the `frontend` folder (so that the folder `frontend\node_modules` exists).
4.  Run the build command to compile the static assets:
    ```cmd
    cd frontend
    npm run build
    ```
This compilation creates a static bundle folder under `frontend\dist`.

### Step 2: Configure Nginx for Windows

1. Copy the project's custom Nginx configuration file [`nginx/nginx.conf`](file:///e:/GVMS%28Graphical%20Visualization%20Management%20System%29/nginx/nginx.conf) and overwrite the default Nginx configuration at `C:\nginx\conf\nginx.conf` on the target machine.
2. Open `C:\nginx\conf\nginx.conf` and replace the `server` block to map the static frontend directory and route the FastAPI and Metabase API frames:


```nginx
server {
    listen 80;
    server_name localhost;

    # 1. Serve React Static Assets directly
    location / {
        root C:/path/to/gvms/frontend/dist; # Replace with your absolute path using forward slashes
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

### Step 3: Run Nginx
In Command Prompt:
```cmd
cd C:\nginx
start nginx
```
To reload Nginx after configuration changes:
```cmd
nginx.exe -s reload
```

---

## 4. Run Standalone Metabase BI

Metabase runs natively using the Java Runtime Environment.

### Step 1: Download Metabase JAR
Download the standalone JAR file into your metabase directory:
[Download Metabase JAR (v0.49.3)](https://downloads.metabase.com/v0.49.3/metabase.jar)

### Step 2: Boot Metabase via Command Prompt
Open a new Command Prompt, set the environment bindings, and launch the JAR file:
```cmd
set MB_DB_TYPE=postgres
set MB_DB_DBNAME=metabase_metadata
set MB_DB_PORT=5432
set MB_DB_USER=your_username
set MB_DB_PASS=your_password
set MB_DB_HOST=127.0.0.1
set MB_JETTY_PORT=3001
java -jar metabase.jar
```

---

## 5. Register Metadata and Provision BI Embeds

Once the backend, frontend, Nginx, and Metabase are active, register LIMS variables (needed for dynamic graphing and dashboards) and link Metabase dashboards.

Open a Command Prompt window and activate the virtual environment:
```cmd
cd backend
call venv\Scripts\activate.bat
```

### Step 1: Register Dynamic LIMS Variables
Even though your database tables exist, register their metadata definitions in the registry tables:
```cmd
set PYTHONPATH=backend
python ..\scripts\db_setup.py
```

### Step 2: Auto-Provision Metabase Dashboard embeds
Run the setup and provisioning scripts to hook Metabase to the pre-existing database and import the dashboard structures:
```cmd
pip install requests
python ..\metabase\setup_metabase.py
python ..\metabase\provision_bi_dashboard.py
```

---

## 6. Ingest Full Trace Metal & Microbiology Datasets (Optional)

If your pre-existing database is empty or contains only the default 5-row sample datasets, you can populate it with the full datasets (23 trace metal records and 28 microbiology records) by running the automated import script from the `backend` directory (with your virtual environment activated):

```cmd
set PYTHONPATH=backend
python ..\scripts\import_full_data.py
```

---

## ⚡ Running Services in the Background (Optional)

To run the Python backend and Metabase as background services on Windows:
*   Download **NSSM** (Non-Sucking Service Manager) and run `nssm install gvms-backend` to register a Windows Service running `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
*   Similarly, register a service `gvms-metabase` running `java -jar metabase.jar` with all database environment variables configured.

