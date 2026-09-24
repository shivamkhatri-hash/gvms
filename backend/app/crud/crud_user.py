import json
from typing import Optional, List, Any
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import get_password_hash, verify_password


class CRUDUser:
    def get_by_id(self, db: Session, user_id: Any) -> Optional[User]:
        if not user_id:
            return None
        try:
            if isinstance(user_id, str):
                try:
                    uuid_val = UUID(user_id)
                    res = db.query(User).filter(User.id == uuid_val).first()
                    if res:
                        return res
                except ValueError:
                    pass
                return db.query(User).filter(User.id == user_id).first()
            return db.query(User).filter(User.id == user_id).first()
        except Exception:
            return db.query(User).filter(User.id == str(user_id)).first()

    def get_by_email(self, db: Session, email: str) -> Optional[User]:
        if not email:
            return None
        return db.query(User).filter(User.email == email.lower().strip()).first()

    def get_multi(self, db: Session, skip: int = 0, limit: int = 100) -> List[User]:
        return db.query(User).offset(skip).limit(limit).all()

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        tasks_val = obj_in.assigned_tasks
        if isinstance(tasks_val, list):
            tasks_str = json.dumps(tasks_val)
        elif tasks_val:
            tasks_str = str(tasks_val)
        else:
            tasks_str = json.dumps(["Core Lab"])

        db_obj = User(
            email=obj_in.email.lower().strip(),
            hashed_password=get_password_hash(obj_in.password),
            full_name=obj_in.full_name,
            role=obj_in.role,
            is_active=obj_in.is_active,
            department=obj_in.department or "Geochemistry Laboratory",
            assigned_tasks=tasks_str
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, *, db_obj: User, obj_in: UserUpdate) -> User:
        update_data = obj_in.model_dump(exclude_unset=True)
        if "password" in update_data and update_data["password"]:
            update_data["hashed_password"] = get_password_hash(update_data["password"])
            del update_data["password"]
        if "email" in update_data:
            update_data["email"] = update_data["email"].lower().strip()
        if "assigned_tasks" in update_data:
            tasks_val = update_data["assigned_tasks"]
            if isinstance(tasks_val, list):
                update_data["assigned_tasks"] = json.dumps(tasks_val)
            elif tasks_val is None:
                update_data["assigned_tasks"] = None
            else:
                update_data["assigned_tasks"] = str(tasks_val)

        for field, val in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, val)

        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def authenticate(self, db: Session, *, email: str, password: str) -> Optional[User]:
        user = self.get_by_email(db, email=email)
        if not user:
            return None
        if not verify_password(password, str(user.hashed_password)):
            return None
        return user

    def delete(self, db: Session, *, user_id: Any) -> bool:
        user = self.get_by_id(db, user_id)
        if user:
            db.delete(user)
            db.commit()
            return True
        return False


crud_user = CRUDUser()
