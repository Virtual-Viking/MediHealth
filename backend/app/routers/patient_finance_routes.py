"""
Patient Finance Routes - Payment submission and card management
"""
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Cookie,
    UploadFile,
    File,
    Form,
)
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from db import get_session
from db.crud import (
    auth_crud,
    finance_crud,
    appointment_crud,
    patient_file_crud,
)
from db.models.patient_file_model import FileBatchCategory
from schemas.finance_schema import (
    PaymentRead,
    PaymentWithDetails,
    PendingPaymentItem,
    OnlinePaymentRequest,
    ChequePaymentRequest,
    InsurancePaymentRequest,
    SavedPaymentCardCreate,
    SavedPaymentCardRead,
)
from services import verify_access_token, get_storage_service
import uuid
import os

router = APIRouter()


async def get_current_patient(
    access_token: str = Cookie(None),
    session: AsyncSession = Depends(get_session),
):
    """Get current authenticated patient user"""
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

    if not user.is_patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only accessible to patients",
        )

    return user


# ==================== Pending Payments ====================

@router.get("/pending-payments", response_model=List[PendingPaymentItem])
async def get_pending_payments(
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Get all appointments with payments for the patient (both pending and completed)"""
    from sqlalchemy import select, or_
    from sqlalchemy.orm import selectinload
    from db.models.appointment_model import Appointment
    from db.models.finance_model import Payment
    from db.models.finance_model import DoctorService
    from db.models.user_model import User
    from db.models.doctor_model import DoctorProfile

    # Get all appointments with payment_pending or confirmed status (to show transaction history)
    stmt = select(Appointment).where(
        Appointment.patient_user_id == current_user.id,
        or_(
            Appointment.status == "payment_pending",
            Appointment.status == "confirmed"
        )
    ).order_by(Appointment.appointment_date.desc())

    result = await session.execute(stmt)
    appointments = result.scalars().all()

    pending_payments = []
    for appointment in appointments:
        # Skip appointments without doctor_user_id (shouldn't happen but safety check)
        if not appointment.doctor_user_id:
            continue

        # Get payment record if exists
        payment = await finance_crud.get_payment_by_appointment_id(
            session, appointment.appointment_id
        )

        # Get doctor info with doctor_profile eagerly loaded
        doctor_stmt = select(User).options(
            selectinload(User.doctor_profile)
        ).where(User.id == appointment.doctor_user_id)
        doctor_result = await session.execute(doctor_stmt)
        doctor = doctor_result.scalar_one_or_none()
        doctor_name = f"{doctor.first_name} {doctor.last_name}".strip() if doctor else "Unknown"

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
                session, appointment.doctor_user_id
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
                    doctor_user_id=appointment.doctor_user_id,
                    patient_user_id=current_user.id,
                    service_id=service_id,
                    base_amount=base_amount,
                    discount_amount=0.0,
                    payment_method=None,  # Will be set when user chooses payment method
                )
                payment_id = payment.id
                payment_status = payment.payment_status
            except Exception as e:
                # If payment creation fails (e.g., duplicate key), skip this appointment
                print(f"Failed to create payment for appointment {appointment.appointment_id}: {e}")
                continue

        # Get doctor photo from profile if available
        doctor_photo_url = None
        if doctor and hasattr(doctor, "doctor_profile") and doctor.doctor_profile:
            doctor_photo_url = doctor.doctor_profile.photo_url

        pending_payments.append(
            PendingPaymentItem(
                appointment_id=appointment.appointment_id,
                appointment_date=appointment.appointment_date,
                appointment_status=appointment.status,
                doctor_user_id=appointment.doctor_user_id,
                doctor_name=doctor_name,
                doctor_photo_url=doctor_photo_url,
                patient_user_id=current_user.id,
                patient_name=f"{current_user.first_name} {current_user.last_name}".strip(),
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


# ==================== Online Payment ====================

@router.post("/payments/online", response_model=PaymentRead)
async def submit_online_payment(
    request: OnlinePaymentRequest,
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Submit online payment for an appointment"""
    # Verify appointment belongs to patient and is in payment_pending status
    appointment = await appointment_crud.get_appointment_by_id(
        session, request.appointment_id
    )
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found",
        )

    if appointment.patient_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Appointment does not belong to you",
        )

    if appointment.status != "payment_pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Appointment is not in payment_pending status",
        )

    # Get or create payment record
    payment = await finance_crud.get_payment_by_appointment_id(
        session, request.appointment_id
    )
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment record not found. Please refresh and try again.",
        )

    if payment.payment_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment has already been processed",
        )

    # Save card if requested
    saved_card_id = None
    if request.save_card:
        saved_card = await finance_crud.create_saved_payment_card(
            session,
            patient_user_id=current_user.id,
            card_last_four=request.card_last_four,
            card_brand=request.card_brand,
            expiry_month=request.expiry_month,
            expiry_year=request.expiry_year,
            cardholder_name=request.cardholder_name,
            is_default=True,  # Set as default if saving
        )
        saved_card_id = saved_card.id

    # Generate transaction ID (for demo purposes)
    transaction_id = f"TXN-{uuid.uuid4().hex[:12].upper()}"

    # Complete the payment
    payment = await finance_crud.complete_payment(
        session,
        payment.id,
        transaction_id=transaction_id,
        saved_card_id=saved_card_id,
    )

    if not payment:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process payment",
        )

    return payment


# ==================== Cheque Payment ====================

@router.post("/payments/cheque", response_model=PaymentRead)
async def submit_cheque_payment(
    appointment_id: int = Form(...),
    files: List[UploadFile] = File(...),
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Submit cheque payment by uploading cheque images (front and back)"""
    print(f"[CHEQUE PAYMENT] Received request for appointment {appointment_id}")
    print(f"[CHEQUE PAYMENT] Number of files: {len(files)}")
    for idx, file in enumerate(files):
        print(f"[CHEQUE PAYMENT] File {idx+1}: {file.filename}, Type: {file.content_type}")
    
    # Verify appointment
    appointment = await appointment_crud.get_appointment_by_id(
        session, appointment_id
    )
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found",
        )

    if appointment.patient_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Appointment does not belong to you",
        )

    if appointment.status != "payment_pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Appointment is not in payment_pending status",
        )

    # Validate files (must be exactly 2 images)
    if len(files) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload exactly 2 images (front and back of cheque)",
        )

    # Validate file types (images only)
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/pjpeg"]
    for file in files:
        print(f"[CHEQUE PAYMENT] Validating file type: {file.content_type}")
        if file.content_type not in allowed_types:
            print(f"[CHEQUE PAYMENT] Invalid file type: {file.content_type}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type: {file.content_type}. Only images are allowed.",
            )

    # Get or create payment record
    payment = await finance_crud.get_payment_by_appointment_id(
        session, appointment_id
    )
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment record not found. Please refresh and try again.",
        )

    if payment.payment_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment has already been processed",
        )

    # Upload files as a batch
    try:
        storage_service = get_storage_service()
        file_contents = []
        for file in files:
            print(f"[CHEQUE PAYMENT] Reading file: {file.filename}")
            content = await file.read()
            print(f"[CHEQUE PAYMENT] File size: {len(content)} bytes")
            file_contents.append({
                "filename": file.filename,
                "content": content,
                "content_type": file.content_type,
                "size": len(content),
            })
    except Exception as e:
        print(f"[CHEQUE PAYMENT] Error reading files: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error reading uploaded files: {str(e)}",
        )

    # Create file batch
    try:
        from db.crud import patient_file_crud
        print(f"[CHEQUE PAYMENT] Creating file batch for user {current_user.id}")
        batch = await patient_file_crud.create_file_batch(
            patient_user_id=current_user.id,
            category=FileBatchCategory.cheque.value,
            heading=f"Cheque for Appointment #{appointment_id}",
            session=session,
        )
        print(f"[CHEQUE PAYMENT] File batch created with ID: {batch.id}")
    except Exception as e:
        print(f"[CHEQUE PAYMENT] Error creating file batch: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating file batch: {str(e)}",
        )

    # Upload files to storage
    uploaded_file_urls = []
    for idx, file_data in enumerate(file_contents):
        filename = file_data["filename"]
        file_content = file_data["content"]
        content_type = file_data["content_type"]
        file_size = file_data["size"]

        file_extension = os.path.splitext(filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        destination_path = f"patient-files/{current_user.id}/cheque/{batch.id}/{unique_filename}"

        file_url = await storage_service.upload_file(
            file_content=file_content,
            destination_path=destination_path,
            content_type=content_type,
        )

        uploaded_file_urls.append({
            "filename": filename,
            "file_url": file_url,
            "content_type": content_type,
            "size": file_size,
        })

    # Create file records
    for file_data in uploaded_file_urls:
        await patient_file_crud.create_patient_file(
            session,
            file_batch_id=batch.id,
            file_name=file_data["filename"],
            file_url=file_data["file_url"],
            file_type=file_data["content_type"],
            file_size=file_data["size"],
        )

    # Auto-share with doctor (this commits internally)
    await patient_file_crud.upsert_file_batch_share(
        file_batch_id=batch.id,
        patient_user_id=current_user.id,
        doctor_user_id=appointment.doctor_user_id,
        appointment_id=appointment_id,
        appointment_request_id=None,
        session=session,
    )

    # Update payment with cheque batch ID
    payment.cheque_batch_id = batch.id
    payment.payment_method = "cheque"
    await session.commit()
    await session.refresh(payment)

    print(f"[CHEQUE PAYMENT] Payment updated successfully: ID={payment.id}, cheque_batch_id={payment.cheque_batch_id}, payment_method={payment.payment_method}")

    return payment


# ==================== Insurance Payment ====================

@router.post("/payments/insurance", response_model=PaymentRead)
async def submit_insurance_payment(
    appointment_id: int = Form(...),
    insurance_policy_id: str = Form(...),
    files: Optional[List[UploadFile]] = File(None),
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Submit insurance payment by selecting insurance policy and optionally uploading documents"""
    # Verify appointment
    appointment = await appointment_crud.get_appointment_by_id(
        session, appointment_id
    )
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found",
        )

    if appointment.patient_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Appointment does not belong to you",
        )

    if appointment.status != "payment_pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Appointment is not in payment_pending status",
        )

    # Verify insurance policy belongs to patient
    from db.models.insurance_model import PatientInsurancePolicy
    from sqlalchemy import select

    stmt = select(PatientInsurancePolicy).where(
        PatientInsurancePolicy.id == UUID(insurance_policy_id),
        PatientInsurancePolicy.patient_user_id == current_user.id,
    )
    result = await session.execute(stmt)
    policy = result.scalar_one_or_none()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance policy not found or does not belong to you",
        )

    # Get or create payment record
    payment = await finance_crud.get_payment_by_appointment_id(
        session, appointment_id
    )
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment record not found. Please refresh and try again.",
        )

    if payment.payment_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment has already been processed",
        )

    # Upload files if provided
    insurance_batch_id = None
    if files and len(files) > 0:
        storage_service = get_storage_service()
        file_contents = []
        for file in files:
            content = await file.read()
            file_contents.append({
                "filename": file.filename,
                "content": content,
                "content_type": file.content_type,
                "size": len(content),
            })

        # Create file batch
        from db.crud import patient_file_crud
        batch = await patient_file_crud.create_file_batch(
            patient_user_id=current_user.id,
            category=FileBatchCategory.insurance_payment.value,
            heading=f"Insurance documents for Appointment #{appointment_id}",
            session=session,
        )

        # Upload files to storage
        uploaded_file_urls = []
        for file_data in file_contents:
            filename = file_data["filename"]
            file_content = file_data["content"]
            content_type = file_data["content_type"]
            file_size = file_data["size"]

            file_extension = os.path.splitext(filename)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            destination_path = f"patient-files/{current_user.id}/insurance_payment/{batch.id}/{unique_filename}"

            file_url = await storage_service.upload_file(
                file_content=file_content,
                destination_path=destination_path,
                content_type=content_type,
            )

            uploaded_file_urls.append({
                "filename": filename,
                "file_url": file_url,
                "content_type": content_type,
                "size": file_size,
            })

        # Create file records
        for file_data in uploaded_file_urls:
            await patient_file_crud.create_patient_file(
                session,
                file_batch_id=batch.id,
                file_name=file_data["filename"],
                file_url=file_data["file_url"],
                file_type=file_data["content_type"],
                file_size=file_data["size"],
            )

        insurance_batch_id = batch.id

        # Auto-share with doctor (this commits internally)
        await patient_file_crud.upsert_file_batch_share(
            file_batch_id=batch.id,
            patient_user_id=current_user.id,
            doctor_user_id=appointment.doctor_user_id,
            appointment_id=appointment_id,
            appointment_request_id=None,
            session=session,
        )

    # Update payment with insurance info
    payment.insurance_policy_id = insurance_policy_id
    payment.insurance_batch_id = insurance_batch_id
    payment.payment_method = "insurance"
    await session.commit()
    await session.refresh(payment)

    print(f"[INSURANCE PAYMENT] Payment updated successfully: ID={payment.id}, insurance_batch_id={payment.insurance_batch_id}, payment_method={payment.payment_method}")

    return payment


# ==================== Saved Payment Cards ====================

@router.get("/cards", response_model=List[SavedPaymentCardRead])
async def list_saved_cards(
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """List all saved payment cards for the patient"""
    cards = await finance_crud.list_saved_payment_cards(
        session, patient_user_id=current_user.id
    )
    return cards


@router.post("/cards", response_model=SavedPaymentCardRead, status_code=status.HTTP_201_CREATED)
async def create_saved_card(
    card_data: SavedPaymentCardCreate,
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Save a payment card for future use"""
    card = await finance_crud.create_saved_payment_card(
        session,
        patient_user_id=current_user.id,
        card_last_four=card_data.card_last_four,
        card_brand=card_data.card_brand,
        expiry_month=card_data.expiry_month,
        expiry_year=card_data.expiry_year,
        cardholder_name=card_data.cardholder_name,
        is_default=card_data.is_default,
    )
    return card


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_card(
    card_id: int,
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Delete a saved payment card"""
    success = await finance_crud.delete_saved_payment_card(
        session, card_id, current_user.id
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found",
        )

