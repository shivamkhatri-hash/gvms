from typing import Any, Optional, List, Dict, cast
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.deps import get_db, get_current_user
from app.crud.crud_log import crud_log
from app.models.user import User
from app.models.registry import DatasetRegistry, DatasetVersion, VariableRegistry
from app.services.report_generator import ReportGenerator

router = APIRouter()


@router.get("")
def download_report(
    dataset_id: int = Query(..., description="Target Dataset ID"),
    format: str = Query("pdf", description="Report format: pdf, excel, or csv"),
    well_name: Optional[str] = Query(None),
    sample_type: Optional[str] = Query(None),
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    include_graphs: Optional[str] = Query(None, description="Comma-separated graph types to include in PDF"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Generate & download professional dynamic reports in PDF, Excel, or CSV formats
    tailored to any registered dataset variables.
    """
    # 1. Resolve Dataset Configuration
    dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset configuration not found.")

    # 2. Load Registry Variables
    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id).all()
    var_map = {v.sql_column_name: v for v in variables}

    # 3. Build dynamic WHERE filter
    is_custom = dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records"
    table_name = dataset.sql_table_name if is_custom else "generic_dataset_records"
    
    # Redirect tables to views if matching view exists
    TABLE_TO_VIEW_MAP = {
        "DL_GAS_CHROMATOGRAPHY_": "DL_GAS_CHROMATOGRAPHY_VW",
        "DL_GCH_OIL_COMPOSITION_": "DL_GCH_OIL_COMPOSITION_VW",
        "DL_BIOMARKER_STERANE_": "DL_BIOMARKER_STERANE_VW",
        "DL_BIOMARKER_HOPANE_": "DL_BIOMARKER_HOPANE_VW",
        "DL_TRICYCLIC_TERPANE_": "DL_BIOM_TRICYCLIC_TERP_VW",
        "DL_BIOMARKER_AROMATIC_": "DL_BIOMARKER_AROMATIC_VW",
        "DL_BIOMARKER_PR_PH_": "DL_BIOMARKER_PR_PH_VW",
        "DL_ISOTOPE_GAS_": "DL_ISOTOPE_GAS_VW",
        "DL_ISOTOPE_OIL": "DL_ISOTOPE_OIL_VW",
        "DL_ISOTOPE_CSIA": "DL_ISOTOPE_CSIA_VW"
    }
    if table_name and table_name.upper() in TABLE_TO_VIEW_MAP:
        table_name = TABLE_TO_VIEW_MAP[table_name.upper()]

    active_version = None
    if is_custom:
        where_clauses = ["1=1"]  # Query directly from official table or view
    else:
        active_version = db.query(DatasetVersion).filter(
            DatasetVersion.dataset_id == dataset_id,
            DatasetVersion.is_active == True
        ).first()
        if not active_version:
            raise HTTPException(status_code=400, detail="No active version exists for this dataset.")
        where_clauses = [f"dataset_id = {dataset.id}", f"version_id = {active_version.id}"]

    params = {}

    if well_name and well_name != "ALL":
        col = dataset.primary_well_column or "well_name"
        if is_custom:
            where_clauses.append(f'"{col}" = :well_name')
        else:
            where_clauses.append(f"data->>'{col}' = :well_name")
        params["well_name"] = well_name

    if sample_type and sample_type != "ALL":
        # Find which column in this dataset represents lithology or sample type (case-insensitive)
        col = None
        for v in variables:
            if v.sql_column_name.lower() in ["sample_type", "lithology"]:
                col = v.sql_column_name
                break
        if not col:
            col = "LITHOLOGY" if dataset.name == "core_source_rock" else "sample_type"

        if is_custom:
            where_clauses.append(f'"{col}" = :sample_type')
        else:
            where_clauses.append(f"data->>'{col}' = :sample_type")
        params["sample_type"] = sample_type

    depth_col = dataset.primary_depth_column or "depth_from"
    if depth_min is not None:
        if is_custom:
            where_clauses.append(f'"{depth_col}" >= :depth_min')
        else:
            where_clauses.append(f"CAST(data->>'{depth_col}' AS DOUBLE PRECISION) >= :depth_min")
        params["depth_min"] = depth_min

    if depth_max is not None:
        if is_custom:
            where_clauses.append(f'"{depth_col}" <= :depth_max')
        else:
            where_clauses.append(f"CAST(data->>'{depth_col}' AS DOUBLE PRECISION) <= :depth_max")
        params["depth_max"] = depth_max

    where_str = " AND ".join(where_clauses)

    # 4. Fetch flat record structures
    if is_custom:
        cols_str = ", ".join([f'"{v.sql_column_name}"' for v in variables])
        query = f"SELECT id, {cols_str} FROM {table_name} WHERE {where_str}"
    else:
        query = f"SELECT id, data FROM {table_name} WHERE {where_str}"

    rows = db.execute(text(query), params).fetchall()
    records = []
    
    for r in rows:
        row_dict = r._asdict()
        if is_custom:
            records.append(row_dict)
        else:
            record_data = row_dict["data"] or {}
            record_data["id"] = row_dict["id"]
            records.append(record_data)

    # 5. Audit Logging
    crud_log.create_audit_log(
        db,
        user_id=cast(UUID, current_user.id),
        action="GENERATE_REPORT",
        resource="REPORTS",
        details=f"Generated dynamic {format.upper()} report for '{dataset.display_name}' containing {len(records)} records."
    )

    filename_base = f"GVMS_{dataset.name}_Report"

    # 6. Stream file bytes based on format
    if format == "csv":
        data_bytes = ReportGenerator.generate_csv(variables, records)
        return Response(
            content=data_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.csv"}
        )
    elif format == "excel":
        data_bytes = ReportGenerator.generate_excel(variables, records, sheet_name=cast(str, dataset.display_name))
        return Response(
            content=data_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.xlsx"}
        )
    else:  # pdf
        selected_graphs = []
        ds_graphs = cast(List[Dict[str, Any]], dataset.graph_config) or []
        if include_graphs:
            graph_types = [g.strip() for g in include_graphs.split(",") if g.strip()]
            for g in ds_graphs:
                if g.get("type") in graph_types:
                    selected_graphs.append(g)
        else:
            selected_graphs = ds_graphs

        data_bytes = ReportGenerator.generate_pdf(cast(str, dataset.display_name), variables, records, selected_graphs)
        return Response(
            content=data_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.pdf"}
        )
