from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.log import UploadLog, AuditLog


class CRUDLog:
    def create_upload_log(
        self,
        db: Session,
        *,
        filename: str,
        file_size: int,
        total_rows: int,
        imported_rows: int,
        skipped_rows: int,
        error_summary: Optional[str] = None,
        quality_report: Optional[str] = None,
        uploader_id: Optional[UUID] = None
    ) -> UploadLog:
        db_obj = UploadLog(
            filename=filename,
            file_size=file_size,
            total_rows=total_rows,
            imported_rows=imported_rows,
            skipped_rows=skipped_rows,
            error_summary=error_summary,
            quality_report=quality_report,
            uploaded_by=uploader_id
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_upload_logs(self, db: Session, skip: int = 0, limit: int = 50) -> List[UploadLog]:
        return db.query(UploadLog).order_by(UploadLog.uploaded_at.desc()).offset(skip).limit(limit).all()

    def create_audit_log(
        self,
        db: Session,
        *,
        user_id: Optional[UUID],
        action: str,
        resource: str,
        details: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> AuditLog:
        db_obj = AuditLog(
            user_id=user_id,
            action=action,
            resource=resource,
            details=details,
            ip_address=ip_address
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_audit_logs(self, db: Session, skip: int = 0, limit: int = 100) -> List[AuditLog]:
        return db.query(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()


crud_log = CRUDLog()
