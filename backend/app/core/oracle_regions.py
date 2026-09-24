import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from sqlalchemy import text
from app.core.config import settings
from app.core.logging import logger

ORACLE_REGIONS: Dict[str, Dict[str, str]] = {
    "NR": {
        "code": "NR",
        "name": "Northern Region",
        "location": "Dehradun",
        "user": "PRJDDN",
        "password": "prjddn",
        "description": "Northern Region (Dehradun) — Schema: PRJDDN",
    },
    "ER": {
        "code": "ER",
        "name": "Eastern Region",
        "location": "Jorhat",
        "user": "PRJJRT",
        "password": "PRJJRT",
        "description": "Eastern Region (Jorhat) — Schema: PRJJRT",
    },
    "WR": {
        "code": "WR",
        "name": "Western Region",
        "location": "Vadodara",
        "user": "PRJBRD",
        "password": "PRJBRD",
        "description": "Western Region (Vadodara) — Schema: PRJBRD",
    },
    "SR": {
        "code": "SR",
        "name": "Southern Region",
        "location": "Chennai",
        "user": "PRJCHN",
        "password": "PRJCHN",
        "description": "Southern Region (Chennai) — Schema: PRJCHN",
    },
    "MR": {
        "code": "MR",
        "name": "Mumbai / Marine Region",
        "location": "Mumbai",
        "user": "PRJMUM",
        "password": "PRJMUM",
        "description": "Mumbai Region (Mumbai) — Schema: PRJMUM",
    },
    "CR": {
        "code": "CR",
        "name": "Central Region",
        "location": "Kolkata",
        "user": "PRJKOL",
        "password": "prjkol",
        "description": "Central Region (Kolkata) — Schema: PRJKOL",
    },
}


def get_current_region_code() -> str:
    """Determine the active region code based on current settings.ORACLE_USER."""
    current_user = (settings.ORACLE_USER or "").strip().upper()
    for code, info in ORACLE_REGIONS.items():
        if info["user"].upper() == current_user:
            return code
    return "CUSTOM"


def get_regions_status() -> Dict[str, Any]:
    """Get active connection status and all regional configuration options."""
    active_code = get_current_region_code()
    region_list: List[Dict[str, str]] = []
    for code, info in ORACLE_REGIONS.items():
        region_list.append({
            "code": info["code"],
            "name": info["name"],
            "location": info["location"],
            "user": info["user"],
            "description": info["description"],
            "is_active": (code == active_code)
        })

    return {
        "current_region": active_code,
        "current_user": settings.ORACLE_USER,
        "current_host": settings.ORACLE_HOST,
        "current_port": settings.ORACLE_PORT,
        "current_service_name": settings.ORACLE_SERVICE_NAME,
        "database_provider": settings.DATABASE_PROVIDER,
        "regions": region_list,
    }


def update_env_file_oracle_credentials(new_user: str, new_password: str) -> None:
    """Persist the changed Oracle credentials to .env file if it exists."""
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[3] / ".env",
        Path(__file__).resolve().parents[2] / ".env",
        Path("e:/GVMS(Graphical Visualization Management System)/.env")
    ]
    
    for env_path in candidates:
        if env_path.is_file():
            try:
                content = env_path.read_text(encoding="utf-8")
                
                # Replace ORACLE_USER
                if re.search(r"^ORACLE_USER=.*$", content, flags=re.MULTILINE):
                    content = re.sub(r"^ORACLE_USER=.*$", f"ORACLE_USER={new_user}", content, flags=re.MULTILINE)
                else:
                    content += f"\nORACLE_USER={new_user}"
                    
                # Replace ORACLE_PASSWORD
                if re.search(r"^ORACLE_PASSWORD=.*$", content, flags=re.MULTILINE):
                    content = re.sub(r"^ORACLE_PASSWORD=.*$", f"ORACLE_PASSWORD={new_password}", content, flags=re.MULTILINE)
                else:
                    content += f"\nORACLE_PASSWORD={new_password}"
                    
                env_path.write_text(content, encoding="utf-8")
                logger.info(f"Updated .env file at {env_path} with ORACLE_USER={new_user}")
                break
            except Exception as e:
                logger.warning(f"Failed to update env file {env_path}: {e}")


def switch_oracle_region(region_code: str) -> Dict[str, Any]:
    """
    Switch active Oracle regional connection at runtime,
    re-bind connection pool, run ping & schema verification.
    """
    from app.core.database import reconfigure_engine, SessionLocal
    from app.db.init_db import init_db

    region_key = region_code.strip().upper()
    if region_key not in ORACLE_REGIONS:
        raise ValueError(f"Invalid region code '{region_code}'. Allowed regions: {list(ORACLE_REGIONS.keys())}")

    target = ORACLE_REGIONS[region_key]
    old_user = settings.ORACLE_USER
    old_password = settings.ORACLE_PASSWORD

    try:
        # 1. Update runtime settings
        settings.ORACLE_USER = target["user"]
        settings.ORACLE_PASSWORD = target["password"]

        # 2. Persist to .env
        update_env_file_oracle_credentials(target["user"], target["password"])

        # 3. Reconfigure SQLAlchemy Engine & SessionLocal
        reconfigure_engine()

        # 4. Test live ping to Oracle
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1 FROM DUAL"))
            logger.info(f"Oracle successfully pinged after switching to region {region_key} ({target['user']})")
            
            # 5. Initialize/verify tables and views in this schema
            try:
                init_db(db)
            except Exception as init_err:
                logger.warning(f"Note during schema init for {region_key}: {init_err}")
                
        finally:
            db.close()

        return {
            "success": True,
            "region": target["code"],
            "region_name": target["name"],
            "location": target["location"],
            "user": target["user"],
            "service_name": settings.ORACLE_SERVICE_NAME,
            "message": f"Successfully connected to {target['name']} ({target['location']}) with Oracle user {target['user']}"
        }
    except Exception as e:
        logger.error(f"Failed to switch Oracle region to {region_key}: {str(e)}")
        # Rollback settings if failed
        settings.ORACLE_USER = old_user
        settings.ORACLE_PASSWORD = old_password
        try:
            update_env_file_oracle_credentials(old_user, old_password)
            reconfigure_engine()
        except Exception:
            pass
        raise e
