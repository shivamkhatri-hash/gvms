import json
from typing import Optional, List, Union, Any
from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from uuid import UUID


# Shared properties
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "viewer"  # 'admin', 'researcher', 'viewer'
    is_active: bool = True
    department: Optional[str] = "Geochemistry Laboratory"
    assigned_tasks: Optional[List[str]] = []


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str


# Properties to receive via API on update
class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    department: Optional[str] = None
    assigned_tasks: Optional[List[str]] = None


class UserInDBBase(UserBase):
    id: Union[UUID, str]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_validator("id", mode="before")
    @classmethod
    def transform_id(cls, v: Any) -> Union[UUID, str]:
        if isinstance(v, (UUID, str)):
            return v
        return str(v)

    @field_validator("assigned_tasks", mode="before")
    @classmethod
    def transform_assigned_tasks(cls, v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, list):
            return [str(x) for x in v]
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return [str(x) for x in parsed]
            except Exception:
                pass
            return [x.strip() for x in v.split(",") if x.strip()]
        return []

    class Config:
        from_attributes = True


# Additional properties to return via API
class UserResponse(UserInDBBase):
    pass


# Password change schema
class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str
