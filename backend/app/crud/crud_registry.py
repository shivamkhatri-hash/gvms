import io
import logging
from typing import List, Optional, Dict, Any, cast
from uuid import UUID

import pandas as pd
from sqlalchemy import func as sa_func, text
from sqlalchemy.orm import Session

from app.models.registry import DatasetRegistry, DatasetVersion, GenericDatasetRecord, VariableRegistry, VersionRecordMapping
from app.services.csv_processor import CSVProcessor


logger = logging.getLogger(__name__)


class CRUDRegistry:
    """CRUD operations for the enterprise dataset registry, versioning, and generic records."""

    # ── Dataset Registry ─────────────────────────────────────────────────────

    def get_all_datasets(self, db: Session, *, skip: int = 0, limit: int = 50, active_only: bool = True) -> List[DatasetRegistry]:
        query = db.query(DatasetRegistry)
        if active_only:
            query = query.filter(DatasetRegistry.is_active == True)
        return query.order_by(DatasetRegistry.created_at.desc()).offset(skip).limit(limit).all()

    def get_dataset_count(self, db: Session, *, active_only: bool = True) -> int:
        query = db.query(sa_func.count(DatasetRegistry.id))
        if active_only:
            query = query.filter(DatasetRegistry.is_active == True)
        result = query.scalar()
        return int(result) if result is not None else 0

    def get_dataset_by_id(self, db: Session, dataset_id: int) -> Optional[DatasetRegistry]:
        return db.query(DatasetRegistry).filter(DatasetRegistry.id == dataset_id).first()

    def get_dataset_by_name(self, db: Session, name: str) -> Optional[DatasetRegistry]:
        return db.query(DatasetRegistry).filter(DatasetRegistry.name == name).first()

    def create_dataset(
        self,
        db: Session,
        *,
        name: str,
        display_name: str,
        sql_table_name: Optional[str] = None,
        module: str = "geochemistry",
        status: str = "active",
        version: str = "1.0",
        description: Optional[str] = None,
        mapping_config: Dict[str, Any],
        graph_config: List[Dict[str, Any]],
        filter_config: Optional[List[Dict[str, Any]]] = None,
        required_columns: List[str],
        primary_depth_column: Optional[str] = None,
        primary_well_column: Optional[str] = None,
        creator_id: Optional[UUID] = None
    ) -> DatasetRegistry:
        db_obj = DatasetRegistry(
            name=name,
            display_name=display_name,
            sql_table_name=sql_table_name,
            module=module,
            status=status,
            version=version,
            description=description,
            mapping_config=mapping_config,
            graph_config=graph_config,
            filter_config=filter_config or [],
            required_columns=required_columns,
            primary_depth_column=primary_depth_column,
            primary_well_column=primary_well_column,
            created_by=creator_id
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_dataset(
        self,
        db: Session,
        *,
        db_obj: DatasetRegistry,
        update_data: Dict[str, Any]
    ) -> DatasetRegistry:
        for field, value in update_data.items():
            if value is not None and hasattr(db_obj, field):
                setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_variables_by_dataset(self, db: Session, dataset_id: int) -> List[VariableRegistry]:
        return db.query(VariableRegistry).filter(VariableRegistry.dataset_id == dataset_id).all()

    def get_all_variables(self, db: Session, dataset_id: Optional[int] = None) -> List[VariableRegistry]:
        query = db.query(VariableRegistry)
        if dataset_id is not None:
            query = query.filter(VariableRegistry.dataset_id == dataset_id)
        return query.all()

    def create_variable(
        self,
        db: Session,
        *,
        dataset_id: int,
        name: str,
        display_name: str,
        sql_column_name: str,
        sql_data_type: str,
        display_unit: Optional[str] = None,
        is_numeric: bool = True,
        is_visible: bool = True,
        is_filterable: bool = True,
        chart_enabled: bool = True,
        kpi_enabled: bool = True,
        export_enabled: bool = True,
        description: Optional[str] = None,
        validation_rule: Optional[str] = None,
        category: Optional[str] = None
    ) -> VariableRegistry:
        db_obj = VariableRegistry(
            dataset_id=dataset_id,
            name=name,
            display_name=display_name,
            sql_column_name=sql_column_name,
            sql_data_type=sql_data_type,
            display_unit=display_unit,
            is_numeric=is_numeric,
            is_visible=is_visible,
            is_filterable=is_filterable,
            chart_enabled=chart_enabled,
            kpi_enabled=kpi_enabled,
            export_enabled=export_enabled,
            description=description,
            validation_rule=validation_rule,
            category=category
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj


    # ── Dataset Versions ─────────────────────────────────────────────────────

    def get_versions(self, db: Session, dataset_id: int) -> List[DatasetVersion]:
        return (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.version_number.desc())
            .all()
        )

    def get_version_by_id(self, db: Session, version_id: int) -> Optional[DatasetVersion]:
        return db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()

    def get_next_version_number(self, db: Session, dataset_id: int) -> int:
        result = (
            db.query(sa_func.max(DatasetVersion.version_number))
            .filter(DatasetVersion.dataset_id == dataset_id)
            .scalar()
        )
        return (int(result) + 1) if result is not None else 1

    def get_active_version(self, db: Session, dataset_id: int) -> Optional[DatasetVersion]:
        return (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset_id, DatasetVersion.is_active == True)
            .order_by(DatasetVersion.version_number.desc())
            .first()
        )

    def create_version(
        self,
        db: Session,
        *,
        dataset_id: int,
        version_number: int,
        filename: str,
        file_size: int = 0,
        uploader_id: Optional[UUID] = None
    ) -> DatasetVersion:
        db_obj = DatasetVersion(
            dataset_id=dataset_id,
            version_number=version_number,
            filename=filename,
            file_size=file_size,
            status="pending",
            uploaded_by=uploader_id
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_version_status(
        self,
        db: Session,
        *,
        version: DatasetVersion,
        status: str,
        total_rows: int = 0,
        imported_rows: int = 0,
        skipped_rows: int = 0,
        error_summary: Optional[str] = None
    ) -> DatasetVersion:
        version.status = status  # type: ignore
        version.total_rows = total_rows  # type: ignore
        version.imported_rows = imported_rows  # type: ignore
        version.skipped_rows = skipped_rows  # type: ignore
        version.error_summary = error_summary  # type: ignore
        db.add(version)
        db.commit()
        db.refresh(version)
        return version

    def rollback_to_version(self, db: Session, dataset_id: int, target_version_id: int) -> DatasetVersion:
        """Mark all versions after the target as rolled_back and set target as active."""
        dataset = self.get_dataset_by_id(db, dataset_id)
        if not dataset:
            raise ValueError(f"Dataset {dataset_id} not found")

        target = db.query(DatasetVersion).filter(
            DatasetVersion.id == target_version_id,
            DatasetVersion.dataset_id == dataset_id
        ).first()
        if not target:
            raise ValueError(f"Version {target_version_id} not found for dataset {dataset_id}")

        # Mark later versions as rolled back
        later_versions = (
            db.query(DatasetVersion)
            .filter(
                DatasetVersion.dataset_id == dataset_id,
                DatasetVersion.version_number > target.version_number
            )
            .all()
        )
        for v in later_versions:
            v.status = "rolled_back"  # type: ignore
            v.is_active = False  # type: ignore
            db.add(v)

            # If it's a custom table, delete the records
            if dataset.sql_table_name and dataset.sql_table_name != "generic_dataset_records":
                mappings = db.query(VersionRecordMapping).filter(VersionRecordMapping.version_id == v.id).all()
                record_ids = [m.record_id for m in mappings]
                if record_ids:
                    t_name = dataset.sql_table_name
                    if t_name and t_name.upper() == "DL_BIOM_TRICYCLIC_TERP_VW":
                        t_name = "DL_TRICYCLIC_TERPANE_"
                    try:
                        id_list = ",".join(str(rid) for rid in record_ids)
                        db.execute(text(f"DELETE FROM {t_name} WHERE ID IN ({id_list})"))
                    except Exception as e:
                        logger.error(f"Failed to delete rolled-back records from {t_name}: {str(e)}")
                    
                    # Delete the mappings
                    db.query(VersionRecordMapping).filter(VersionRecordMapping.version_id == v.id).delete()

        target.is_active = True  # type: ignore
        target.status = "completed"  # type: ignore
        db.add(target)
        db.commit()
        db.refresh(target)
        return target


    # ── Generic Records ──────────────────────────────────────────────────────

    def get_active_records(
        self,
        db: Session,
        dataset_id: int,
        *,
        skip: int = 0,
        limit: int = 100
    ) -> List[GenericDatasetRecord]:
        """Return records from the latest active version of a dataset."""
        active_version = self.get_active_version(db, dataset_id)
        if not active_version:
            return []
        return (
            db.query(GenericDatasetRecord)
            .filter(
                GenericDatasetRecord.dataset_id == dataset_id,
                GenericDatasetRecord.version_id == active_version.id
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_active_record_count(self, db: Session, dataset_id: int) -> int:
        active_version = self.get_active_version(db, dataset_id)
        if not active_version:
            return 0
        result = (
            db.query(sa_func.count(GenericDatasetRecord.id))
            .filter(
                GenericDatasetRecord.dataset_id == dataset_id,
                GenericDatasetRecord.version_id == active_version.id
            )
            .scalar()
        )
        return int(result) if result is not None else 0

    def bulk_insert_records(
        self,
        db: Session,
        *,
        dataset_id: int,
        version_id: int,
        records: List[Dict[str, Any]]
    ) -> int:
        """High-throughput bulk insert of JSONB records."""
        objects = [
            GenericDatasetRecord(
                dataset_id=dataset_id,
                version_id=version_id,
                data=record
            )
            for record in records
        ]
        db.bulk_save_objects(objects)
        db.commit()
        return len(objects)

    # ── Background Ingestion Worker ──────────────────────────────────────────

    def process_registry_upload(
        self,
        db: Session,
        *,
        dataset: DatasetRegistry,
        version: DatasetVersion,
        file_bytes: bytes,
        filename: str
    ) -> None:
        """
        Background task worker: delegate parsing and validation to CSVProcessor,
        and dynamically insert into target SQL table.
        """
        try:
            # Update status to processing
            version.status = "processing"  # type: ignore
            db.add(version)
            db.commit()

            # Delegate to CSVProcessor
            result = CSVProcessor.process_file(
                file_bytes=file_bytes,
                filename=filename,
                db=db,
                uploader_id=cast(UUID, version.uploaded_by),
                dataset_id=cast(int, dataset.id),
                version_id=cast(int, version.id)
            )

            # Trigger Metabase Synchronization dynamically
            try:
                from app.services.metabase_service import metabase_service
                metabase_service.sync_dataset(dataset, db)
            except Exception as mb_err:
                logger.warning(f"Metabase synchronization failed for dataset {dataset.name}: {str(mb_err)}")

            # Update version status
            version.status = "completed"  # type: ignore
            version.total_rows = result["total_rows"]  # type: ignore
            version.imported_rows = result["imported_rows"]  # type: ignore
            version.skipped_rows = result["skipped_rows"]  # type: ignore
            
            duplicates = result.get("duplicates", 0)
            warnings = result.get("warnings", [])
            error_text = "; ".join(warnings) if warnings else None
            if duplicates > 0:
                dup_msg = f"{duplicates} duplicate rows skipped."
                error_text = f"{dup_msg}; {error_text}" if error_text else dup_msg
            version.error_summary = error_text  # type: ignore
            
            db.add(version)
            db.commit()

            logger.info(
                f"Registry upload completed: dataset={dataset.name}, version={version.version_number}, "
                f"imported={result['imported_rows']}/{result['total_rows']}"
            )

        except Exception as exc:
            logger.exception(f"Registry upload failed: {str(exc)}")
            try:
                version.status = "failed"  # type: ignore
                version.error_summary = f"Processing error: {str(exc)}"  # type: ignore
                db.add(version)
                db.commit()
            except Exception:
                db.rollback()


crud_registry = CRUDRegistry()
