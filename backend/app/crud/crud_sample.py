from typing import Optional, List, Dict, Any, Tuple
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, and_
from app.models.sample import PetroleumData
from app.schemas.sample import PetroleumDataCreate, PetroleumDataUpdate


class CRUDSample:
    def get(self, db: Session, id: int) -> Optional[PetroleumData]:
        return db.query(PetroleumData).filter(PetroleumData.id == id).first()

    def get_filtered(
        self,
        db: Session,
        *,
        well_name: Optional[str] = None,
        sample_type: Optional[str] = None,
        depth_min: Optional[float] = None,
        depth_max: Optional[float] = None,
        toc_min: Optional[float] = None,
        toc_max: Optional[float] = None,
        s2_min: Optional[float] = None,
        s2_max: Optional[float] = None,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[PetroleumData], int]:
        query = db.query(PetroleumData)

        if well_name and well_name != "ALL":
            query = query.filter(PetroleumData.well_name == well_name)
        if sample_type and sample_type != "ALL":
            query = query.filter(PetroleumData.sample_type == sample_type)
        if depth_min is not None:
            query = query.filter(PetroleumData.depth_from >= depth_min)
        if depth_max is not None:
            query = query.filter(PetroleumData.depth_from <= depth_max)
        if toc_min is not None:
            query = query.filter(PetroleumData.toc >= toc_min)
        if toc_max is not None:
            query = query.filter(PetroleumData.toc <= toc_max)
        if s2_min is not None:
            query = query.filter(PetroleumData.s2 >= s2_min)
        if s2_max is not None:
            query = query.filter(PetroleumData.s2 <= s2_max)

        total = query.count()
        items = query.order_by(PetroleumData.well_name, PetroleumData.depth_from).offset(skip).limit(limit).all()
        return items, total

    def get_all_unpaginated(
        self,
        db: Session,
        *,
        well_name: Optional[str] = None,
        sample_type: Optional[str] = None,
        depth_min: Optional[float] = None,
        depth_max: Optional[float] = None,
        toc_min: Optional[float] = None,
        toc_max: Optional[float] = None,
        s2_min: Optional[float] = None,
        s2_max: Optional[float] = None
    ) -> List[PetroleumData]:
        query = db.query(PetroleumData)

        if well_name and well_name != "ALL":
            query = query.filter(PetroleumData.well_name == well_name)
        if sample_type and sample_type != "ALL":
            query = query.filter(PetroleumData.sample_type == sample_type)
        if depth_min is not None:
            query = query.filter(PetroleumData.depth_from >= depth_min)
        if depth_max is not None:
            query = query.filter(PetroleumData.depth_from <= depth_max)
        if toc_min is not None:
            query = query.filter(PetroleumData.toc >= toc_min)
        if toc_max is not None:
            query = query.filter(PetroleumData.toc <= toc_max)
        if s2_min is not None:
            query = query.filter(PetroleumData.s2 >= s2_min)
        if s2_max is not None:
            query = query.filter(PetroleumData.s2 <= s2_max)

        return query.order_by(PetroleumData.well_name, PetroleumData.depth_from).all()

    def get_wells(self, db: Session) -> List[str]:
        wells = db.query(distinct(PetroleumData.well_name)).order_by(PetroleumData.well_name).all()
        return [w[0] for w in wells if w[0]]

    def get_sample_types(self, db: Session) -> List[str]:
        types = db.query(distinct(PetroleumData.sample_type)).order_by(PetroleumData.sample_type).all()
        return [t[0] for t in types if t[0]]

    def create(self, db: Session, *, obj_in: Dict[str, Any], uploader_id: Optional[UUID] = None) -> PetroleumData:
        db_obj = PetroleumData(
            sample_type=obj_in["sample_type"],
            well_name=obj_in["well_name"],
            depth_from=obj_in["depth_from"],
            depth_interval=obj_in["depth_interval"],
            toc=obj_in["toc"],
            s2=obj_in["s2"],
            toc_classification=obj_in["toc_classification"],
            s2_classification=obj_in["s2_classification"],
            interpretation=obj_in.get("interpretation"),
            uploaded_by=uploader_id
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def bulk_create(self, db: Session, *, records: List[Dict[str, Any]], uploader_id: Optional[UUID] = None) -> int:
        db_objects = [
            PetroleumData(
                sample_type=rec["sample_type"],
                well_name=rec["well_name"],
                depth_from=rec["depth_from"],
                depth_interval=rec["depth_interval"],
                toc=rec["toc"],
                s2=rec["s2"],
                toc_classification=rec["toc_classification"],
                s2_classification=rec["s2_classification"],
                interpretation=rec.get("interpretation"),
                uploaded_by=uploader_id
            )
            for rec in records
        ]
        db.bulk_save_objects(db_objects)
        db.commit()
        return len(db_objects)

    def delete(self, db: Session, id: int) -> bool:
        obj = self.get(db, id)
        if obj:
            db.delete(obj)
            db.commit()
            return True
        return False

    def get_stats(self, db: Session) -> Dict[str, Any]:
        total_samples = db.query(func.count(PetroleumData.id)).scalar() or 0
        total_wells = db.query(func.count(distinct(PetroleumData.well_name))).scalar() or 0
        avg_toc = db.query(func.avg(PetroleumData.toc)).scalar() or 0.0
        avg_s2 = db.query(func.avg(PetroleumData.s2)).scalar() or 0.0
        max_toc = db.query(func.max(PetroleumData.toc)).scalar() or 0.0
        max_s2 = db.query(func.max(PetroleumData.s2)).scalar() or 0.0

        # TOC Classification Distribution
        toc_counts = db.query(
            PetroleumData.toc_classification, func.count(PetroleumData.id)
        ).group_by(PetroleumData.toc_classification).all()
        toc_dist = {cat: count for cat, count in toc_counts}

        # S2 Classification Distribution
        s2_counts = db.query(
            PetroleumData.s2_classification, func.count(PetroleumData.id)
        ).group_by(PetroleumData.s2_classification).all()
        s2_dist = {cat: count for cat, count in s2_counts}

        # Wells Summary
        wells_summary_raw = db.query(
            PetroleumData.well_name,
            func.count(PetroleumData.id).label("samples_count"),
            func.avg(PetroleumData.toc).label("avg_toc"),
            func.avg(PetroleumData.s2).label("avg_s2"),
            func.min(PetroleumData.depth_from).label("min_depth"),
            func.max(PetroleumData.depth_from).label("max_depth")
        ).group_by(PetroleumData.well_name).all()

        wells_summary = [
            {
                "well_name": row[0],
                "samples_count": row[1],
                "avg_toc": round(row[2] or 0.0, 2),
                "avg_s2": round(row[3] or 0.0, 2),
                "min_depth": round(row[4] or 0.0, 1),
                "max_depth": round(row[5] or 0.0, 1)
            }
            for row in wells_summary_raw
        ]

        return {
            "total_samples": total_samples,
            "total_wells": total_wells,
            "avg_toc": round(avg_toc, 2),
            "avg_s2": round(avg_s2, 2),
            "max_toc": round(max_toc, 2),
            "max_s2": round(max_s2, 2),
            "toc_distribution": toc_dist,
            "s2_distribution": s2_dist,
            "wells_summary": wells_summary
        }


crud_sample = CRUDSample()
