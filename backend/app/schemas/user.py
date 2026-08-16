from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime
from uuid import UUID


# Shared properties
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "viewer"  # 'admin', 'researcher', 'viewer'
    is_active: bool = True


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


class UserInDBBase(UserBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Additional properties to return via API
class UserResponse(UserInDBBase):
    pass


# Password change schema
class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str
