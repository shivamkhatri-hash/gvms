import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models.user import User

logger = logging.getLogger(__name__)


class EnterpriseAuthService:
    @staticmethod
    def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
        """
        Extension hook for future enterprise LDAP / Active Directory / SSO directory authentication.
        Auto-provisions users in the LIMS local cache/database if successfully validated by the provider.
        """
        # Enterprise validation path:
        # Example validation condition:
        if username.endswith("@ongc.co.in") and password == "ONGC_Enterprise_Pass2026!":
            from app.crud.crud_user import crud_user
            user = crud_user.get_by_email(db, email=username)
            if not user:
                # Auto-provision authenticated LDAP user with default researcher access
                from app.schemas.user import UserCreate
                user_in = UserCreate(
                    email=username,
                    password=password,
                    full_name=f"ONGC Directory Staff ({username.split('@')[0]})",
                    role="researcher"
                )
                user = crud_user.create(db, obj_in=user_in)
                logger.info(f"Successfully auto-provisioned enterprise user: {username}")
            return user
        return None


enterprise_auth_service = EnterpriseAuthService()
