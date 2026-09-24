from typing import Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.deps import get_db
from app.core.config import settings
from app.core.oracle_regions import (
    ORACLE_REGIONS,
    get_regions_status,
    switch_oracle_region,
    get_current_region_code,
)
from app.core.logging import logger

router = APIRouter()


class SwitchRegionRequest(BaseModel):
    region: str


@router.get("/regions")
def get_oracle_regions() -> Any:
    """
    Get all available Oracle regional configurations and current active region.
    """
    return get_regions_status()


@router.post("/switch-region")
def handle_switch_region(request: SwitchRegionRequest) -> Any:
    """
    Switch active Oracle region/user schema dynamically without server restart.
    """
    if settings.DATABASE_PROVIDER.lower() != "oracle":
        raise HTTPException(
            status_code=400,
            detail="Active DATABASE_PROVIDER is not set to 'oracle'. Region switching applies to Oracle databases."
        )

    try:
        result = switch_oracle_region(request.region)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Failed to switch Oracle region: {e}")
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")


@router.get("/status")
def get_oracle_live_status(db: Session = Depends(get_db)) -> Any:
    """
    Ping and test active Oracle database connection and return current regional schema info.
    """
    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
    current_region = get_current_region_code()
    
    try:
        sql = "SELECT 1 FROM DUAL" if is_oracle else "SELECT 1"
        db.execute(text(sql))
        db_status = "connected"
        error_msg = None
    except Exception as e:
        db_status = "error"
        error_msg = str(e)

    return {
        "status": db_status,
        "region_code": current_region,
        "oracle_user": settings.ORACLE_USER,
        "oracle_host": settings.ORACLE_HOST,
        "oracle_port": settings.ORACLE_PORT,
        "oracle_service_name": settings.ORACLE_SERVICE_NAME,
        "database_provider": settings.DATABASE_PROVIDER,
        "error": error_msg
    }
