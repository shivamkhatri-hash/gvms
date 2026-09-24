from typing import Any, Optional, List, Dict, cast
from uuid import UUID
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.deps import get_db, get_current_user
from app.crud.crud_log import crud_log
from app.models.user import User
from app.models.registry import DatasetRegistry, DatasetVersion, VariableRegistry
from app.services.report_generator import ReportGenerator
from app.api.v1.endpoints.dashboard import build_where_clause

router = APIRouter()


class SnapshotItem(BaseModel):
    title: str
    image_base64: str


class ExportPdfRequest(BaseModel):
    dataset_id: int
    well_name: Optional[str] = None
    sample_type: Optional[str] = None
    depth_min: Optional[float] = None
    depth_max: Optional[float] = None
    include_graphs: Optional[str] = None
    snapshots: Optional[List[SnapshotItem]] = None
    custom_filters: Optional[Dict[str, Any]] = None


@router.post("/export-pdf")
def export_pdf_with_snapshots(
    body: ExportPdfRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Generate & download high-definition PDF reports embedding direct client Plotly snapshots.
    """
    # 1. Resolve Dataset Configuration
    dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == body.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset configuration not found.")

    # 2. Load Registry Variables
    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == body.dataset_id).all()
    var_map = {v.sql_column_name: v for v in variables}

    # 3. Build dynamic WHERE filter
    is_custom = dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records"
    table_name = dataset.sql_table_name if is_custom else "generic_dataset_records"
    
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

    active_version_id = None
    if not is_custom:
        active_version = db.query(DatasetVersion).filter(
            DatasetVersion.dataset_id == body.dataset_id,
            DatasetVersion.is_active == True
        ).first()
        if not active_version:
            raise HTTPException(status_code=400, detail="No active version exists for this dataset.")
        active_version_id = active_version.id

    query_params: Dict[str, Any] = {}
    if body.custom_filters:
        query_params.update(body.custom_filters)
    if body.well_name:
        query_params["well_name"] = body.well_name
    if body.sample_type:
        query_params["sample_type"] = body.sample_type
    if body.depth_min is not None:
        query_params["depth_min"] = body.depth_min
    if body.depth_max is not None:
        query_params["depth_max"] = body.depth_max

    where_clauses, params = build_where_clause(
        dataset=dataset,
        var_map=var_map,
        query_params=query_params,
        active_version_id=active_version_id
    )

    where_str = " AND ".join(where_clauses) if where_clauses else "1=1"

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

    crud_log.create_audit_log(
        db,
        user_id=cast(UUID, current_user.id),
        action="GENERATE_REPORT_SNAPSHOT",
        resource="REPORTS",
        details=f"Generated snapshot PDF report for '{dataset.display_name}' containing {len(records)} records and {len(body.snapshots or [])} direct plot snapshots."
    )

    filename_base = f"GVMS_{dataset.name}_Report"
    snapshots_list = [s.model_dump() if hasattr(s, "model_dump") else s.dict() for s in body.snapshots] if body.snapshots else None

    data_bytes = ReportGenerator.generate_pdf(
        dataset_display_name=cast(str, dataset.display_name),
        variables=variables,
        records=records,
        selected_graphs=None,
        snapshots=snapshots_list
    )

    return Response(
        content=data_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename_base}.pdf"}
    )


@router.get("")
def download_report(
    request: Request,
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
    tailored to any registered dataset variables with full multi-select filter support
    and high-precision embedded graph snapshots.
    """
    # 1. Resolve Dataset Configuration
    dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset configuration not found.")

    # 2. Load Registry Variables
    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id).all()
    var_map = {v.sql_column_name: v for v in variables}

    # 3. Build dynamic WHERE filter using unified builder supporting multi-select
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

    active_version_id = None
    if not is_custom:
        active_version = db.query(DatasetVersion).filter(
            DatasetVersion.dataset_id == dataset_id,
            DatasetVersion.is_active == True
        ).first()
        if not active_version:
            raise HTTPException(status_code=400, detail="No active version exists for this dataset.")
        active_version_id = active_version.id

    # Gather query params from request
    query_params = dict(request.query_params)
    if well_name:
        query_params["well_name"] = well_name
    if sample_type:
        query_params["sample_type"] = sample_type
    if depth_min is not None:
        query_params["depth_min"] = depth_min
    if depth_max is not None:
        query_params["depth_max"] = depth_max

    where_clauses, params = build_where_clause(
        dataset=dataset,
        var_map=var_map,
        query_params=query_params,
        active_version_id=active_version_id
    )

    where_str = " AND ".join(where_clauses) if where_clauses else "1=1"

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
        
        # If no explicit graph_config stored in dataset, construct default lab-specific graphs
        if not ds_graphs:
            ds_name = dataset.name.lower()
            if "hopane" in ds_name:
                ds_graphs = [
                    {"type": "oleanane_vs_bicadinane", "x_axis": "oleanane_index", "y_axis": "bcd_index", "title": "Oleanane vs Bicadinane Index Crossplot"},
                    {"type": "diahopane_vs_bnh", "x_axis": "diahopane_index", "y_axis": "bnh_index", "title": "Diahopane vs Bisnorhopane Index Crossplot"},
                    {"type": "c29ts_vs_oleanane", "x_axis": "oleanane_index", "y_axis": "c29ts_by_c29h_plus_c29ts", "title": "C29Ts/(C29H+C29Ts) vs Oleanane Index Crossplot"},
                    {"type": "hopane_depth_profiles", "x_axis": "c31h_s_by_s_plus_r", "y_axis": "depth_top", "title": "C31 Homohopane 22S/(22S+22R) Depth Profile"}
                ]
            elif "sterane" in ds_name:
                ds_graphs = [
                    {"type": "sterane_c29_maturity", "x_axis": "c29_s_by_s_plus_r", "y_axis": "c29_bb_by_aa_plus_bb", "title": "Sterane C29 20S/(20S+20R) vs ββ/(αα+ββ) Maturity Plot"},
                    {"type": "sterane_crossplot", "x_axis": "c27r_by_c27r_plus_c29r", "y_axis": "c29_s_by_s_plus_r", "title": "C27R/(C27R+C29R) Sterane Crossplot"},
                    {"type": "sterane_diast_c27_c29", "x_axis": "c27_diast_by_c29_diast", "y_axis": "depth_top", "title": "C27/C29 Diasterane Ratio vs Depth"}
                ]
            elif "aromatic" in ds_name:
                ds_graphs = [
                    {"type": "aromatic_vrc_depth", "x_axis": "vrc", "y_axis": "depth", "title": "Calculated Vitrinite Reflectance (%VRo) vs Depth"},
                    {"type": "aromatic_mpi_depth", "x_axis": "mpi", "y_axis": "depth", "title": "Methylphenanthrene Index (MPI-1) vs Depth"},
                    {"type": "aromatic_dbt_phe_vs_pr_ph", "x_axis": "dbt_by_phe", "y_axis": "pr_by_ph", "title": "DBT/PHE vs Pr/Ph Crossplot"}
                ]
            elif "pr_ph" in ds_name or "pristane" in ds_name:
                ds_graphs = [
                    {"type": "pr_nc17_vs_ph_nc18", "x_axis": "phytane_by_nc18", "y_axis": "pristane_by_nc17", "title": "Pristane/nC17 vs Phytane/nC18 Depositional Environment Crossplot"},
                    {"type": "pr_ph_profile", "x_axis": "pr_by_ph", "y_axis": "depth", "title": "Pr/Ph Ratio Subsurface Depth Profile"}
                ]
            elif "tricyclic" in ds_name:
                ds_graphs = [
                    {"type": "tricyclic_crossplot", "x_axis": "c23_by_c21", "y_axis": "c24_by_c23", "title": "C23/C21 vs C24/C23 Tricyclic Terpane Crossplot"},
                    {"type": "etr_depth_profile", "x_axis": "etr", "y_axis": "depth", "title": "Extended Tricyclic Ratio (ETR) vs Depth"}
                ]
            elif "gas_isotope" in ds_name or "isotope" in ds_name:
                ds_graphs = [
                    {"type": "sofer_plot", "x_axis": "delta_c13_saturates", "y_axis": "delta_c13_aromatics", "title": "Sofer Isotopic δ13C Saturates vs Aromatics Plot"},
                    {"type": "bernard_diagram", "x_axis": "c1_by_c2_plus_c3", "y_axis": "delta_c1", "title": "Bernard Natural Gas Genetic Classification Diagram"},
                    {"type": "csia_profile", "x_axis": "carbon_number", "y_axis": "delta_c13", "title": "Compound Specific Isotope Analysis (CSIA) δ13C Profile"}
                ]
            elif "oil" in ds_name:
                ds_graphs = [
                    {"type": "api_vs_depth", "x_axis": "api", "y_axis": "depth", "title": "Crude Oil API Gravity vs Depth Profile"},
                    {"type": "oleanane_vs_bicadinane", "x_axis": "oleanane_index", "y_axis": "bcd_index", "title": "Oleanane vs Bicadinane Biomarker Crossplot"}
                ]
            elif "source_rock" in ds_name or "core" in ds_name or "geochem" in ds_name:
                ds_graphs = [
                    {"type": "s2_vs_toc", "x_axis": "toc", "y_axis": "s2", "title": "Pyrolysis S2 vs Total Organic Carbon (TOC) Crossplot"},
                    {"type": "hi_vs_tmax", "x_axis": "tmax", "y_axis": "hi", "title": "Modified Van Krevelen HI vs Tmax Maturity Diagram"},
                    {"type": "depth_profile", "x_axis": "toc", "y_axis": "depth_from", "title": "TOC Source Rock Richness vs Depth Profile"}
                ]

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
