@echo off
setlocal
title GVMS - Offline Backend Library Installer

pushd "%~dp0backend"

echo =========================================================================
echo  GVMS: Installing Python Backend Dependencies from Local Wheelhouse
echo =========================================================================
echo.

if exist "venv\Scripts\python.exe" goto :venv_exists

echo [*] Creating virtual environment (venv)...
python -m venv venv
if errorlevel 1 goto :venv_failed

:venv_exists
echo [*] Activating virtual environment...
call venv\Scripts\activate.bat

echo [*] Installing packages offline from .\wheelhouse folder...
pip install --no-index --find-links=wheelhouse -r requirements.txt
if errorlevel 1 goto :install_failed

echo.
echo =========================================================================
echo  [SUCCESS] All Python libraries have been installed offline!
echo  You can now start the backend with start_backend.bat
echo =========================================================================
goto :end

:venv_failed
echo.
echo [ERROR] Failed to create virtual environment. Ensure Python is installed.
goto :end

:install_failed
echo.
echo [ERROR] Failed to install offline packages from wheelhouse.
goto :end

:end
popd
pause
