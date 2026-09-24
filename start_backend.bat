@echo off
setlocal
title GVMS - Backend API Server (:8000)

pushd "%~dp0backend"

if exist "venv\Scripts\python.exe" goto :have_venv

echo [!] Virtual environment not found. Running installer first...
call "%~dp0install_backend_offline.bat"

:have_venv
echo [*] Activating virtual environment...
call venv\Scripts\activate.bat

python -c "import uvicorn" 2>nul
if not errorlevel 1 goto :start_server

echo [!] Uvicorn not found in venv. Installing packages from offline wheelhouse...
call "%~dp0install_backend_offline.bat"
call venv\Scripts\activate.bat

:start_server
set PYTHONPATH=%CD%
echo [*] Starting FastAPI Backend on http://127.0.0.1:8000 ...
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

popd
pause
