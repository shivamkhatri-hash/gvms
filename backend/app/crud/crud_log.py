from typing import List, Optional, Any
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
        uploader_id: Optional[Any] = None
    ) -> Optional[UploadLog]:
        try:
            db_obj = UploadLog(
                filename=filename,
                file_size=file_size,
                total_rows=total_rows,
                imported_rows=imported_rows,
                skipped_rows=skipped_rows,
                error_summary=error_summary,
                quality_report=quality_report,
                uploaded_by=str(uploader_id) if uploader_id else None
            )
            db.add(db_obj)
            db.commit()
            db.refresh(db_obj)
            return db_obj
        except Exception as e:
            db.rollback()
            import logging
            logging.getLogger(__name__).warning(f"Failed to create upload log: {str(e)}")
            return None

    def get_upload_logs(self, db: Session, skip: int = 0, limit: int = 50) -> List[UploadLog]:
        try:
            return db.query(UploadLog).order_by(UploadLog.uploaded_at.desc()).offset(skip).limit(limit).all()
        except Exception:
            return []

    def create_audit_log(
        self,
        db: Session,
        *,
        user_id: Optional[Any] = None,
        action: str,
        resource: str,
        details: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> Optional[AuditLog]:
        try:
            db_obj = AuditLog(
                user_id=str(user_id) if user_id else None,
                action=action,
                resource=resource,
                details=details,
                ip_address=ip_address
            )
            db.add(db_obj)
            db.commit()
            db.refresh(db_obj)
            return db_obj
        except Exception as e:
            db.rollback()
            import logging
            logging.getLogger(__name__).warning(f"Failed to create audit log: {str(e)}")
            return None

    def get_audit_logs(self, db: Session, skip: int = 0, limit: int = 100) -> List[AuditLog]:
        try:
            return db.query(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
        except Exception:
            return []


crud_log = CRUDLog()
