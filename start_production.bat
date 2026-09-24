@echo off
setlocal
title GVMS - Production Server Launcher (No Docker)

echo ===================================================
echo   GVMS - Production Launch (Without Docker)
echo ===================================================

:: 1. Build Frontend
echo [*] Checking Frontend build...
cd /d "%~dp0frontend"
if not exist "dist\index.html" (
    echo [*] Frontend production build not found. Building now...
    call npm install
    call npm run build
) else (
    echo [OK] Frontend build found in frontend\dist
)

:: 2. Start Backend in separate window
echo [*] Starting FastAPI Backend on port 8000...
start "GVMS Backend (FastAPI Production)" cmd /k "cd /d %~dp0backend && if exist venv\Scripts\activate.bat (call venv\Scripts\activate.bat) && set PYTHONPATH=%CD% && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4"

:: 3. Start Frontend Preview in separate window
echo [*] Starting Frontend Server on port 3005...
start "GVMS Frontend (Vite Production)" cmd /k "cd /d %~dp0frontend && npm run preview"

echo.
echo ===================================================
echo [+] GVMS is running in production mode!
echo     - Frontend:  http://localhost:3005
echo     - Backend:   http://localhost:8000
echo     - API Docs:  http://localhost:8000/docs
echo ===================================================
pause
