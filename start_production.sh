#!/bin/bash
# GVMS - Production Launch Script (Without Docker)

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==================================================="
echo "   GVMS - Production Launch (Without Docker)"
echo "==================================================="

# 1. Build Frontend
echo "[*] Building frontend assets..."
cd "$PROJECT_DIR/frontend"
npm install
npm run build

# 2. Setup & Start Backend
echo "[*] Starting FastAPI Backend on port 8000..."
cd "$PROJECT_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

export PYTHONPATH="$PROJECT_DIR/backend"

# Run with PM2 if installed, else run background process
if command -v pm2 &> /dev/null; then
    echo "[*] Launching via PM2..."
    cd "$PROJECT_DIR"
    pm2 start ecosystem.config.cjs
    pm2 save
    echo "[+] Services running under PM2!"
    pm2 status
else
    echo "[*] Starting background processes..."
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 &
    BACKEND_PID=$!
    
    cd "$PROJECT_DIR/frontend"
    npm run preview &
    FRONTEND_PID=$!
    
    echo "[+] Backend PID: $BACKEND_PID"
    echo "[+] Frontend PID: $FRONTEND_PID"
fi

echo "==================================================="
echo " Access URLs:"
echo " - Frontend:  http://localhost:3005"
echo " - API Docs:  http://localhost:8000/docs"
echo "==================================================="
