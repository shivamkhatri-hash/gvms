# GVMS Offline Manual Deployment — Packaging & Installation Guide

This guide describes how to bundle all runtimes, Python library packages, and Node.js dependencies on an internet-connected development PC, transfer them via a USB drive, and perform the native Windows installation on the restricted business computer without an internet connection.

---

## 📦 Part 1: Preparing the Offline Package (On Internet-Enabled PC)

On your development PC, create a folder named `GVMS_Offline_Bundle` on your desktop or USB drive. Configure its structure as follows:

```text
GVMS_Offline_Bundle/
├── runtimes/              # Windows installers (Python, Node, Java, Nginx, Metabase)
├── python_libraries/      # Offline Python wheel (.whl) packages
├── node_modules.zip       # Zipped Node.js dependencies
└── gvms-codebase/         # The complete project codebase directory
```

### Step-by-Step Packaging Actions:

#### 1. Download System Runtimes
Download these installers and save them inside `GVMS_Offline_Bundle/runtimes/`:
*   [Python 3.13.7 Installer](https://www.python.org/ftp/python/3.13.7/python-3.13.7-amd64.exe)
*   [Node.js v20.11.0 Installer](https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi)
*   [Java JDK 21 Temurin Installer](https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.2%2B13/OpenJDK21U-jdk_x64_windows_hotspot_21.0.2_13.msi)
*   [Nginx v1.26.1 Windows Zip](https://nginx.org/download/nginx-1.26.1.zip)
*   [Metabase v0.49.3 JAR Package](https://downloads.metabase.com/v0.49.3/metabase.jar)

#### 2. Download Python Backend Wheels
Open Command Prompt, navigate to your project's `backend` folder, and download all library packages into your bundle folder:
```cmd
pip download -r requirements.txt -d C:\path\to\GVMS_Offline_Bundle\python_libraries
```

#### 3. Package Node.js Frontend Dependencies
1. Navigate to the `frontend` folder of the project.
2. Run `npm install` to download all dependencies into `frontend\node_modules`.
3. Compress/Zip the compiled `node_modules` folder and save it as `node_modules.zip` inside `GVMS_Offline_Bundle/`.

#### 4. Copy the Project Codebase
Copy the entire project codebase folder (containing `backend/`, `frontend/`, `nginx/`, `.env`, etc.) into `GVMS_Offline_Bundle/gvms-codebase/`.

*Copy the entire `GVMS_Offline_Bundle` folder to your USB drive.*

---

## 🛠️ Part 2: Installing the Package (On Restricted Business Computer)

Eject the USB drive, connect it to the restricted computer, and perform the installation steps offline:

### Step 1: Install System Runtimes
Run the installers from the `runtimes/` folder on your USB:
1.  **Python**: Run `python-3.13.7-amd64.exe`. **CRITICAL**: Check the box **"Add python.exe to PATH"** before clicking install.
2.  **Node.js**: Run `node-v20.11.0-x64.msi` and accept the default settings.
3.  **Java JDK**: Run the Temurin JDK 21 installer. Enable **"Set JAVA_HOME"** during installation.
4.  **Nginx**: Extract `nginx-1.26.1.zip` directly to `C:\nginx` (such that `nginx.exe` is located at `C:\nginx\nginx.exe`).

### Step 2: Copy Codebase to Workspace
Copy the `gvms-codebase` folder from your USB to your target directory on the machine (e.g., `C:\gvms`).

### Step 3: Install Python Libraries Offline
Open a Command Prompt window on the target PC and run:
```cmd
cd C:\gvms\backend
python -m venv venv
call venv\Scripts\activate.bat
pip install --no-index --find-links=D:\GVMS_Offline_Bundle\python_libraries -r requirements.txt
```
*(Replace `D:\` with your USB drive letter).*

### Step 4: Extract Node.js Modules
Copy `node_modules.zip` from your USB to `C:\gvms\frontend\`, right-click it, and extract it there.
*   *Verification: Make sure the folder `C:\gvms\frontend\node_modules` exists.*

### Step 5: Compile Frontend Assets
In your Command Prompt window, compile the static files:
```cmd
cd C:\gvms\frontend
npm run build
```
This compiles Vite assets and generates a `C:\gvms\frontend\dist` folder.

### Step 6: Configure Nginx & App Settings
1.  Copy your custom configuration file `C:\gvms\nginx\nginx.conf` and replace the file at `C:\nginx\conf\nginx.conf`.
2.  Edit `C:\nginx\conf\nginx.conf` and update the static frontend directory path:
    ```nginx
    location / {
        root C:/gvms/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    ```
3.  In `C:\gvms\`, rename `.env.example` to `.env` and fill in your pre-existing database credentials (like `DATABASE_URL=postgresql://user:pass@10.203.10.236:5432/db`).

### Step 7: Launch the Platform

#### 1. Start Nginx Proxy
```cmd
cd C:\nginx
start nginx
```

#### 2. Start Python API Backend
```cmd
cd C:\gvms\backend
call venv\Scripts\activate.bat
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

#### 3. Start Metabase
Open a new Command Prompt window and launch Metabase:
```cmd
set MB_DB_TYPE=postgres
set MB_DB_DBNAME=metabase_metadata
set MB_DB_PORT=5432
set MB_DB_USER=your_db_username
set MB_DB_PASS=your_db_password
set MB_DB_HOST=10.203.10.236
set MB_JETTY_PORT=3001
java -jar C:\path\to\runtimes\metabase.jar
```

The portal is now active! Open your browser and go to `http://localhost`.
