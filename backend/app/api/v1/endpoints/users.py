from typing import Any, List, cast
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_admin, get_current_user
from app.crud.crud_user import crud_user
from app.crud.crud_log import crud_log
from app.models.user import User
from app.schemas.user import UserResponse, UserCreate, UserUpdate

router = APIRouter()


@router.get("", response_model=List[UserResponse])
def read_users(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Retrieve all users.
    """
    users = crud_user.get_multi(db, skip=skip, limit=limit)
    return users


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    *,
    db: Session = Depends(get_db),
    user_in: UserCreate,
    current_user: User = Depends(get_current_active_admin),
) -> Any:
    """
    Create new user. Restricted to Admin.
    """
    user = crud_user.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="User with this email already exists in system.",
        )
    user = crud_user.create(db, obj_in=user_in)
    try:
        if current_user.id:
            crud_log.create_audit_log(
                db,
                user_id=str(current_user.id),
                action="CREATE_USER",
                resource="USERS",
                details=f"Created user {user.email} with role {user.role}"
            )
    except Exception:
        pass

    return user


@router.get("/{user_id}", response_model=UserResponse)
def read_user_by_id(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Get a specific user by ID.
    """
    user = crud_user.get_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role != "admin" and str(current_user.id) != str(user.id):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    *,
    db: Session = Depends(get_db),
    user_id: str,
    user_in: UserUpdate,
    current_user: User = Depends(get_current_active_admin),
) -> Any:
    """
    Update a user. Restricted to Admin.
    """
    user = crud_user.get_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = crud_user.update(db, db_obj=user, obj_in=user_in)
    
    try:
        if current_user.id:
            crud_log.create_audit_log(
                db,
                user_id=str(current_user.id),
                action="UPDATE_USER",
                resource="USERS",
                details=f"Updated user {user.email}"
            )
    except Exception:
        pass

    return user


@router.delete("/{user_id}")
def delete_user(
    *,
    db: Session = Depends(get_db),
    user_id: str,
    current_user: User = Depends(get_current_active_admin),
) -> Any:
    """
    Delete a user. Restricted to Admin.
    """
    if str(current_user.id) == str(user_id):
        raise HTTPException(status_code=400, detail="Cannot delete current admin user")

    user = crud_user.get_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    crud_user.delete(db, user_id=user_id)
    
    try:
        if current_user.id:
            crud_log.create_audit_log(
                db,
                user_id=str(current_user.id),
                action="DELETE_USER",
                resource="USERS",
                details=f"Deleted user {user.email}"
            )
    except Exception:
        pass

    return {"message": "User deleted successfully"}
