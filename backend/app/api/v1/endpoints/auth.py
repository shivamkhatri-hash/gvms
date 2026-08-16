from datetime import timedelta
from typing import Any, cast
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from app.api.deps import get_db, get_current_user
from app.core import security
from app.core.config import settings
from app.crud.crud_user import crud_user
from app.crud.crud_log import crud_log
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import UserResponse, UserPasswordChange, UserUpdate

router = APIRouter()


@router.post("/login", response_model=Token)
def login_access_token(
    request: Request,
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    user = None
    if settings.ENTERPRISE_AUTH_ENABLED:
        try:
            from app.services.enterprise_auth import enterprise_auth_service
            user = enterprise_auth_service.authenticate_user(
                db, username=form_data.username, password=form_data.password
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Enterprise authentication hook failure: {str(e)}")
            
    if not user:
        user = crud_user.authenticate(
            db, email=form_data.username, password=form_data.password
        )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is deactivated"
        )

    # Log audit entry
    client_ip = request.client.host if request.client else "127.0.0.1"
    crud_log.create_audit_log(
        db,
        user_id=cast(UUID, user.id),
        action="USER_LOGIN",
        resource="AUTH",
        details=f"User {user.email} logged in successfully.",
        ip_address=client_ip
    )

    access_token = security.create_access_token(subject=user.id, role=cast(str, user.role))
    refresh_token = security.create_refresh_token(subject=user.id, role=cast(str, user.role))

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.post("/refresh", response_model=Token)
def refresh_token(
    refresh_token: str,
    db: Session = Depends(get_db)
) -> Any:
    """
    Refresh access token using valid refresh token.
    """
    try:
        payload = jwt.decode(
            refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id = cast(str, payload.get("sub"))
        token_type = cast(str, payload.get("type"))
        if user_id is None or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    try:
        uuid_user_id = UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token"
        )

    user = crud_user.get_by_id(db, user_id=uuid_user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User inactive or deleted"
        )

    new_access_token = security.create_access_token(subject=user.id, role=cast(str, user.role))
    new_refresh_token = security.create_refresh_token(subject=user.id, role=cast(str, user.role))

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
def read_user_me(
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Get current logged-in user profile.
    """
    return current_user


@router.put("/me/password")
def change_password(
    password_data: UserPasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Update password for current logged-in user.
    """
    if not security.verify_password(password_data.current_password, cast(str, current_user.hashed_password)):
        raise HTTPException(status_code=400, detail="Incorrect current password")

    crud_user.update(
        db,
        db_obj=current_user,
        obj_in=UserUpdate(password=password_data.new_password)
    )
    return {"message": "Password updated successfully"}


@router.post("/forgot-password")
def forgot_password(email: str, db: Session = Depends(get_db)) -> Any:
    """
    Forgot password password reset request trigger.
    """
    user = crud_user.get_by_email(db, email=email)
    if not user:
        # Prevent account enumeration
        return {"message": "If account exists, password reset instructions have been logged."}
    
    crud_log.create_audit_log(
        db,
        user_id=cast(UUID, user.id),
        action="FORGOT_PASSWORD_REQUESTED",
        resource="AUTH",
        details=f"Password reset requested for {email}."
    )
    return {"message": "If account exists, password reset instructions have been logged."}
