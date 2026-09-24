import os
import sys
import time
import platform
import shutil
import datetime
from typing import Any, List, cast
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.deps import get_db, get_current_active_admin
from app.core.config import settings
from app.crud.crud_log import crud_log
from app.models.user import User
from app.services.metabase_service import metabase_service
from app.services.backup_service import BackupService, BACKUP_DIR

router = APIRouter()


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> Any:
    """
    Check dynamic backend, database, and Metabase health and infrastructure status.
    """
    # 1. Database Ping & Diagnostics
    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
    db_provider_name = f"Oracle Database 19c ({settings.ORACLE_SERVICE_NAME or 'EPIDDN'})" if is_oracle else f"PostgreSQL 16 ({settings.POSTGRES_DB or 'ongc_lab'})"
    db_host = settings.ORACLE_HOST if is_oracle else settings.POSTGRES_SERVER
    db_port = settings.ORACLE_PORT if is_oracle else settings.POSTGRES_PORT
    
    db_status = "offline"
    db_latency_ms = None
    db_error = None
    start_time = time.time()
    try:
        sql = "SELECT 1 FROM DUAL" if is_oracle else "SELECT 1"
        db.execute(text(sql))
        db_latency_ms = round((time.time() - start_time) * 1000, 2)
        db_status = "healthy"
    except Exception as e:
        db_error = str(e)
        db_status = "degraded"

    # 2. Metabase Diagnostics
    metabase_info = metabase_service.get_status()
    mb_healthy = metabase_info.get("healthy", False)
    mb_port = getattr(settings, "METABASE_PORT", 3001)

    # 3. Overall System State
    overall_status = "healthy" if (db_status == "healthy" and mb_healthy) else ("degraded" if db_status == "healthy" or mb_healthy else "unhealthy")

    # 4. Storage Disk Metrics
    disk_total_gb = 0.0
    disk_free_gb = 0.0
    disk_usage_pct = 0.0
    try:
        total, used, free = shutil.disk_usage("/")
        disk_total_gb = round(total / (1024 ** 3), 2)
        disk_free_gb = round(free / (1024 ** 3), 2)
        disk_usage_pct = round(((total - free) / total) * 100, 1)
    except Exception:
        pass

    return {
        "status": overall_status,
        "timestamp": datetime.datetime.now().isoformat(),
        "services": {
            "backend": "online",
            "database": db_status,
            "metabase": metabase_info.get("status", "offline")
        },
        "nodes": {
            "database": {
                "name": db_provider_name,
                "type": "database",
                "provider": settings.DATABASE_PROVIDER.upper(),
                "host": db_host,
                "port": db_port,
                "status": db_status,
                "latency_ms": db_latency_ms,
                "details": f"Port {db_port} • {db_status.capitalize()}" + (f" ({db_latency_ms} ms)" if db_latency_ms else (f" • {db_error[:50]}..." if db_error else "")),
                "version": "19c Enterprise" if is_oracle else "16.2"
            },
            "backend": {
                "name": f"FastAPI Python {platform.python_version()}",
                "type": "backend",
                "provider": "Uvicorn ASGI",
                "host": "localhost",
                "port": getattr(settings, "FASTAPI_PORT", 8000),
                "status": "healthy",
                "latency_ms": 1.2,
                "details": f"Port {getattr(settings, 'FASTAPI_PORT', 8000)} • Healthy (Active)",
                "version": f"Python {platform.python_version()} / FastAPI"
            },
            "metabase": {
                "name": "Metabase BI Platform",
                "type": "metabase",
                "provider": "Metabase Enterprise Embed",
                "host": "metabase",
                "port": mb_port,
                "status": "healthy" if mb_healthy else "degraded",
                "latency_ms": None,
                "details": f"Port {mb_port} • " + ("Connected" if mb_healthy else "Embed Service Standby"),
                "version": metabase_info.get("version", "v0.48.x")
            }
        },
        "metabase": metabase_info,
        "storage": {
            "disk_total_gb": disk_total_gb,
            "disk_free_gb": disk_free_gb,
            "usage_percent": disk_usage_pct
        }
    }



@router.get("/audit-logs")
def get_audit_logs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_active_admin)
) -> Any:
    """
    Get system audit activity log history. Restricted to Admin.
    """
    logs = crud_log.get_audit_logs(db, skip=skip, limit=limit)
    return [
        {
            "id": log.id,
            "user_id": str(log.user_id) if log.user_id else None,
            "user_email": log.user.email if log.user else "System",
            "action": log.action,
            "resource": log.resource,
            "details": log.details,
            "ip_address": log.ip_address,
            "created_at": log.created_at
        }
        for log in logs
    ]


import os
import shutil
from typing import cast
from uuid import UUID
from fastapi import HTTPException
from app.services.backup_service import BackupService, BACKUP_DIR
from app.core.config import settings

@router.get("/monitoring")
def get_monitoring_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
) -> Any:
    """
    Exposes detailed system resources, disk space usage, sync histories, 
    and available backups packages list. Restricted to Administrator.
    """
    # 1. Disk usage diagnostics
    disk_total = 0
    disk_free = 0
    try:
        total, used, free = shutil.disk_usage("/")
        disk_total = total / (1024 ** 3)  # GB
        disk_free = free / (1024 ** 3)    # GB
    except Exception:
        pass

    # 2. Get database sync history runs (Deprecated - LIMS sync disabled)
    sync_runs = []

    # 3. Get backup archives list
    backups = []
    if os.path.exists(BACKUP_DIR):
        try:
            backups = [f for f in os.listdir(BACKUP_DIR) if f.endswith(".zip")]
        except Exception:
            pass

    return {
        "status": "online",
        "timestamp": datetime.datetime.now().isoformat() if "datetime" in globals() else None,
        "storage": {
            "disk_total_gb": round(disk_total, 2),
            "disk_free_gb": round(disk_free, 2),
            "usage_percent": round(((disk_total - disk_free) / disk_total * 100), 2) if disk_total > 0 else 0.0
        },
        "sync_runs": sync_runs,
        "backup_archives": backups,
        "database_provider": settings.DATABASE_PROVIDER
    }


@router.post("/backup")
def trigger_system_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
) -> Any:
    """
    Create a complete LIMS database and configuration backup zip archive. Restricted to Admin.
    """
    import os
    if os.getenv("GVMS_PRODUCTION", "false").lower() == "true":
        raise HTTPException(
            status_code=400,
            detail="Database backups are managed externally in GVMS production mode."
        )

    try:
        zip_path = BackupService.create_backup(db)
        crud_log.create_audit_log(
            db,
            user_id=cast(UUID, current_user.id),
            action="TRIGGER_BACKUP",
            resource="SYSTEM",
            details=f"Manual system backup file generated successfully: {os.path.basename(zip_path)}"
        )
        return {"status": "success", "file": os.path.basename(zip_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup generation failed: {str(e)}")


@router.post("/restore")
def trigger_system_restore(
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_admin)
) -> Any:
    """
    Restore LIMS database and custom tables from a specified backup ZIP file. Restricted to Admin.
    """
    import os
    if os.getenv("GVMS_PRODUCTION", "false").lower() == "true":
        raise HTTPException(
            status_code=400,
            detail="Database recovery is managed externally in GVMS production mode."
        )

    try:
        report = BackupService.restore_backup(db, filename)
        crud_log.create_audit_log(
            db,
            user_id=cast(UUID, current_user.id),
            action="TRIGGER_RESTORE",
            resource="SYSTEM",
            details=f"System data successfully restored from backup file: {filename}"
        )
        return report
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore operation failed: {str(e)}")
