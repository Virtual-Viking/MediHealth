from pydantic import BaseModel, Field, EmailStr
from enum import Enum
from typing import Optional
from datetime import datetime


class UserRole(str, Enum):
    doctor = "doctor"
    patient = "patient"
    insurer = "insurer"
    pharmacist = "pharmacist"


# Base user model
class UserBase(BaseModel):
    first_name: str = Field(..., min_length=1, description="user firstname")
    middle_name: Optional[str] = Field(None, description="user middlename")
    last_name: str = Field(..., min_length=1, description="user lastname")
    email: EmailStr = Field(..., description="account email")
    phone: str = Field(..., min_length=10, description="User's phone number")
    emergency_contact: Optional[str] = Field(None, description="Emergency contact phone number")
    role: Optional[UserRole] = Field(None, description="Must be 'doctor', 'pharmacist', or 'insurer' for service providers. NULL for patients.")
    accepted_terms: bool = Field(
        ..., description="Must be true to accept the Terms & Conditions."
    )

    class Config:
        use_enum_values = True
        from_attributes = True


# create new account model
class CreateUser(UserBase):
    password: str = Field(..., min_length=8, description="account password")


# read user model
class ReadUser(UserBase):
    id: int = Field(..., description="user's unique id")
    user_id: int = Field(..., description="Alias for id (backward compatibility)")
    is_patient: bool = Field(..., description="True if user is a patient, False if service provider")
    created_at: Optional[datetime] = Field(None, description="Account creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    
    def __init__(self, **data):
        # Ensure user_id is always set to match id
        if 'id' in data and 'user_id' not in data:
            data['user_id'] = data['id']
        elif 'user_id' in data and 'id' not in data:
            data['id'] = data['user_id']
        super().__init__(**data)
