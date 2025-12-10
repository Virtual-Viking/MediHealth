from typing import List, Optional, TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import (
    String,
    DateTime,
    ForeignKey,
    Integer,
    func,
    Text,
    Enum as SQLEnum,
)
from datetime import datetime
from db.base import Base
import enum

if TYPE_CHECKING:
    from db.models.user_model import User
    from db.models.appointment_model import Appointment
    from db.models.appointment_request_model import AppointmentRequest


class FileBatchCategory(str, enum.Enum):
    """Category of file batch"""
    insurance = "insurance"
    lab_report = "lab_report"
    cheque = "cheque"
    insurance_payment = "insurance_payment"


class FileBatch(Base):
    """Batch of files uploaded by patient"""
    __tablename__ = "file_batches"

    id: Mapped[int] = mapped_column("file_batch_id", primary_key=True, index=True)
    patient_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(SQLEnum(FileBatchCategory, name="file_batch_category"), nullable=False, index=True)
    heading: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    # Relationship to files
    files: Mapped[List["PatientFile"]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="desc(PatientFile.created_at)"
    )
    shares: Mapped[List["FileBatchShare"]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="desc(FileBatchShare.shared_at)"
    )


class PatientFile(Base):
    """Individual file in a batch"""
    __tablename__ = "patient_files"

    id: Mapped[int] = mapped_column("file_id", primary_key=True, index=True)
    file_batch_id: Mapped[int] = mapped_column(Integer, ForeignKey("file_batches.file_batch_id", ondelete="CASCADE"), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(String(100), nullable=False)  # MIME type
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)  # Size in bytes
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True
    )

    # Relationship to batch
    batch: Mapped["FileBatch"] = relationship(back_populates="files")


class FileBatchShare(Base):
    """Records of lab-report batches shared with doctors"""
    __tablename__ = "file_batch_shares"

    id: Mapped[int] = mapped_column("share_id", primary_key=True, index=True)
    file_batch_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("file_batches.file_batch_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doctor_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    appointment_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("appointments.appointment_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    appointment_request_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("appointment_requests.request_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    share_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
    )
    shared_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    batch: Mapped["FileBatch"] = relationship(back_populates="shares")
    patient: Mapped["User"] = relationship("User", foreign_keys=[patient_user_id])
    doctor: Mapped["User"] = relationship("User", foreign_keys=[doctor_user_id])
    appointment: Mapped[Optional["Appointment"]] = relationship("Appointment")
    appointment_request: Mapped[Optional["AppointmentRequest"]] = relationship("AppointmentRequest")

