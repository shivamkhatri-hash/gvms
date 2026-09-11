from typing import Any, List
import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.deps import get_db, get_current_active_admin
from app.crud.crud_log import crud_log
from app.models.user import User
from app.services.metabase_service import metabase_service

router = APIRouter()


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> Any:
    """
    Check backend, database, and Metabase health status.
    """
    db_status = "online"
    try:
        sql = "SELECT 1 FROM DUAL" if settings.DATABASE_PROVIDER.lower() == "oracle" else "SELECT 1"
        db.execute(text(sql))
    except Exception as e:
        db_status = f"offline: {str(e)}"

    metabase_info = metabase_service.get_status()

    return {
        "status": "healthy" if db_status == "online" else "degraded",
        "services": {
            "backend": "online",
            "database": db_status,
            "metabase": metabase_info["status"]
        },
        "metabase": metabase_info
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
