"""
Doctor Finance Routes - Services management, discount management, and payment approval
"""
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Cookie,
)
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db import get_session
from db.crud import (
    auth_crud,
    finance_crud,
    appointment_crud,
    patient_file_crud,
    notification_crud,
)
from db.models.finance_model import Payment, DoctorService
from db.models.appointment_model import Appointment
from db.models.user_model import User
from db.models.patient_file_model import FileBatch, FileBatchShare
from schemas.finance_schema import (
    DoctorServiceCreate,
    DoctorServiceUpdate,
    DoctorServiceRead,
    PaymentRead,
    PendingPaymentItem,
    DoctorWidgetMetrics,
)
from services import verify_access_token

router = APIRouter()


async def get_current_doctor(
    access_token: str = Cookie(None),
    session: AsyncSession = Depends(get_session),
):
    """Get current authenticated doctor user"""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = await verify_access_token(access_token)
    user_id = int(payload.get("sub"))

    user = await auth_crud.get_user_by_id(user_id, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Verify user is a doctor
    if not user.role or user.role.value != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only accessible to doctors",
        )

    return user


# ==================== Widget Metrics ====================

@router.get("/metrics", response_model=DoctorWidgetMetrics)
async def get_widget_metrics(
    time_filter: str = "monthly",  # weekly, monthly, yearly
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Get metrics for dashboard widgets based on time filter"""
    from datetime import datetime, timedelta
    from sqlalchemy import func, and_
    
    # Calculate date range based on filter
    now = datetime.now()
    if time_filter == "weekly":
        start_date = now - timedelta(days=7)
    elif time_filter == "yearly":
        start_date = now - timedelta(days=365)
    else:  # monthly (default)
        start_date = now - timedelta(days=30)
    
    # Total Payment Received (completed payments in time period)
    received_result = await session.execute(
        select(func.coalesce(func.sum(Payment.final_amount), 0))
        .where(
            and_(
                Payment.doctor_user_id == current_user.id,
                Payment.payment_status == "completed",
                Payment.updated_at >= start_date
            )
        )
    )
    total_received = float(received_result.scalar())
    
    # Total Amount Pending Approval (pending payments with cheque/insurance)
    pending_approval_result = await session.execute(
        select(func.coalesce(func.sum(Payment.final_amount), 0))
        .where(
            and_(
                Payment.doctor_user_id == current_user.id,
                Payment.payment_status == "pending",
                Payment.payment_method.in_(["cheque", "insurance"])
            )
        )
    )
    total_pending_approval = float(pending_approval_result.scalar())
    
    # Total Unpaid Amount (all pending payments)
    unpaid_result = await session.execute(
        select(func.coalesce(func.sum(Payment.final_amount), 0))
        .where(
            and_(
                Payment.doctor_user_id == current_user.id,
                Payment.payment_status == "pending"
            )
        )
    )
    total_unpaid = float(unpaid_result.scalar())
    
    # Number of New Customers (distinct patients in time period)
    new_customers_result = await session.execute(
        select(func.count(func.distinct(Payment.patient_user_id)))
        .where(
            and_(
                Payment.doctor_user_id == current_user.id,
                Payment.created_at >= start_date
            )
        )
    )
    new_customers = int(new_customers_result.scalar())
    
    return DoctorWidgetMetrics(
        total_received=total_received,
        total_pending_approval=total_pending_approval,
        total_unpaid=total_unpaid,
        new_customers=new_customers
    )


# ==================== Doctor Services CRUD ====================

@router.get("/services", response_model=List[DoctorServiceRead])
async def list_my_services(
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """List all services for the doctor"""
    services = await finance_crud.list_doctor_services(
        session, doctor_user_id=current_user.id, include_inactive=False
    )
    return services


@router.post("/services", response_model=DoctorServiceRead, status_code=status.HTTP_201_CREATED)
async def create_service(
    service_data: DoctorServiceCreate,
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Create a new service for the doctor"""
    service = await finance_crud.create_doctor_service(
        session,
        doctor_user_id=current_user.id,
        service_name=service_data.service_name,
        description=service_data.description,
        price=service_data.price,
    )
    return service


@router.get("/services/{service_id}", response_model=DoctorServiceRead)
async def get_service(
    service_id: int,
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Get a specific service"""
    service = await finance_crud.get_doctor_service_by_id(
        session, service_id, current_user.id
    )
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found",
        )
    return service


@router.put("/services/{service_id}", response_model=DoctorServiceRead)
async def update_service(
    service_id: int,
    service_data: DoctorServiceUpdate,
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Update a service"""
    service = await finance_crud.update_doctor_service(
        session,
        service_id,
        current_user.id,
        service_name=service_data.service_name,
        description=service_data.description,
        price=service_data.price,
        is_active=service_data.is_active,
    )
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found",
        )
    return service


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(
    service_id: int,
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Delete a service (soft delete)"""
    success = await finance_crud.delete_doctor_service(
        session, service_id, current_user.id
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found",
        )


# ==================== Pending Payments (Discount Management) ====================

@router.get("/pending-payments", response_model=List[PendingPaymentItem])
async def get_pending_payments(
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Get all appointments with payments for the doctor (both pending and completed)"""
    from sqlalchemy import or_
    
    # Get all appointments with payment_pending or confirmed status (to show payment history)
    stmt = select(Appointment).where(
        Appointment.doctor_user_id == current_user.id,
        or_(
            Appointment.status == "payment_pending",
            Appointment.status == "confirmed"
        )
    ).order_by(Appointment.appointment_date.desc())

    result = await session.execute(stmt)
    appointments = result.scalars().all()

    pending_payments = []
    for appointment in appointments:
        # Skip appointments without patient_user_id (shouldn't happen but safety check)
        if not appointment.patient_user_id:
            continue

        # Get payment record if exists
        payment = await finance_crud.get_payment_by_appointment_id(
            session, appointment.appointment_id
        )

        # Get patient info
        patient = await auth_crud.get_user_by_id(appointment.patient_user_id, session)
        patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "Unknown"

        # Get service info if payment exists
        service_name = None
        base_amount = 100.0  # Default consultation fee
        discount_amount = 0.0
        final_amount = 100.0
        payment_id = None
        payment_status = None
        payment_method = None

        if payment:
            payment_id = payment.id
            payment_status = payment.payment_status
            payment_method = payment.payment_method
            base_amount = float(payment.base_amount)
            discount_amount = float(payment.discount_amount)
            final_amount = float(payment.final_amount)
            if payment.service_id:
                service = await session.get(DoctorService, payment.service_id)
                if service:
                    service_name = service.service_name
        else:
            # Create payment record if it doesn't exist
            # Get consultation service or use default
            consultation_service = await finance_crud.get_consultation_service(
                session, current_user.id
            )
            service_id = consultation_service.id if consultation_service else None
            if consultation_service:
                base_amount = float(consultation_service.price)
                service_name = consultation_service.service_name
            else:
                service_name = "Consultation"  # Default service name

            final_amount = base_amount

            # Create payment record
            try:
                payment = await finance_crud.create_payment(
                    session,
                    appointment_id=appointment.appointment_id,
                    doctor_user_id=current_user.id,
                    patient_user_id=appointment.patient_user_id,
                    service_id=service_id,
                    base_amount=base_amount,
                    discount_amount=0.0,
                    payment_method=None,  # Will be set when patient chooses payment method
                )
                payment_id = payment.id
                payment_status = payment.payment_status
            except Exception as e:
                # If payment creation fails (e.g., duplicate key), skip this appointment
                print(f"Failed to create payment for appointment {appointment.appointment_id}: {e}")
                continue

        pending_payments.append(
            PendingPaymentItem(
                appointment_id=appointment.appointment_id,
                appointment_date=appointment.appointment_date,
                appointment_status=appointment.status,
                doctor_user_id=current_user.id,
                doctor_name=f"{current_user.first_name} {current_user.last_name}".strip(),
                doctor_photo_url=None,  # Can be added if needed
                patient_user_id=appointment.patient_user_id,
                patient_name=patient_name,
                service_id=payment.service_id if payment else None,
                service_name=service_name,
                base_amount=base_amount,
                discount_amount=discount_amount,
                final_amount=final_amount,
                payment_id=payment_id,
                payment_status=payment_status,
                payment_method=payment_method,
                payment_created_at=payment.created_at if payment else None,
                payment_updated_at=payment.updated_at if payment else None,
            )
        )

    return pending_payments


# Discount update request model
from pydantic import BaseModel as PydanticBaseModel, Field

class DiscountUpdateRequest(PydanticBaseModel):
    discount_amount: float = Field(..., ge=0, description="Discount amount")


@router.patch("/payments/{payment_id}/discount", response_model=PaymentRead)
async def update_payment_discount_fixed(
    payment_id: int,
    discount_data: DiscountUpdateRequest,
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Update discount amount for a pending payment"""
    payment = await finance_crud.get_payment_by_id(session, payment_id)
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    if payment.doctor_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Payment does not belong to you",
        )

    if payment.payment_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only update discount for pending payments",
        )

    # Validate discount doesn't exceed base amount
    if discount_data.discount_amount > float(payment.base_amount):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Discount amount cannot exceed base amount",
        )

    # Update discount
    updated_payment = await finance_crud.update_payment_discount(
        session,
        payment_id,
        current_user.id,
        discount_amount=discount_data.discount_amount,
    )

    if not updated_payment:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update discount",
        )

    return updated_payment


# ==================== Payment Approval ====================

@router.get("/payments/pending-approval", response_model=List[PaymentRead])
async def get_payments_pending_approval(
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Get payments that need approval (cheque or insurance)"""
    # Get pending payments with cheque or insurance method
    stmt = select(Payment).where(
        Payment.doctor_user_id == current_user.id,
        Payment.payment_status == "pending",
        Payment.payment_method.in_(["cheque", "insurance"]),
    ).order_by(Payment.created_at.desc())

    result = await session.execute(stmt)
    payments = result.scalars().all()

    return payments


# ==================== Payment History ====================

@router.get("/payments/history", response_model=List[PendingPaymentItem])
async def get_payment_history(
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Get all payment history for doctor (all appointments with payments)"""
    try:
        # Fetch all appointments for this doctor
        stmt = select(Appointment).where(Appointment.doctor_user_id == current_user.id)
        result = await session.execute(stmt)
        appointments = result.scalars().all()

        pending_payments = []
        for appointment in appointments:
            # Get patient info
            patient = await auth_crud.get_user_by_id(appointment.patient_user_id, session)
            patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "Unknown"

            # Get payment info
            payment_stmt = select(Payment).where(Payment.appointment_id == appointment.appointment_id)
            payment_result = await session.execute(payment_stmt)
            payment = payment_result.scalar_one_or_none()
            
            payment_id = payment.id if payment else None
            payment_status = payment.payment_status if payment else None
            payment_method = payment.payment_method if payment else None

            # Get service info
            service_id = payment.service_id if payment else None
            service_name = None
            base_amount = 100.0  # Default consultation fee
            discount_amount = 0.0
            final_amount = 100.0

            if service_id:
                service = await finance_crud.get_doctor_service(current_user.id, service_id, session)
                if service:
                    service_name = service.service_name
                    base_amount = float(service.price)

            if payment:
                base_amount = float(payment.base_amount)
                discount_amount = float(payment.discount_amount)
                final_amount = float(payment.final_amount)

            pending_payments.append(
                PendingPaymentItem(
                    appointment_id=appointment.appointment_id,
                    appointment_date=appointment.appointment_date,
                    appointment_status=appointment.status,
                    doctor_user_id=current_user.id,
                    doctor_name=f"{current_user.first_name} {current_user.last_name}".strip(),
                    doctor_photo_url=None,  # Can be added if needed
                    patient_user_id=appointment.patient_user_id,
                    patient_name=patient_name,
                    service_id=service_id,
                    service_name=service_name,
                    base_amount=base_amount,
                    discount_amount=discount_amount,
                    final_amount=final_amount,
                    payment_id=payment_id,
                    payment_status=payment_status,
                    payment_method=payment_method,
                    payment_created_at=payment.created_at if payment else None,
                    payment_updated_at=payment.updated_at if payment else None,
                )
            )

        return pending_payments
    except Exception as e:
        import traceback
        print(f"Error in get_payment_history: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch payment history: {str(e)}",
        )


@router.post("/payments/{payment_id}/approve", response_model=PaymentRead)
async def approve_payment(
    payment_id: int,
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Approve a payment (for cheque/insurance payments)"""
    payment = await finance_crud.get_payment_by_id(session, payment_id)
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    if payment.doctor_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Payment does not belong to you",
        )

    if payment.payment_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment is not pending approval",
        )

    if payment.payment_method not in ["cheque", "insurance"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only cheque and insurance payments require approval",
        )

    # Approve payment
    approved_payment = await finance_crud.approve_payment(
        session, payment_id, current_user.id
    )

    if not approved_payment:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve payment",
        )

    return approved_payment


@router.post("/payments/{payment_id}/reject", response_model=PaymentRead)
async def reject_payment(
    payment_id: int,
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Reject a pending cheque/insurance payment so the patient can try again."""
    payment = await finance_crud.get_payment_by_id(session, payment_id)
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    if payment.doctor_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Payment does not belong to you",
        )

    if payment.payment_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment is not pending approval",
        )

    if payment.payment_method not in ["cheque", "insurance"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only cheque and insurance payments can be rejected here",
        )

    rejected_payment = await finance_crud.reject_payment(
        session, payment_id, current_user.id, clear_method=True
    )

    if not rejected_payment:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reject payment",
        )

    # Notify patient
    patient_user_id = rejected_payment.patient_user_id
    try:
        await notification_crud.create_notification(
            session,
            user_id=patient_user_id,
            type="general",
            title="Payment Rejected",
            message="Your payment was rejected by the doctor. Please submit payment again.",
            related_entity_type="payment",
            related_entity_id=rejected_payment.id,
            appointment_id=rejected_payment.appointment_id,
        )
    except Exception:
        # Do not block rejection if notification fails
        pass

    return rejected_payment


# ==================== View Payment Files ====================

@router.get("/payments/{payment_id}/files")
async def get_payment_files(
    payment_id: int,
    current_user=Depends(get_current_doctor),
    session: AsyncSession = Depends(get_session),
):
    """Get files associated with a payment (cheque images or insurance documents)"""
    payment = await finance_crud.get_payment_by_id(session, payment_id)
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found",
        )

    if payment.doctor_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Payment does not belong to you",
        )

    batch_id = None
    if payment.payment_method == "cheque" and payment.cheque_batch_id:
        batch_id = payment.cheque_batch_id
    elif payment.payment_method == "insurance" and payment.insurance_batch_id:
        batch_id = payment.insurance_batch_id

    if not batch_id:
        return {"files": []}

    # Get file batch with files
    stmt = select(FileBatch).where(FileBatch.id == batch_id).options(
        selectinload(FileBatch.files)
    )
    result = await session.execute(stmt)
    batch = result.scalar_one_or_none()

    if not batch:
        return {"files": []}

    # Check if doctor has access (via FileBatchShare)
    share_stmt = select(FileBatchShare).where(
        FileBatchShare.file_batch_id == batch_id,
        FileBatchShare.doctor_user_id == current_user.id,
        FileBatchShare.share_status == "active",
    )
    share_result = await session.execute(share_stmt)
    share = share_result.scalar_one_or_none()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to these files",
        )

    # Return files
    from schemas.patient_file_schema import PatientFileRead
    files = [
        PatientFileRead(
            id=file.id,
            file_name=file.file_name,
            file_url=file.file_url,
            file_type=file.file_type,
            file_size=file.file_size,
            created_at=file.created_at.isoformat(),
        )
        for file in batch.files
    ]

    return {
        "batch_id": batch.id,
        "batch_heading": batch.heading,
        "category": batch.category,
        "files": files,
    }

