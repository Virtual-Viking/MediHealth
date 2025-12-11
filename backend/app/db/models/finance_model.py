from __future__ import annotations

from datetime import datetime
from typing import Optional, List
import enum

from sqlalchemy import (
    String,
    DateTime,
    ForeignKey,
    Integer,
    func,
    Text,
    Numeric,
    Boolean,
    Enum as SQLEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.base import Base


class PaymentMethod(str, enum.Enum):
    """Payment method types"""
    online = "online"
    cheque = "cheque"
    insurance = "insurance"


class PaymentStatus(str, enum.Enum):
    """Payment status"""
    pending = "pending"
    completed = "completed"
    failed = "failed"
    refunded = "refunded"


class DoctorService(Base):
    """Services offered by doctors with pricing"""
    __tablename__ = "doctor_services"

    id: Mapped[int] = mapped_column("service_id", primary_key=True, index=True)
    doctor_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    doctor: Mapped["User"] = relationship("User", foreign_keys=[doctor_user_id])
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="service")


class SavedPaymentCard(Base):
    """Saved payment cards for patients"""
    __tablename__ = "saved_payment_cards"

    id: Mapped[int] = mapped_column("card_id", primary_key=True, index=True)
    patient_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_last_four: Mapped[str] = mapped_column(String(4), nullable=False)
    card_brand: Mapped[str] = mapped_column(String(50), nullable=False)  # Visa, Mastercard, etc.
    expiry_month: Mapped[int] = mapped_column(Integer, nullable=False)
    expiry_year: Mapped[int] = mapped_column(Integer, nullable=False)
    cardholder_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    patient: Mapped["User"] = relationship("User", foreign_keys=[patient_user_id])
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="saved_card")


class Payment(Base):
    """Payment records for appointments"""
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column("payment_id", primary_key=True, index=True)
    appointment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("appointments.appointment_id", ondelete="CASCADE"), 
        nullable=False, unique=True, index=True
    )
    doctor_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    patient_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("doctor_services.service_id", ondelete="SET NULL"), nullable=True, index=True
    )
    base_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0.0)
    final_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    payment_method: Mapped[Optional[str]] = mapped_column(
        SQLEnum(PaymentMethod, name="payment_method", create_constraint=False),
        nullable=True
    )
    payment_status: Mapped[str] = mapped_column(
        SQLEnum(PaymentStatus, name="payment_status", create_constraint=False),
        nullable=False,
        default=PaymentStatus.pending.value
    )
    transaction_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    
    # Payment method specific references
    saved_card_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("saved_payment_cards.card_id", ondelete="SET NULL"), nullable=True
    )
    cheque_batch_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("file_batches.file_batch_id", ondelete="SET NULL"), nullable=True
    )
    insurance_batch_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("file_batches.file_batch_id", ondelete="SET NULL"), nullable=True
    )
    insurance_policy_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)  # UUID as string
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    appointment: Mapped["Appointment"] = relationship("Appointment")
    doctor: Mapped["User"] = relationship("User", foreign_keys=[doctor_user_id])
    patient: Mapped["User"] = relationship("User", foreign_keys=[patient_user_id])
    service: Mapped[Optional["DoctorService"]] = relationship("DoctorService", back_populates="payments")
    saved_card: Mapped[Optional["SavedPaymentCard"]] = relationship("SavedPaymentCard", back_populates="payments")
    cheque_batch: Mapped[Optional["FileBatch"]] = relationship("FileBatch", foreign_keys=[cheque_batch_id])
    insurance_batch: Mapped[Optional["FileBatch"]] = relationship("FileBatch", foreign_keys=[insurance_batch_id])

