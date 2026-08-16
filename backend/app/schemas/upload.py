from typing import List, Optional, Any
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID


class UploadStats(BaseModel):
    filename: str
    total_rows: int
    imported_rows: int
    skipped_rows: int
    duplicates: int
    warnings: List[str] = []
    message: str
    quality_report: Optional[Any] = None
    dataset_name: Optional[str] = None
    rows_imported: Optional[int] = None
    rows_updated: Optional[int] = None
    rows_skipped: Optional[int] = None
    measured_variables: Optional[List[str]] = []
    calculated_variables: Optional[List[str]] = []
    missing_optional_variables: Optional[List[str]] = []
    execution_time: Optional[float] = None
    validation_summary: Optional[str] = None


class UploadLogResponse(BaseModel):
    id: int
    filename: str
    file_size: int
    total_rows: int
    imported_rows: int
    skipped_rows: int
    error_summary: Optional[str] = None
    quality_report: Optional[str] = None
    uploaded_at: datetime
    uploaded_by: Optional[UUID] = None

    class Config:
        from_attributes = True
