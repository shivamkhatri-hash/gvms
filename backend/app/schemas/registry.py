from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID


# ── Graph Configuration Schema ──────────────────────────────────────────────

class GraphDefinition(BaseModel):
    type: str = Field(..., description="Chart type: depth_profile, scatter, histogram, heatmap")
    x_axis: str = Field(..., description="Column key for X axis")
    y_axis: Optional[str] = Field(None, description="Column key for Y axis (optional for histograms)")
    title: str = Field(..., description="Chart title")
    color: Optional[str] = Field(None, description="Hex color code")
    color_by: Optional[str] = Field(None, description="Column key to group colors by")


# ── Variable Registry Schemas ──────────────────────────────────────────────

class VariableRegistryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    display_name: str = Field(..., max_length=150)
    sql_column_name: str = Field(..., max_length=100)
    sql_data_type: str = Field(..., max_length=50)
    display_unit: Optional[str] = None
    is_numeric: bool = True
    is_visible: bool = True
    is_filterable: bool = True
    chart_enabled: bool = True
    kpi_enabled: bool = True
    export_enabled: bool = True
    description: Optional[str] = None
    validation_rule: Optional[str] = None
    category: Optional[str] = None
    synonyms: List[str] = Field(default_factory=list)
    is_required: bool = False
    is_nullable: bool = True
    is_calculated: bool = False
    formula: Optional[str] = None

class VariableRegistryUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    sql_column_name: Optional[str] = None
    sql_data_type: Optional[str] = None
    display_unit: Optional[str] = None
    is_numeric: Optional[bool] = None
    is_visible: Optional[bool] = None
    is_filterable: Optional[bool] = None
    chart_enabled: Optional[bool] = None
    kpi_enabled: Optional[bool] = None
    export_enabled: Optional[bool] = None
    description: Optional[str] = None
    validation_rule: Optional[str] = None
    category: Optional[str] = None
    synonyms: Optional[List[str]] = None
    is_required: Optional[bool] = None
    is_nullable: Optional[bool] = None
    is_calculated: Optional[bool] = None
    formula: Optional[str] = None

class VariableRegistryResponse(BaseModel):
    id: int
    dataset_id: int
    name: str
    display_name: str
    sql_column_name: str
    sql_data_type: str
    display_unit: Optional[str] = None
    is_numeric: bool
    is_visible: bool
    is_filterable: bool
    chart_enabled: bool
    kpi_enabled: bool
    export_enabled: bool
    description: Optional[str] = None
    validation_rule: Optional[str] = None
    category: Optional[str] = None
    synonyms: List[str] = []
    is_required: bool
    is_nullable: bool
    is_calculated: bool
    formula: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Dataset Registry Schemas ────────────────────────────────────────────────

class DatasetRegistryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-z0-9_]+$",
                      description="Unique slug identifier (lowercase, underscores only)")
    display_name: str = Field(..., min_length=2, max_length=150)
    sql_table_name: Optional[str] = Field(None, max_length=100)
    module: str = Field("geochemistry", max_length=100)
    description: Optional[str] = None
    mapping_config: Dict[str, List[str]] = Field(default_factory=dict, description="Canonical column name -> list of aliases")
    graph_config: List[GraphDefinition] = Field(default_factory=list)
    filter_config: List[Dict[str, Any]] = Field(default_factory=list)
    required_columns: List[str] = Field(default_factory=list,
                                        description="List of canonical column names that must be present in uploads")
    primary_depth_column: Optional[str] = None
    primary_well_column: Optional[str] = None


class DatasetRegistryUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    sql_table_name: Optional[str] = None
    module: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    mapping_config: Optional[Dict[str, List[str]]] = None
    graph_config: Optional[List[GraphDefinition]] = None
    filter_config: Optional[List[Dict[str, Any]]] = None
    required_columns: Optional[List[str]] = None
    primary_depth_column: Optional[str] = None
    primary_well_column: Optional[str] = None
    is_active: Optional[bool] = None


class DatasetRegistryResponse(BaseModel):
    id: int
    name: str
    display_name: str
    sql_table_name: Optional[str] = None
    module: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    description: Optional[str] = None
    mapping_config: Dict[str, List[str]]
    graph_config: List[Dict[str, Any]]
    filter_config: List[Dict[str, Any]] = []
    required_columns: List[str]
    primary_depth_column: Optional[str] = None
    primary_well_column: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[UUID] = None
    version_count: int = 0
    active_record_count: int = 0
    variables: List[VariableRegistryResponse] = []

    class Config:
        from_attributes = True


class DatasetRegistryListResponse(BaseModel):
    total: int
    items: List[DatasetRegistryResponse]



# ── Dataset Version Schemas ─────────────────────────────────────────────────

class DatasetVersionResponse(BaseModel):
    id: int
    dataset_id: int
    version_number: int
    filename: str
    file_size: int
    total_rows: int
    imported_rows: int
    skipped_rows: int
    status: str
    is_active: bool
    error_summary: Optional[str] = None
    created_at: datetime
    uploaded_by: Optional[UUID] = None

    class Config:
        from_attributes = True


class DatasetVersionListResponse(BaseModel):
    total: int
    items: List[DatasetVersionResponse]


# ── Generic Record Schemas ──────────────────────────────────────────────────

class GenericRecordResponse(BaseModel):
    id: int
    dataset_id: int
    version_id: int
    data: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class GenericRecordListResponse(BaseModel):
    total: int
    items: List[GenericRecordResponse]


# ── Upload Response ─────────────────────────────────────────────────────────

class RegistryUploadResponse(BaseModel):
    message: str
    dataset_id: int
    dataset_name: str
    version_id: int
    version_number: int
    status: str
