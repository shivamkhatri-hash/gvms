from typing import Optional, List
from pydantic import BaseModel


class ReportRequest(BaseModel):
    format: str = "pdf"  # 'pdf', 'excel', 'csv'
    well_name: Optional[str] = None
    sample_type: Optional[str] = None
    depth_min: Optional[float] = None
    depth_max: Optional[float] = None
    toc_min: Optional[float] = None
    toc_max: Optional[float] = None
    s2_min: Optional[float] = None
    s2_max: Optional[float] = None
