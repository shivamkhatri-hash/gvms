Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host " GVMS: Installing Python Backend Dependencies from Local Wheelhouse" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan

Set-Location "$PSScriptRoot\backend"

if (-not (Test-Path "venv\Scripts\python.exe")) {
    Write-Host "[*] Creating virtual environment (venv)..." -ForegroundColor Yellow
    python -m venv venv
}

Write-Host "[*] Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

Write-Host "[*] Installing offline wheel packages from .\wheelhouse ..." -ForegroundColor Yellow
pip install --no-index --find-links=wheelhouse -r requirements.txt

Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Green
Write-Host " [SUCCESS] All Python libraries (including uvicorn) installed offline!" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Green
