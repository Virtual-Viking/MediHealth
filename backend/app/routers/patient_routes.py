import os
import uuid
from typing import Any, List, Dict, Optional

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from db.crud import auth_crud, patient_crud, account_status_crud
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from db.models.appointment_model import Appointment
from db.models.finance_model import Payment
from db.models.user_model import User
from db.models.patient_file_model import FileBatch, FileBatchShare
from pydantic import BaseModel
from schemas import (
    PatientProfileEnvelope,
    PatientProfileUpdate,
    PatientProfileUpdateResponse,
    PatientUserInfoUpdate,
    AccountDeactivateRequest,
    AccountReactivateRequest,
    AccountStatusResponse,
    AccountStatusInfo,
)
from services import get_storage_service, verify_access_token

router = APIRouter()


class VisitingDoctorTimelineItem(BaseModel):
    type: str
    title: str
    detail: Optional[str] = None
    timestamp: str


class PatientTimelineItem(BaseModel):
    type: str
    title: str
    detail: Optional[str] = None
    timestamp: str
    provider: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    files: Optional[List[Dict[str, str]]] = None


class VisitingDoctor(BaseModel):
    doctor_id: int
    name: str
    photo_url: Optional[str] = None
    specialty: Optional[str] = None
    status_text: str
    visits: int
    upcoming: int
    timeline: List[VisitingDoctorTimelineItem]


async def get_current_patient(
    access_token: str = Cookie(None),
    session: AsyncSession = Depends(get_session),
):
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


@router.get("/profile", response_model=PatientProfileEnvelope)
async def get_patient_profile(
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    profile_data = await patient_crud.get_patient_profile_with_details(current_user.id, session)
    if not profile_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found",
        )
    return profile_data


@router.put("/profile", response_model=PatientProfileUpdateResponse)
async def update_patient_profile(
    profile_update: PatientProfileUpdate,
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    update_payload = profile_update.model_dump(exclude_unset=True)
    updated_profile = await patient_crud.update_patient_profile(current_user.id, update_payload, session)
    if not updated_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found",
        )
    return updated_profile


@router.put("/user-info", response_model=PatientProfileEnvelope)
async def update_patient_user_info(
    user_update: PatientUserInfoUpdate,
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    update_data = user_update.model_dump(exclude_unset=True)
    allowed_fields = {"first_name", "middle_name", "last_name", "phone", "emergency_contact"}
    filtered_data = {k: v for k, v in update_data.items() if k in allowed_fields}

    if not filtered_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update",
        )

    updated_user = await patient_crud.update_user_info(current_user.id, filtered_data, session)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return await patient_crud.get_patient_profile_with_details(current_user.id, session)


async def _validate_image_upload(file: UploadFile, max_size_mb: int) -> bytes:
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(sorted(allowed_types))}",
        )

    max_bytes = max_size_mb * 1024 * 1024
    file_content = await file.read()
    if len(file_content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds {max_size_mb}MB limit",
        )
    return file_content


@router.post("/upload-profile-picture")
async def upload_patient_profile_picture(
    file: UploadFile = File(...),
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    file_content = await _validate_image_upload(file, max_size_mb=5)
    try:
        profile = await patient_crud.ensure_patient_profile(current_user.id, session)
        storage_service = get_storage_service()
        prefix = f"patient-profiles/{current_user.id}/profile/"
        await storage_service.delete_files_by_prefix(prefix)

        file_extension = os.path.splitext(file.filename or "")[1] or ".jpg"
        unique_filename = f"{prefix}{uuid.uuid4()}{file_extension}"
        public_url = await storage_service.upload_file(
            file_content,
            unique_filename,
            content_type=file.content_type,
        )

        profile.photo_url = public_url
        session.add(profile)
        await session.commit()

        return {"message": "Profile picture uploaded successfully", "photo_url": public_url}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload profile picture: {exc}",
        )


@router.delete("/profile-picture")
async def delete_patient_profile_picture(
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    try:
        profile = await patient_crud.ensure_patient_profile(current_user.id, session)
        if not profile.photo_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No profile picture found",
            )

        storage_service = get_storage_service()
        file_path = storage_service.extract_file_path_from_url(profile.photo_url)
        if file_path:
            await storage_service.delete_file(file_path)

        profile.photo_url = None
        session.add(profile)
        await session.commit()

        return {"message": "Profile picture deleted successfully"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete profile picture: {exc}",
        )


@router.post("/upload-cover-photo")
async def upload_patient_cover_photo(
    file: UploadFile = File(...),
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    file_content = await _validate_image_upload(file, max_size_mb=8)
    try:
        profile = await patient_crud.ensure_patient_profile(current_user.id, session)
        storage_service = get_storage_service()
        prefix = f"patient-profiles/{current_user.id}/cover/"
        await storage_service.delete_files_by_prefix(prefix)

        file_extension = os.path.splitext(file.filename or "")[1] or ".jpg"
        unique_filename = f"{prefix}{uuid.uuid4()}{file_extension}"
        public_url = await storage_service.upload_file(
            file_content,
            unique_filename,
            content_type=file.content_type,
        )

        profile.cover_photo_url = public_url
        session.add(profile)
        await session.commit()

        return {"message": "Cover photo uploaded successfully", "cover_photo_url": public_url}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload cover photo: {exc}",
        )


@router.delete("/cover-photo")
async def delete_patient_cover_photo(
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    try:
        profile = await patient_crud.ensure_patient_profile(current_user.id, session)
        if not profile.cover_photo_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No cover photo found",
            )

        storage_service = get_storage_service()
        file_path = storage_service.extract_file_path_from_url(profile.cover_photo_url)
        if file_path:
            await storage_service.delete_file(file_path)

        profile.cover_photo_url = None
        session.add(profile)
        await session.commit()

        return {"message": "Cover photo deleted successfully"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete cover photo: {exc}",
        )


@router.post("/deactivate-account", response_model=AccountStatusResponse)
async def deactivate_patient_account(
    request: AccountDeactivateRequest,
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Deactivate patient account portal."""
    if request.portal_type != "patient":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid portal_type. Must be 'patient' for this endpoint.",
        )
    
    # Combine reason and feedback
    combined_reason = None
    if request.reason or request.feedback:
        parts = []
        if request.reason:
            parts.append(f"Reason: {request.reason}")
        if request.feedback:
            parts.append(f"Feedback: {request.feedback}")
        combined_reason = "\n".join(parts)
    
    result = await account_status_crud.update_account_status(
        user_id=current_user.id,
        portal_type="patient",
        new_status="deactivated",
        reason=combined_reason,
        changed_by="user",
        session=session,
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to deactivate account",
        )
    
    return result


@router.post("/reactivate-account", response_model=AccountStatusResponse)
async def reactivate_patient_account(
    request: AccountReactivateRequest,
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Reactivate patient account portal."""
    if request.portal_type != "patient":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid portal_type. Must be 'patient' for this endpoint.",
        )
    
    result = await account_status_crud.update_account_status(
        user_id=current_user.id,
        portal_type="patient",
        new_status="active",
        changed_by="user",
        session=session,
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reactivate account",
        )
    
    return result


@router.get("/visiting-doctors", response_model=List[VisitingDoctor])
async def list_visiting_doctors(
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """List doctors the patient has interacted with, including visit counts and timeline."""
    appt_result = await session.execute(
        select(Appointment)
        .where(Appointment.patient_user_id == current_user.id)
    )
    appointments = appt_result.scalars().all()

    if not appointments:
        return []

    doctor_ids = {appt.doctor_user_id for appt in appointments if appt.doctor_user_id}
    if not doctor_ids:
        return []

    users_result = await session.execute(
        select(User)
        .where(User.id.in_(doctor_ids))
        .options(selectinload(User.doctor_profile))
    )
    users_map = {u.id: u for u in users_result.scalars().all()}

    payments_result = await session.execute(
        select(Payment).where(
            Payment.patient_user_id == current_user.id,
            Payment.doctor_user_id.in_(doctor_ids),
        )
    )
    payments = payments_result.scalars().all()
    payments_by_appt = {p.appointment_id: p for p in payments}

    appts_by_doctor: Dict[int, List[Appointment]] = {}
    for appt in appointments:
        appts_by_doctor.setdefault(appt.doctor_user_id, []).append(appt)

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    visiting: List[VisitingDoctor] = []

    for doctor_id, appts in appts_by_doctor.items():
        user = users_map.get(doctor_id)
        if not user:
            continue

        visits = sum(
            1
            for a in appts
            if a.status == "confirmed" and a.appointment_date and a.appointment_date < now
        )
        upcoming = sum(
            1
            for a in appts
            if a.appointment_date and a.appointment_date >= now
        )

        payment_pending = any(
            payments_by_appt.get(a.appointment_id)
            and payments_by_appt.get(a.appointment_id).payment_status == "pending"
            for a in appts
        )

        if visits > 0 or upcoming > 0:
            status_text = f"{visits} visit{'s' if visits != 1 else ''}, {upcoming} upcoming"
        elif payment_pending:
            status_text = "payment pending"
        else:
            status_text = "No recent visits"

        events: List[VisitingDoctorTimelineItem] = []
        for appt in appts:
            ts_created = getattr(appt, "created_at", None) or appt.appointment_date
            if ts_created:
                events.append(
                    VisitingDoctorTimelineItem(
                        type="appointment",
                        title="Appointment booked",
                        detail=f"Status: {appt.status}",
                        timestamp=ts_created.isoformat(),
                    )
                )
            if appt.status == "confirmed":
                ts_conf = getattr(appt, "updated_at", None) or appt.appointment_date
                if ts_conf:
                    events.append(
                        VisitingDoctorTimelineItem(
                            type="appointment",
                            title="Appointment confirmed",
                            detail=None,
                            timestamp=ts_conf.isoformat(),
                        )
                    )
            payment = payments_by_appt.get(appt.appointment_id)
            if payment:
                ts_pay = getattr(payment, "updated_at", None) or getattr(payment, "created_at", None)
                if ts_pay:
                    events.append(
                        VisitingDoctorTimelineItem(
                            type="payment",
                            title=f"Payment {payment.payment_status}",
                            detail=f"Method: {payment.payment_method or 'N/A'}",
                            timestamp=ts_pay.isoformat(),
                        )
                    )

        events.sort(key=lambda e: e.timestamp, reverse=True)

        name = " ".join(
            [p for p in [user.first_name, user.last_name] if p]
        ).strip()
        photo_url = None
        specialty = None
        if user.doctor_profile:
            photo_url = user.doctor_profile.photo_url
            specialty = getattr(user.doctor_profile, "specialty", None)

        visiting.append(
            VisitingDoctor(
                doctor_id=doctor_id,
                name=name or "Doctor",
                photo_url=photo_url,
                specialty=specialty,
                status_text=status_text,
                visits=visits,
                upcoming=upcoming,
                timeline=events,
            )
        )

    return visiting


@router.get("/account-status", response_model=AccountStatusInfo)
async def get_patient_account_status(
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Get current account status."""
    result = await account_status_crud.get_account_status(current_user.id, session)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account status not found",
        )
    
    return result


@router.get("/timeline", response_model=List[PatientTimelineItem])
async def get_patient_timeline(
    activity_type: Optional[str] = Query(None, description="Filter by activity type: appointment, payment, order, share, collect, chore"),
    current_user=Depends(get_current_patient),
    session: AsyncSession = Depends(get_session),
):
    """Get unified timeline of all patient activities: appointments, file shares, payments, and file uploads.
    
    Args:
        activity_type: Optional filter by activity type. Valid values: 'appointment', 'payment', 'order', 'share', 'collect', 'chore'
    """
    from datetime import datetime, timezone
    
    events: List[PatientTimelineItem] = []
    
    # 1. Get all appointments
    appt_result = await session.execute(
        select(Appointment)
        .where(Appointment.patient_user_id == current_user.id)
    )
    appointments = appt_result.scalars().all()
    
    # Get doctor info for appointments
    doctor_ids = {appt.doctor_user_id for appt in appointments if appt.doctor_user_id}
    doctors_map = {}
    if doctor_ids:
        doctors_result = await session.execute(
            select(User)
            .where(User.id.in_(doctor_ids))
            .options(selectinload(User.doctor_profile))
        )
        for doctor in doctors_result.scalars().all():
            doctors_map[doctor.id] = doctor
    
    for appt in appointments:
        doctor = doctors_map.get(appt.doctor_user_id) if appt.doctor_user_id else None
        doctor_name = None
        doctor_specialty = None
        if doctor and doctor.doctor_profile:
            doctor_name = f"{doctor.first_name} {doctor.last_name}".strip()
            doctor_specialty = doctor.doctor_profile.specialty
        
        provider = f"Dr. {doctor_name} | {doctor_specialty}" if doctor_name else "Doctor"
        location = "Clinic"  # Appointment model doesn't have location field
        
        # Appointment created/booked
        if appt.created_at:
            events.append(
                PatientTimelineItem(
                    type="appointment",
                    title="Appointment booked",
                    detail=f"Status: {appt.status}",
                    timestamp=appt.created_at.isoformat(),
                    provider=provider,
                    location=location,
                    description=appt.reason or appt.notes or f"Appointment with {provider}",
                )
            )
        
        # Appointment confirmed
        if appt.status == "confirmed" and appt.updated_at and appt.updated_at != appt.created_at:
            events.append(
                PatientTimelineItem(
                    type="appointment",
                    title="Appointment confirmed",
                    detail=None,
                    timestamp=appt.updated_at.isoformat(),
                    provider=provider,
                    location=location,
                    description=f"Appointment confirmed for {appt.appointment_date.strftime('%B %d, %Y at %I:%M %p') if appt.appointment_date else 'scheduled date'}",
                )
            )
        
        # Appointment date/time
        if appt.appointment_date:
            events.append(
                PatientTimelineItem(
                    type="appointment",
                    title="Appointment",
                    detail=None,
                    timestamp=appt.appointment_date.isoformat(),
                    provider=provider,
                    location=location,
                    description=appt.reason or appt.notes or f"Appointment with {provider}",
                )
            )
    
    # 2. Get all payments
    payments_result = await session.execute(
        select(Payment)
        .where(Payment.patient_user_id == current_user.id)
        .options(selectinload(Payment.doctor))
    )
    payments = payments_result.scalars().all()
    
    # Get file batches for payments
    batch_ids = []
    for payment in payments:
        if payment.cheque_batch_id:
            batch_ids.append(payment.cheque_batch_id)
        if payment.insurance_batch_id:
            batch_ids.append(payment.insurance_batch_id)
    
    batches_by_id = {}
    if batch_ids:
        batches_result = await session.execute(
            select(FileBatch)
            .where(FileBatch.id.in_(batch_ids))
            .options(selectinload(FileBatch.files))
        )
        for batch in batches_result.scalars().all():
            batches_by_id[batch.id] = batch
    
    for payment in payments:
        doctor = payment.doctor if hasattr(payment, 'doctor') else None
        doctor_name = None
        if doctor:
            doctor_name = f"{doctor.first_name} {doctor.last_name}".strip()
        
        provider = f"Dr. {doctor_name}" if doctor_name else "Doctor"
        location = "Online"
        
        files_payload = None
        batch_id = payment.cheque_batch_id or payment.insurance_batch_id
        if batch_id and batches_by_id.get(batch_id):
            files_payload = [
                {
                    "name": f.file_name,
                    "url": f.file_url,
                }
                for f in batches_by_id[batch_id].files
            ]
        
        ts_pay = payment.updated_at or payment.created_at
        if ts_pay:
            payment_type = "Order Meds" if payment.payment_method == "insurance" else "Payment"
            events.append(
                PatientTimelineItem(
                    type="order" if payment.payment_method == "insurance" else "payment",
                    title=payment_type,
                    detail=f"Status: {payment.payment_status}, Method: {payment.payment_method or 'N/A'}",
                    timestamp=ts_pay.isoformat(),
                    provider=provider,
                    location=location,
                    description=f"Payment {payment.payment_status} via {payment.payment_method or 'N/A'}",
                    files=files_payload,
                )
            )
    
    # 3. Get file shares (when patient shares files with doctors)
    shares_result = await session.execute(
        select(FileBatchShare)
        .where(FileBatchShare.patient_user_id == current_user.id)
        .options(selectinload(FileBatchShare.batch).selectinload(FileBatch.files))
        .options(selectinload(FileBatchShare.doctor).selectinload(User.doctor_profile))
    )
    shares = shares_result.scalars().all()
    
    for share in shares:
        doctor = share.doctor if hasattr(share, 'doctor') else None
        doctor_name = None
        if doctor:
            doctor_name = f"{doctor.first_name} {doctor.last_name}".strip()
        
        provider = f"Dr. {doctor_name}" if doctor_name else "Doctor"
        location = "Online"
        
        cat = share.batch.category if share.batch else None
        files_payload = None
        if share.batch and share.batch.files:
            files_payload = [
                {
                    "name": f.file_name,
                    "url": f.file_url,
                }
                for f in share.batch.files
            ]
        
        ts_share = share.shared_at or share.updated_at or share.created_at
        if ts_share:
            category_text = cat.replace("_", " ").title() if cat else "files"
            events.append(
                PatientTimelineItem(
                    type="share",
                    title="Share Record",
                    detail=f"Category: {category_text}",
                    timestamp=ts_share.isoformat(),
                    provider=provider,
                    location=location,
                    description=f"Shared {category_text} with {provider}",
                    files=files_payload,
                )
            )
    
    # 4. Get file uploads (when patient uploads files)
    batches_result = await session.execute(
        select(FileBatch)
        .where(FileBatch.patient_user_id == current_user.id)
        .options(selectinload(FileBatch.files))
    )
    file_batches = batches_result.scalars().all()
    
    for batch in file_batches:
        files_payload = [
            {
                "name": f.file_name,
                "url": f.file_url,
            }
            for f in batch.files
        ]
        
        category_text = batch.category.replace("_", " ").title() if batch.category else "files"
        title = "Collect report" if batch.category == "lab_report" else "File Upload"
        
        ts_upload = batch.created_at
        if ts_upload:
            events.append(
                PatientTimelineItem(
                    type="collect" if batch.category == "lab_report" else "chore",
                    title=title,
                    detail=f"Category: {category_text}",
                    timestamp=ts_upload.isoformat(),
                    provider="System",
                    location="Online",
                    description=f"{category_text} uploaded: {batch.heading or 'No heading'}",
                    files=files_payload,
                )
            )
    
    # Sort all events by timestamp (newest first)
    events.sort(key=lambda e: e.timestamp, reverse=True)
    
    # Filter by activity type if provided
    if activity_type:
        # Map frontend filter values to backend types
        type_mapping = {
            "appointment": "appointment",
            "payment": "payment",
            "order": "order",
            "share": "share",
            "send_reports": "share",
            "collect": "collect",
            "chore": "chore",
        }
        filter_type = type_mapping.get(activity_type.lower(), activity_type.lower())
        events = [e for e in events if e.type == filter_type]
    
    return events

