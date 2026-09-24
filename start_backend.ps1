Set-Location "$PSScriptRoot\backend"

if (-not (Test-Path "venv\Scripts\python.exe")) {
    Write-Host "[!] Virtual environment not found. Running offline installer first..." -ForegroundColor Yellow
    & "$PSScriptRoot\install_backend_offline.ps1"
}

Write-Host "[*] Activating virtual environment..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Verify if uvicorn is present
python -c "import uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Uvicorn not found. Installing from offline wheelhouse..." -ForegroundColor Yellow
    & "$PSScriptRoot\install_backend_offline.ps1"
    & ".\venv\Scripts\Activate.ps1"
}

$env:PYTHONPATH = (Get-Location).Path
Write-Host "[*] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
