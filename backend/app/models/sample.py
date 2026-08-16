from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class PetroleumData(Base):
    __tablename__ = "petroleum_data"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sample_type = Column(String(100), nullable=False, index=True)
    well_name = Column(String(100), nullable=False, index=True)
    depth_from = Column(Float, nullable=False, index=True)
    depth_interval = Column(Float, nullable=False)
    toc = Column(Float, nullable=False, index=True)
    s2 = Column(Float, nullable=False, index=True)
    toc_classification = Column(String(50), nullable=False)
    s2_classification = Column(String(50), nullable=False)
    interpretation = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    uploader = relationship("User", back_populates="samples")
