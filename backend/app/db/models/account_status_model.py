from typing import Optional, TYPE_CHECKING
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from datetime import datetime
from db.base import Base

if TYPE_CHECKING:
    from .user_model import User


class AccountStatusLog(Base):
    """Logs all account status changes for audit purposes."""
    __tablename__ = "account_status_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    # Portal type: 'patient' or 'service_provider'
    portal_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Previous status
    previous_status: Mapped[str] = mapped_column(String(20), nullable=False)
    # New status
    new_status: Mapped[str] = mapped_column(String(20), nullable=False)
    # Reason for change (user feedback for deactivation, admin reason for suspension)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Ticket ID if suspended by admin
    ticket_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Who changed it: 'user' or 'admin'
    changed_by: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationship back to User
    user: Mapped["User"] = relationship(back_populates="account_status_logs")

