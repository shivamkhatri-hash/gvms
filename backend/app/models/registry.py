from sqlalchemy import Column, Integer, BigInteger, String, Text, Boolean, DateTime, ForeignKey, func, JSON, Sequence
from sqlalchemy.orm import relationship
from app.core.database import Base


class DatasetRegistry(Base):
    __tablename__ = "dataset_registry"

    id = Column(Integer, Sequence('dataset_registry_seq'), primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(150), nullable=False)
    sql_table_name = Column(String(100), nullable=True)
    module = Column(String(100), nullable=False, default="geochemistry")
    status = Column(String(50), nullable=False, default="active")
    version = Column(String(50), nullable=False, default="1.0")
    description = Column(Text, nullable=True)
    mapping_config = Column(JSON, nullable=False, default=dict)
    graph_config = Column(JSON, nullable=False, default=list)
    filter_config = Column(JSON, nullable=False, default=list)
    required_columns = Column(JSON, nullable=False, default=list)
    primary_depth_column = Column(String(100), nullable=True)
    primary_well_column = Column(String(100), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    versions = relationship("DatasetVersion", back_populates="dataset", cascade="all, delete-orphan", order_by="DatasetVersion.version_number.desc()")
    records = relationship("GenericDatasetRecord", back_populates="dataset", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="created_datasets")
    variables = relationship("VariableRegistry", back_populates="dataset", cascade="all, delete-orphan")



class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    id = Column(Integer, Sequence('dataset_version_seq'), primary_key=True, index=True, autoincrement=True)
    dataset_id = Column(Integer, ForeignKey("dataset_registry.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    total_rows = Column(Integer, nullable=False, default=0)
    imported_rows = Column(Integer, nullable=False, default=0)
    skipped_rows = Column(Integer, nullable=False, default=0)
    status = Column(String(50), nullable=False, default="pending")  # pending, processing, completed, failed, rolled_back
    is_active = Column(Boolean, nullable=False, default=True)
    error_summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    uploaded_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    dataset = relationship("DatasetRegistry", back_populates="versions")
    records = relationship("GenericDatasetRecord", back_populates="version", cascade="all, delete-orphan")
    uploader = relationship("User", back_populates="dataset_versions")


class GenericDatasetRecord(Base):
    __tablename__ = "generic_dataset_records"

    id = Column(BigInteger, Sequence('generic_record_seq'), primary_key=True, index=True, autoincrement=True)
    dataset_id = Column(Integer, ForeignKey("dataset_registry.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id = Column(Integer, ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    data = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    dataset = relationship("DatasetRegistry", back_populates="records")
    version = relationship("DatasetVersion", back_populates="records")


class VariableRegistry(Base):
    __tablename__ = "variable_registry"

    id = Column(Integer, Sequence('variable_registry_seq'), primary_key=True, index=True, autoincrement=True)
    dataset_id = Column(Integer, ForeignKey("dataset_registry.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    display_name = Column(String(150), nullable=False)
    sql_column_name = Column(String(100), nullable=False)
    sql_data_type = Column(String(50), nullable=False)
    display_unit = Column(String(50), nullable=True)
    is_numeric = Column(Boolean, nullable=False, default=True)
    is_visible = Column(Boolean, nullable=False, default=True)
    is_filterable = Column(Boolean, nullable=False, default=True)
    chart_enabled = Column(Boolean, nullable=False, default=True)
    kpi_enabled = Column(Boolean, nullable=False, default=True)
    export_enabled = Column(Boolean, nullable=False, default=True)
    description = Column(Text, nullable=True)
    validation_rule = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    synonyms = Column(JSON, nullable=False, default=list)
    is_required = Column(Boolean, nullable=False, default=False)
    is_nullable = Column(Boolean, nullable=False, default=True)
    is_calculated = Column(Boolean, nullable=False, default=False)
    formula = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    dataset = relationship("DatasetRegistry", back_populates="variables")


class VersionRecordMapping(Base):
    __tablename__ = "version_record_mapping"

    id = Column(Integer, Sequence('version_record_seq'), primary_key=True, index=True, autoincrement=True)
    version_id = Column(Integer, ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    record_id = Column(Integer, nullable=False)

