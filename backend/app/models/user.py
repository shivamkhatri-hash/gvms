import uuid
from sqlalchemy import Column, String, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="viewer")  # 'admin', 'researcher', 'viewer'
    is_active = Column(Boolean, default=True, nullable=False)
    department = Column(String(255), nullable=True, default="Geochemistry Laboratory")
    assigned_tasks = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    samples = relationship("PetroleumData", back_populates="uploader", cascade="all, delete-orphan")
    upload_logs = relationship("UploadLog", back_populates="uploader", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    created_datasets = relationship("DatasetRegistry", back_populates="creator")
    dataset_versions = relationship("DatasetVersion", back_populates="uploader")

