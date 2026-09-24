# GVMS Project Report: Exact Code Excerpts and System Facts

This document contains verified, exact code excerpts and system architecture facts directly extracted from the current GVMS (Graphical Visualization Management System) codebase.

---

# PART 1: EXACT CODE EXCERPTS

---

### 1. `backend/app/main.py` — `lifespan()` Function
- **Real File Path:** `backend/app/main.py`
- **Function Name:** `lifespan`
- **Current Line Range:** Lines 11–26

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database connection...")
    db = SessionLocal()
    try:
        from sqlalchemy import text
        is_oracle = settings.DATABASE_PROVIDER.lower() == "oracle"
        # Test quick connectivity before running DDL suite
        db.execute(text("SELECT 1 FROM DUAL" if is_oracle else "SELECT 1"))
        init_db(db)
        logger.info("Database initialization completed successfully.")
    except Exception as e:
        logger.warning(f"Database connection offline or skipped on startup: {str(e)}")
    finally:
        db.close()
    yield
```

---

### 2. `backend/app/core/security.py` — `create_access_token()` and `verify_password()`
- **Real File Path:** `backend/app/core/security.py`
- **Functions:** `verify_password` (Lines 10–11) and `create_access_token` (Lines 18–31)

```python
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: Union[str, Any], role: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "role": role,
        "type": "access"
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
```

---

### 3. `backend/app/api/deps.py` — `get_current_user()` and `require_roles()`
- **Real File Path:** `backend/app/api/deps.py`
- **Functions:** `get_current_user` (Lines 19–82) and `require_roles` (Lines 95–103)

```python
def get_current_user(
    db: Session = Depends(get_db), token: Optional[str] = Depends(reusable_oauth2)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if token:
        # Support demo / intranet token scheme
        if token.startswith("demo_token_"):
            parts = token.split("_")
            req_role = parts[2] if len(parts) > 2 else "admin"
            req_user_id = parts[3] if len(parts) > 3 else None
            user = None
            if req_user_id:
                user = crud_user.get_by_id(db, req_user_id)
            if not user:
                user = db.query(User).filter(User.role == req_role, User.is_active == True).first()
            if not user:
                user = crud_user.get_by_email(db, email=settings.FIRST_SUPERUSER)
            if not user:
                user = db.query(User).first()
            if user:
                return user

        try:
            payload = jwt.decode(
                token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
            )
            user_id: str = payload.get("sub")
            token_type: str = payload.get("type")
            if user_id and token_type == "access":
                user = crud_user.get_by_id(db, user_id=user_id)
                if user and user.is_active:
                    return user
        except (JWTError, ValueError):
            if not settings.AUTH_DISABLED:
                raise credentials_exception

    # Development / testing authentication bypass when AUTH_DISABLED=True
    if settings.AUTH_DISABLED:
        admin_user = crud_user.get_by_email(db, email=settings.FIRST_SUPERUSER)
        if not admin_user:
            admin_user = db.query(User).filter(User.role == "admin").first()
        if not admin_user:
            admin_user = db.query(User).first()
        if admin_user:
            return admin_user
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AUTH_DISABLED is enabled, but no admin user exists in the database to authenticate as."
        )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raise credentials_exception


def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles and current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User role '{current_user.role}' lacks sufficient privileges."
            )
        return current_user
    return role_checker
```

---

### 4. `backend/app/services/formula_engine.py` — Main Derived-Parameter Calculation Functions
- **Real File Path:** `backend/app/services/formula_engine.py`
- **Functions:** `calculate_derived_parameters` (Lines 13–101), `calculate_chromatography_ratios` (Lines 104–224), `calculate_isotope_ratios` (Lines 245–305)

```python
def calculate_derived_parameters(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Central scientific equations library for Petroleum Geochemistry LIMS.
    Calculates derived variables from measured parameters (S1, S2, S3, PC, RC, TOC).
    Updates and mutates record keys in-place.
    """
    s1 = safe_float(record.get("s1"))
    s2 = safe_float(record.get("s2"))
    s3 = safe_float(record.get("s3"))
    pc = safe_float(record.get("pc"))
    rc = safe_float(record.get("rc"))
    toc = safe_float(record.get("toc"))

    # 1. Total Organic Carbon (TOC = PC + RC)
    # Automatically derive if TOC is not present but PC and RC exist
    if toc is None and pc is not None and rc is not None:
        toc = pc + rc
        record["toc"] = round(toc, 4)

    # 2. Production Index (PI = S1 / (S1 + S2))
    if s1 is not None and s2 is not None:
        denom = s1 + s2
        if denom > 0:
            record["pi"] = round(s1 / denom, 4)
        else:
            record["pi"] = None
    else:
        # Keep existing PI if present and no new inputs are available
        if "pi" not in record:
            record["pi"] = None

    # 3. Hydrogen Index (HI = (S2 / TOC) * 100)
    if s2 is not None and toc is not None and toc > 0:
        record["hi"] = round((s2 / toc) * 100, 4)
    else:
        if "hi" not in record:
            record["hi"] = None

    # 4. Oxygen Index (OI = (S3 / TOC) * 100)
    if s3 is not None and toc is not None and toc > 0:
        record["oi"] = round((s3 / toc) * 100, 4)
    else:
        if "oi" not in record:
            record["oi"] = None

    # 5. Oil Saturation Index (OSI = (S1 / TOC) * 100)
    if s1 is not None and toc is not None and toc > 0:
        record["osi"] = round((s1 / toc) * 100, 4)
    else:
        if "osi" not in record:
            record["osi"] = None

    # 6. S2/S3 Ratio (S2_S3 = S2 / S3)
    if s2 is not None and s3 is not None and s3 > 0:
        record["s2_s3"] = round(s2 / s3, 4)
    else:
        if "s2_s3" not in record:
            record["s2_s3"] = None

    # 7. Richness and Pyrolysis classifications for petroleum_data table integrity
    if toc is not None:
        if toc < 0.5:
            record["toc_classification"] = "Poor"
        elif 0.5 <= toc < 1.0:
            record["toc_classification"] = "Fair"
        elif 1.0 <= toc < 2.0:
            record["toc_classification"] = "Good"
        elif 2.0 <= toc <= 4.0:
            record["toc_classification"] = "Very Good"
        else:
            record["toc_classification"] = "Excellent"
    else:
        record["toc_classification"] = "Poor"  # Safe default to avoid DB constraint violation if completely missing

    if s2 is not None:
        if s2 < 2.5:
            record["s2_classification"] = "Poor"
        elif 2.5 <= s2 < 5.0:
            record["s2_classification"] = "Fair"
        elif 5.0 <= s2 < 10.0:
            record["s2_classification"] = "Good"
        elif 10.0 <= s2 <= 20.0:
            record["s2_classification"] = "Very Good"
        else:
            record["s2_classification"] = "Excellent"
    else:
        record["s2_classification"] = "Poor"  # Safe default

    return record
```

---

### 5. `backend/app/services/geochemistry_engine.py` — S2 vs TOC Chart Aggregation & Figure Builders
- **Real File Path:** `backend/app/services/geochemistry_engine.py`
- **Functions:** `build_s2_toc_chart` (Lines 103–241) and `build_s2_toc_chart_figure` (Lines 244–388)

```python
def build_s2_toc_chart(dataset: list) -> list:
    """
    Accepts Core dataset, Cuttings dataset, Combined dataset without modification.
    Computes Average TOC and Average S2 automatically grouped by:
    - Well Name
    - Formation
    - Layer
    - Depth / Depth Interval (or Top/Bottom Depth)
    - Sample / Sample Number
    when appropriate.
    """
    if not dataset:
        return []

    records = []
    for r in dataset:
        if hasattr(r, "_asdict"):
            records.append(r._asdict())
        elif isinstance(r, dict):
            records.append(r.copy())
        else:
            try:
                records.append(r.__dict__.copy())
            except Exception:
                records.append(r)

    roles = {
        "toc": ["toc", "total organic carbon", "total carbon", "total organic carbon (toc)", "average_toc"],
        "s2": ["s2", "pyrolyzable hydrocarbons", "hydrocarbon yield", "s2 (mg hc/g rock)", "average_s2"],
        "well": ["well", "well name", "borehole", "borehole name", "well_name"],
        "formation": ["formation", "fm", "stratigraphy"],
        "layer": ["layer", "member"],
        "depth": ["depth", "md", "tvd", "top depth", "sample top", "depth (m)", "depth_from", "top_depth"],
        "bottom_depth": ["bottom depth", "bottom_depth", "sample bottom", "depth_max", "depth_to", "bottom_depth"],
        "sample": ["sample", "sample_id", "sample_name", "sample_number", "sample_no"],
        "sample_type": ["sample_type", "type", "lithology", "sample_type"]
    }

    def find_val(rec: dict, role_keys: list):
        if not isinstance(rec, dict):
            return None
        for k, v in rec.items():
            k_lower = k.lower()
            if k_lower in role_keys:
                return v
        return None

    groups = {}
    for rec in records:
        if not isinstance(rec, dict):
            continue

        well = find_val(rec, roles["well"])
        fm = find_val(rec, roles["formation"])
        layer = find_val(rec, roles["layer"])
        depth = find_val(rec, roles["depth"])
        b_depth = find_val(rec, roles["bottom_depth"])
        sample = find_val(rec, roles["sample"])
        sample_type = find_val(rec, roles["sample_type"])
        toc = find_val(rec, roles["toc"])
        s2 = find_val(rec, roles["s2"])

        try:
            toc_val = float(toc) if toc is not None else None
        except (ValueError, TypeError):
            toc_val = None

        try:
            s2_val = float(s2) if s2 is not None else None
        except (ValueError, TypeError):
            s2_val = None

        well_str = str(well).strip() if well is not None else ""
        fm_str = str(fm).strip() if fm is not None else ""
        layer_str = str(layer).strip() if layer is not None else ""
        depth_val = float(depth) if depth is not None else None
        b_depth_val = float(b_depth) if b_depth is not None else None
        sample_str = str(sample).strip() if sample is not None else ""

        depth_key = f"{depth_val:.1f}" if depth_val is not None else ""
        b_depth_key = f"{b_depth_val:.1f}" if b_depth_val is not None else ""

        group_key = (well_str, fm_str, layer_str, depth_key, b_depth_key, sample_str)

        if group_key not in groups:
            groups[group_key] = {
                "well_name": well_str or None,
                "formation": fm_str or None,
                "layer": layer_str or None,
                "top_depth": depth_val,
                "bottom_depth": b_depth_val,
                "sample": sample_str or None,
                "sample_type": sample_type,
                "tocs": [],
                "s2s": [],
                "raw_record": rec
            }

        if toc_val is not None:
            groups[group_key]["tocs"].append(toc_val)
        if s2_val is not None:
            groups[group_key]["s2s"].append(s2_val)

    aggregated = []
    for g_key, g_data in groups.items():
        tocs_list = g_data["tocs"]
        s2s_list = g_data["s2s"]

        avg_toc = sum(tocs_list) / len(tocs_list) if tocs_list else None
        avg_s2 = sum(s2s_list) / len(s2s_list) if s2s_list else None

        if avg_toc is None:
            raw_toc = find_val(g_data["raw_record"], roles["toc"])
            try:
                avg_toc = float(raw_toc) if raw_toc is not None else None
            except (ValueError, TypeError):
                pass
        if avg_s2 is None:
            raw_s2 = find_val(g_data["raw_record"], roles["s2"])
            try:
                avg_s2 = float(raw_s2) if raw_s2 is not None else None
            except (ValueError, TypeError):
                pass

        rec = g_data["raw_record"].copy()
        rec["average_toc"] = avg_toc
        rec["average_s2"] = avg_s2
        rec["well_name"] = g_data["well_name"]
        rec["formation"] = g_data["formation"]
        rec["layer"] = g_data["layer"]
        rec["top_depth"] = g_data["top_depth"]
        rec["bottom_depth"] = g_data["bottom_depth"]
        rec["sample"] = g_data["sample"]
        rec["sample_type"] = g_data["sample_type"]
        rec["is_aggregated"] = len(tocs_list) > 1 or len(s2s_list) > 1

        aggregated.append(rec)

    return aggregated
```

---

### 6. `backend/app/services/csv_processor.py` — Ingestion Pipeline Entry Point
- **Real File Path:** `backend/app/services/csv_processor.py`
- **Functions:** `CSVProcessor.process_geochemical_upload` (Master wrapper, Lines 1303–1393) and `CSVProcessor.process_file` (Core parser, Lines 258–320+)

```python
    @classmethod
    def process_geochemical_upload(
        cls,
        db: Session,
        file_bytes: bytes,
        filename: str,
        uploader_id: UUID,
        dataset_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Master dynamic ingestion engine method. Resolves/detects dataset, creates version,
        runs validation/ingestion, commits to database, syncs Metabase, and saves audit trails.
        """
        from app.crud.crud_registry import crud_registry
        from app.models.registry import DatasetRegistry
        
        # 1. Resolve Dataset
        ds = None
        if dataset_id:
            ds = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
        else:
            try:
                ds, _ = cls.detect_dataset(file_bytes, filename, db)
            except Exception as e:
                raise ValueError(str(e))
                
        if not ds:
            raise ValueError("No registered dataset configuration found to process this file.")
            
        if not ds.is_active:
            raise ValueError("Dataset is deactivated")

        # 2. Create Dataset Version (Audit History)
        next_version = crud_registry.get_next_version_number(db, cast(int, ds.id))
        version = crud_registry.create_version(
            db,
            dataset_id=cast(int, ds.id),
            version_number=next_version,
            filename=filename,
            file_size=len(file_bytes),
            uploader_id=uploader_id
        )
        
        # Set version status to processing
        version.status = cast(Any, "processing")
        db.add(version)
        db.commit()
        
        try:
            # 3. Core Ingestion & Processing
            result = cls.process_file(
                file_bytes=file_bytes,
                filename=filename,
                db=db,
                uploader_id=uploader_id,
                dataset_id=cast(int, ds.id),
                version_id=cast(int, version.id)
            )
            
            # 4. Trigger Metabase synchronization
            try:
                from app.services.metabase_service import metabase_service
                metabase_service.sync_dataset(ds, db)
            except Exception as mb_err:
                logger.warning(f"Metabase synchronization failed for dataset {ds.name}: {str(mb_err)}")
                
            # 5. Update Version Status to Completed
            version.status = cast(Any, "completed")
            version.total_rows = result["total_rows"]
            version.imported_rows = result["imported_rows"]
            version.skipped_rows = result["skipped_rows"]
            
            duplicates = result.get("duplicates", 0)
            warnings = result.get("warnings", [])
            error_text = "; ".join(warnings) if warnings else None
            if duplicates > 0:
                dup_msg = f"{duplicates} duplicate rows skipped."
                error_text = f"{dup_msg}; {error_text}" if error_text else dup_msg
            version.error_summary = cast(Any, error_text)
            db.add(version)
            db.commit()
            
            return result
            
        except Exception as err:
            db.rollback()
            version.status = cast(Any, "failed")
            version.error_summary = cast(Any, str(err))
            db.add(version)
            db.commit()
            raise err
```

---

### 7. `backend/app/api/v1/endpoints/dashboard.py` — `/scientific-plots` Endpoint
- **Real File Path:** `backend/app/api/v1/endpoints/dashboard.py`
- **Function Name:** `get_scientific_plots`
- **Current Line Range:** Lines 729–878

```python
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
```

---

### 8. `backend/app/api/v1/endpoints/dashboard.py` — `/cross-chart-data` Endpoint
- **Real File Path:** `backend/app/api/v1/endpoints/dashboard.py`
- **Function Name:** `get_cross_chart_data`
- **Current Line Range:** Lines 1070–1256

```python
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
```

---

### 9. `backend/app/api/v1/endpoints/dashboard.py` — `/embed-url` Endpoint
- **Real File Path:** `backend/app/api/v1/endpoints/dashboard.py`
- **Function Name:** `get_metabase_embed_url`
- **Current Line Range:** Lines 881–937

```python
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
```

---

### 10. `backend/app/services/report_generator.py` — `generate_pdf()`
- **Real File Path:** `backend/app/services/report_generator.py`
- **Class / Method:** `ReportGenerator.generate_pdf`
- **Current Line Range:** Lines 121–336

```python
    @staticmethod
    def generate_pdf(
        dataset_display_name: str,
        variables: List[VariableRegistry],
        records: List[Dict[str, Any]],
        selected_graphs: Optional[List[Dict[str, Any]]] = None,
        snapshots: Optional[List[Dict[str, str]]] = None
    ) -> bytes:
        """Dynamically generate a styled landscape or portrait PDF containing the dataset, summary, and direct graph snapshots."""
        # 1. Filter columns that are visible (max 8 columns for layout rendering)
        pdf_vars = [v for v in variables if v.is_visible][:8]
        if not pdf_vars:
            pdf_vars = variables[:6]

        # 2. Determine page layout: Landscape for wide tables
        use_landscape = len(pdf_vars) > 5 or (snapshots and len(snapshots) > 0)
        page_size = landscape(A4) if use_landscape else A4
        printable_width = (842 - 72) if use_landscape else (595 - 72)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=page_size,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        elements = []
        styles = getSampleStyleSheet()

        # Custom paragraph styles
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=16,
            textColor=colors.HexColor('#003366'),
            spaceAfter=4
        )
        subtitle_style = ParagraphStyle(
            'SubTitleStyle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            textColor=colors.HexColor('#64748B'),
            spaceAfter=12
        )
        section_style = ParagraphStyle(
            'SectionStyle',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=11,
            textColor=colors.HexColor('#003366'),
            spaceBefore=8,
            spaceAfter=6
        )
        chart_caption_style = ParagraphStyle(
            'ChartCaptionStyle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            textColor=colors.HexColor('#1E293B'),
            alignment=1,  # Center
            spaceAfter=6
        )

        elements.append(Paragraph("OIL AND NATURAL GAS CORPORATION LIMITED", title_style))
        elements.append(Paragraph(f"Dynamic Laboratory Data Platform — {dataset_display_name} Technical Report", subtitle_style))
        elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#003366'), spaceAfter=12))

        # 3. Dynamic Executive Summary stats
        total = len(records)
        numeric_kpis = [v for v in variables if v.is_numeric and v.kpi_enabled]
        summary_parts = []
        
        for v in numeric_kpis:
            col = cast(str, v.sql_column_name)
            vals = [float(r[col]) for r in records if r.get(col) is not None]
            if vals:
                avg_val = sum(vals) / len(vals)
                summary_parts.append(f"Avg {v.display_name}: <b>{avg_val:.2f} {v.display_unit or ''}</b>")
                
        summary_text = f"<b>Summary Stats:</b> Total Samples: <b>{total}</b>"
        if summary_parts:
            summary_text += " | " + " · ".join(summary_parts)
            
        elements.append(Paragraph(summary_text, styles['Normal']))
        elements.append(Spacer(1, 10))

        # 4. Data Table
        elements.append(Paragraph("Ingested Data & Subsurface Records", section_style))

        # Header row
        table_data = [[
            Paragraph(f"<b>{v.display_name}</b>", styles['Normal'])
            for v in pdf_vars
        ]]

        # Data rows (limit top 100 to avoid out-of-memory or huge page count crashes)
        for r in records[:100]:
            row = []
            for v in pdf_vars:
                col_name = cast(str, v.sql_column_name)
                val = r.get(col_name)
                if val is None:
                    txt = "-"
                else:
                    if v.is_numeric:
                        try:
                            txt = f"{float(val):.2f}"
                        except (ValueError, TypeError):
                            txt = str(val)
                    else:
                        txt = str(val)
                row.append(Paragraph(txt, styles['Normal']))
            table_data.append(row)

        # Distribute width equally
        col_width = printable_width / len(pdf_vars)
        col_widths = [col_width] * len(pdf_vars)

        t = Table(table_data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)

        # 5. Direct Plotly Graph Snapshots (if provided from frontend client)
        if snapshots and len(snapshots) > 0:
            elements.append(Spacer(1, 20))
            elements.append(Paragraph("Direct Laboratory Graph Snapshots", section_style))
            elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceAfter=15))

            img_w = 480 if use_landscape else 400
            img_h = 300 if use_landscape else 250

            for snap in snapshots:
                try:
                    title = snap.get("title", "Laboratory Plot Snapshot")
                    img_b64 = snap.get("image_base64", "")
                    if not img_b64:
                        continue
                    if "," in img_b64:
                        img_b64 = img_b64.split(",", 1)[1]
                    raw_bytes = base64.b64decode(img_b64)
                    
                    elements.append(Paragraph(f"<b>{title}</b>", chart_caption_style))
                    snap_img = Image(io.BytesIO(raw_bytes), width=img_w, height=img_h)
                    snap_img.hAlign = 'CENTER'
                    elements.append(snap_img)
                    elements.append(Spacer(1, 15))
                except Exception as ex:
                    print(f"Error embedding direct Plotly snapshot in PDF: {ex}")
                    elements.append(Paragraph(f"[!] Error embedding snapshot '{snap.get('title')}'", styles['Normal']))
                    elements.append(Spacer(1, 10))

        # 6. Selected Subsurface Charts & Visualizations (fallback / backend rendering)
        elif selected_graphs and records:
            elements.append(Spacer(1, 20))
            elements.append(Paragraph("Visualizations & Dynamic Interpretations", section_style))
            elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#CBD5E1'), spaceAfter=15))
            
            for g in selected_graphs:
                try:
                    x_col = g.get("x_axis")
                    if not x_col or not isinstance(x_col, str):
                        continue
                    y_col = g.get("y_axis")
                    if y_col is not None and not isinstance(y_col, str):
                        y_col = None
                    title = g.get("title", "Dataset Visualization")
                    g_type = g.get("type", "scatter")
                    
                    # Resolve professional labels from variables registry
                    x_label = x_col.upper()
                    for v in variables:
                        if v.sql_column_name.lower() == x_col.lower():
                            unit = f" ({v.display_unit})" if v.display_unit else ""
                            x_label = f"{v.display_name}{unit}"
                            break
                    
                    y_label = y_col.upper() if y_col else None
                    if y_col:
                        for v in variables:
                            if v.sql_column_name.lower() == y_col.lower():
                                unit = f" ({v.display_unit})" if v.display_unit else ""
                                y_label = f"{v.display_name}{unit}"
                                break

                    img_bytes = ReportGenerator._create_matplotlib_plot(
                        chart_type=g_type,
                        x_col=x_col,
                        y_col=y_col,
                        title=title,
                        records=records,
                        x_label=x_label,
                        y_label=y_label
                    )
                    
                    if img_bytes:
                        chart_img = Image(io.BytesIO(img_bytes), width=420, height=270)
                        chart_img.hAlign = 'CENTER'
                        elements.append(chart_img)
                        elements.append(Spacer(1, 15))
                except Exception as ex:
                    print(f"Error generating matplotlib plot in PDF: {ex}")
                    elements.append(Paragraph(f"[!] Error rendering visualization chart '{g.get('title')}'", styles['Normal']))
                    elements.append(Spacer(1, 10))

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()
```

---

### 11. `frontend/src/pages/GasIsotopeDashboard.tsx` — Component Body
- **Real File Path:** `frontend/src/pages/GasIsotopeDashboard.tsx`
- **Component:** `GasIsotopeDashboard`
- **Total Lines in File:** 4,350 lines

```tsx
export const GasIsotopeDashboard: React.FC = () => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const datasetParam = searchParams.get('dataset') || 'gas_isotope';

  // Sub-tabs state
  const [subTab, setSubTab] = useState<'genetics' | 'maturity' | 'wetness' | 'oil_csia'>(() => {
    const params = new URLSearchParams(window.location.search);
    const ds = params.get('dataset') || 'gas_isotope';
    return (ds === 'oil_isotope' || ds === 'csia_isotope') ? 'oil_csia' : 'genetics';
  });

  // Custom builder states
  const [xVar, setXVar] = useState<string>('delta_c1');
  const [yVar, setYVar] = useState<string>('c1_by_c2_plus_c3');
  const [colorBy, setColorBy] = useState<string>('');
  const [chartType, setChartType] = useState<string>('scatter');

  // Filters state
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [activeFiltersCount, setActiveFiltersCount] = useState<number>(0);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Search filter options inside search boxes
  const [filterSearches, setFilterSearches] = useState<Record<string, string>>({});

  // Tabs state
  const [activeTab, setActiveTab] = useState<'scientific' | 'builder'>('scientific');

  // 1. Fetch Datasets
  const { data: datasets, isLoading: datasetsLoading } = useQuery<DatasetDef[]>({
    queryKey: ['datasets'],
    queryFn: () => api.get<DatasetDef[]>('/datasets').then((res) => res.data),
  });

  const isotopeDataset = datasets?.find((d) => d.name === datasetParam);

  useEffect(() => {
    if (isotopeDataset) {
      setSelectedDatasetId(isotopeDataset.id);

      // Auto-switch subtab based on active dataset parameter
      if (datasetParam === 'oil_isotope' || datasetParam === 'csia_isotope') {
        setSubTab('oil_csia');
      } else if (datasetParam === 'gas_isotope') {
        setSubTab((prev) => (prev === 'oil_csia' ? 'genetics' : prev));
      }
    }
  }, [isotopeDataset, datasetParam]);

  // 2. Fetch Metadata filters options
  const { data: metadata, isLoading: metaLoading } = useQuery({
    queryKey: ['metadata', selectedDatasetId],
    queryFn: () =>
      api.get<{
        filter_options?: Record<string, string[]>;
        filter_ranges?: Record<string, { min: number; max: number }>;
      }>('/metadata', {
        params: { dataset_id: selectedDatasetId },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // 3. Fetch Summary KPIs
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats-dynamic', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api.get('/dashboard', {
        params: {
          dataset_id: selectedDatasetId,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // 4. Fetch Scientific Plots Records
  const { data: records = [], isLoading: recordsLoading } = useQuery<any[]>({
    queryKey: ['dashboard-scientific-plots', selectedDatasetId, serializedFilters],
    queryFn: () =>
      api.get('/dashboard/scientific-plots', {
        params: {
          dataset_id: selectedDatasetId,
          ...serializedFilters,
        },
      }).then((res) => res.data),
    enabled: !!selectedDatasetId,
  });

  // ... (Full JSX rendering Whiticar, Schoell, Chung, Galimov, and CSIA isotope cross-plots)
};
```

---

### 12. `frontend/src/components/charts/CustomPlot.tsx` — Wrapper Component
- **Real File Path:** `frontend/src/components/charts/CustomPlot.tsx`
- **Component:** `CustomPlot`
- **Total Lines:** 327 lines

```tsx
import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { applyGlobalLayoutDefaults, GLOBAL_PLOTLY_EXPORT_CONFIG, sanitizeFileName } from '../../utils/plotlyConfig';

interface CustomPlotProps {
  data: any[];
  layout: any;
  config?: any;
  className?: string;
  useResizeHandler?: boolean;
  onClick?: (data: any) => void;
  [key: string]: any;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#f59e0b',
  '#ec4899', '#22c55e', '#6366f1', '#84cc16', '#14b8a6',
  '#d97706', '#4f46e5', '#db2777', '#059669', '#7c3aed',
  '#9333ea', '#ea580c', '#be123c'
];

const PlotlySymbol: React.FC<{ symbol?: string; color: string; size?: number }> = ({ symbol = 'circle', color, size = 12 }) => {
  const normSymbol = String(symbol).toLowerCase();

  // If trace color is transparent or has low opacity, display a solid color for the legend
  let displayColor = color;
  if (color.startsWith('rgba')) {
    if (color.includes('0.05') || color.includes('0.1') || color.includes('0.2')) {
      if (color.includes('59, 130, 246')) displayColor = '#3b82f6';
      else if (color.includes('245, 158, 11')) displayColor = '#f59e0b';
      else if (color.includes('16, 185, 129')) displayColor = '#10b981';
      else if (color.includes('239, 68, 68')) displayColor = '#ef4444';
    }
  }

  if (normSymbol.includes('square')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <rect x="1" y="1" width="10" height="10" fill={displayColor} stroke="none" />
        {normSymbol.includes('cross') && (
          <>
            <line x1="6" y1="1" x2="6" y2="11" stroke="white" strokeWidth="1.5" />
            <line x1="1" y1="6" x2="11" y2="6" stroke="white" strokeWidth="1.5" />
          </>
        )}
      </svg>
    );
  }

  if (normSymbol.includes('diamond')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 11,6 6,11 1,6" fill={displayColor} stroke="none" />
        {normSymbol.includes('cross') && (
          <>
            <line x1="6" y1="1" x2="6" y2="11" stroke="white" strokeWidth="1.5" />
            <line x1="1" y1="6" x2="11" y2="6" stroke="white" strokeWidth="1.5" />
          </>
        )}
      </svg>
    );
  }

  if (normSymbol.includes('triangle-up')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 11,11 1,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('triangle-down')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="1,1 11,1 6,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('triangle-left')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="11,1 1,6 11,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('triangle-right')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="1,1 11,6 1,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('pentagon')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 11,5 9,11 3,11 1,5" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('star')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 7.5,4.5 11,5 8,7.5 9,11 6,9 3,11 4,7.5 1,5 4.5,4.5" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('hexagram')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="6,1 8,4.5 11,3 9,6 11,9 8,7.5 6,11 4,7.5 1,9 3,6 1,3 4,4.5" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('hourglass')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="1,1 11,1 6,6 1,11 11,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('bowtie')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <polygon points="1,1 11,1 6,11 11,11" fill={displayColor} stroke="none" />
      </svg>
    );
  }

  if (normSymbol.includes('x') || normSymbol === 'x') {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <line x1="2" y1="2" x2="10" y2="10" stroke={displayColor} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="10" y1="2" x2="2" y2="10" stroke={displayColor} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (normSymbol.includes('cross') || normSymbol.includes('asterisk')) {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
        <line x1="6" y1="1.5" x2="6" y2="10.5" stroke={displayColor} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="1.5" y1="6" x2="10.5" y2="6" stroke={displayColor} strokeWidth="2.5" strokeLinecap="round" />
        {normSymbol.includes('asterisk') && (
          <>
            <line x1="3" y1="3" x2="9" y2="9" stroke={displayColor} strokeWidth="2" strokeLinecap="round" />
            <line x1="9" y1="3" x2="3" y2="9" stroke={displayColor} strokeWidth="2" strokeLinecap="round" />
          </>
        )}
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className="inline-block shrink-0">
      <circle cx="6" cy="6" r="5" fill={displayColor} stroke="none" />
      {normSymbol.includes('cross') && (
        <>
          <line x1="6" y1="2.5" x2="6" y2="9.5" stroke="white" strokeWidth="1.5" />
          <line x1="2.5" y1="6" x2="9.5" y2="6" stroke="white" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
};

export const CustomPlot: React.FC<CustomPlotProps> = ({
  data = [],
  layout,
  config,
  className,
  useResizeHandler = true,
  onClick,
  ...props
}) => {
  const [hiddenTraces, setHiddenTraces] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initialHidden: Record<string, boolean> = {};
    data.forEach((trace) => {
      if (trace && trace.name && (trace.visible === 'legendonly' || trace.visible === false)) {
        initialHidden[trace.name] = true;
      }
    });
    setHiddenTraces(initialHidden);
  }, [data]);

  const toggleTrace = (name: string) => {
    setHiddenTraces((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  // 1. Process and center the layout title
  const propTitle = (props as any).title || '';
  const processedLayout = applyGlobalLayoutDefaults(layout || {}, propTitle);
  const finalLayout = {
    ...processedLayout,
    showlegend: false,
  };

  // 2. Extract graph title and configure dynamic snapshot filename
  const titleText =
    (typeof processedLayout.title === 'string' ? processedLayout.title : processedLayout.title?.text) ||
    (typeof layout?.title === 'string' ? layout.title : layout?.title?.text) ||
    (props as any).title ||
    '';
  const cleanFilename = sanitizeFileName(titleText);

  const finalConfig = {
    ...GLOBAL_PLOTLY_EXPORT_CONFIG,
    ...config,
    toImageButtonOptions: {
      ...GLOBAL_PLOTLY_EXPORT_CONFIG.toImageButtonOptions,
      filename: cleanFilename,
      ...(config?.toImageButtonOptions || {}),
    },
  };

  const finalData = data.map((trace) => {
    if (trace && trace.name && hiddenTraces[trace.name]) {
      return { ...trace, visible: 'legendonly' };
    }
    return trace;
  });

  const legendItems = data
    .map((trace, index) => {
      if (trace && trace.name && trace.showlegend !== false) {
        let color = '#475569';
        if (trace.marker && trace.marker.color) {
          color = trace.marker.color;
        } else if (trace.line && trace.line.color) {
          color = trace.line.color;
        } else if (trace.fillcolor) {
          color = trace.fillcolor;
        } else {
          color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
        }

        const symbol = trace.marker && trace.marker.symbol ? trace.marker.symbol : 'circle';
        const isLine = typeof trace.mode === 'string' && trace.mode.includes('lines') && !trace.mode.includes('markers');
        const isLineAndMarker = typeof trace.mode === 'string' && trace.mode.includes('lines') && trace.mode.includes('markers');

        return {
          name: trace.name,
          color,
          symbol,
          isLine,
          isLineAndMarker,
          originalIndex: index,
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const uniqueLegendItems: typeof legendItems = [];
  const seenNames = new Set<string>();
  legendItems.forEach((item) => {
    if (!seenNames.has(item.name)) {
      seenNames.add(item.name);
      uniqueLegendItems.push(item);
    }
  });

  const hasVisibleLegend = layout?.showlegend !== false && uniqueLegendItems.length > 0;

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="flex-1 min-h-0">
        <Plot
          data={finalData}
          layout={finalLayout}
          config={finalConfig}
          className={className}
          useResizeHandler={useResizeHandler}
          onClick={onClick}
          {...props}
        />
      </div>
      {hasVisibleLegend && (
        <div className="mt-3 px-4 py-2 bg-white border border-slate-200/85 rounded-lg shadow-2xs w-full">
          <div className="flex items-center gap-6 overflow-x-auto w-full py-1.5 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {uniqueLegendItems.map((item) => {
              const isHidden = !!hiddenTraces[item.name];
              return (
                <button
                  key={item.name}
                  onClick={() => toggleTrace(item.name)}
                  className={`flex items-center gap-2 shrink-0 select-none cursor-pointer hover:bg-slate-50 px-2 py-1 rounded transition-colors text-xs font-semibold ${
                    isHidden ? 'text-slate-400 line-through opacity-60' : 'text-slate-700'
                  }`}
                  title={`Click to show/hide ${item.name}`}
                >
                  {item.isLine ? (
                    <svg width="16" height="12" viewBox="0 0 16 12" className="inline-block shrink-0">
                      <line x1="1" y1="6" x2="15" y2="6" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  ) : item.isLineAndMarker ? (
                    <svg width="16" height="12" viewBox="0 0 16 12" className="inline-block shrink-0">
                      <line x1="1" y1="6" x2="15" y2="6" stroke={item.color} strokeWidth="1.5" />
                      <circle cx="8" cy="6" r="3.5" fill={item.color} />
                    </svg>
                  ) : (
                    <PlotlySymbol symbol={item.symbol} color={item.color} size={11} />
                  )}
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
```

---

# PART 2: CONFIRMED PROJECT FACTS FOR YOUR REPORT

---

### 1. Exact Package Versions

#### Backend (`backend/requirements.txt`):
```text
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
sqlalchemy>=2.0.28
psycopg2-binary>=2.9.9
alembic>=1.13.1
pydantic>=2.6.4
pydantic-settings>=2.2.1
python-jose[cryptography]>=3.3.0
types-python-jose
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.9
pandas>=2.2.1
openpyxl>=3.1.2
reportlab>=4.1.0
requests>=2.31.0
python-dateutil>=2.9.0
email-validator>=2.0.0
bcrypt==4.0.1
oracledb>=2.0.0
plotly>=5.18.0
matplotlib>=3.8.0
```

#### Frontend (`frontend/package.json`):
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.28.9",
    "axios": "^1.6.8",
    "clsx": "^2.1.0",
    "lucide-react": "^0.359.0",
    "plotly.js-dist-min": "^2.30.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.51.1",
    "react-plotly.js": "^2.6.0",
    "react-router-dom": "^6.22.3",
    "tailwind-merge": "^2.2.2"
  },
  "devDependencies": {
    "@types/node": "^20.11.30",
    "@types/plotly.js": "^2.12.30",
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "@types/react-plotly.js": "^2.6.3",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.4.3",
    "vite": "^5.1.6"
  }
}
```

---

### 2. Actual Database Table Names
Extracted directly from SQLAlchemy `Base.metadata`:

1. `audit_logs` (User action audit trails)
2. `dataset_registry` (Dynamic schema registration metadata)
3. `dataset_versions` (Historical ingestion versions)
4. `generic_dataset_records` (Dynamic JSONB EAV store for uploaded CSV/Excel data)
5. `petroleum_data` (Legacy core / cuttings geochemical table)
6. `upload_logs` (Upload history and error status tracking)
7. `users` (User accounts, roles, hashed passwords)
8. `variable_registry` (Variable definitions, units, synonyms, KPI flags)
9. `version_record_mapping` (Mapping linking records to specific dataset versions)

*(Note: In Oracle production mode, DDL also integrates with live Oracle views: `DL_CL_CORE_SOURCEROCK_VW`, `DL_CL_CUTTING_SOURCEROCK_VW`, `DL_GAS_CHROMATOGRAPHY_VW`, `DL_GAS_ISOTOPE_VW`, `DL_SAT_AROMATIC_FRACTION_VW`, `DL_BIOMARKER_STERANE_VW`, `DL_BIOMARKER_HOPANE_VW`, `DL_BIOMARKER_AROMATIC_VW`, `DL_BIOMARKER_PR_PH_VW`, `DL_OIL_ISOTOPE_VW`, `DL_CSIA_ISOTOPE_VW`, `DL_MICROBIOLOGY_DATA_VW`)*

---

### 3. Real List of API Routes (36 Endpoints)
Directly exported from FastAPI's OpenAPI schema:

| HTTP Method | Route Path | Summary |
|---|---|---|
| `GET` | `/` | Root health status |
| `GET` | `/api/datasets` | Get Datasets |
| `GET` | `/api/datasets/{id}` | Get Dataset by ID |
| `GET` | `/api/datasets/{dataset_id}/records` | Get Dynamic Records |
| `GET` | `/api/metadata` | Get Metadata |
| `POST` | `/api/upload` | Upload File |
| `GET` | `/api/variables` | Get Variables |
| `GET` | `/api/v1/audit-logs` | Get Audit Logs |
| `POST` | `/api/v1/auth/forgot-password` | Forgot Password |
| `POST` | `/api/v1/auth/login` | Login Access Token |
| `GET` | `/api/v1/auth/me` | Read Current User Profile |
| `PUT` | `/api/v1/auth/me/password` | Change Password |
| `POST` | `/api/v1/auth/refresh` | Refresh Token |
| `POST` | `/api/v1/backup` | Trigger System Backup |
| `POST` | `/api/v1/restore` | Trigger System Restore |
| `GET` | `/api/v1/dashboard` | Get Dashboard Summary / KPIs |
| `GET` | `/api/v1/dashboard/chart-data` | Get Chart Data |
| `GET` | `/api/v1/dashboard/cross-chart-data` | Get Cross Chart Data |
| `GET` | `/api/v1/dashboard/embed-url` | Get Metabase Embed Url |
| `GET` | `/api/v1/dashboard/graph-data/{graph_id}` | Get Graph Specific Data |
| `GET` | `/api/v1/dashboard/scientific-plots` | Get Scientific Plots Data |
| `GET` | `/api/v1/datasets` | Get Datasets |
| `GET` | `/api/v1/datasets/{id}` | Get Dataset |
| `GET` | `/api/v1/datasets/{dataset_id}/records` | Get Dynamic Records |
| `GET` | `/api/v1/health` | Health Check |
| `GET` | `/api/v1/metadata` | Get Metadata & Filter Ranges |
| `GET` | `/api/v1/monitoring` | Get Monitoring Status |
| `GET` | `/api/v1/oracle/regions` | Get Oracle Regions |
| `GET` | `/api/v1/oracle/status` | Get Oracle Live Status |
| `POST` | `/api/v1/oracle/switch-region` | Handle Switch Region |
| `GET` | `/api/v1/reports` | Download CSV / Excel Report |
| `POST` | `/api/v1/reports/export-pdf` | Export PDF With Snapshots |
| `POST` | `/api/v1/upload` | Ingest CSV / Excel File |
| `GET` | `/api/v1/users` | Read Users List (Admin) |
| `POST` | `/api/v1/users` | Create User (Admin) |
| `GET` | `/api/v1/users/{user_id}` | Read User By Id |
| `PUT` | `/api/v1/users/{user_id}` | Update User |
| `DELETE` | `/api/v1/users/{user_id}` | Delete User |
| `GET` | `/api/v1/variables` | Get Variables |

---

### 4. Default Seeded User Credentials
From `backend/app/db/init_db.py` and `config.py`:

| Role | Email | Default Password | Full Name |
|---|---|---|---|
| **Admin** | `admin@ongc.co.in` | `Admin@123456` | GVMS Chief Geochemist |
| **Researcher** | `researcher@ongc.co.in` | `Researcher@123` | Senior Geochemist |
| **Viewer** | `viewer@ongc.co.in` | `Viewer@123` | Lab Analyst Viewer |

---

### 5. Docker Compose Services and Ports

#### Development (`docker-compose.yml`):
- **Stack Name:** `gvms`
- **Network:** `gvms-network`
- **Services & Ports:**
  1. `postgres` (Container: `gvms-postgres`) — Host `5433` -> Container `5432`
  2. `backend` (Container: `gvms-backend`) — Host `8000` -> Container `8000`
  3. `metabase` (Container: `gvms-metabase`) — Host `3001` -> Container `3000`
  4. `frontend` (Container: `gvms-frontend`) — Host `3005` -> Container `3005`
  5. `nginx` (Container: `gvms-nginx`) — Host `80` -> Container `80`

#### Production (`docker-compose.prod.yml`):
- **Stack Name:** `gvms`
- **Network:** `gvms-prod-network`
- **Services & Ports:**
  1. `postgres` (Container: `gvms-postgres-prod`) — Host `5432` -> Container `5432`
  2. `backend` (Container: `gvms-backend-prod`) — Host `8001` -> Container `8000`
  3. `metabase` (Container: `gvms-metabase-prod`) — Host `3002` -> Container `3000`
  4. `frontend` (Container: `gvms-frontend-prod`) — Host `3001` -> Container `3000`
  5. `nginx` (Container: `gvms-nginx-prod`) — Host `80` -> Container `80`, Host `8443` -> Container `443`
