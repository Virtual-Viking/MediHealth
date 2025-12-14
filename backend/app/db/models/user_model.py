from typing import List, Optional, TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import (
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    func,
    Enum as SQLEnum,
)
from datetime import datetime
from db.base import Base
import enum

if TYPE_CHECKING:
    from .appointment_model import Appointment
    from .address_model import Address
    from .patient_model import PatientProfile
    from .insurance_model import PatientInsurancePolicy
    from .account_status_model import AccountStatusLog


# Enum for user roles matching database ENUM type
class UserRoleEnum(str, enum.Enum):
    doctor = "doctor"
    pharmacist = "pharmacist"
    insurer = "insurer"


# Enum for account status
class AccountStatusEnum(str, enum.Enum):
    active = "active"
    deactivated = "deactivated"
    suspended = "suspended"


# user table
class User(Base):
    __tablename__ = "users"

    # Map Python attribute 'id' to database column 'user_id'
    id: Mapped[int] = mapped_column("user_id", primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    middle_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    # Unique constraints required for login/signup validation
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)  # No unique constraint - same phone can be used for multiple accounts
    emergency_contact: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Security field (stores the HASHED password)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # is_patient: True for patient accounts, False for service provider accounts
    is_patient: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # role: NULL for patient accounts, 'doctor'/'pharmacist'/'insurer' for service providers
    role: Mapped[Optional[str]] = mapped_column(SQLEnum(UserRoleEnum, name="user_role"), nullable=True)
    accepted_terms: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Account status fields - separate for patient and service provider portals
    patient_status: Mapped[str] = mapped_column(SQLEnum(AccountStatusEnum, name="account_status"), nullable=False, server_default="active")
    service_provider_status: Mapped[str] = mapped_column(SQLEnum(AccountStatusEnum, name="account_status"), nullable=False, server_default="active")
    # Suspension details (only used when status is suspended)
    suspension_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    suspension_ticket_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, server_default=func.now())

    # Link to dbsessions
    sessions: Mapped[List["DBSession"]] = relationship(back_populates="user")
    # Link to the OTPStore
    otp_codes: Mapped[List["OTPStore"]] = relationship(back_populates="user")
    # Link to doctor profile (one-to-one)
    doctor_profile: Mapped[Optional["DoctorProfile"]] = relationship(
        back_populates="user", uselist=False
    )
    # Link to patient profile (one-to-one)
    patient_profile: Mapped[Optional["PatientProfile"]] = relationship(
        back_populates="user", uselist=False
    )

    # Addresses associated with the user (home, primary clinic, etc.)
    addresses: Mapped[List["Address"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    # Insurance policies for patients
    insurance_policies: Mapped[List["PatientInsurancePolicy"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan", passive_deletes=True
    )
    # Account status change logs
    account_status_logs: Mapped[List["AccountStatusLog"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    
    @property
    def user_id(self) -> int:
        """Alias for id to maintain backward compatibility."""
        return self.id