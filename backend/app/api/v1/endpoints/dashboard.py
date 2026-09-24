# pyright: reportMissingTypeStubs=false
import time
import logging
from typing import Any, Optional, List, Dict, cast
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from jose import jwt
import pandas as pd

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.registry import DatasetRegistry, DatasetVersion, VariableRegistry
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
_TABLE_COLUMNS_CACHE = {}

def map_column_case_insensitively(col_name: str, db_columns: set) -> str:
    if not col_name or not db_columns:
        return col_name
    if col_name in db_columns:
        return col_name
    col_lower = col_name.lower()
    for db_col in db_columns:
        if db_col.lower() == col_lower:
            return db_col
    col_clean = col_lower.replace("_", "")
    for db_col in db_columns:
        if db_col.lower().replace("_", "") == col_clean:
            return db_col
    return col_name



def build_where_clause(
    dataset: DatasetRegistry,
    var_map: Dict[str, VariableRegistry],
    query_params: Dict[str, Any],
    active_version_id: Optional[int] = None
) -> tuple:
    """Builds parameterized WHERE clauses and parameters mapping dynamically from query params."""
    is_custom = dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records"
    
    where_clauses = []
    if not is_custom:
        where_clauses.append(f"dataset_id = {dataset.id}")
        if active_version_id:
            where_clauses.append(f"version_id = {active_version_id}")
            
    params = {}

    # Process all query parameters
    for key, val in query_params.items():
        if not isinstance(val, (str, int, float, list, tuple)):
            continue
        if key in ["dataset_id", "x_axis", "y_axis", "z_axis", "chart_type", "color_by", "well_name", "sample_type", "skip", "limit", "sort_by", "sort_desc", "search"]:
            continue
        if val is None or str(val).strip() == "" or str(val) == "ALL":
            continue

        # Check if it's a dynamic range filter (e.g. column_min or column_max)
        is_min = key.endswith("_min")
        is_max = key.endswith("_max")
        
        base_key = key[:-4] if (is_min or is_max) else key
        col_def = var_map.get(base_key)
        if not col_def:
            # Try case-insensitive lookup
            for k, v in var_map.items():
                if k.lower() == base_key.lower():
                    col_def = v
                    break

        if col_def:
            col = col_def.sql_column_name
            is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
            col_ref = f'"{col.upper()}"' if is_oracle else f'"{col}"'
            if is_min or is_max:
                try:
                    val_float = float(val)
                    op = ">=" if is_min else "<="
                    param_name = f"{base_key}_min_val" if is_min else f"{base_key}_max_val"
                    if is_custom:
                        col_expr = f"TO_NUMBER({col_ref} DEFAULT NULL ON CONVERSION ERROR)" if is_oracle else col_ref
                        where_clauses.append(f'{col_expr} {op} :{param_name}')
                    else:
                        where_clauses.append(f"CAST(data->>'{col}' AS DOUBLE PRECISION) {op} :{param_name}")
                    params[param_name] = val_float
                except (ValueError, TypeError):
                    pass
            else:
                # Categorical column filter
                # Multi-select (comma separated string or list/tuple)
                if isinstance(val, (list, tuple)) or (isinstance(val, str) and "," in val):
                    if isinstance(val, str):
                        vals_list = [v.strip() for v in val.split(",") if v.strip()]
                    else:
                        vals_list = [str(v).strip() for v in val if str(v).strip()]
                    if vals_list:
                        bind_names = []
                        for i, item in enumerate(vals_list):
                            b_name = f"{key}_{i}"
                            bind_names.append(f":{b_name}")
                            params[b_name] = item
                        in_clause = ", ".join(bind_names)
                        if is_custom:
                            where_clauses.append(f'{col_ref} IN ({in_clause})')
                        else:
                            where_clauses.append(f"data->>'{col}' IN ({in_clause})")
                else:
                    if is_custom:
                        where_clauses.append(f'{col_ref} = :{key}')
                    else:
                        where_clauses.append(f"data->>'{col}' = :{key}")
                    params[key] = str(val)

    # Backward compatibility fallback for explicit parameters: well_name and sample_type
    well_val = query_params.get("well_name")
    if well_val and str(well_val).strip() and str(well_val) != "ALL" and "well_name" not in params:
        col = dataset.primary_well_column or "well_name"
        for k, v in var_map.items():
            if k.lower() in ["well_name", "borehole_name", "name", "ubhi"]:
                col = v.sql_column_name
                break
        col_ref = f'"{col.upper()}"' if settings.DATABASE_PROVIDER.lower() == "oracle" else f'"{col}"'
        if isinstance(well_val, str) and "," in well_val:
            w_list = [w.strip() for w in well_val.split(",") if w.strip()]
            b_names = []
            for i, w in enumerate(w_list):
                b_name = f"well_fb_{i}"
                b_names.append(f":{b_name}")
                params[b_name] = w
            if is_custom:
                where_clauses.append(f'{col_ref} IN ({", ".join(b_names)})')
            else:
                where_clauses.append(f"data->>'{col}' IN ({", ".join(b_names)})")
        else:
            if is_custom:
                where_clauses.append(f'{col_ref} = :well_name')
            else:
                where_clauses.append(f"data->>'{col}' = :well_name")
            params["well_name"] = str(well_val).strip()

    st_val = query_params.get("sample_type")
    if st_val and str(st_val).strip() and str(st_val) != "ALL" and "sample_type" not in params:
        col = "sample_type"
        for v in var_map.values():
            if not v.is_numeric and v.sql_column_name.lower() in ["sample_type", "lithology"]:
                col = v.sql_column_name
                break
        col_ref = f'"{col.upper()}"' if settings.DATABASE_PROVIDER.lower() == "oracle" else f'"{col}"'
        if isinstance(st_val, str) and "," in st_val:
            s_list = [s.strip() for s in st_val.split(",") if s.strip()]
            b_names = []
            for i, s in enumerate(s_list):
                b_name = f"st_fb_{i}"
                b_names.append(f":{b_name}")
                params[b_name] = s
            if is_custom:
                where_clauses.append(f'{col_ref} IN ({", ".join(b_names)})')
            else:
                where_clauses.append(f"data->>'{col}' IN ({", ".join(b_names)})")
        else:
            if is_custom:
                where_clauses.append(f'{col_ref} = :sample_type')
            else:
                where_clauses.append(f"data->>'{col}' = :sample_type")
            params["sample_type"] = str(st_val).strip()


    # Backward compatibility fallback for explicit depth_min and depth_max
    depth_col = dataset.primary_depth_column or "depth_from"
    for k, v in var_map.items():
        if k.lower() in ["depth_from", "top_depth", "sample_top", "depth"]:
            depth_col = v.sql_column_name
            break
            
    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
    depth_col_ref = f'"{depth_col.upper()}"' if is_oracle else f'"{depth_col}"'
    depth_num_expr = f"TO_NUMBER({depth_col_ref} DEFAULT NULL ON CONVERSION ERROR)" if is_oracle else depth_col_ref
    depth_min = query_params.get("depth_min")
    if depth_min is not None and str(depth_min).strip() != "" and "depth_min" not in params:
        try:
            float_min = float(depth_min)
            if is_custom:
                where_clauses.append(f'{depth_num_expr} >= :depth_min')
            else:
                where_clauses.append(f"CAST(data->>'{depth_col}' AS DOUBLE PRECISION) >= :depth_min")
            params["depth_min"] = float_min
        except (ValueError, TypeError):
            pass
            
    depth_max = query_params.get("depth_max")
    if depth_max is not None and str(depth_max).strip() != "" and "depth_max" not in params:
        try:
            float_max = float(depth_max)
            if is_custom:
                where_clauses.append(f'{depth_num_expr} <= :depth_max')
            else:
                where_clauses.append(f"CAST(data->>'{depth_col}' AS DOUBLE PRECISION) <= :depth_max")
            params["depth_max"] = float_max
        except (ValueError, TypeError):
            pass

    if not where_clauses:
        return "1=1", params
    return " AND ".join(where_clauses), params
 
 
@router.get("")
def get_dashboard_summary(
    request: Request,
    dataset_id: Optional[int] = Query(None),
    well_name: Optional[str] = Query(None),
    sample_type: Optional[str] = Query(None),
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Get aggregated dashboard summary, dynamic KPI statistics, classifications distributions,
    and a dynamic well-wise summary based on the selected dataset configuration.
    """
    start_time = time.time()
    # 1. Resolve Dataset Registry
    if not dataset_id:
        first_ds = db.query(DatasetRegistry).filter(DatasetRegistry.is_active == True).first()
        if not first_ds:
            return {"kpis": [], "distributions": {}, "wells_summary": []}
        dataset_id = cast(int, first_ds.id)
 
    dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset configuration not found.")
 
    is_custom = dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records"
    table_name = cast(str, dataset.sql_table_name) if is_custom else "generic_dataset_records"
    if table_name and table_name.upper() == "DL_BIOMARKER_STERANE_":
        table_name = "DL_BIOMARKER_STERANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_HOPANE_":
        table_name = "DL_BIOMARKER_HOPANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_AROMATIC_":
        table_name = "DL_BIOMARKER_AROMATIC_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_PR_PH_":
        table_name = "DL_BIOMARKER_PR_PH_VW"
 
    # 2. Fetch Active Version (only constraint for generic datasets)
    active_version = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id,
        DatasetVersion.is_active == True
    ).first()
    if not active_version and not is_custom:
        return {
            "dataset_id": dataset_id,
            "total_samples": 0,
            "total_wells": 0,
            "kpis": [],
            "distributions": {},
            "wells_summary": []
        }
 
    active_version_id = cast(int, active_version.id) if active_version else None
 
    # 3. Load variables and compile mapping
    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id).all()
    var_map = {cast(str, v.sql_column_name): v for v in variables}
 
    # 3.5 Inspect database columns to filter out non-existent ones
    try:
        from sqlalchemy import inspect
        bind = db.get_bind()
        inspector = inspect(bind)
        try:
            columns_meta = inspector.get_columns(table_name)
        except Exception:
            columns_meta = inspector.get_columns(table_name.lower())
        db_columns = {c['name'] for c in columns_meta}
    except Exception as inspect_err:
        logger.error(f"Failed to inspect SQL table columns: {str(inspect_err)}")
        db_columns = set()

    if db_columns:
        for v in variables:
            v.sql_column_name = cast(Any, map_column_case_insensitively(cast(str, v.sql_column_name), db_columns))
        var_map = {cast(str, v.sql_column_name): v for v in variables}
        if dataset.primary_well_column:
            dataset.primary_well_column = cast(Any, map_column_case_insensitively(cast(str, dataset.primary_well_column), db_columns))
        if dataset.primary_depth_column:
            dataset.primary_depth_column = cast(Any, map_column_case_insensitively(cast(str, dataset.primary_depth_column), db_columns))
 
    # Compile dynamic query params dictionary
    q_params = dict(request.query_params)
    if well_name:
        q_params["well_name"] = well_name
    if sample_type:
        q_params["sample_type"] = sample_type
    if depth_min is not None:
        q_params["depth_min"] = str(depth_min)
    if depth_max is not None:
        q_params["depth_max"] = str(depth_max)

    # 4. Resolve dynamic WHERE conditions
    where_str, params = build_where_clause(
        dataset, var_map, q_params, active_version_id
    )
 
    # 5. Build dynamic KPI select fields
    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
    kpi_vars = [v for v in variables if v.kpi_enabled]
    select_fields = []
    
    for v in kpi_vars:
        col = v.sql_column_name
        col_ref = f'"{col.upper()}"' if is_oracle else f'"{col}"'
        if db_columns and col not in db_columns and col.upper() not in db_columns and col.lower() not in {c.lower() for c in db_columns}:
            continue
        if v.is_numeric:
            if is_custom:
                num_expr = f'TO_NUMBER({col_ref} DEFAULT NULL ON CONVERSION ERROR)' if is_oracle else col_ref
                select_fields.append(f'AVG({num_expr}) AS "avg_{col.lower()}"')
                select_fields.append(f'MIN({num_expr}) AS "min_{col.lower()}"')
                select_fields.append(f'MAX({num_expr}) AS "max_{col.lower()}"')
                select_fields.append(f'STDDEV({num_expr}) AS "stddev_{col.lower()}"')
                select_fields.append(f'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY {num_expr}) AS "median_{col.lower()}"')
            else:
                select_fields.append(f"AVG(CAST(data->>'{col}' AS DOUBLE PRECISION)) AS \"avg_{col.lower()}\"")
                select_fields.append(f"MIN(CAST(data->>'{col}' AS DOUBLE PRECISION)) AS \"min_{col.lower()}\"")
                select_fields.append(f"MAX(CAST(data->>'{col}' AS DOUBLE PRECISION)) AS \"max_{col.lower()}\"")
                select_fields.append(f"STDDEV(CAST(data->>'{col}' AS DOUBLE PRECISION)) AS \"stddev_{col.lower()}\"")
                select_fields.append(f"PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CAST(data->>'{col}' AS DOUBLE PRECISION)) AS \"median_{col.lower()}\"")
        else:
            if is_custom:
                select_fields.append(f'COUNT(DISTINCT {col_ref}) AS "distinct_{col.lower()}"')
            else:
                select_fields.append(f"COUNT(DISTINCT data->>'{col}') AS \"distinct_{col.lower()}\"")

    select_fields.append('COUNT(*) AS "total_samples"')

    # 6. Execute KPI aggregations
    kpi_query = f"SELECT {', '.join(select_fields)} FROM {table_name} WHERE {where_str}"
    kpi_result = db.execute(text(kpi_query), params).fetchone()
    result_dict = {k.lower(): v for k, v in (kpi_result._asdict() if kpi_result else {}).items()}

    # Compile KPI lists
    kpis_list = []
    for v in kpi_vars:
        col = v.sql_column_name
        col_key = col.lower()
        if db_columns and col not in db_columns and col.upper() not in db_columns and col.lower() not in {c.lower() for c in db_columns}:
            continue
        if v.is_numeric:
            kpis_list.append({
                "name": v.name,
                "display_name": v.display_name,
                "display_unit": v.display_unit,
                "is_numeric": True,
                "avg": float(result_dict.get(f"avg_{col_key}") or 0.0) if result_dict.get(f"avg_{col_key}") is not None else None,
                "min": float(result_dict.get(f"min_{col_key}") or 0.0) if result_dict.get(f"min_{col_key}") is not None else None,
                "max": float(result_dict.get(f"max_{col_key}") or 0.0) if result_dict.get(f"max_{col_key}") is not None else None,
                "median": float(result_dict.get(f"median_{col_key}") or 0.0) if result_dict.get(f"median_{col_key}") is not None else None,
                "stddev": float(result_dict.get(f"stddev_{col_key}") or 0.0) if result_dict.get(f"stddev_{col_key}") is not None else None,
            })
        else:
            kpis_list.append({
                "name": v.name,
                "display_name": v.display_name,
                "is_numeric": False,
                "distinct_count": result_dict.get(f"distinct_{col_key}") or 0
            })

    # 7. Compute Total Wells explicitly if primary well column exists
    total_wells = 0
    if dataset.primary_well_column:
        well_col = dataset.primary_well_column
        well_col_ref = f'"{well_col.upper()}"' if is_oracle else f'"{well_col}"'
        if is_custom:
            well_q = f"SELECT COUNT(DISTINCT {well_col_ref}) FROM {table_name} WHERE {where_str}"
        else:
            well_q = f"SELECT COUNT(DISTINCT data->>'{well_col}') FROM {table_name} WHERE {where_str}"
        total_wells = db.execute(text(well_q), params).scalar() or 0

    # 8. Compute distributions for visible non-numeric categories (classification columns, sample types)
    distributions = {}
    for v in variables:
        if not v.is_numeric and (v.sql_column_name.endswith("classification") or v.sql_column_name.lower() in ["sample_type", "lithology"]):
            col = v.sql_column_name
            col_ref = f'"{col.upper()}"' if is_oracle else f'"{col}"'
            if db_columns and col not in db_columns and col.upper() not in db_columns and col.lower() not in {c.lower() for c in db_columns}:
                continue
            if is_custom:
                dist_q = f"SELECT {col_ref}, COUNT(*) FROM {table_name} WHERE {where_str} AND {col_ref} IS NOT NULL GROUP BY {col_ref}"
            else:
                dist_q = f"SELECT data->>'{col}', COUNT(*) FROM {table_name} WHERE {where_str} AND data->>'{col}' IS NOT NULL GROUP BY data->>'{col}'"
            
            dist_res = db.execute(text(dist_q), params).fetchall()
            distributions[v.name] = {r[0]: r[1] for r in dist_res if r[0]}

    # 9. Compute dynamic well-wise summary
    wells_summary = []
    if dataset.primary_well_column:
        well_col = dataset.primary_well_column
        depth_col = dataset.primary_depth_column or "depth_from"
        well_col_ref = f'"{well_col.upper()}"' if is_oracle else f'"{well_col}"'
        depth_col_ref = f'"{depth_col.upper()}"' if is_oracle else f'"{depth_col}"'
        
        agg_fields = []
        for v in kpi_vars:
            if v.is_numeric:
                c = v.sql_column_name
                c_ref = f'"{c.upper()}"' if is_oracle else f'"{c}"'
                if db_columns and c not in db_columns and c.upper() not in db_columns and c.lower() not in {c.lower() for c in db_columns}:
                    continue
                if is_custom:
                    num_expr = f'TO_NUMBER({c_ref} DEFAULT NULL ON CONVERSION ERROR)' if is_oracle else c_ref
                    agg_fields.append(f'ROUND(AVG({num_expr}), 2) AS "avg_{c.lower()}"')
                else:
                    agg_fields.append(f"ROUND(AVG(CAST(data->>'{c}' AS DOUBLE PRECISION)), 2) AS \"avg_{c.lower()}\"")
        
        agg_str = ", " + ", ".join(agg_fields) if agg_fields else ""
        
        if is_custom:
            depth_num_expr = f'TO_NUMBER({depth_col_ref} DEFAULT NULL ON CONVERSION ERROR)' if is_oracle else depth_col_ref
            well_summary_q = f"""
                SELECT 
                    {well_col_ref} AS "well_name",
                    COUNT(*) AS "samples_count",
                    MIN({depth_num_expr}) AS "min_depth",
                    MAX({depth_num_expr}) AS "max_depth"
                    {agg_str}
                FROM {table_name}
                WHERE {where_str}
                GROUP BY {well_col_ref}
                ORDER BY {well_col_ref}
            """
        else:
            well_summary_q = f"""
                SELECT 
                    data->>'{well_col}' AS "well_name",
                    COUNT(*) AS "samples_count",
                    MIN(CAST(data->>'{depth_col}' AS DOUBLE PRECISION)) AS "min_depth",
                    MAX(CAST(data->>'{depth_col}' AS DOUBLE PRECISION)) AS "max_depth"
                    {agg_str}
                FROM {table_name}
                WHERE {where_str}
                GROUP BY data->>'{well_col}'
                ORDER BY data->>'{well_col}'
            """
            
        try:
            well_res = db.execute(text(well_summary_q), params).fetchall()
            for r in well_res:
                row_dict = {k.lower(): v for k, v in r._asdict().items()}
                metrics = {}
                for v in kpi_vars:
                    if v.is_numeric:
                        c_key = v.sql_column_name.lower()
                        if db_columns and v.sql_column_name not in db_columns and v.sql_column_name.upper() not in db_columns and c_key not in {c.lower() for c in db_columns}:
                            continue
                        val = row_dict.get(f"avg_{c_key}")
                        metrics[v.name] = float(val) if val is not None else 0.0
                
                wells_summary.append({
                    "well_name": row_dict.get("well_name") or "UNKNOWN",
                    "samples_count": row_dict.get("samples_count", 0),
                    "min_depth": float(row_dict.get("min_depth") or 0.0),
                    "max_depth": float(row_dict.get("max_depth") or 0.0),
                    "metrics": metrics
                })
        except Exception as e:
            logger.error(f"Failed to generate well-wise dynamic summary: {e}")
        except Exception as e:
            logger.error(f"Failed to generate well-wise dynamic summary: {e}")

    # 10. Print telemetry execution logs
    execution_time = time.time() - start_time
    sample_type_col = None
    for v in variables:
        if not v.is_numeric and v.sql_column_name.lower() in ["sample_type", "lithology"]:
            sample_type_col = v.sql_column_name
            break

    logger.info(
        f"[KPI SUMMARY] Selected Dataset: {dataset.name} | "
        f"SQL Table: {table_name} | "
        f"Rows Returned: {result_dict.get('total_samples') or 0} | "
        f"Variables Loaded: {[v.name for v in variables]} | "
        f"Filters Loaded: {[f for f in [dataset.primary_well_column, sample_type_col] if f]} | "
        f"SQL Query: {kpi_query} | "
        f"Execution Time: {execution_time:.4f}s"
    )

    return {
        "dataset_id": dataset_id,
        "total_samples": result_dict.get("total_samples") or 0,
        "total_wells": total_wells,
        "kpis": kpis_list,
        "distributions": distributions,
        "wells_summary": wells_summary
    }


@router.get("/chart-data")
def get_chart_data(
    request: Request,
    dataset_id: int,
    x_axis: str,
    y_axis: Optional[str] = Query(None),
    z_axis: Optional[str] = Query(None),
    chart_type: str = Query("scatter"),
    well_name: Optional[str] = Query(None),
    sample_type: Optional[str] = Query(None),
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    color_by: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Retrieve coordinates and series dynamically for Plotly interactive plots.
    Supports regular dynamic 2D/3D plots and returns calculated Pearson correlation matrices.
    """
    start_time = time.time()
    dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset registry not found.")

    is_custom = dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records"
    table_name = cast(str, dataset.sql_table_name) if is_custom else "generic_dataset_records"
    if table_name and table_name.upper() == "DL_BIOMARKER_STERANE_":
        table_name = "DL_BIOMARKER_STERANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_HOPANE_":
        table_name = "DL_BIOMARKER_HOPANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_AROMATIC_":
        table_name = "DL_BIOMARKER_AROMATIC_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_PR_PH_":
        table_name = "DL_BIOMARKER_PR_PH_VW"

    active_version = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id,
        DatasetVersion.is_active == True
    ).first()
    if not active_version and not is_custom:
        if chart_type == "correlation_matrix":
            return {"labels": [], "z": []}
        return []

    active_version_id = cast(int, active_version.id) if active_version else None

    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id).all()
    var_map = {cast(str, v.sql_column_name): v for v in variables}

    # 3.5 Inspect database columns
    try:
        from sqlalchemy import inspect
        bind = db.get_bind()
        inspector = inspect(bind)
        try:
            columns_meta = inspector.get_columns(table_name)
        except Exception:
            columns_meta = inspector.get_columns(table_name.lower())
        db_columns = {c['name'] for c in columns_meta}
    except Exception as inspect_err:
        logger.error(f"Failed to inspect SQL table columns: {str(inspect_err)}")
        db_columns = set()

    if db_columns:
        x_axis = map_column_case_insensitively(x_axis, db_columns)
        if y_axis:
            y_axis = map_column_case_insensitively(y_axis, db_columns)
        if z_axis:
            z_axis = map_column_case_insensitively(z_axis, db_columns)
        if color_by:
            color_by = map_column_case_insensitively(color_by, db_columns)

        for v in variables:
            v.sql_column_name = cast(Any, map_column_case_insensitively(cast(str, v.sql_column_name), db_columns))
        var_map = {cast(str, v.sql_column_name): v for v in variables}
        if dataset.primary_well_column:
            dataset.primary_well_column = cast(Any, map_column_case_insensitively(cast(str, dataset.primary_well_column), db_columns))
        if dataset.primary_depth_column:
            dataset.primary_depth_column = cast(Any, map_column_case_insensitively(cast(str, dataset.primary_depth_column), db_columns))

    # Verify column exists to prevent SQL Injection
    if x_axis not in var_map:
        raise HTTPException(status_code=400, detail=f"Column '{x_axis}' is not registered.")
    if y_axis and y_axis not in var_map:
        raise HTTPException(status_code=400, detail=f"Column '{y_axis}' is not registered.")
    if z_axis and z_axis not in var_map:
        raise HTTPException(status_code=400, detail=f"Column '{z_axis}' is not registered.")
    if color_by and color_by not in var_map:
        raise HTTPException(status_code=400, detail=f"Column '{color_by}' is not registered.")

    if db_columns:
        if x_axis not in db_columns:
            raise HTTPException(status_code=400, detail=f"Column '{x_axis}' does not exist in database table.")
        if y_axis and y_axis not in db_columns:
            raise HTTPException(status_code=400, detail=f"Column '{y_axis}' does not exist in database table.")
        if z_axis and z_axis not in db_columns:
            raise HTTPException(status_code=400, detail=f"Column '{z_axis}' does not exist in database table.")
        if color_by and color_by not in db_columns:
            raise HTTPException(status_code=400, detail=f"Column '{color_by}' does not exist in database table.")

    # Compile query params
    q_params = dict(request.query_params)
    if well_name:
        q_params["well_name"] = well_name
    if sample_type:
        q_params["sample_type"] = sample_type
    if depth_min is not None:
        q_params["depth_min"] = str(depth_min)
    if depth_max is not None:
        q_params["depth_max"] = str(depth_max)

    where_str, params = build_where_clause(
        dataset, var_map, q_params, active_version_id
    )

    # Handle Pearson Correlation Matrix
    if chart_type == "correlation_matrix":
        numeric_cols = [v.sql_column_name for v in variables if v.is_numeric]
        if db_columns:
            numeric_cols = [c for c in numeric_cols if c in db_columns]
        if not numeric_cols:
            return {"labels": [], "z": []}

        if is_custom:
            col_select = ", ".join([f'"{c}"' for c in numeric_cols])
            query = f"SELECT {col_select} FROM {table_name} WHERE {where_str}"
        else:
            col_select = ", ".join([f"CAST(data->>'{c}' AS DOUBLE PRECISION) AS \"{c}\"" for c in numeric_cols])
            query = f"SELECT {col_select} FROM {table_name} WHERE {where_str}"

        rows = db.execute(text(query), params).fetchall()
        df = pd.DataFrame([r._asdict() for r in rows])

        execution_time = time.time() - start_time
        logger.info(
            f"[CORRELATION MATRIX] Selected Dataset: {dataset.name} | "
            f"SQL Table: {table_name} | "
            f"Variables Loaded: {numeric_cols} | "
            f"Charts Generated: correlation_matrix | "
            f"SQL Query: {query} | "
            f"Execution Time: {execution_time:.4f}s"
        )

        if not df.empty:
            corr = df.corr().fillna(0).to_dict(orient="list")
            labels = list(corr.keys())
            z = [corr[l] for l in labels]
            return {"labels": labels, "z": z}
        return {"labels": [], "z": []}

    # Regular Coordinate plots
    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
    x_ref = f'"{x_axis.upper()}"' if is_oracle else f'"{x_axis}"'
    select_fields = [f'{x_ref} AS "x"'] if is_custom else [f"data->>'{x_axis}' AS \"x\""]
    if y_axis:
        y_ref = f'"{y_axis.upper()}"' if is_oracle else f'"{y_axis}"'
        select_fields.append(f'{y_ref} AS "y"' if is_custom else f"data->>'{y_axis}' AS \"y\"")
    if z_axis:
        z_ref = f'"{z_axis.upper()}"' if is_oracle else f'"{z_axis}"'
        select_fields.append(f'{z_ref} AS "z"' if is_custom else f"data->>'{z_axis}' AS \"z\"")
    if color_by:
        cb_ref = f'"{color_by.upper()}"' if is_oracle else f'"{color_by}"'
        select_fields.append(f'{cb_ref} AS "color_by"' if is_custom else f"data->>'{color_by}' AS \"color_by\"")

    order_str = ""
    if chart_type == "depth_profile" and y_axis:
        y_ref = f'"{y_axis.upper()}"' if is_oracle else f'"{y_axis}"'
        order_str = f' ORDER BY {y_ref} DESC' if is_custom else f" ORDER BY CAST(data->>'{y_axis}' AS DOUBLE PRECISION) DESC"

    query = f"SELECT {', '.join(select_fields)} FROM {table_name} WHERE {where_str}{order_str}"
    res = db.execute(text(query), params).fetchall()

    points = []
    x_is_num = var_map[x_axis].is_numeric
    y_is_num = var_map[y_axis].is_numeric if y_axis else False
    z_is_num = var_map[z_axis].is_numeric if z_axis else False

    for r in res:
        row_dict = {k.lower(): v for k, v in r._asdict().items()}
        x_val = row_dict["x"]
        y_val = row_dict.get("y")
        z_val = row_dict.get("z")
        
        if x_val is not None:
            try:
                x_val = float(x_val) if x_is_num else str(x_val).strip()
            except ValueError:
                continue
                
        if y_val is not None:
            try:
                y_val = float(y_val) if y_is_num else str(y_val).strip()
            except ValueError:
                continue

        if z_val is not None:
            try:
                z_val = float(z_val) if z_is_num else str(z_val).strip()
            except ValueError:
                continue

        points.append({
            "x": x_val,
            "y": y_val,
            "z": z_val,
            "color_by": row_dict.get("color_by")
        })

    # Telemetry logging for charts
    execution_time = time.time() - start_time
    logger.info(
        f"[CHART PLOT] Selected Dataset: {dataset.name} | "
        f"SQL Table: {table_name} | "
        f"Rows Returned: {len(points)} | "
        f"Variables Loaded: {[x_axis] + ([y_axis] if y_axis else []) + ([z_axis] if z_axis else [])} | "
        f"Charts Generated: {chart_type} | "
        f"SQL Query: {query} | "
        f"Execution Time: {execution_time:.4f}s"
    )

    return points


@router.get("/scientific-plots")
def get_scientific_plots(
    request: Request,
    dataset_id: int,
    well_name: Optional[str] = Query(None),
    sample_type: Optional[str] = Query(None),
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Retrieve all filtered records for default scientific plots in a single call.
    Dynamically maps columns based on the Dataset and Variable Registry.
    """
    start_time = time.time()
    dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset registry not found.")

    is_custom = dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records"
    table_name = cast(str, dataset.sql_table_name) if is_custom else "generic_dataset_records"
    if table_name and table_name.upper() == "DL_BIOMARKER_STERANE_":
        table_name = "DL_BIOMARKER_STERANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_HOPANE_":
        table_name = "DL_BIOMARKER_HOPANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_AROMATIC_":
        table_name = "DL_BIOMARKER_AROMATIC_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_PR_PH_":
        table_name = "DL_BIOMARKER_PR_PH_VW"

    active_version = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset_id,
        DatasetVersion.is_active == True
    ).first()
    if not active_version and not is_custom:
        return []

    active_version_id = cast(int, active_version.id) if active_version else None

    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id).all()
    var_map = {cast(str, v.sql_column_name): v for v in variables}

    # Inspect database columns (cached to avoid slow database inspector catalog queries on every API request)
    db_columns = _TABLE_COLUMNS_CACHE.get(table_name)
    if db_columns is None:
        try:
            from sqlalchemy import inspect
            bind = db.get_bind()
            inspector = inspect(bind)
            try:
                columns_meta = inspector.get_columns(table_name)
            except Exception:
                columns_meta = inspector.get_columns(table_name.lower())
            db_columns = {c['name'] for c in columns_meta}
            _TABLE_COLUMNS_CACHE[table_name] = db_columns
        except Exception as inspect_err:
            logger.error(f"Failed to inspect SQL table columns: {str(inspect_err)}")
            db_columns = set()

    # Compile query params
    q_params = dict(request.query_params)
    if well_name:
        q_params["well_name"] = well_name
    if sample_type:
        q_params["sample_type"] = sample_type
    if depth_min is not None:
        q_params["depth_min"] = str(depth_min)
    if depth_max is not None:
        q_params["depth_max"] = str(depth_max)

    where_str, params = build_where_clause(
        dataset, var_map, q_params, active_version_id
    )

    # Resolve columns to select
    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
    cols_to_select = []
    if is_custom:
        allowed_cols = None
        ds_name_lower = dataset.name.lower()
        if "cutting" in ds_name_lower:
            allowed_cols = {"id", "toc", "s1", "s2", "s3", "hi", "oi", "tmax", "pi", "vro", "osi", "lithology", "layer_name", "top_depth", "bottom_depth", "cuttings_sample_id", "borehole_name", "ubhi"}
        elif "core" in ds_name_lower:
            allowed_cols = {"id", "toc", "s1", "s2", "s3", "hi", "oi", "tmax", "pi", "vro", "osi", "lithology", "layer_name", "sample_top", "sample_bottom", "core_sample_id", "borehole_name", "ubhi"}

        for v in variables:
            col = v.sql_column_name
            col_ref = f'"{col.upper()}"' if is_oracle else f'"{col}"'
            if not db_columns or col in db_columns or col.upper() in db_columns or col.lower() in {c.lower() for c in db_columns}:
                if allowed_cols is None or col.lower() in allowed_cols:
                    cols_to_select.append(col_ref)
        if not cols_to_select:
            return []
        if "id" not in [c.replace('"', '').lower() for c in cols_to_select]:
            id_ref = '"ID"' if is_oracle else '"id"'
            cols_to_select.insert(0, id_ref)
        query = f"SELECT {', '.join(cols_to_select)} FROM {table_name} WHERE {where_str}"
    else:
        query = f"SELECT id, data FROM {table_name} WHERE {where_str}"

    res = db.execute(text(query), params).fetchall()

    points = []
    for r in res:
        row_dict = r._asdict()
        if is_custom:
            record_data = {}
            for raw_k, val in row_dict.items():
                k = raw_k.lower()
                if val is None:
                    record_data[k] = None
                    continue
                var_def = var_map.get(k) or var_map.get(raw_k)
                if var_def and var_def.is_numeric:
                    try:
                        record_data[k] = float(val)
                    except ValueError:
                        record_data[k] = None
                else:
                    record_data[k] = val
            points.append(record_data)
        else:
            item_data = row_dict.get("data") or {}
            item_data["id"] = row_dict.get("id") or row_dict.get("ID")
            record_data = {}
            for raw_k, val in item_data.items():
                k = raw_k.lower()
                if val is None:
                    record_data[k] = None
                    continue
                var_def = var_map.get(k) or var_map.get(raw_k)
                if var_def and var_def.is_numeric:
                    try:
                        record_data[k] = float(val)
                    except ValueError:
                        record_data[k] = None
                else:
                    record_data[k] = val
            points.append(record_data)


    execution_time = time.time() - start_time
    logger.info(
        f"[SCIENTIFIC PLOTS] Dataset: {dataset.name} | "
        f"Rows: {len(points)} | "
        f"Time: {execution_time:.4f}s"
    )

    return points


@router.get("/embed-url")
def get_metabase_embed_url(
    dataset: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Generate a secure, signed Metabase dashboard iframe URL using JWT (HS256)
    with dynamic filter bindings for dataset slug names.
    """
    from app.core.database import SessionLocal
    
    dash_id = settings.METABASE_DASHBOARD_ID
    if dataset:
        try:
            from app.services.metabase_service import metabase_service
            db = SessionLocal()
            try:
                ds = db.query(DatasetRegistry).filter(DatasetRegistry.name == dataset).first()
                if ds:
                    mb_dash_name = f"{ds.display_name} Dashboard"
                    mb_dash_id = metabase_service.get_dashboard_id_by_name(mb_dash_name)
                    if mb_dash_id:
                        dash_id = mb_dash_id
                        logger.info(f"Using dynamic Metabase Dashboard ID {dash_id} for '{mb_dash_name}'")
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Failed to lookup dynamic Metabase Dashboard: {str(e)}")

    # Metabase embedding only accepts parameters explicitly allowed in embedding settings.
    # Dashboard ID 1 (E-commerce Insights) has no parameters configured for embedding,
    # so we must omit 'dataset' parameter if using the fallback dashboard.
    payload_params = {}
    if dataset and dash_id != settings.METABASE_DASHBOARD_ID:
        payload_params["dataset"] = dataset

    expiration_time = int(time.time()) + (10 * 60)
    payload = {
        "resource": {"dashboard": dash_id},
        "params": payload_params,
        "exp": expiration_time
    }
    
    secret = settings.METABASE_EMBED_SECRET_KEY
    token = jwt.encode(payload, secret, algorithm="HS256")
    embed_url = f"{settings.METABASE_PUBLIC_URL}/embed/dashboard/{token}#theme=light&bordered=false&titled=false"
    
    logger.info(
        f"[METABASE EMBED DIAGNOSIS] "
        f"Secret loaded: '{secret}' | "
        f"Dashboard ID: {dash_id} (type: {type(dash_id).__name__}) | "
        f"Expiration timestamp: {expiration_time} | "
        f"JWT payload: {payload} | "
        f"Generated embed URL: {embed_url}"
    )
    
    return {"url": embed_url}


def find_variable_by_concept(variables: List[VariableRegistry], concept: str) -> Optional[str]:
    concept_synonyms = {
        "ubhi": ["ubhi", "unique borehole id", "unique_borehole_id", "unique borehole identifier", "unique_borehole_identifier"],
        "borehole_id": ["borehole_id", "borehole id", "borehole_id_key"],
        "object_number": ["object_number", "object_no", "object number", "object", "object #"],
        "depth": ["depth", "depth_top", "sample_top", "interval_top", "top_depth", "depth_from", "top depth", "sample top", "interval top", "md"],
        "interval_top": ["interval_top", "depth_top", "sample_top", "top_depth", "interval top", "depth top", "sample top", "top depth", "depth_from", "depth", "md"],
        "interval_bottom": ["interval_bottom", "depth_bottom", "sample_bottom", "bottom_depth", "interval bottom", "depth bottom", "sample bottom", "bottom depth", "depth_to"]
    }
    
    syns = concept_synonyms.get(concept, [])
    # 1. Search by exact sql_column_name match (case-insensitive)
    for v in variables:
        if v.sql_column_name.lower() in syns:
            return cast(str, v.sql_column_name)
            
    # 2. Search by synonyms array in VariableRegistry
    for v in variables:
        for s in (v.synonyms or []):
            if s.lower() in syns:
                return cast(str, v.sql_column_name)
                
    # 3. Search by partial name match
    for v in variables:
        for s in syns:
            if s in v.name.lower() or s in v.display_name.lower():
                return cast(str, v.sql_column_name)
    return None


def fetch_dataset_records(db: Session, dataset: DatasetRegistry, variables: List[VariableRegistry], query_params: Dict[str, Any]) -> List[Dict[str, Any]]:
    is_custom = dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records"
    table_name = cast(str, dataset.sql_table_name) if is_custom else "generic_dataset_records"
    if table_name and table_name.upper() == "DL_BIOMARKER_STERANE_":
        table_name = "DL_BIOMARKER_STERANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_HOPANE_":
        table_name = "DL_BIOMARKER_HOPANE_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_AROMATIC_":
        table_name = "DL_BIOMARKER_AROMATIC_VW"
    elif table_name and table_name.upper() == "DL_BIOMARKER_PR_PH_":
        table_name = "DL_BIOMARKER_PR_PH_VW"

    active_version = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset.id,
        DatasetVersion.is_active == True
    ).first()
    active_version_id = cast(Optional[int], active_version.id) if active_version else None

    try:
        from sqlalchemy import inspect
        bind = db.get_bind()
        inspector = inspect(bind)
        try:
            columns_meta = inspector.get_columns(table_name)
        except Exception:
            columns_meta = inspector.get_columns(table_name.lower())
        db_columns = {c['name'] for c in columns_meta}
    except Exception:
        db_columns = set()

    if db_columns:
        for v in variables:
            v.sql_column_name = cast(Any, map_column_case_insensitively(cast(str, v.sql_column_name), db_columns))
        if dataset.primary_well_column:
            dataset.primary_well_column = cast(Any, map_column_case_insensitively(cast(str, dataset.primary_well_column), db_columns))
        if dataset.primary_depth_column:
            dataset.primary_depth_column = cast(Any, map_column_case_insensitively(cast(str, dataset.primary_depth_column), db_columns))

    var_map = {cast(str, v.sql_column_name): v for v in variables}
    where_str, params = build_where_clause(dataset, var_map, query_params, active_version_id)

    is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
    if is_custom:
        cols_to_select = []
        for v in variables:
            col = v.sql_column_name
            col_ref = f'"{col.upper()}"' if is_oracle else f'"{col}"'
            if not db_columns or col in db_columns or col.upper() in db_columns or col.lower() in {c.lower() for c in db_columns}:
                cols_to_select.append(col_ref)
        if not cols_to_select:
            return []
        if "id" not in [c.replace('"', '').lower() for c in cols_to_select]:
            id_ref = '"ID"' if is_oracle else '"id"'
            cols_to_select.insert(0, id_ref)
        query = f"SELECT {', '.join(cols_to_select)} FROM {table_name} WHERE {where_str}"
    else:
        query = f"SELECT id, data FROM {table_name} WHERE {where_str}"

    res = db.execute(text(query), params).fetchall()

    points = []
    for r in res:
        row_dict = r._asdict()
        if is_custom:
            record_data = {}
            for raw_k, val in row_dict.items():
                k = raw_k.lower()
                if val is None:
                    record_data[k] = None
                    continue
                var_def = var_map.get(k) or var_map.get(raw_k)
                if var_def and var_def.is_numeric:
                    try:
                        record_data[k] = float(val)
                    except ValueError:
                        record_data[k] = None
                else:
                    record_data[k] = val
            points.append(record_data)
        else:
            item_data = row_dict.get("data") or {}
            item_data["id"] = row_dict.get("id") or row_dict.get("ID")
            record_data = {}
            for raw_k, val in item_data.items():
                k = raw_k.lower()
                if val is None:
                    record_data[k] = None
                    continue
                var_def = var_map.get(k) or var_map.get(raw_k)
                if var_def and var_def.is_numeric:
                    try:
                        record_data[k] = float(val)
                    except ValueError:
                        record_data[k] = None
                else:
                    record_data[k] = val
            points.append(record_data)
    return points


@router.get("/cross-chart-data")
def get_cross_chart_data(
    request: Request,
    dataset_id_1: int,
    x_axis_1: str,
    dataset_id_2: int,
    y_axis_2: str,
    chart_type: str = Query("scatter"),
    well_name: Optional[str] = Query(None),
    sample_type: Optional[str] = Query(None),
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    color_by: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Retrieve joined coordinates dynamically from two registered datasets based on shared relational identifiers.
    """
    start_time = time.time()
    ds1 = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id_1).first()
    ds2 = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id_2).first()
    if not ds1 or not ds2:
        raise HTTPException(status_code=404, detail="One or both dataset configurations not found.")

    variables1 = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id_1).all()
    variables2 = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id_2).all()

    var_map1 = {cast(str, v.sql_column_name): v for v in variables1}
    var_map2 = {cast(str, v.sql_column_name): v for v in variables2}

    if x_axis_1 not in var_map1:
        raise HTTPException(status_code=400, detail=f"Column '{x_axis_1}' is not registered in dataset 1.")
    if y_axis_2 not in var_map2:
        raise HTTPException(status_code=400, detail=f"Column '{y_axis_2}' is not registered in dataset 2.")

    # 1. Resolve Join Keys
    join_on = []

    # Check Borehole ID
    bh1 = find_variable_by_concept(variables1, "borehole_id")
    bh2 = find_variable_by_concept(variables2, "borehole_id")
    if bh1 and bh2:
        join_on.append((bh1, bh2))

    # Check UBHI
    ubhi1 = find_variable_by_concept(variables1, "ubhi")
    ubhi2 = find_variable_by_concept(variables2, "ubhi")
    if ubhi1 and ubhi2:
        join_on.append((ubhi1, ubhi2))

    # Check Object Number
    obj1 = find_variable_by_concept(variables1, "object_number")
    obj2 = find_variable_by_concept(variables2, "object_number")
    if obj1 and obj2:
        join_on.append((obj1, obj2))

    # Check Depth / Top Depth
    dep1 = find_variable_by_concept(variables1, "depth")
    dep2 = find_variable_by_concept(variables2, "depth")
    if dep1 and dep2:
        join_on.append((dep1, dep2))

    # Check Bottom Depth
    bot1 = find_variable_by_concept(variables1, "interval_bottom")
    bot2 = find_variable_by_concept(variables2, "interval_bottom")
    if bot1 and bot2:
        join_on.append((bot1, bot2))

    # Fallback to check well_name/borehole_name synonyms if no join keys resolved
    if not join_on:
        well1 = find_variable_by_concept(variables1, "well_name")
        well2 = find_variable_by_concept(variables2, "well_name")
        if well1 and well2:
            join_on.append((well1, well2))

    if not join_on:
        raise HTTPException(
            status_code=400,
            detail="Cross-dataset analysis is unavailable: no compatible relational keys (UBHI, borehole name, object number, depth) found between these datasets."
        )

    # 2. Query filtered records
    q_params = dict(request.query_params)
    if well_name:
        q_params["well_name"] = well_name
    if sample_type:
        q_params["sample_type"] = sample_type
    if depth_min is not None:
        q_params["depth_min"] = str(depth_min)
    if depth_max is not None:
        q_params["depth_max"] = str(depth_max)

    points1 = fetch_dataset_records(db, ds1, variables1, q_params)
    points2 = fetch_dataset_records(db, ds2, variables2, q_params)

    if not points1 or not points2:
        return []

    # 3. Perform Relational Join using pandas
    df1 = pd.DataFrame(points1)
    df2 = pd.DataFrame(points2)

    left_on = []
    right_on = []
    for idx, (col1, col2) in enumerate(join_on):
        common_col = f"join_key_{idx}"
        df1[common_col] = df1[col1]
        df2[common_col] = df2[col2]
        left_on.append(common_col)
        right_on.append(common_col)

    merged_df = pd.merge(df1, df2, on=left_on, suffixes=('_ds1', '_ds2'))

    if merged_df.empty:
        return []

    # 4. Resolve X, Y, Color, Tooltip fields from merged data frame
    x_col = x_axis_1
    if x_col not in merged_df.columns:
        if f"{x_col}_ds1" in merged_df.columns:
            x_col = f"{x_col}_ds1"
        else:
            x_col = f"{x_col}_ds2"

    y_col = y_axis_2
    if y_col not in merged_df.columns:
        if f"{y_col}_ds2" in merged_df.columns:
            y_col = f"{y_col}_ds2"
        else:
            y_col = f"{y_col}_ds1"

    color_col = None
    if color_by:
        color_col = color_by
        if color_col not in merged_df.columns:
            if f"{color_col}_ds1" in merged_df.columns:
                color_col = f"{color_col}_ds1"
            elif f"{color_col}_ds2" in merged_df.columns:
                color_col = f"{color_col}_ds2"

    points = []
    for _, row in merged_df.iterrows():
        x_val = row.get(x_col)
        y_val = row.get(y_col)
        if x_val is None or y_val is None:
            continue

        well_val = None
        for c in ["well_name", "borehole_name", "name", "WELL_NAME", "BOREHOLE_NAME", "NAME"]:
            for suffix in ["", "_ds1", "_ds2"]:
                col_name = f"{c}{suffix}"
                if col_name in row and row[col_name] is not None:
                    well_val = str(row[col_name])
                    break
            if well_val:
                break

        depth_val = None
        for c in ["depth", "depth_from", "sample_top", "interval_top", "DEPTH", "DEPTH_FROM"]:
            for suffix in ["", "_ds1", "_ds2"]:
                col_name = f"{c}{suffix}"
                if col_name in row and row[col_name] is not None:
                    try:
                        depth_val = float(row[col_name])
                    except ValueError:
                        pass
                    break
            if depth_val is not None:
                break

        points.append({
            "x": x_val,
            "y": y_val,
            "well_name": well_val or "Unknown",
            "depth": depth_val,
            "color_by": row.get(color_col) if color_col else None
        })

    execution_time = time.time() - start_time
    logger.info(
        f"[CROSS-DATASET JOIN PLOT] Left: {ds1.name} | Right: {ds2.name} | "
        f"Rows Joined: {len(points)} | Join Keys: {join_on} | "
        f"Execution Time: {execution_time:.4f}s"
    )

    return points


@router.get("/graph-data/{graph_id}")
def get_graph_specific_data(
    graph_id: str,
    well_name: Optional[str] = Query(None),
    formation: Optional[str] = Query(None),
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Retrieve subset data specifically for a given graph, executing targeted SELECT statements 
    and database-level filtering/joins.
    """
    from app.core.graph_config import GRAPH_CONFIGS
    
    if graph_id not in GRAPH_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Graph config '{graph_id}' not found.")
        
    config = GRAPH_CONFIGS[graph_id]
    cols = config["columns"]
    
    # Base query compile
    if "custom_query" in config:
        base_query = config["custom_query"]
        # Wrap as subquery to apply filters
        col_list = ", ".join(cols)
        query_str = f"SELECT {col_list} FROM ({base_query}) AS sub"
    else:
        source_table = config["source_table"]
        col_list = ", ".join(cols)
        query_str = f"SELECT {col_list} FROM {source_table}"
        
    # Compile filters
    where_clauses = []
    params = {}
    
    if well_name:
        # Check if the columns have different casing or names
        well_col = next((c for c in cols if c.lower() in ["name", "well_name", "borehole_name"]), None)
        if well_col:
            where_clauses.append(f"{well_col} = :well_name")
            params["well_name"] = well_name
            
    if formation:
        form_col = next((c for c in cols if c.lower() in ["formation", "fm"]), None)
        if form_col:
            where_clauses.append(f"{form_col} = :formation")
            params["formation"] = formation
            
    if depth_min is not None:
        depth_col = next((c for c in cols if c.lower() in ["depth", "depth_top", "depth_from"]), None)
        if depth_col:
            where_clauses.append(f"{depth_col} >= :depth_min")
            params["depth_min"] = depth_min
            
    if depth_max is not None:
        depth_col = next((c for c in cols if c.lower() in ["depth", "depth_top", "depth_from"]), None)
        if depth_col:
            where_clauses.append(f"{depth_col} <= :depth_max")
            params["depth_max"] = depth_max

    if where_clauses:
        query_str += " WHERE " + " AND ".join(where_clauses)
        
    # Execute query
    try:
        rows = db.execute(text(query_str), params).fetchall()
        result = []
        for r in rows:
            row_dict = r._asdict()
            # Clean floating values to standard float types
            cleaned = {}
            for k, v in row_dict.items():
                val = float(v) if isinstance(v, (int, float)) else v
                cleaned[k] = val
                cleaned[k.lower()] = val
            result.append(cleaned)
        return result
    except Exception as e:
        logger.exception(f"Failed to execute graph-specific query for '{graph_id}': {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database query failure: {str(e)}")

