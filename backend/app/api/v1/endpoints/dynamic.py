import io
import logging
from typing import Any, List, Optional, cast
from uuid import UUID
import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.deps import get_db, get_current_user, require_roles
from app.crud.crud_registry import crud_registry
from app.crud.crud_log import crud_log
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.user import User
from app.models.registry import DatasetRegistry, VariableRegistry, DatasetVersion
from app.schemas.registry import (
    DatasetRegistryResponse,
    VariableRegistryResponse,
    RegistryUploadResponse
)
from app.services.csv_processor import CSVProcessor

router = APIRouter()
logger = logging.getLogger(__name__)


def get_dataset_record_count(db: Session, ds: DatasetRegistry) -> int:
    if ds.sql_table_name and ds.sql_table_name != "generic_dataset_records":
        try:
            t_name = "DL_BIOMARKER_STERANE_VW" if ds.sql_table_name.upper() == "DL_BIOMARKER_STERANE_" else ("DL_BIOMARKER_HOPANE_VW" if ds.sql_table_name.upper() == "DL_BIOMARKER_HOPANE_" else ("DL_BIOMARKER_AROMATIC_VW" if ds.sql_table_name.upper() == "DL_BIOMARKER_AROMATIC_" else ("DL_BIOMARKER_PR_PH_VW" if ds.sql_table_name.upper() == "DL_BIOMARKER_PR_PH_" else ds.sql_table_name)))
            res = db.execute(text(f"SELECT COUNT(*) FROM {t_name}"))
            return res.scalar() or 0
        except Exception:
            return 0
    else:
        return crud_registry.get_active_record_count(db, cast(int, ds.id))


@router.get("/datasets", response_model=List[DatasetRegistryResponse])
def get_datasets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Retrieve all active registered datasets with their metadata, variables, and record counts."""
    datasets = crud_registry.get_all_datasets(db)
    items = []
    for ds in datasets:
        version_count = len(cast(list, ds.versions)) if ds.versions else 0
        active_count = get_dataset_record_count(db, ds)
        ds_response = DatasetRegistryResponse.model_validate(ds)
        ds_response.version_count = version_count
        ds_response.active_record_count = active_count
        items.append(ds_response)
    return items


@router.get("/datasets/{id}", response_model=DatasetRegistryResponse)
def get_dataset(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Retrieve details of a single dataset, including its schemas and record counts."""
    ds = crud_registry.get_dataset_by_id(db, id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    version_count = len(cast(list, ds.versions)) if ds.versions else 0
    active_count = get_dataset_record_count(db, ds)
    ds_response = DatasetRegistryResponse.model_validate(ds)
    ds_response.version_count = version_count
    ds_response.active_record_count = active_count
    return ds_response


@router.get("/variables", response_model=List[VariableRegistryResponse])
def get_variables(
    dataset_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Retrieve all variables or filter them by dataset_id."""
    variables = crud_registry.get_all_variables(db, dataset_id=dataset_id)
    return [VariableRegistryResponse.model_validate(v) for v in variables]


@router.post("/upload", response_model=RegistryUploadResponse)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    dataset_id: Optional[int] = Query(None),
    dataset_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "researcher"]))
) -> Any:
    """Ingest a CSV/Excel file. Dynamically auto-detects dataset mapping if no target is provided."""
    import os
    if os.getenv("GVMS_PRODUCTION", "false").lower() == "true":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload and data ingestion features are disabled in GVMS visualization-only production mode."
        )

    filename = file.filename or "uploaded_file.csv"
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV or Excel files.")

    file_bytes = await file.read()
    file_size = len(file_bytes)

    # 1. Resolve Dataset
    ds = None
    if dataset_id:
        ds = crud_registry.get_dataset_by_id(db, dataset_id)
    elif dataset_name:
        ds = crud_registry.get_dataset_by_name(db, dataset_name)
    
    if not ds:
        try:
            ds, _ = CSVProcessor.detect_dataset(file_bytes, filename, db)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    if not ds:
        raise HTTPException(status_code=404, detail="No registered dataset configuration found to process this file.")

    next_version = crud_registry.get_next_version_number(db, cast(int, ds.id))
    version = crud_registry.create_version(
        db,
        dataset_id=cast(int, ds.id),
        version_number=next_version,
        filename=filename,
        file_size=file_size,
        uploader_id=cast(UUID, current_user.id)
    )

    crud_log.create_audit_log(
        db,
        user_id=cast(UUID, current_user.id),
        action="DYNAMIC_UPLOAD",
        resource="REGISTRY",
        details=f"Uploaded {filename} to dynamic dataset '{ds.name}' (detected={not dataset_id and not dataset_name})"
    )

    # Schedule background processing
    def _background_ingest() -> None:
        bg_db = SessionLocal()
        try:
            bg_dataset = crud_registry.get_dataset_by_id(bg_db, cast(int, ds.id))
            bg_version = crud_registry.get_version_by_id(bg_db, cast(int, version.id))
            if bg_dataset and bg_version:
                crud_registry.process_registry_upload(
                    bg_db,
                    dataset=bg_dataset,
                    version=bg_version,
                    file_bytes=file_bytes,
                    filename=filename
                )
        finally:
            bg_db.close()

    background_tasks.add_task(_background_ingest)

    return RegistryUploadResponse(
        message=f"File '{filename}' accepted. Processing dynamically under dataset '{ds.display_name}'.",
        dataset_id=cast(int, ds.id),
        dataset_name=cast(str, ds.name),
        version_id=cast(int, version.id),
        version_number=next_version,
        status="pending"
    )


@router.get("/metadata")
def get_metadata(
    dataset_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Retrieve global or dataset-specific metadata (distinct categories and range bounds)."""
    if not dataset_id:
        first_ds = db.query(DatasetRegistry).filter(DatasetRegistry.is_active == True).first()
        if not first_ds:
            return {"wells": [], "sample_types": [], "filter_options": {}, "filter_ranges": {}}
        dataset_id = cast(int, first_ds.id)
        
    ds = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Redirect to Production Oil Lab database (DL_GAS_CHROMATOGRAPHY_) if connected/populated for CSIA Isotope
    if ds.name == "csia_isotope":
        try:
            prod_count = db.execute(text("SELECT count(*) FROM DL_GAS_CHROMATOGRAPHY_ WHERE nc15 IS NOT NULL OR nc16 IS NOT NULL OR nc17 IS NOT NULL OR nc18 IS NOT NULL")).scalar() or 0
            if prod_count > 0:
                gc_dataset = db.query(DatasetRegistry).filter(DatasetRegistry.name == "gas_chromatography").first()
                if gc_dataset:
                    ds = gc_dataset
                    dataset_id = cast(int, gc_dataset.id)
        except Exception:
            pass
        
    # Get all filterable variables
    variables = db.query(VariableRegistry).filter(
        VariableRegistry.dataset_id == dataset_id,
        VariableRegistry.is_filterable == True
    ).all()
    
    filter_options = {}
    filter_ranges = {}
    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
    for var in variables:
        col = var.sql_column_name
        col_ref = f'"{col.upper()}"' if is_oracle else f'"{col}"'
        try:
            t_name = "DL_BIOMARKER_STERANE_VW" if ds.sql_table_name.upper() == "DL_BIOMARKER_STERANE_" else ("DL_BIOMARKER_HOPANE_VW" if ds.sql_table_name.upper() == "DL_BIOMARKER_HOPANE_" else ("DL_BIOMARKER_AROMATIC_VW" if ds.sql_table_name.upper() == "DL_BIOMARKER_AROMATIC_" else ("DL_BIOMARKER_PR_PH_VW" if ds.sql_table_name.upper() == "DL_BIOMARKER_PR_PH_" else ds.sql_table_name)))
            if var.is_numeric:
                res = db.execute(text(f'SELECT MIN({col_ref}), MAX({col_ref}) FROM {t_name}'))
                row_val = res.fetchone()
                min_v, max_v = row_val if row_val else (None, None)
                filter_ranges[col] = {
                    "min": float(min_v) if min_v is not None else 0.0,
                    "max": float(max_v) if max_v is not None else 100.0
                }
            else:
                res = db.execute(text(f'SELECT DISTINCT {col_ref} FROM {t_name} WHERE {col_ref} IS NOT NULL'))
                vals = [str(r[0]).strip() for r in res.fetchall() if r[0]]
                filter_options[col] = sorted(list(set(vals)))
        except Exception as e:
            logger.warning(f"Metadata lookup note for column {col}: {e}")
            if var.is_numeric:
                filter_ranges[col] = {"min": 0.0, "max": 100.0}
            else:
                filter_options[col] = []
            
    # For backward compatibility, also return 'wells' and 'sample_types'
    # 'wells' maps to primary_well_column
    wells = filter_options.get(ds.primary_well_column or "well_name", [])
    if not wells and "well_name" in filter_options:
        wells = filter_options["well_name"]
    elif not wells and "borehole_name" in filter_options:
        wells = filter_options["borehole_name"]
        
    # 'sample_types' maps to 'sample_type' or 'lithology'
    sample_types = []
    for var in variables:
        if not var.is_numeric and var.sql_column_name.lower() in ["sample_type", "lithology"]:
            sample_types = filter_options.get(var.sql_column_name, [])
            break
            
    return {
        "wells": wells,
        "sample_types": sample_types,
        "filter_options": filter_options,
        "filter_ranges": filter_ranges
    }


from fastapi import Request
from app.api.v1.endpoints.dashboard import build_where_clause

@router.get("/datasets/{dataset_id}/records")
def get_dynamic_records(
    dataset_id: int,
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=1000),
    sort_by: Optional[str] = Query(None),
    sort_desc: bool = Query(False),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Retrieve paginated, filterable, sortable, and searchable records for any registered dataset.
    Automatically queries custom database tables or generic records tables.
    """
    import time
    start_time = time.time()
    
    dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset configuration not found.")

    is_custom = dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records"
    table_name = dataset.sql_table_name if is_custom else "generic_dataset_records"
    if table_name and table_name.upper() == "DL_BIOMARKER_STERANE_":
        table_name = "DL_BIOMARKER_STERANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_HOPANE_":
        table_name = "DL_BIOMARKER_HOPANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_AROMATIC_":
        table_name = "DL_BIOMARKER_AROMATIC_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_PR_PH_":
        table_name = "DL_BIOMARKER_PR_PH_VW"

    # Load variables and compile mapping
    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id).all()
    var_map = {cast(str, v.sql_column_name): v for v in variables}

    # Redirect to Production Oil Lab database (DL_GAS_CHROMATOGRAPHY_) if connected/populated for CSIA Isotope
    if dataset.name == "csia_isotope":
        try:
            prod_count = db.execute(text("SELECT count(*) FROM DL_GAS_CHROMATOGRAPHY_ WHERE nc15 IS NOT NULL OR nc16 IS NOT NULL OR nc17 IS NOT NULL OR nc18 IS NOT NULL")).scalar() or 0
            if prod_count > 0:
                gc_dataset = db.query(DatasetRegistry).filter(DatasetRegistry.name == "gas_chromatography").first()
                if gc_dataset:
                    table_name = gc_dataset.sql_table_name or "DL_GAS_CHROMATOGRAPHY_"
                    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == gc_dataset.id).all()
                    var_map = {cast(str, v.sql_column_name): v for v in variables}
                    dataset = gc_dataset
                    dataset_id = cast(int, gc_dataset.id)
        except Exception as e:
            logger.warning(f"Failed to check production GC database: {str(e)}")

    # Fetch active version (only constraint for generic datasets)
    active_version = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id,
        DatasetVersion.is_active == True
    ).first()
    active_version_id = cast(Optional[int], active_version.id) if active_version else None
    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"

    # Build dynamic WHERE filter
    q_params = dict(request.query_params)
    where_str, params = build_where_clause(
        dataset, var_map, q_params, active_version_id
    )

    # Search filter logic
    if search:
        search_clauses = []
        for v in variables:
            if not v.is_numeric:
                col = v.sql_column_name
                col_ref = f'"{col.upper()}"' if is_oracle else f'"{col}"'
                if is_custom:
                    if is_oracle:
                        search_clauses.append(f"UPPER(TO_CHAR({col_ref})) LIKE :search_str")
                    else:
                        search_clauses.append(f'CAST({col_ref} AS TEXT) ILIKE :search_str')
                else:
                    search_clauses.append(f"data->>'{col}' ILIKE :search_str")
        if search_clauses:
            where_str = f"({where_str}) AND ({' OR '.join(search_clauses)})"
            params["search_str"] = f"%{search.upper() if is_oracle else search}%"

    # Sorting logic
    order_clause = ""
    if sort_by and (sort_by in var_map or sort_by == "id"):
        direction = "DESC" if sort_desc else "ASC"
        if sort_by == "id":
            order_clause = f" ORDER BY id {direction}"
        else:
            col = var_map[sort_by].sql_column_name
            col_ref = f'"{col.upper()}"' if is_oracle else f'"{col}"'
            if is_custom:
                order_clause = f' ORDER BY {col_ref} {direction}'
            else:
                if var_map[sort_by].is_numeric:
                    order_clause = f" ORDER BY CAST(data->>'{col}' AS DOUBLE PRECISION) {direction}"
                else:
                    order_clause = f" ORDER BY data->>'{col}' {direction}"
    else:
        order_clause = f" ORDER BY {'ID' if is_oracle else 'id'} ASC"

    # Query total records count matching filters
    count_query = f"SELECT COUNT(*) FROM {table_name} WHERE {where_str}"
    total = db.execute(text(count_query), params).scalar() or 0

    # Pagination clause based on DB Provider
    if is_oracle:
        pagination_clause = f" OFFSET {skip} ROWS FETCH NEXT {limit} ROWS ONLY"
    else:
        pagination_clause = f" LIMIT {limit} OFFSET {skip}"

    # Query items
    if is_custom:
        cols_to_select = [f'"{v.sql_column_name.upper()}"' if is_oracle else f'"{v.sql_column_name}"' for v in variables]
        id_col = "ID" if is_oracle else "id"
        if id_col.lower() not in [v.sql_column_name.lower() for v in variables]:
            cols_to_select.insert(0, id_col)
        query_str = f"SELECT {', '.join(cols_to_select)} FROM {table_name} WHERE {where_str}{order_clause}{pagination_clause}"
    else:
        query_str = f"SELECT id, data FROM {table_name} WHERE {where_str}{order_clause}{pagination_clause}"

    rows = db.execute(text(query_str), params).fetchall()
    
    items = []
    for r in rows:
        row_dict = r._asdict()
        if is_custom:
            norm_dict = {}
            for k, val in row_dict.items():
                norm_dict[k] = val
                norm_dict[k.lower()] = val
            items.append(norm_dict)
        else:
            item_data = row_dict.get("data") or row_dict.get("DATA") or {}
            item_data["id"] = row_dict.get("id") or row_dict.get("ID")
            items.append(item_data)

    # Audit Logging
    execution_time = time.time() - start_time
    crud_log.create_audit_log(
        db,
        user_id=cast(UUID, current_user.id),
        action="QUERY_RECORDS",
        resource="REGISTRY",
        details=f"Queried {len(items)} records from dataset '{dataset.name}' (limit={limit}, offset={skip}, SQL={query_str})."
    )

    return {"total": total, "items": items}
