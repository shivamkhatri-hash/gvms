import io
import json
import pandas as pd
import time
import re
import logging
from typing import List, Dict, Any, Tuple, Optional, cast
from uuid import UUID
from sqlalchemy import inspect, text as sa_text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.registry import DatasetRegistry, VariableRegistry, VersionRecordMapping, DatasetVersion
from app.crud.crud_log import crud_log

logger = logging.getLogger(__name__)

class CSVProcessor:
    @classmethod
    def normalize_header(cls, header: str) -> str:
        """
        Normalize a spreadsheet header using LIMS metadata rules:
        - Lowercase
        - Remove brackets and their contents (e.g. units like '(m)' or '(wt%)')
        - Remove special characters like %, -, _, and spaces
        - Strip leading/trailing underscores or spaces
        """
        if not header or pd.isna(header):
            return ""
        s = header.strip().lower()
        # Remove brackets and any contents inside them
        s = re.sub(r'\(.*?\)', '', s)
        s = re.sub(r'\[.*?\]', '', s)
        # Remove separators and special characters
        s = s.replace("%", "perc").replace("-", "").replace("_", "").replace(".", "")
        # Remove all whitespace
        s = re.sub(r'\s+', '', s)
        return s.strip()

    @classmethod
    def preprocess_isotope_multi_header(cls, df_raw: pd.DataFrame) -> pd.DataFrame:
        """
        Detect and collapse stable isotope double header spreadsheets into a single header row.
        """
        if len(df_raw) > 1 and len(df_raw.columns) >= 25:
            # Check row 0 for keywords like "Molecular Composition" or "Stable Carbon Isotopic"
            row0_str = " ".join([str(x).lower() for x in df_raw.iloc[0] if x is not None])
            if "molecular composition" in row0_str or "carbon isotopic" in row0_str or "stable carbon" in row0_str:
                collapsed_headers = []
                for col_idx in range(len(df_raw.columns)):
                    val0 = str(df_raw.iloc[0, col_idx]).strip()
                    val1 = str(df_raw.iloc[1, col_idx]).strip()
                    
                    v0_empty = (val0 == "" or val0.lower() == "nan" or pd.isna(df_raw.iloc[0, col_idx]))
                    v1_empty = (val1 == "" or val1.lower() == "nan" or pd.isna(df_raw.iloc[1, col_idx]))
                    
                    if v0_empty and not v1_empty:
                        collapsed_headers.append(val1)
                    elif not v0_empty and v1_empty:
                        collapsed_headers.append(val0)
                    elif not v0_empty and not v1_empty:
                        v0_lower = val0.lower()
                        if "molecular composition" in v0_lower or "carbon isotopic" in v0_lower or "stable carbon" in v0_lower:
                            collapsed_headers.append(val1)
                        else:
                            collapsed_headers.append(val1 if len(val1) > 0 else val0)
                    else:
                        collapsed_headers.append(f"Col_{col_idx}")
                
                # Create a new DataFrame with collapsed headers
                df_new = df_raw.iloc[2:].copy()
                df_new.columns = collapsed_headers
                # Insert the collapsed headers as row 0 so that detect_dataset scan will find it at r_idx = 0
                df_header_row = pd.DataFrame([collapsed_headers], columns=collapsed_headers)
                df_res = pd.concat([df_header_row, df_new], ignore_index=True)
                return df_res
        return df_raw

    @classmethod
    def preprocess_hopane_header(cls, df_raw: pd.DataFrame) -> pd.DataFrame:
        """
        Merge double-header rows in Hopane datasets to avoid duplicate column names.
        """
        if len(df_raw) > 1:
            collapsed_headers = []
            last_val0 = ""
            for col_idx in range(len(df_raw.columns)):
                val0 = str(df_raw.iloc[0, col_idx]).strip()
                val1 = str(df_raw.iloc[1, col_idx]).strip()
                
                # Protect isomer markers in parentheses
                for pat in ["(R)", "(S)", "(r)", "(s)"]:
                    val0 = val0.replace(pat, " " + pat[1])
                    val1 = val1.replace(pat, " " + pat[1])
                
                v0_empty = (val0 == "" or val0.lower() == "nan" or pd.isna(df_raw.iloc[0, col_idx]))
                v1_empty = (val1 == "" or val1.lower() == "nan" or pd.isna(df_raw.iloc[1, col_idx]))
                
                if not v0_empty:
                    last_val0 = val0
                
                # Strip bracket contents from last_val0
                clean_v0 = re.sub(r'\(.*?\)', '', last_val0).strip()
                
                if v0_empty and not v1_empty:
                    collapsed_headers.append(f"{clean_v0} {val1}")
                elif not v0_empty and v1_empty:
                    collapsed_headers.append(val0)
                elif not v0_empty and not v1_empty:
                    collapsed_headers.append(f"{clean_v0} {val1}")
                else:
                    collapsed_headers.append(f"Col_{col_idx}")
            
            # Create a new DataFrame with collapsed headers
            df_new = df_raw.iloc[2:].copy()
            df_new.columns = collapsed_headers
            df_header_row = pd.DataFrame([collapsed_headers], columns=collapsed_headers)
            df_res = pd.concat([df_header_row, df_new], ignore_index=True)
            return df_res
        return df_raw

    @classmethod
    def preprocess_sterane_header(cls, df_raw: pd.DataFrame) -> pd.DataFrame:
        """
        Merge double-header rows in Sterane datasets to avoid duplicate column names.
        """
        if len(df_raw) > 1:
            collapsed_headers = []
            last_val0 = ""
            for col_idx in range(len(df_raw.columns)):
                val0 = str(df_raw.iloc[0, col_idx]).strip()
                val1 = str(df_raw.iloc[1, col_idx]).strip()
                
                # Protect isomer markers in parentheses
                for pat in ["(R)", "(S)", "(r)", "(s)"]:
                    val0 = val0.replace(pat, " " + pat[1])
                    val1 = val1.replace(pat, " " + pat[1])
                
                v0_empty = (val0 == "" or val0.lower() == "nan" or pd.isna(df_raw.iloc[0, col_idx]))
                v1_empty = (val1 == "" or val1.lower() == "nan" or pd.isna(df_raw.iloc[1, col_idx]))
                
                if not v0_empty:
                    last_val0 = val0
                
                # Strip bracket contents from last_val0
                clean_v0 = re.sub(r'\(.*?\)', '', last_val0).strip()
                
                if v0_empty and not v1_empty:
                    collapsed_headers.append(f"{clean_v0} {val1}")
                elif not v0_empty and v1_empty:
                    collapsed_headers.append(val0)
                elif not v0_empty and not v1_empty:
                    collapsed_headers.append(f"{clean_v0} {val1}")
                else:
                    collapsed_headers.append(f"Col_{col_idx}")
            
            # Create a new DataFrame with collapsed headers
            df_new = df_raw.iloc[2:].copy()
            df_new.columns = collapsed_headers
            df_header_row = pd.DataFrame([collapsed_headers], columns=collapsed_headers)
            df_res = pd.concat([df_header_row, df_new], ignore_index=True)
            return df_res
        return df_raw

    @classmethod
    def detect_dataset(cls, file_bytes: bytes, filename: str, db: Session) -> Tuple[DatasetRegistry, int]:
        """
        Scan a spreadsheet's first 15 rows and match column headers against
        the Variable Registry to detect the dataset type and header row index.
        """
        is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")
        try:
            if is_excel:
                df_raw = pd.read_excel(io.BytesIO(file_bytes), header=None)
            else:
                df_raw = pd.read_csv(io.BytesIO(file_bytes), header=None)
        except Exception as e:
            raise ValueError(f"Failed to parse file content: {str(e)}")

        # Drop completely empty/nan rows at the start of the dataframe
        while len(df_raw) > 0 and df_raw.iloc[0].isna().all():
            df_raw = df_raw.iloc[1:].reset_index(drop=True)

        df_raw = cls.preprocess_isotope_multi_header(df_raw)
        if len(df_raw) > 0:
            row0_str = " ".join([str(x).lower() for x in df_raw.iloc[0] if x is not None])
            if "hopane" in row0_str or "homohopane" in row0_str:
                df_raw = cls.preprocess_hopane_header(df_raw)
            elif "sterane" in row0_str or "diasterane" in row0_str:
                df_raw = cls.preprocess_sterane_header(df_raw)

        total_rows_raw = len(df_raw)
        if total_rows_raw == 0:
            raise ValueError("Uploaded file contains no data rows.")

        datasets = db.query(DatasetRegistry).filter(DatasetRegistry.is_active == True).all()
        if not datasets:
            raise ValueError("No registered dataset configuration found in database.")

        best_dataset = None
        best_r_idx = 0
        best_score = -1

        # Scan the first 15 rows for column matches
        for r_idx in range(min(15, total_rows_raw)):
            row_vals = [str(x).strip() for x in df_raw.iloc[r_idx] if x is not None and not pd.isna(x)]
            norm_row_vals = [cls.normalize_header(x) for x in row_vals if cls.normalize_header(x)]
            if not norm_row_vals:
                continue

            for ds in datasets:
                variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == ds.id).all()
                
                # Gather target normalized names for variables
                target_names = {}
                for v in variables:
                    target_names[cls.normalize_header(cast(str, v.sql_column_name))] = cast(str, v.sql_column_name)
                    target_names[cls.normalize_header(cast(str, v.name))] = cast(str, v.sql_column_name)
                    for syn in (v.synonyms or []):
                        target_names[cls.normalize_header(cast(str, syn))] = cast(str, v.sql_column_name)

                # Add mapping configuration synonyms
                mapping = ds.mapping_config or {}
                for canonical, aliases in mapping.items():
                    target_names[cls.normalize_header(cast(str, canonical))] = cast(str, canonical)
                    for alias in aliases:
                        target_names[cls.normalize_header(cast(str, alias))] = cast(str, canonical)

                # Calculate matches
                matches = 0
                matched_required = set()
                required_cols = [cls.normalize_header(cast(str, c)) for c in (ds.required_columns or [])]

                for norm_val in norm_row_vals:
                    if norm_val in target_names:
                        matches += 1
                        canonical = target_names[norm_val]
                        norm_canonical = cls.normalize_header(cast(str, canonical))
                        if norm_canonical in required_cols:
                            matched_required.add(norm_canonical)

                # Calculate score
                total_required = len(required_cols)
                required_ratio = len(matched_required) / total_required if total_required > 0 else 1.0
                
                score = (required_ratio * 1000) + matches

                # Standard threshold check: must match at least 50% of required variables
                if required_ratio >= 0.5 and score > best_score:
                    best_score = score
                    best_dataset = ds
                    best_r_idx = r_idx

        if not best_dataset:
            raise ValueError("Variable mapping failure: No matching dataset registry found for the uploaded headers.")

        return best_dataset, best_r_idx

    @classmethod
    def process_file(
        cls,
        file_bytes: bytes,
        filename: str,
        db: Session,
        uploader_id: Optional[UUID] = None,
        dataset_id: Optional[int] = None,
        version_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Ingest a CSV/Excel file synchronously, dynamically mapping headers using Variable Registry.
        Automatically detects the dataset if dataset_id is not specified.
        """
        start_time = time.time()
        warnings = []
        is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")

        logger.info(f"Ingestion pipeline started: filename='{filename}', size={len(file_bytes)} bytes")

        # 1. Parse Raw File Content & Auto-detect Sheet if Excel
        try:
            detected_dataset = None
            header_row_idx = 0
            selected_sheet = None

            if is_excel:
                xl = pd.ExcelFile(io.BytesIO(file_bytes))
                
                # Fetch all active datasets
                datasets = db.query(DatasetRegistry).filter(DatasetRegistry.is_active == True).all()

                # If dataset_id is pre-specified, load it
                if dataset_id:
                    detected_dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
                    if not detected_dataset:
                        raise ValueError(f"Specified dataset configuration ID {dataset_id} not found.")

                if detected_dataset:
                    # Find the sheet with the most matches for this specific dataset
                    best_sheet = xl.sheet_names[0]
                    best_matches = -1
                    best_r_idx = 0
                    
                    variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == detected_dataset.id).all()
                    target_names = {cls.normalize_header(cast(str, v.sql_column_name)) for v in variables}
                    for v in variables:
                        for syn in (v.synonyms or []):
                            target_names.add(cls.normalize_header(cast(str, syn)))
                            
                    for sname in xl.sheet_names:
                        df_temp = pd.read_excel(xl, sheet_name=sname, header=None)
                        df_temp = cls.preprocess_isotope_multi_header(df_temp)
                        for r_idx in range(min(15, len(df_temp))):
                            row_vals = [cls.normalize_header(x) for x in df_temp.iloc[r_idx] if x is not None and not pd.isna(x)]
                            matches = sum(1 for x in row_vals if x in target_names)
                            if matches > best_matches:
                                best_matches = matches
                                best_sheet = sname
                                best_r_idx = r_idx
                                
                    df_raw = pd.read_excel(xl, sheet_name=best_sheet, header=None)
                    selected_sheet = best_sheet
                    header_row_idx = best_r_idx
                else:
                    # Auto-detect mode: scan all sheets and all datasets to find the best pair
                    best_dataset = None
                    best_sheet = xl.sheet_names[0]
                    best_score = -1
                    best_r_idx = 0
                    
                    for sname in xl.sheet_names:
                        df_temp = pd.read_excel(xl, sheet_name=sname, header=None)
                        df_temp = cls.preprocess_isotope_multi_header(df_temp)
                        for r_idx in range(min(15, len(df_temp))):
                            row_vals = [cls.normalize_header(x) for x in df_temp.iloc[r_idx] if x is not None and not pd.isna(x)]
                            norm_row_vals = [x for x in row_vals if x]
                            if not norm_row_vals:
                                continue
                                
                            for ds in datasets:
                                variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == ds.id).all()
                                target_names = {}
                                for v in variables:
                                    target_names[cls.normalize_header(cast(str, v.sql_column_name))] = cast(str, v.sql_column_name)
                                    target_names[cls.normalize_header(cast(str, v.name))] = cast(str, v.sql_column_name)
                                    for syn in (v.synonyms or []):
                                        target_names[cls.normalize_header(cast(str, syn))] = cast(str, v.sql_column_name)
                                        
                                matches = 0
                                matched_required = set()
                                required_cols = [cls.normalize_header(cast(str, c)) for c in (ds.required_columns or [])]
                                
                                for norm_val in norm_row_vals:
                                    if norm_val in target_names:
                                        matches += 1
                                        canonical = target_names[norm_val]
                                        norm_canonical = cls.normalize_header(cast(str, canonical))
                                        if norm_canonical in required_cols:
                                            matched_required.add(norm_canonical)
                                            
                                total_required = len(required_cols)
                                required_ratio = len(matched_required) / total_required if total_required > 0 else 1.0
                                score = (required_ratio * 1000) + matches
                                
                                if required_ratio >= 0.5 and score > best_score:
                                    best_score = score
                                    best_dataset = ds
                                    best_sheet = sname
                                    best_r_idx = r_idx
                                    
                    if best_dataset:
                        detected_dataset = best_dataset
                        df_raw = pd.read_excel(xl, sheet_name=best_sheet, header=None)
                        selected_sheet = best_sheet
                        header_row_idx = best_r_idx
                    else:
                        # Fallback to sheet 0
                        df_raw = pd.read_excel(xl, sheet_name=0, header=None)
                        selected_sheet = xl.sheet_names[0]
                        header_row_idx = 0
            else:
                df_raw = pd.read_csv(io.BytesIO(file_bytes), header=None)
                selected_sheet = "CSV"
                
            # Drop completely empty/nan rows at the start of the dataframe immediately after loading
            while len(df_raw) > 0 and df_raw.iloc[0].isna().all():
                df_raw = df_raw.iloc[1:].reset_index(drop=True)

            # Fetch dataset_id if pre-specified
            if dataset_id:
                detected_dataset = db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()
                if not detected_dataset:
                    raise ValueError(f"Specified dataset configuration ID {dataset_id} not found.")
            
            # Auto-detect if not pre-specified
            if not detected_dataset:
                detected_dataset, header_row_idx = cls.detect_dataset(file_bytes, filename, db)
            else:
                best_r_idx = 0
                best_matches = -1
                variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == detected_dataset.id).all()
                target_names = {cls.normalize_header(cast(str, v.sql_column_name)) for v in variables}
                df_temp = cls.preprocess_isotope_multi_header(df_raw)
                for r_idx in range(min(15, len(df_temp))):
                    row_vals = [cls.normalize_header(x) for x in df_temp.iloc[r_idx] if x is not None and not pd.isna(x)]
                    matches = sum(1 for x in row_vals if x in target_names)
                    if matches > best_matches:
                        best_matches = matches
                        best_r_idx = r_idx
                header_row_idx = best_r_idx
                    
        except Exception as e:
            logger.error(f"Error parsing file '{filename}': {str(e)}")
            raise ValueError(f"Failed to parse file content: {str(e)}")

        df_raw = cls.preprocess_isotope_multi_header(df_raw)
        if len(df_raw) > 0:
            row0_str = " ".join([str(x).lower() for x in df_raw.iloc[0] if x is not None])
            if "hopane" in row0_str or "homohopane" in row0_str:
                df_raw = cls.preprocess_hopane_header(df_raw)
            elif "sterane" in row0_str or "diasterane" in row0_str:
                df_raw = cls.preprocess_sterane_header(df_raw)

        # 1.5 Transpose CSIA sheet if it's detected and transposed
        if detected_dataset and detected_dataset.name == "csia_isotope":
            is_transposed = False
            carbon_col_idx = -1
            header_row_idx_csia = -1
            
            # Look for nC15 and nC16 in the first few columns (indicating transposed list layout)
            for col_idx in range(min(5, len(df_raw.columns))):
                col_vals = [cls.normalize_header(str(x)) for x in df_raw.iloc[:, col_idx]]
                if "nc15" in col_vals and "nc16" in col_vals:
                    is_transposed = True
                    carbon_col_idx = col_idx
                    header_row_idx_csia = col_vals.index("nc15") - 1
                    break
                    
            if is_transposed:
                logger.info("Transposing CSIA dataset...")
                carbon_numbers = []
                for r in range(header_row_idx_csia + 1, len(df_raw)):
                    c_val = str(df_raw.iloc[r, carbon_col_idx]).strip()
                    if c_val and c_val.lower() != "nan":
                        carbon_numbers.append(c_val)
                        
                samples = []
                sample_cols = []
                for col in range(carbon_col_idx + 1, len(df_raw.columns)):
                    s_val = str(df_raw.iloc[header_row_idx_csia, col]).replace("\n", " ").strip()
                    if s_val and s_val.lower() != "nan":
                        samples.append(s_val)
                        sample_cols.append(col)
                        
                transposed_rows = []
                for col in sample_cols:
                    s_name = str(df_raw.iloc[header_row_idx_csia, col]).replace("\n", " ").strip()
                    row_dict: dict[str, Any] = {
                        "well_name": s_name,
                        "depth": None,
                        "formation": None
                    }
                    for r_offset, carbon in enumerate(carbon_numbers):
                        val = df_raw.iloc[header_row_idx_csia + 1 + r_offset, col]
                        col_name = carbon.lower().replace("-", "")
                        try:
                            row_dict[col_name] = float(val) if val is not None and str(val).strip() != "" else None
                        except:
                            row_dict[col_name] = None
                    transposed_rows.append(row_dict)
                    
                df_raw = pd.DataFrame(transposed_rows)
                header_row_idx = 0
                logger.info(f"Transposed CSIA into DataFrame with {len(df_raw)} records.")

        logger.info(f"Dataset detected: name='{detected_dataset.name}', ID={detected_dataset.id}, Table='{detected_dataset.sql_table_name}'")
        logger.info(f"Header row index identified at: {header_row_idx}")

        # 4. Read Variable Registry & Database Schema Columns
        variables = db.query(VariableRegistry).filter(VariableRegistry.dataset_id == detected_dataset.id).all()
        var_map = {cast(str, v.sql_column_name): v for v in variables}

        # Inspect database columns to prevent SQL injection or mapping to missing fields
        try:
            bind = db.get_bind()
            inspector = inspect(bind)
            table_name = str(detected_dataset.sql_table_name)
            try:
                columns_meta = inspector.get_columns(table_name)
            except Exception:
                columns_meta = inspector.get_columns(table_name.lower())
            db_columns = {c['name'] for c in columns_meta}
        except Exception as inspect_err:
            logger.error(f"Failed to inspect SQL table columns: {str(inspect_err)}")
            db_columns = set()

        # 5. Extract and normalize spreadsheet headers
        raw_headers = [str(df_raw.iloc[header_row_idx, col_idx]).strip() for col_idx in range(len(df_raw.columns))]
        df = df_raw.iloc[header_row_idx + 1:].copy()
        df.columns = raw_headers
        df = df.reset_index(drop=True)
        total_rows = len(df)

        # 6. Map spreadsheet headers dynamically using Variable Registry synonyms (Two-pass match)
        rename_map = {}
        mapped_vars = {}
        unmapped_cols = set(df.columns)

        # Pass 1: Exact matches on canonical SQL column names or variable names
        for var in variables:
            canonical_names = {cls.normalize_header(cast(str, var.sql_column_name)), cls.normalize_header(cast(str, var.name))}
            for col_name in list(unmapped_cols):
                norm_header = cls.normalize_header(col_name)
                if norm_header in canonical_names:
                    rename_map[col_name] = cast(str, var.sql_column_name)
                    mapped_vars[cast(str, var.sql_column_name)] = col_name
                    unmapped_cols.remove(col_name)
                    break

        # Pass 2: Synonym/Alias matches for remaining variables
        for var in variables:
            if cast(str, var.sql_column_name) in mapped_vars:
                continue
                
            # Build target names list for fuzzy synonym matching
            target_syns = set()
            for syn in (var.synonyms or []):
                target_syns.add(cls.normalize_header(cast(str, syn)))
            
            # Map based on dataset-wide config mapping
            mapping = detected_dataset.mapping_config or {}
            if cast(str, var.sql_column_name) in mapping:
                for alias in mapping[cast(str, var.sql_column_name)]:
                    target_syns.add(cls.normalize_header(cast(str, alias)))

            for col_name in list(unmapped_cols):
                norm_header = cls.normalize_header(col_name)
                if norm_header in target_syns:
                    rename_map[col_name] = cast(str, var.sql_column_name)
                    mapped_vars[cast(str, var.sql_column_name)] = col_name
                    unmapped_cols.remove(col_name)
                    break

        df = df.rename(columns=rename_map)

        # 6.5. Backward compatibility positional defaults for legacy petroleum_geochem
        if detected_dataset.name == "petroleum_geochem":
            positional_defaults = {
                0: "sample_type",
                1: "well_name",
                2: "depth_from",
                3: "depth_interval",
                4: "toc",
                5: "s2"
            }
            for pos, canonical in positional_defaults.items():
                if canonical not in df.columns and len(df.columns) > pos:
                    col_name = df.columns[pos]
                    if "unnamed" in f"{col_name}".lower() or not f"{col_name}".strip():
                        df = df.rename(columns={col_name: canonical})
                        mapped_vars[canonical] = col_name
            
            # Filename well extraction fallback
            if "well_name" not in df.columns:
                match = re.search(r'\b([A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)?|[A-Z]+-[0-9]+[A-Za-z0-9-]*)\b', filename, re.IGNORECASE)
                df["well_name"] = match.group(1).upper() if match else "UNKNOWN_WELL"
            else:
                df["well_name"] = df["well_name"].fillna("UNKNOWN_WELL")

            if "depth_from" not in df.columns:
                df["depth_from"] = [float(i) for i in range(len(df))]
            else:
                df["depth_from"] = df["depth_from"].fillna(pd.Series([float(i) for i in range(len(df))]))

            if "sample_type" not in df.columns:
                df["sample_type"] = "cuttings"
            else:
                df["sample_type"] = df["sample_type"].fillna("cuttings")

            if "depth_interval" not in df.columns:
                df["depth_interval"] = 1.0
            else:
                df["depth_interval"] = df["depth_interval"].fillna(1.0)

        # 7. Validate Required Columns
        required_cols = [cast(str, v.sql_column_name) for v in variables if v.is_required]
        missing_required = [col for col in required_cols if col not in df.columns]
        if missing_required:
            logger.error(f"Missing required columns for dataset '{detected_dataset.name}': {missing_required}")
            raise ValueError(f"Missing required column: {missing_required[0]}")

        # 8. Load Existing Keys for Duplicate Check
        well_col = cast(Optional[str], detected_dataset.primary_well_column)
        depth_col = cast(Optional[str], detected_dataset.primary_depth_column)
        existing_keys = set()
        if well_col and depth_col and well_col in df.columns and depth_col in df.columns:
            try:
                query = sa_text(f'SELECT "{well_col}", "{depth_col}" FROM {detected_dataset.sql_table_name}')
                res = db.execute(query).fetchall()
                existing_keys = {
                    (f"{r[0]}".strip().upper(), float(r[1]))
                    for r in res
                    if r[0] is not None and r[1] is not None
                }
                logger.info(f"Loaded {len(existing_keys)} existing keys for duplicate check.")
            except Exception as e:
                logger.warning(f"Failed to load duplicate check keys: {str(e)}")

        # 9. Row Validation & Parsing
        valid_records = []
        skipped_rows = 0
        duplicates = 0
        quality_report_list = []
        
        scientific_vars = {"toc", "s1", "s2", "s3", "pi", "hi", "oi", "osi", "s2_s3", "minc", "tmax", "vro", "pc", "rc", "top_depth", "bottom_depth", "pr", "ph", "pr_by_ph", "pr_by_nc17", "ph_by_nc18", "pr_nc17_by_ph_nc18", "nc21_nc22_by_nc28_nc29", "oep_odd_even_pref", "cp_index", "ta_ratio", "nc17_by_nc29", "paq", "nc17_by_nc27", "c_max", "ibp", "water_content", "api_gravity", "pour_point", "sulfur", "sat", "ar", "sat_by_aro", "asp", "nso"}
        for i in range(10, 41):
            scientific_vars.add(f"nc{i}")

        for index, row in df.iterrows():
            row_num = int(str(index)) + 2 + header_row_idx
            try:
                record = {}
                for col_name, var_def in var_map.items():
                    if col_name not in df.columns:
                        record[col_name] = None
                        if col_name.lower() in scientific_vars:
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get(col_name, col_name),
                                "oracle_col": col_name.upper(),
                                "original": "Missing",
                                "action": "Converted to NULL",
                                "stored": "NULL",
                                "reason": "Missing numeric value"
                            })
                        continue

                    val = row[col_name]
                    
                    # Value Normalization placeholders
                    null_placeholders = {"-", "--", "na", "n/a", "null", "nan", "blank", "empty", ""}
                    val_str_clean = str(val).strip().lower() if val is not None and not pd.isna(val) else ""
                    is_null_placeholder = (val is None) or (pd.isna(val)) or (val_str_clean in null_placeholders)

                    if is_null_placeholder:
                        record[col_name] = None
                        if var_def.is_numeric:
                            orig_val_repr = str(val) if val is not None and not pd.isna(val) else "blank"
                            warnings.append(f"Row {row_num}: Expected numeric value for '{col_name}' but got '{orig_val_repr}'. Set to None.")
                        if col_name.lower() in scientific_vars:
                            orig_repr = str(val) if val is not None and not pd.isna(val) else "Blank"
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get(col_name, col_name),
                                "oracle_col": col_name.upper(),
                                "original": orig_repr,
                                "action": "Converted to NULL",
                                "stored": "NULL",
                                "reason": "Missing numeric value"
                            })
                    else:
                        if var_def.is_numeric:
                            try:
                                val_str = str(val).strip()
                                is_range = False
                                check_str = val_str
                                if check_str.startswith('-'):
                                    check_str = check_str[1:]
                                if '-' in check_str and not any(x in check_str.lower() for x in ['e-', 'e+']):
                                    is_range = True

                                if is_range:
                                    parts = [float(p.strip()) for p in val_str.split("-") if p.strip()]
                                    if len(parts) == 2:
                                        if col_name in ["depth_interval", "interval", "thickness"]:
                                            float_val = abs(parts[1] - parts[0])
                                        else:
                                            float_val = parts[0]
                                    elif len(parts) == 1:
                                        float_val = parts[0]
                                    else:
                                        raise ValueError("Invalid range format")
                                else:
                                    float_val = float(val)

                                if float_val < 0 and not (
                                     "delta" in col_name.lower() or 
                                     "del" in col_name.lower() or 
                                     "ln_" in col_name.lower() or
                                     col_name.lower().startswith("nc") or
                                     col_name.lower() == "cv"
                                 ):
                                    raise ValueError(f"Negative value '{val}' not allowed.")
                                record[col_name] = float_val
                            except ValueError:
                                if col_name in required_cols:
                                    non_mandatory = {"top_depth", "bottom_depth", "pi", "hi", "oi", "osi", "toc", "minc", "s2_s3"}
                                    if col_name not in non_mandatory:
                                        raise ValueError(f"Invalid datatype: Column '{col_name}' expects a numeric value but got '{val}'.")
                                record[col_name] = None
                                warnings.append(f"Row {row_num}: Expected numeric value for '{col_name}' but got '{val}'. Set to None.")
                                if col_name.lower() in scientific_vars:
                                    quality_report_list.append({
                                        "row": row_num,
                                        "csv_col": mapped_vars.get(col_name, col_name),
                                        "oracle_col": col_name.upper(),
                                        "original": str(val),
                                        "action": "Converted to NULL",
                                        "stored": "NULL",
                                        "reason": "Missing numeric value"
                                    })
                        else:
                            val_str = str(val).strip()
                            is_date_col = ("date" in col_name.lower()) or (var_def.sql_data_type and "DATE" in var_def.sql_data_type.upper())
                            if is_date_col and val_str and val_str.lower() not in ["none", "nan", "null"]:
                                try:
                                    parsed_date = pd.to_datetime(val_str, dayfirst=True)
                                    record[col_name] = parsed_date.strftime("%Y-%m-%d")
                                except Exception:
                                    record[col_name] = val_str
                            else:
                                record[col_name] = val_str

                # Demo Mode Auto-Generation of Enterprise Fields (Generic & Dynamic)
                well_key = "borehole_name" if "borehole_name" in var_map else ("well_name" if "well_name" in var_map else ("name" if "name" in var_map else None))
                if well_key:
                    if not record.get(well_key) or str(record.get(well_key)).strip().lower() in ["", "none", "nan"]:
                        record[well_key] = f"TMP_WELL_{row_num}"
                
                # Resolve borehole_id and ubhi from W_BOREHOLE dynamically if present
                if "borehole_id" in var_map or "ubhi" in var_map:
                    well_name_val = record.get(well_key) if well_key else "UNKNOWN"
                    if well_name_val and well_name_val != "UNKNOWN":
                        try:
                            from sqlalchemy import text
                            res_bh = db.execute(text("SELECT borehole_id, ubhi FROM W_BOREHOLE WHERE BOREHOLE_NAME = :name"), {"name": well_name_val}).fetchone()
                            if res_bh:
                                bh_id, bh_ubhi = res_bh
                            else:
                                bh_ubhi = f"TMP_UBHI_{str(well_name_val).upper().replace(' ', '_')}"
                                insert_res = db.execute(text("INSERT INTO W_BOREHOLE (BOREHOLE_NAME, UBHI) VALUES (:name, :ubhi) RETURNING BOREHOLE_ID"), {"name": well_name_val, "ubhi": bh_ubhi})
                                bh_id = insert_res.scalar()
                                db.flush() # dynamic lookup without committing
                            
                            if "borehole_id" in var_map:
                                record["borehole_id"] = bh_id
                            if "ubhi" in var_map:
                                record["ubhi"] = bh_ubhi
                        except Exception as bh_err:
                            logger.warning(f"Failed to resolve borehole info: {str(bh_err)}")
                            if "ubhi" in var_map and not record.get("ubhi"):
                                record["ubhi"] = f"TMP_UBHI_{well_name_val}"
                    else:
                        if "ubhi" in var_map and not record.get("ubhi"):
                            record["ubhi"] = f"TMP_UBHI_UNKNOWN"

                sample_id_key = "cuttings_sample_id" if "cuttings_sample_id" in var_map else ("core_sample_id" if "core_sample_id" in var_map else None)
                if sample_id_key:
                    if not record.get(sample_id_key) or str(record.get(sample_id_key)).strip().lower() in ["", "none", "nan"]:
                        well_val = record.get(well_key) if well_key else "UNKNOWN"
                        depth_val = 0.0
                        depth_key = detected_dataset.primary_depth_column or "top_depth"
                        if depth_key in record and record[depth_key] is not None:
                            depth_val = record[depth_key]
                        record[sample_id_key] = f"TMP_SMP_{well_val}_{depth_val}"

                # Automatically derive missing depth values
                if detected_dataset.name == "cutting_source_rock":
                    # Derive top_depth
                    orig_top = record.get("top_depth")
                    if orig_top is None:
                        sample_top_val = record.get("sample_top")
                        cuttings_top_val = record.get("cuttings_top")
                        if sample_top_val is not None:
                            record["top_depth"] = sample_top_val
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get("top_depth", "top_depth"),
                                "oracle_col": "TOP_DEPTH",
                                "original": "Missing",
                                "action": "Derived",
                                "stored": str(sample_top_val),
                                "reason": "Using SAMPLE_TOP"
                            })
                        elif cuttings_top_val is not None:
                            record["top_depth"] = cuttings_top_val
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get("top_depth", "top_depth"),
                                "oracle_col": "TOP_DEPTH",
                                "original": "Missing",
                                "action": "Derived",
                                "stored": str(cuttings_top_val),
                                "reason": "Using CUTTINGS_TOP"
                            })
                            
                    # Derive bottom_depth
                    orig_bottom = record.get("bottom_depth")
                    if orig_bottom is None:
                        sample_bottom_val = record.get("sample_bottom")
                        cuttings_bottom_val = record.get("cuttings_base")
                        if sample_bottom_val is not None:
                            record["bottom_depth"] = sample_bottom_val
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get("bottom_depth", "bottom_depth"),
                                "oracle_col": "BOTTOM_DEPTH",
                                "original": "Missing",
                                "action": "Derived",
                                "stored": str(sample_bottom_val),
                                "reason": "Using SAMPLE_BOTTOM"
                            })
                        elif cuttings_bottom_val is not None:
                            record["bottom_depth"] = cuttings_bottom_val
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get("bottom_depth", "bottom_depth"),
                                "oracle_col": "BOTTOM_DEPTH",
                                "original": "Missing",
                                "action": "Derived",
                                "stored": str(cuttings_bottom_val),
                                "reason": "Using CUTTINGS_BOTTOM"
                            })
                else:
                    # Fallback/Core Source Rock derivation
                    if record.get("top_depth") is None:
                        sample_top_val = record.get("sample_top")
                        core_top_val = record.get("core_top")
                        if sample_top_val is not None:
                            record["top_depth"] = sample_top_val
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get("top_depth", "top_depth"),
                                "oracle_col": "TOP_DEPTH",
                                "original": "Missing",
                                "action": "Derived",
                                "stored": str(sample_top_val),
                                "reason": "Using SAMPLE_TOP"
                            })
                        elif core_top_val is not None:
                            record["top_depth"] = core_top_val
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get("top_depth", "top_depth"),
                                "oracle_col": "TOP_DEPTH",
                                "original": "Missing",
                                "action": "Derived",
                                "stored": str(core_top_val),
                                "reason": "Using CORE_TOP"
                            })
                    if record.get("bottom_depth") is None:
                        sample_bottom_val = record.get("sample_bottom")
                        core_base_val = record.get("core_base")
                        if sample_bottom_val is not None:
                            record["bottom_depth"] = sample_bottom_val
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get("bottom_depth", "bottom_depth"),
                                "oracle_col": "BOTTOM_DEPTH",
                                "original": "Missing",
                                "action": "Derived",
                                "stored": str(sample_bottom_val),
                                "reason": "Using SAMPLE_BOTTOM"
                            })
                        elif core_base_val is not None:
                            record["bottom_depth"] = core_base_val
                            quality_report_list.append({
                                "row": row_num,
                                "csv_col": mapped_vars.get("bottom_depth", "bottom_depth"),
                                "oracle_col": "BOTTOM_DEPTH",
                                "original": "Missing",
                                "action": "Derived",
                                "stored": str(core_base_val),
                                "reason": "Using CORE_BASE"
                            })

                # Extract PC and RC for TOC calculation if present in the spreadsheet
                pc_val = None
                rc_val = None
                for col in row.index:
                    norm_col = cls.normalize_header(col)
                    if norm_col in ["pc", "pyrolysablecarbon"]:
                        try:
                            pc_val = float(row[col])
                        except Exception:
                            pass
                    elif norm_col in ["rc", "residualcarbon"]:
                        try:
                            rc_val = float(row[col])
                        except Exception:
                            pass
                if pc_val is not None:
                    record["pc"] = pc_val
                if rc_val is not None:
                    record["rc"] = rc_val

                # Track original values of calculated columns
                calculated_targets = ["toc", "pi", "hi", "oi", "osi", "s2_s3", "pr_by_ph", "pr_by_nc17", "ph_by_nc18", "pr_nc17_by_ph_nc18", "nc21_nc22_by_nc28_nc29", "oep_odd_even_pref", "cp_index", "ta_ratio", "nc17_by_nc29", "paq", "nc17_by_nc27", "c_max", "sat_by_aro", "c1_by_c2_plus_c3", "c2_by_c3", "delta_c2_by_delta_c3", "ln_c2_by_c3", "c1_by_c2", "ln_c1_by_c2"]
                orig_calculated_vals = {
                    c: record.get(c) for c in calculated_targets if c in var_map
                }

                # Apply central scientific formulas if it's a geochemistry dataset
                if detected_dataset.module == "geochemistry":
                    from app.services.formula_engine import calculate_derived_parameters
                    record = calculate_derived_parameters(record)
                    
                    # Log calculated parameters in Quality Report
                    for c in ["toc", "pi", "hi", "oi", "osi", "s2_s3"]:
                        if c in var_map:
                            stored_val = record.get(c)
                            orig_val = orig_calculated_vals[c]
                            if stored_val is not None and stored_val != orig_val:
                                reason = "Calculated using PC + RC" if c == "toc" else "Formula Engine"
                                orig_str = str(orig_val) if orig_val is not None else "Blank"
                                
                                # Dedup: remove previous converted-to-null warning
                                quality_report_list = [
                                    item for item in quality_report_list
                                    if not (item["row"] == row_num and item["oracle_col"] == c.upper())
                                ]
                                quality_report_list.append({
                                    "row": row_num,
                                    "csv_col": mapped_vars.get(c, c),
                                    "oracle_col": c.upper(),
                                    "original": orig_str,
                                    "action": "Calculated",
                                    "stored": str(stored_val),
                                    "reason": reason
                                })
                elif detected_dataset.name == "gas_chromatography":
                    from app.services.formula_engine import calculate_chromatography_ratios
                    record = calculate_chromatography_ratios(record)
                    
                    # Log calculated parameters in Quality Report
                    chrom_calc_targets = ["pr_by_ph", "pr_by_nc17", "ph_by_nc18", "pr_nc17_by_ph_nc18", "nc21_nc22_by_nc28_nc29", "oep_odd_even_pref", "cp_index", "ta_ratio", "nc17_by_nc29", "paq", "nc17_by_nc27", "c_max"]
                    for c in chrom_calc_targets:
                        if c in var_map:
                            stored_val = record.get(c)
                            orig_val = orig_calculated_vals[c]
                            if stored_val is not None and stored_val != orig_val:
                                orig_str = str(orig_val) if orig_val is not None else "Blank"
                                
                                # Dedup
                                quality_report_list = [
                                    item for item in quality_report_list
                                    if not (item["row"] == row_num and item["oracle_col"] == c.upper())
                                ]
                                quality_report_list.append({
                                    "row": row_num,
                                    "csv_col": mapped_vars.get(c, c),
                                    "oracle_col": c.upper(),
                                    "original": orig_str,
                                    "action": "Calculated",
                                    "stored": str(stored_val),
                                    "reason": "Chromatography Ratio Engine"
                                })
                elif detected_dataset.name == "oil_composition":
                    from app.services.formula_engine import calculate_oil_composition_ratios
                    record = calculate_oil_composition_ratios(record)
                    
                    # Log calculated parameters in Quality Report
                    oil_calc_targets = ["sat_by_aro"]
                    for c in oil_calc_targets:
                        if c in var_map:
                            stored_val = record.get(c)
                            orig_val = orig_calculated_vals[c]
                            if stored_val is not None and stored_val != orig_val:
                                orig_str = str(orig_val) if orig_val is not None else "Blank"
                                
                                # Dedup
                                quality_report_list = [
                                    item for item in quality_report_list
                                    if not (item["row"] == row_num and item["oracle_col"] == c.upper())
                                ]
                                quality_report_list.append({
                                    "row": row_num,
                                    "csv_col": mapped_vars.get(c, c),
                                    "oracle_col": c.upper(),
                                    "original": orig_str,
                                    "action": "Calculated",
                                    "stored": str(stored_val),
                                    "reason": "Oil Composition Ratio Engine"
                                })
                elif detected_dataset.name == "gas_isotope":
                    from app.services.formula_engine import calculate_isotope_ratios
                    record = calculate_isotope_ratios(record)
                    
                    # Log calculated parameters in Quality Report
                    isotope_calc_targets = ["c1_by_c2_plus_c3", "c2_by_c3", "delta_c2_by_delta_c3", "ln_c2_by_c3", "c1_by_c2", "ln_c1_by_c2"]
                    for c in isotope_calc_targets:
                        if c in var_map:
                            stored_val = record.get(c)
                            orig_val = orig_calculated_vals[c]
                            if stored_val is not None and stored_val != orig_val:
                                orig_str = str(orig_val) if orig_val is not None else "Blank"
                                
                                # Dedup
                                quality_report_list = [
                                    item for item in quality_report_list
                                    if not (item["row"] == row_num and item["oracle_col"] == c.upper())
                                ]
                                quality_report_list.append({
                                    "row": row_num,
                                    "csv_col": mapped_vars.get(c, c),
                                    "oracle_col": c.upper(),
                                    "original": orig_str,
                                    "action": "Calculated",
                                    "stored": str(stored_val),
                                    "reason": "Stable Isotope Ratio Engine"
                                })

                # Skip row if any required values are missing/None
                non_mandatory = {"top_depth", "bottom_depth", "pi", "hi", "oi", "osi", "toc", "minc", "s2_s3", "pr_by_ph", "pr_by_nc17", "ph_by_nc18", "pr_nc17_by_ph_nc18", "nc21_nc22_by_nc28_nc29", "oep_odd_even_pref", "cp_index", "ta_ratio", "nc17_by_nc29", "paq", "nc17_by_nc27", "c_max", "sat_by_aro", "c1_by_c2_plus_c3", "c2_by_c3", "delta_c2_by_delta_c3", "ln_c2_by_c3", "c1_by_c2", "ln_c1_by_c2", "ndr", "tmn_1_2_7", "tmn_1_3_7", "tmn_ratio", "etr"}
                missing_req = [c for c in required_cols if record.get(c) is None and c not in non_mandatory]
                if missing_req:
                    skipped_rows += 1
                    warnings.append(f"Row {row_num}: Missing required value(s) for {', '.join(missing_req)}. Row skipped.")
                    continue

                # Duplicate Check
                if well_col and depth_col:
                    w_val = str(record.get(well_col, "")).strip().upper()
                    d_val = record.get(depth_col)
                    if d_val is not None:
                        key = (w_val, float(d_val))
                        if key in existing_keys:
                            duplicates += 1
                            skipped_rows += 1
                            continue
                        existing_keys.add(key)

                # Aromatic Biomarker derived calculations
                if detected_dataset.name == "aromatic_biomarkers":
                    # ONLY calculate if not already supplied
                    if record.get("dbt_by_phe") is None:
                        dbt = record.get("dbt_dibenzo")
                        phe = record.get("phe_phena")
                        if dbt is not None and phe is not None:
                            try:
                                denom = float(phe)
                                if denom != 0.0:
                                    record["dbt_by_phe"] = float(dbt) / denom
                                else:
                                    record["dbt_by_phe"] = None
                                    warnings.append(f"Row {row_num}: DBT_BY_PHE calculation denominator (PHE_PHENA) is zero. Storing NULL.")
                            except Exception:
                                record["dbt_by_phe"] = None
                        else:
                            record["dbt_by_phe"] = None

                    mpi = record.get("mpi")
                    if mpi is None:
                        mp1 = record.get("mp_1")
                        mp2 = record.get("mp_2")
                        mp3 = record.get("mp_3")
                        mp9 = record.get("mp_9")
                        phe = record.get("phe_phena")
                        if mp2 is not None and mp3 is not None and phe is not None and mp1 is not None and mp9 is not None:
                            try:
                                num = 1.5 * (float(mp2) + float(mp3))
                                denom = float(phe) + float(mp1) + float(mp9)
                                if denom != 0.0:
                                    mpi = num / denom
                                    record["mpi"] = mpi
                                else:
                                    record["mpi"] = None
                                    warnings.append(f"Row {row_num}: MPI calculation denominator is zero. Storing NULL.")
                            except Exception:
                                record["mpi"] = None
                        else:
                            record["mpi"] = None

                    if record.get("vrc") is None:
                        if mpi is not None:
                            try:
                                record["vrc"] = 0.4 + (0.6 * mpi)
                            except Exception:
                                record["vrc"] = None
                        else:
                            record["vrc"] = None

                # Pristane / Phytane derived calculations
                if detected_dataset.name == "pr_ph":
                    if record.get("pr_by_ph") is None:
                        pr = record.get("pristane")
                        ph = record.get("phytane")
                        if pr is not None and ph is not None:
                            try:
                                denom = float(ph)
                                if denom != 0.0:
                                    record["pr_by_ph"] = float(pr) / denom
                                else:
                                    record["pr_by_ph"] = None
                                    warnings.append(f"Row {row_num}: PR_BY_PH calculation denominator (PHYTANE) is zero. Storing NULL.")
                            except Exception:
                                record["pr_by_ph"] = None
                        else:
                            record["pr_by_ph"] = None

                valid_records.append(record)

            except ValueError as e:
                logger.error(f"Row {row_num}: Ingestion aborted due to validation error: {str(e)}")
                raise e
            except Exception as e:
                skipped_rows += 1
                warnings.append(f"Row {row_num}: Validation error ({str(e)}). Row skipped.")

        if duplicates == total_rows:
            logger.error("Duplicate dataset: All uploaded rows already exist.")
            raise ValueError("Duplicate dataset: All records in the uploaded file already exist in the database.")

        # 10. Database Insertion
        inserted_count = 0
        if valid_records:
            try:
                # Intercept view insertion for Tricyclic Terpane
                if detected_dataset.sql_table_name.upper() == "DL_BIOM_TRICYCLIC_TERP_VW":
                    target_table = "DL_TRICYCLIC_TERPANE_"
                    # Fetch physical columns list to update db_columns
                    try:
                        bind = db.get_bind()
                        inspector = inspect(bind)
                        columns_meta = inspector.get_columns(target_table)
                        db_columns = {c['name'].lower() for c in columns_meta}
                    except Exception as e:
                        logger.error(f"Failed to inspect physical columns: {str(e)}")
                        db_columns = set()

                    # Mapping view column keys to physical column keys
                    mapping = {
                        "c19tt": "c19",
                        "c20tt": "c20",
                        "c21tt": "c21",
                        "c22tt": "c22",
                        "c23tt": "c23",
                        "c24tt": "c24",
                        "c25tt_r": "c25r",
                        "c25tt_s": "c25s",
                        "c24tet_tt": "c24tet",
                        "c26tt_r": "c26r",
                        "c26tt_s": "c26s",
                        "perc_c19tt": "c19_ratio",
                        "perc_c20tt": "c20_ratio",
                        "perc_c21tt": "c21_ratio",
                        "perc_c22tt": "c22_ratio",
                        "perc_c23tt": "c23_ratio",
                        "perc_c24tt": "c24_ratio",
                        "perc_c25tt_r": "c25r_ratio",
                        "perc_c25tt_s": "c25s_ratio",
                        "perc_c24tet_tt": "c24tet_ratio",
                        "perc_c26tt_r": "c26r_ratio",
                        "perc_c26tt_s": "c26s_ratio"
                    }
                    
                    mapped_records = []
                    for rec in valid_records:
                        mapped_rec = {}
                        for k, v in rec.items():
                            k_lower = k.lower()
                            phys_k = mapping.get(k_lower, k_lower)
                            mapped_rec[phys_k] = v
                        mapped_records.append(mapped_rec)
                    valid_records = mapped_records
                else:
                    target_table = detected_dataset.sql_table_name
                
                # If target_table is a view, resolve to the physical table for insert
                VIEW_TO_TABLE = {
                    "DL_BIOMARKER_STERANE_VW": "dl_biomarker_sterane",
                    "DL_BIOMARKER_HOPANE_VW": "dl_biomarker_hopane",
                    "DL_BIOM_TRICYCLIC_TERP_VW": "dl_tricyclic_terpane_",
                    "DL_BIOMARKER_AROMATIC_VW": "dl_biomarker_aromatic_",
                    "DL_BIOMARKER_PR_PH_VW": "dl_biomarker_pr_ph_",
                    "DL_ISOTOPE_GAS_VW": "dl_isotope_gas",
                    "DL_ISOTOPE_OIL_VW": "dl_isotope_oil",
                    "DL_ISOTOPE_CSIA_VW": "dl_isotope_csia"
                }
                
                if target_table.upper() in VIEW_TO_TABLE:
                    target_table = VIEW_TO_TABLE[target_table.upper()]
                    # Refresh db_columns schema check with physical table columns
                    try:
                        bind = db.get_bind()
                        inspector = inspect(bind)
                        columns_meta = inspector.get_columns(target_table)
                        db_columns = {c['name'].lower() for c in columns_meta}
                    except Exception as e:
                        logger.error(f"Failed to inspect physical columns for {target_table}: {str(e)}")

                sample_rec = valid_records[0]
                cols_to_insert = [c for c in sample_rec.keys() if (c.lower() in db_columns or not db_columns) and c.lower() != "id"]
                
                # Check for uploaded_by in DB schema
                if "uploaded_by" in db_columns and "uploaded_by" not in cols_to_insert:
                    cols_to_insert.append("uploaded_by")

                col_list_str = ", ".join([f'"{c}"' for c in cols_to_insert])
                val_list_str = ", ".join([f":{c}" for c in cols_to_insert])
                insert_query = sa_text(f"INSERT INTO {target_table} ({col_list_str}) VALUES ({val_list_str}) RETURNING ID")

                inserted_ids = []
                for rec in valid_records:
                    if "uploaded_by" in db_columns:
                        rec["uploaded_by"] = uploader_id
                    
                    rec_filtered = {k: v for k, v in rec.items() if k in cols_to_insert}
                    res = db.execute(insert_query, rec_filtered)
                    inserted_ids.append(res.scalar())
                
                inserted_count = len(valid_records)

                # Link Version mapping if version_id is provided
                if version_id and inserted_ids:
                    mapping_objs = [
                        VersionRecordMapping(version_id=version_id, record_id=rid)
                        for rid in inserted_ids if rid is not None
                    ]
                    db.bulk_save_objects(mapping_objs)

                db.commit()
                logger.info(f"Inserted {inserted_count} rows into table '{detected_dataset.sql_table_name}'.")
            except Exception as db_err:
                db.rollback()
                logger.exception(f"Database insertion failed: {str(db_err)}")
                raise Exception(f"Database failure: {str(db_err)}")

        # 11. Write Ingestion Activity Logs
        error_summary = "; ".join(warnings[:20]) if warnings else None
        if duplicates > 0:
            dup_msg = f"{duplicates} duplicate rows skipped"
            error_summary = f"{dup_msg}; {error_summary}" if error_summary else dup_msg

        try:
            # Audit and upload logs
            crud_log.create_upload_log(
                db=db,
                filename=filename,
                file_size=len(file_bytes),
                total_rows=total_rows,
                imported_rows=inserted_count,
                skipped_rows=skipped_rows,
                error_summary=error_summary,
                quality_report=json.dumps(quality_report_list),
                uploader_id=uploader_id
            )
            crud_log.create_audit_log(
                db=db,
                user_id=uploader_id,
                action="UPLOAD",
                resource="SAMPLE",
                details=f"Uploaded '{filename}' dynamically under dataset '{detected_dataset.name}' ({inserted_count} rows imported)."
            )
        except Exception as log_err:
            logger.warning(f"Failed to write upload or audit logs: {str(log_err)}")

        execution_time = time.time() - start_time
        logger.info(
            f"[UPLOAD VERIFICATION] Dataset detected: {detected_dataset.name} | "
            f"SQL Table: {detected_dataset.sql_table_name} | "
            f"Matched columns: {list(mapped_vars.keys())} | "
            f"Ignored columns: {[col for col in raw_headers if col not in mapped_vars.values()]} | "
            f"Rows ready: {len(valid_records)} | "
            f"Rows skipped: {skipped_rows} | "
            f"Rows inserted: {inserted_count} | "
            f"Execution time: {execution_time:.4f}s"
        )

        # Collect measured, calculated, and missing optional lists
        measured_vars = [v.display_name for v in variables if not getattr(v, "is_calculated", False)]
        calculated_vars = [v.display_name for v in variables if getattr(v, "is_calculated", False)]
        
        uploaded_sql_cols = {rename_map.get(col) for col in df.columns if col in rename_map}
        missing_optional_vars = [
            v.display_name for v in variables 
            if not getattr(v, "is_required", False) and v.sql_column_name not in uploaded_sql_cols
        ]

        return {
            "filename": filename,
            "total_rows": total_rows,
            "imported_rows": inserted_count,
            "skipped_rows": skipped_rows,
            "duplicates": duplicates,
            "warnings": warnings[:15],
            "records": valid_records,
            "message": f"Successfully processed '{filename}' under dataset '{detected_dataset.display_name}'.",
            "dataset_name": detected_dataset.display_name,
            "rows_imported": inserted_count,
            "rows_updated": 0,
            "rows_skipped": skipped_rows,
            "measured_variables": measured_vars,
            "calculated_variables": calculated_vars,
            "missing_optional_variables": missing_optional_vars,
            "execution_time": execution_time,
            "validation_summary": f"Ingestion completed. {inserted_count} rows imported, {skipped_rows} skipped (including {duplicates} duplicates).",
            "quality_report": quality_report_list
        }

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
