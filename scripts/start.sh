#!/bin/bash
# ONGC Chem Lab Data - Production Launch Script

set -e

echo "================================================="
echo " ONGC Chem Lab Data - Enterprise LIMS Deployment"
echo "================================================="

# Check docker compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

echo "[*] Building and launching containers..."
$DOCKER_COMPOSE up --build -d

echo "[*] Waiting for services to initialize..."
sleep 10

echo "[+] Application successfully started!"
echo "Access Points:"
echo " - Web UI Application: http://localhost"
echo " - FastAPI API Documentation: http://localhost/docs"
echo " - Metabase Analytics BI: http://localhost/metabase"
