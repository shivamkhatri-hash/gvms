from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID


class PetroleumDataBase(BaseModel):
    sample_type: str = Field(..., examples=["Shale"])
    well_name: str = Field(..., examples=["KM-101"])
    depth_from: float = Field(..., ge=0, examples=[2450.5])
    depth_interval: float = Field(..., ge=0, examples=[10.0])
    toc: float = Field(..., ge=0, examples=[2.45])
    s2: float = Field(..., ge=0, examples=[8.20])


class PetroleumDataCreate(PetroleumDataBase):
    pass


class PetroleumDataUpdate(BaseModel):
    sample_type: Optional[str] = None
    well_name: Optional[str] = None
    depth_from: Optional[float] = None
    depth_interval: Optional[float] = None
    toc: Optional[float] = None
    s2: Optional[float] = None


class PetroleumDataResponse(PetroleumDataBase):
    id: int
    toc_classification: str
    s2_classification: str
    interpretation: Optional[str] = None
    created_at: datetime
    uploaded_by: Optional[UUID] = None

    class Config:
        from_attributes = True


class PetroleumDataFilter(BaseModel):
    well_name: Optional[str] = None
    sample_type: Optional[str] = None
    depth_min: Optional[float] = None
    depth_max: Optional[float] = None
    toc_min: Optional[float] = None
    toc_max: Optional[float] = None
    s2_min: Optional[float] = None
    s2_max: Optional[float] = None
    limit: int = 100
    skip: int = 0


class SampleListResponse(BaseModel):
    total: int
    items: List[PetroleumDataResponse]
    wells: List[str]
    sample_types: List[str]


class DashboardStats(BaseModel):
    total_samples: int
    total_wells: int
    avg_toc: float
    avg_s2: float
    max_toc: float
    max_s2: float
    toc_distribution: dict
    s2_distribution: dict
    wells_summary: List[dict]
