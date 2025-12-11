from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Dict, Any
from decimal import Decimal

from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models.finance_model import (
    DoctorService,
    Payment,
    SavedPaymentCard,
    PaymentMethod,
    PaymentStatus,
)
from db.models.appointment_model import Appointment
from db.models.user_model import User


# ==================== Doctor Services CRUD ====================

async def create_doctor_service(
    session: AsyncSession,
    *,
    doctor_user_id: int,
    service_name: str,
    description: Optional[str],
    price: float,
) -> DoctorService:
    """Create a new service for a doctor"""
    service = DoctorService(
        doctor_user_id=doctor_user_id,
        service_name=service_name,
        description=description,
        price=Decimal(str(price)),
        is_active=True,
    )
    session.add(service)
    await session.commit()
    await session.refresh(service)
    return service


async def get_doctor_service_by_id(
    session: AsyncSession,
    service_id: int,
    doctor_user_id: int,
) -> Optional[DoctorService]:
    """Get a service by ID, ensuring it belongs to the doctor"""
    stmt = select(DoctorService).where(
        and_(
            DoctorService.id == service_id,
            DoctorService.doctor_user_id == doctor_user_id,
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_doctor_services(
    session: AsyncSession,
    *,
    doctor_user_id: int,
    include_inactive: bool = False,
) -> List[DoctorService]:
    """List all services for a doctor"""
    stmt = select(DoctorService).where(
        DoctorService.doctor_user_id == doctor_user_id
    )
    if not include_inactive:
        stmt = stmt.where(DoctorService.is_active == True)
    stmt = stmt.order_by(DoctorService.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_doctor_service(
    session: AsyncSession,
    service_id: int,
    doctor_user_id: int,
    *,
    service_name: Optional[str] = None,
    description: Optional[str] = None,
    price: Optional[float] = None,
    is_active: Optional[bool] = None,
) -> Optional[DoctorService]:
    """Update a doctor service"""
    service = await get_doctor_service_by_id(session, service_id, doctor_user_id)
    if not service:
        return None

    if service_name is not None:
        service.service_name = service_name
    if description is not None:
        service.description = description
    if price is not None:
        service.price = Decimal(str(price))
    if is_active is not None:
        service.is_active = is_active

    await session.commit()
    await session.refresh(service)
    return service


async def delete_doctor_service(
    session: AsyncSession,
    service_id: int,
    doctor_user_id: int,
) -> bool:
    """Delete a doctor service (soft delete by setting is_active=False)"""
    service = await get_doctor_service_by_id(session, service_id, doctor_user_id)
    if not service:
        return False

    service.is_active = False
    await session.commit()
    return True


async def get_consultation_service(
    session: AsyncSession,
    doctor_user_id: int,
) -> Optional[DoctorService]:
    """Get the consultation service for a doctor, or return None if not found"""
    stmt = select(DoctorService).where(
        and_(
            DoctorService.doctor_user_id == doctor_user_id,
            DoctorService.service_name.ilike("%consultation%"),
            DoctorService.is_active == True,
        )
    ).order_by(DoctorService.created_at.asc()).limit(1)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


# ==================== Saved Payment Cards CRUD ====================

async def create_saved_payment_card(
    session: AsyncSession,
    *,
    patient_user_id: int,
    card_last_four: str,
    card_brand: str,
    expiry_month: int,
    expiry_year: int,
    cardholder_name: Optional[str] = None,
    is_default: bool = False,
) -> SavedPaymentCard:
    """Create a saved payment card for a patient"""
    # If this is set as default, unset other default cards
    if is_default:
        stmt = select(SavedPaymentCard).where(
            and_(
                SavedPaymentCard.patient_user_id == patient_user_id,
                SavedPaymentCard.is_default == True,
            )
        )
        result = await session.execute(stmt)
        existing_defaults = result.scalars().all()
        for card in existing_defaults:
            card.is_default = False

    card = SavedPaymentCard(
        patient_user_id=patient_user_id,
        card_last_four=card_last_four,
        card_brand=card_brand,
        expiry_month=expiry_month,
        expiry_year=expiry_year,
        cardholder_name=cardholder_name,
        is_default=is_default,
    )
    session.add(card)
    await session.commit()
    await session.refresh(card)
    return card


async def get_saved_payment_card_by_id(
    session: AsyncSession,
    card_id: int,
    patient_user_id: int,
) -> Optional[SavedPaymentCard]:
    """Get a saved card by ID, ensuring it belongs to the patient"""
    stmt = select(SavedPaymentCard).where(
        and_(
            SavedPaymentCard.id == card_id,
            SavedPaymentCard.patient_user_id == patient_user_id,
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_saved_payment_cards(
    session: AsyncSession,
    *,
    patient_user_id: int,
) -> List[SavedPaymentCard]:
    """List all saved payment cards for a patient"""
    stmt = select(SavedPaymentCard).where(
        SavedPaymentCard.patient_user_id == patient_user_id
    ).order_by(SavedPaymentCard.is_default.desc(), SavedPaymentCard.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def delete_saved_payment_card(
    session: AsyncSession,
    card_id: int,
    patient_user_id: int,
) -> bool:
    """Delete a saved payment card"""
    card = await get_saved_payment_card_by_id(session, card_id, patient_user_id)
    if not card:
        return False

    await session.delete(card)
    await session.commit()
    return True


# ==================== Payment CRUD ====================

async def create_payment(
    session: AsyncSession,
    *,
    appointment_id: int,
    doctor_user_id: int,
    patient_user_id: int,
    service_id: Optional[int],
    base_amount: float,
    discount_amount: float = 0.0,
    payment_method: Optional[str] = None,
) -> Payment:
    """Create a payment record for an appointment"""
    final_amount = Decimal(str(base_amount)) - Decimal(str(discount_amount))
    
    payment = Payment(
        appointment_id=appointment_id,
        doctor_user_id=doctor_user_id,
        patient_user_id=patient_user_id,
        service_id=service_id,
        base_amount=Decimal(str(base_amount)),
        discount_amount=Decimal(str(discount_amount)),
        final_amount=final_amount,
        payment_method=payment_method,
        payment_status=PaymentStatus.pending.value,
    )
    session.add(payment)
    await session.commit()
    await session.refresh(payment)
    return payment


async def get_payment_by_appointment_id(
    session: AsyncSession,
    appointment_id: int,
) -> Optional[Payment]:
    """Get payment by appointment ID"""
    stmt = select(Payment).where(Payment.appointment_id == appointment_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_payment_by_id(
    session: AsyncSession,
    payment_id: int,
) -> Optional[Payment]:
    """Get payment by payment ID"""
    stmt = select(Payment).where(Payment.id == payment_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_payments_for_patient(
    session: AsyncSession,
    *,
    patient_user_id: int,
    status: Optional[str] = None,
) -> List[Payment]:
    """List all payments for a patient"""
    stmt = select(Payment).where(Payment.patient_user_id == patient_user_id)
    if status:
        stmt = stmt.where(Payment.payment_status == status)
    stmt = stmt.order_by(Payment.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_payments_for_doctor(
    session: AsyncSession,
    *,
    doctor_user_id: int,
    status: Optional[str] = None,
) -> List[Payment]:
    """List all payments for a doctor"""
    stmt = select(Payment).where(Payment.doctor_user_id == doctor_user_id)
    if status:
        stmt = stmt.where(Payment.payment_status == status)
    stmt = stmt.order_by(Payment.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_pending_payments_for_doctor(
    session: AsyncSession,
    *,
    doctor_user_id: int,
) -> List[Payment]:
    """List all pending payments for a doctor (for discount management)"""
    stmt = select(Payment).where(
        and_(
            Payment.doctor_user_id == doctor_user_id,
            Payment.payment_status == PaymentStatus.pending.value,
        )
    ).order_by(Payment.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_payment_discount(
    session: AsyncSession,
    payment_id: int,
    doctor_user_id: int,
    *,
    discount_amount: float,
) -> Optional[Payment]:
    """Update discount amount for a payment (only if status is pending)"""
    payment = await get_payment_by_id(session, payment_id)
    if not payment:
        return None
    
    if payment.doctor_user_id != doctor_user_id:
        return None
    
    if payment.payment_status != PaymentStatus.pending.value:
        return None

    payment.discount_amount = Decimal(str(discount_amount))
    payment.final_amount = payment.base_amount - payment.discount_amount
    await session.commit()
    await session.refresh(payment)
    return payment


async def complete_payment(
    session: AsyncSession,
    payment_id: int,
    *,
    transaction_id: Optional[str] = None,
    saved_card_id: Optional[int] = None,
    cheque_batch_id: Optional[int] = None,
    insurance_batch_id: Optional[int] = None,
    insurance_policy_id: Optional[str] = None,
) -> Optional[Payment]:
    """Complete a payment (for online payments)"""
    payment = await get_payment_by_id(session, payment_id)
    if not payment:
        return None

    payment.payment_status = PaymentStatus.completed.value
    if transaction_id:
        payment.transaction_id = transaction_id
    if saved_card_id:
        payment.saved_card_id = saved_card_id
    if cheque_batch_id:
        payment.cheque_batch_id = cheque_batch_id
    if insurance_batch_id:
        payment.insurance_batch_id = insurance_batch_id
    if insurance_policy_id:
        payment.insurance_policy_id = insurance_policy_id

    # Update appointment status to confirmed
    appointment = await session.get(Appointment, payment.appointment_id)
    if appointment:
        appointment.status = "confirmed"

    await session.commit()
    await session.refresh(payment)
    return payment


async def approve_payment(
    session: AsyncSession,
    payment_id: int,
    doctor_user_id: int,
) -> Optional[Payment]:
    """Approve a payment (for cheque/insurance payments)"""
    payment = await get_payment_by_id(session, payment_id)
    if not payment:
        return None
    
    if payment.doctor_user_id != doctor_user_id:
        return None
    
    if payment.payment_status != PaymentStatus.pending.value:
        return None

    payment.payment_status = PaymentStatus.completed.value

    # Update appointment status to confirmed
    appointment = await session.get(Appointment, payment.appointment_id)
    if appointment:
        appointment.status = "confirmed"

    await session.commit()
    await session.refresh(payment)
    return payment

