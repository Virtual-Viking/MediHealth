from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Cookie,
    Query,
)
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime, time

from db import get_session
from db.crud import (
    auth_crud,
    appointment_request_crud,
    notification_crud,
    appointment_crud,
)
from schemas import (
    AppointmentRequestCreate,
    AppointmentRequestUpdate,
    AppointmentRequestRead,
    AppointmentRequestResponse,
)
from services import verify_access_token
from db.models.appointment_request_model import AppointmentRequestStatus

router = APIRouter()


def get_role_value(role) -> Optional[str]:
    """Extract role value from Enum or string"""
    if role is None:
        return None
    if hasattr(role, 'value'):
        return role.value
    return str(role)


async def get_authenticated_user(
    access_token: str = Cookie(None), session: AsyncSession = Depends(get_session)
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
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    return user


@router.post("/", response_model=AppointmentRequestRead, status_code=status.HTTP_201_CREATED)
async def create_appointment_request(
    request_data: AppointmentRequestCreate,
    current_user = Depends(get_authenticated_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new appointment request (patient only)"""
    if not current_user.is_patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patients can create appointment requests"
        )

    request = await appointment_request_crud.create_appointment_request(
        session,
        patient_user_id=current_user.id,
        doctor_user_id=request_data.doctor_user_id,
        clinic_id=request_data.clinic_id,
        preferred_date=request_data.preferred_date,
        preferred_time_slot_start=request_data.preferred_time_slot_start,
        is_flexible=request_data.is_flexible,
        reason=request_data.reason,
        notes=request_data.notes,
    )

    doctor = await auth_crud.get_user_by_id(request_data.doctor_user_id, session)
    doctor_name = f"{doctor.first_name} {doctor.last_name}".strip() if doctor else "Doctor"
    patient_name = f"{current_user.first_name} {current_user.last_name}".strip()

    await notification_crud.create_notification(
        session,
        user_id=request_data.doctor_user_id,
        type="appointment_request",
        title="New Appointment Request",
        message=f"{patient_name} has requested an appointment for {request_data.preferred_date.strftime('%Y-%m-%d')} at {request_data.preferred_time_slot_start.strftime('%H:%M')}",
        appointment_request_id=request.request_id,
        related_entity_type="appointment_request",
        related_entity_id=request.request_id,
    )

    return request


@router.get("/patient", response_model=List[AppointmentRequestRead])
async def list_patient_appointment_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user = Depends(get_authenticated_user),
    session: AsyncSession = Depends(get_session),
):
    """List appointment requests for the current patient"""
    if not current_user.is_patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patients can view their appointment requests"
        )

    requests = await appointment_request_crud.list_appointment_requests_for_patient(
        session,
        patient_user_id=current_user.id,
        status=status_filter,
    )
    return list(requests)


@router.get("/doctor", response_model=List[AppointmentRequestRead])
async def list_doctor_appointment_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user = Depends(get_authenticated_user),
    session: AsyncSession = Depends(get_session),
):
    """List appointment requests for the current doctor"""
    role_value = get_role_value(current_user.role)
    
    if role_value != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only doctors can view appointment requests"
        )

    requests = await appointment_request_crud.list_appointment_requests_for_doctor(
        session,
        doctor_user_id=current_user.id,
        status=status_filter,
    )
    return list(requests)


@router.get("/{request_id}", response_model=AppointmentRequestRead)
async def get_appointment_request(
    request_id: int,
    current_user = Depends(get_authenticated_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a specific appointment request"""
    request = await appointment_request_crud.get_appointment_request_by_id(
        session,
        request_id,
    )
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment request not found"
        )

    if request.patient_user_id != current_user.id and request.doctor_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this appointment request"
        )

    return request


@router.patch("/{request_id}", response_model=AppointmentRequestRead)
async def update_appointment_request(
    request_id: int,
    update_data: AppointmentRequestUpdate,
    current_user = Depends(get_authenticated_user),
    session: AsyncSession = Depends(get_session),
):
    """Update an appointment request (doctor can accept/reject/suggest alternative, patient can accept/reject alternative)"""
    try:
        request = await appointment_request_crud.get_appointment_request_by_id(
            session,
            request_id,
        )
        if not request:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment request not found"
            )

        role_value = get_role_value(current_user.role)
        is_doctor = role_value == "doctor"
        is_patient = current_user.is_patient

        has_doctor_permission = is_doctor and request.doctor_user_id == current_user.id
        has_patient_permission = is_patient and request.patient_user_id == current_user.id

        if not (has_doctor_permission or has_patient_permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to update this appointment request"
            )

        new_status = update_data.status
        doctor = await auth_crud.get_user_by_id(request.doctor_user_id, session)
        patient = await auth_crud.get_user_by_id(request.patient_user_id, session)
        doctor_name = f"{doctor.first_name} {doctor.last_name}".strip() if doctor else "Doctor"
        patient_name = f"{patient.first_name} {patient.last_name}".strip() if patient else "Patient"
        
        # Handle status conversion - check if it's an enum or string
        if hasattr(request.status, "value"):
            current_status = str(request.status.value)
        elif isinstance(request.status, str):
            current_status = request.status.strip()
        else:
            current_status = str(request.status or "").strip()

        if has_doctor_permission:
            # Determine if this is a reschedule request (has appointment_id and was confirmed)
            is_reschedule_request = request.appointment_id is not None and current_status == "pending" and request.appointment_id > 0
            is_initial_booking = request.appointment_id is None

            if new_status == "accepted":
                if not request.preferred_date or not request.preferred_time_slot_start:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Preferred date and time are required to accept an appointment request"
                    )

                preferred_date_naive = request.preferred_date.replace(tzinfo=None) if request.preferred_date.tzinfo else request.preferred_date
                combined_datetime = datetime.combine(
                    preferred_date_naive.date(),
                    request.preferred_time_slot_start
                )
                if request.preferred_date.tzinfo:
                    combined_datetime = combined_datetime.replace(tzinfo=request.preferred_date.tzinfo)

                if is_reschedule_request:
                    # RESCHEDULING: Doctor accepts reschedule request
                    appointment = await appointment_crud.get_appointment_by_id(session, request.appointment_id)
                    if not appointment:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Appointment not found"
                        )
                    
                    # Update appointment time and increment reschedule count
                    await appointment_crud.update_appointment(
                        session,
                        request.appointment_id,
                        appointment_date=combined_datetime,
                        status="payment_pending",
                        notes=update_data.notes or request.notes,
                        reschedule_count=appointment.reschedule_count + 1,
                    )
                    await appointment_request_crud.update_appointment_request(
                        session,
                        request_id,
                        status="confirmed",
                        preferred_date=combined_datetime,
                        preferred_time_slot_start=request.preferred_time_slot_start,
                        suggested_date=None,
                        suggested_time_slot_start=None,
                        notes=update_data.notes,
                    )
                    appointment_record_id = request.appointment_id
                    notification_type = "appointment_confirmed"
                    notification_title = "Appointment Reschedule Confirmed"
                    notification_message = f"{doctor_name} approved your reschedule request for {combined_datetime.strftime('%Y-%m-%d')} at {request.preferred_time_slot_start.strftime('%H:%M')}."
                else:
                    # INITIAL BOOKING: Doctor accepts initial appointment request
                    # Status set to "payment_pending" - patient needs to make payment
                    appointment = await appointment_crud.create_appointment(
                        session,
                        patient_user_id=request.patient_user_id,
                        doctor_user_id=request.doctor_user_id,
                        clinic_id=request.clinic_id,
                        appointment_date=combined_datetime,
                        duration_minutes=30,
                        status="payment_pending",
                        appointment_type="consultation",
                        reason=request.reason,
                        notes=request.notes,
                    )
                    await appointment_request_crud.update_appointment_request(
                        session,
                        request_id,
                        status="confirmed",
                        appointment_id=appointment.appointment_id,
                        notes=update_data.notes,
                    )
                    appointment_record_id = appointment.appointment_id
                    notification_type = "appointment_accepted"
                    notification_title = "Appointment Accepted"
                    notification_message = f"{doctor_name} has accepted your appointment request for {request.preferred_date.strftime('%Y-%m-%d')} at {request.preferred_time_slot_start.strftime('%H:%M')}."

                await notification_crud.create_notification(
                    session,
                    user_id=request.patient_user_id,
                    type=notification_type,
                    title=notification_title,
                    message=notification_message,
                    appointment_request_id=request_id,
                    appointment_id=appointment_record_id,
                    related_entity_type="appointment",
                    related_entity_id=appointment_record_id,
                )

            elif new_status == "rejected":
                if is_reschedule_request:
                    # RESCHEDULING: Doctor rejects reschedule request - appointment stays same
                    appointment = await appointment_crud.get_appointment_by_id(session, request.appointment_id)
                    if not appointment:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Appointment not found"
                        )
                    original_datetime = appointment.appointment_date
                    original_time = appointment.appointment_date.time()
                    
                    await appointment_request_crud.update_appointment_request(
                        session,
                        request_id,
                        status="confirmed",
                        preferred_date=original_datetime,
                        preferred_time_slot_start=original_time,
                        suggested_date=None,
                        suggested_time_slot_start=None,
                        notes=update_data.notes,
                    )

                    await notification_crud.create_notification(
                        session,
                        user_id=request.patient_user_id,
                        type="appointment_confirmed",
                        title="Reschedule Request Rejected",
                        message=f"{doctor_name} has rejected your reschedule request. The appointment remains confirmed for its original time.",
                        appointment_request_id=request_id,
                        appointment_id=request.appointment_id,
                        related_entity_type="appointment",
                        related_entity_id=request.appointment_id,
                    )
                else:
                    # INITIAL BOOKING: Doctor rejects initial appointment request
                    await appointment_request_crud.update_appointment_request(
                        session,
                        request_id,
                        status=new_status,
                        notes=update_data.notes,
                    )

                    await notification_crud.create_notification(
                        session,
                        user_id=request.patient_user_id,
                        type="appointment_rejected",
                        title="Appointment Request Rejected",
                        message=f"{doctor_name} has rejected your appointment request for {request.preferred_date.strftime('%Y-%m-%d')} at {request.preferred_time_slot_start.strftime('%H:%M')}",
                        appointment_request_id=request_id,
                        related_entity_type="appointment_request",
                        related_entity_id=request_id,
                    )

            elif new_status == "doctor_suggested_alternative":
                # Doctor suggests alternative time
                if is_initial_booking and not request.is_flexible:
                    # INITIAL BOOKING: Can only suggest if patient is flexible
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Patient did not allow alternative suggestions for initial booking"
                    )
                # For rescheduling, doctor can always suggest alternative (no is_flexible check needed)
                
                if not update_data.suggested_date or not update_data.suggested_time_slot_start:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Suggested date and time slot are required when suggesting an alternative"
                    )

                await appointment_request_crud.update_appointment_request(
                    session,
                    request_id,
                    status=new_status,
                    suggested_date=update_data.suggested_date,
                    suggested_time_slot_start=update_data.suggested_time_slot_start,
                    notes=update_data.notes,
                )

                context_msg = "for rescheduling" if is_reschedule_request else "for your appointment request"
                await notification_crud.create_notification(
                    session,
                    user_id=request.patient_user_id,
                    type="appointment_suggested",
                    title="Alternative Time Suggested",
                    message=f"{doctor_name} has suggested an alternative time {context_msg}: {update_data.suggested_date.strftime('%Y-%m-%d')} at {update_data.suggested_time_slot_start.strftime('%H:%M')}",
                    appointment_request_id=request_id,
                    appointment_id=request.appointment_id,
                    related_entity_type="appointment_request",
                    related_entity_id=request_id,
                )

        elif has_patient_permission:
            if new_status == "patient_accepted_alternative":
                # Patient accepts the doctor's suggested alternative time
                if current_status != "doctor_suggested_alternative":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Can only accept alternative when doctor has suggested one. Current status: {current_status}"
                    )
                
                if not request.suggested_date or not request.suggested_time_slot_start:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="No alternative time was suggested by the doctor"
                    )

                # Combine suggested date and time into datetime
                suggested_date_naive = request.suggested_date.replace(tzinfo=None) if request.suggested_date.tzinfo else request.suggested_date
                combined_datetime = datetime.combine(
                    suggested_date_naive.date(),
                    request.suggested_time_slot_start
                )
                if request.suggested_date.tzinfo:
                    combined_datetime = combined_datetime.replace(tzinfo=request.suggested_date.tzinfo)
                
                is_reschedule_flow = request.appointment_id is not None
                
                if is_reschedule_flow:
                    # RESCHEDULING: Update existing appointment (reschedule flow)
                    appointment = await appointment_crud.get_appointment_by_id(session, request.appointment_id)
                    if not appointment:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Appointment with ID {request.appointment_id} not found"
                        )
                    # Increment reschedule count when patient accepts doctor's alternative in reschedule
                    await appointment_crud.update_appointment(
                        session,
                        request.appointment_id,
                        appointment_date=combined_datetime,
                        status=appointment.status or "scheduled",
                        notes=request.notes,
                        reschedule_count=appointment.reschedule_count + 1,
                    )
                    final_datetime = combined_datetime
                    await appointment_request_crud.update_appointment_request(
                        session,
                        request_id,
                        status="confirmed",
                        preferred_date=final_datetime,
                        preferred_time_slot_start=request.suggested_time_slot_start,
                        suggested_date=None,
                        suggested_time_slot_start=None,
                    )
                    appointment_ref_id = request.appointment_id
                else:
                    # INITIAL BOOKING: Create appointment with suggested time
                    appointment = await appointment_crud.create_appointment(
                        session,
                        patient_user_id=request.patient_user_id,
                        doctor_user_id=request.doctor_user_id,
                        clinic_id=request.clinic_id,
                        appointment_date=combined_datetime,
                        duration_minutes=30,
                        status="payment_pending",
                        appointment_type="consultation",
                        reason=request.reason,
                        notes=request.notes,
                    )
                    appointment_ref_id = appointment.appointment_id
                    await appointment_request_crud.update_appointment_request(
                        session,
                        request_id,
                        status="confirmed",
                        appointment_id=appointment_ref_id,
                        preferred_date=combined_datetime,
                        preferred_time_slot_start=request.suggested_time_slot_start,
                        suggested_date=None,
                        suggested_time_slot_start=None,
                    )

                # Notify doctor
                context_msg = "reschedule" if is_reschedule_flow else "appointment request"
                await notification_crud.create_notification(
                    session,
                    user_id=request.doctor_user_id,
                    type="appointment_confirmed",
                    title="Appointment Confirmed",
                    message=f"{patient_name} has accepted your suggested alternative time for {context_msg}. Appointment confirmed for {request.suggested_date.strftime('%Y-%m-%d')} at {request.suggested_time_slot_start.strftime('%H:%M')}",
                    appointment_request_id=request_id,
                    appointment_id=appointment_ref_id,
                    related_entity_type="appointment",
                    related_entity_id=appointment_ref_id,
                )

            elif new_status == "patient_rejected_alternative":
                # Patient rejects the doctor's suggested alternative time
                if current_status != "doctor_suggested_alternative":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Can only reject alternative when doctor has suggested one. Current status: {current_status}"
                    )
                
                is_reschedule_flow = request.appointment_id is not None
                
                if is_reschedule_flow:
                    # RESCHEDULING: Patient rejects alternative - keep original appointment time
                    appointment = await appointment_crud.get_appointment_by_id(session, request.appointment_id)
                    if not appointment:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Appointment not found"
                        )
                    original_datetime = appointment.appointment_date
                    original_time = appointment.appointment_date.time()
                    
                    await appointment_request_crud.update_appointment_request(
                        session,
                        request_id,
                        status="confirmed",
                        preferred_date=original_datetime,
                        preferred_time_slot_start=original_time,
                        suggested_date=None,
                        suggested_time_slot_start=None,
                        notes=update_data.notes,
                    )

                    await notification_crud.create_notification(
                        session,
                        user_id=request.doctor_user_id,
                        type="appointment_confirmed",
                        title="Patient kept original appointment time",
                        message=f"{patient_name} has declined the suggested alternative for rescheduling. The appointment remains confirmed for its original time.",
                        appointment_request_id=request_id,
                        appointment_id=request.appointment_id,
                        related_entity_type="appointment",
                        related_entity_id=request.appointment_id,
                    )
                else:
                    # INITIAL BOOKING: Patient rejects alternative - cancel the request
                    await appointment_request_crud.update_appointment_request(
                        session,
                        request_id,
                        status="cancelled",
                        notes=update_data.notes,
                    )

                    await notification_crud.create_notification(
                        session,
                        user_id=request.doctor_user_id,
                        type="appointment_cancelled",
                        title="Alternative Time Rejected",
                        message=f"{patient_name} has rejected your suggested alternative time. The appointment request has been cancelled.",
                        appointment_request_id=request_id,
                        related_entity_type="appointment_request",
                        related_entity_id=request_id,
                    )

            elif new_status == "pending":
                # Patient requests reschedule
                if current_status != "confirmed":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Reschedule requests can only be made for confirmed appointments"
                    )
                if not request.appointment_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Appointment ID is required for reschedule requests"
                    )
                if not update_data.preferred_date or not update_data.preferred_time_slot_start:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Preferred date and time are required to request a reschedule"
                    )

                # Check reschedule count (max 2 reschedules allowed)
                appointment = await appointment_crud.get_appointment_by_id(session, request.appointment_id)
                if not appointment:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Appointment not found"
                    )
                
                if appointment.reschedule_count >= 2:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Maximum reschedule limit (2) has been reached for this appointment"
                    )

                await appointment_request_crud.update_appointment_request(
                    session,
                    request_id,
                    status="pending",
                    preferred_date=update_data.preferred_date,
                    preferred_time_slot_start=update_data.preferred_time_slot_start,
                    suggested_date=None,
                    suggested_time_slot_start=None,
                    notes=update_data.notes,
                )

                await notification_crud.create_notification(
                    session,
                    user_id=request.doctor_user_id,
                    type="appointment_request",
                    title="Appointment Reschedule Requested",
                    message=f"{patient_name} requested to reschedule the appointment to {update_data.preferred_date.strftime('%Y-%m-%d')} at {update_data.preferred_time_slot_start.strftime('%H:%M')}.",
                    appointment_request_id=request_id,
                    appointment_id=request.appointment_id,
                    related_entity_type="appointment_request",
                    related_entity_id=request_id,
                )

            elif new_status == "cancelled":
                # Patient can cancel any appointment request (pending or confirmed)
                cancellation_note = f"Cancelled by patient. {update_data.notes or ''}".strip()
                
                # Update request status to "cancelled"
                await appointment_request_crud.update_appointment_request(
                    session,
                    request_id,
                    status="cancelled",
                    notes=cancellation_note,
                )
                
                # If there's a confirmed appointment, also cancel it
                if request.appointment_id:
                    appointment = await appointment_crud.get_appointment_by_id(
                        session,
                        request.appointment_id,
                    )
                    if appointment:
                        await appointment_crud.update_appointment(
                            session,
                            request.appointment_id,
                            status="cancelled",
                            notes=cancellation_note,
                        )
                
                # Notify doctor
                await notification_crud.create_notification(
                    session,
                    user_id=request.doctor_user_id,
                    type="appointment_cancelled",
                    title="Appointment Cancelled by Patient",
                    message=f"{patient_name} has cancelled the appointment request for {request.preferred_date.strftime('%Y-%m-%d')} at {request.preferred_time_slot_start.strftime('%H:%M')}.",
                    appointment_request_id=request_id,
                    appointment_id=request.appointment_id,
                    related_entity_type="appointment_request" if not request.appointment_id else "appointment",
                    related_entity_id=request.appointment_id or request_id,
                )
            
            else:
                # Patient cannot perform any other status updates
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status update for patient: {new_status}. Patients can accept/reject doctor-suggested alternatives or cancel appointments."
                )
        
        else:
            # User doesn't have permission to update this appointment request
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to update this appointment request"
            )

        updated_request = await appointment_request_crud.get_appointment_request_by_id(
            session,
            request_id,
        )
        
        if not updated_request:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Appointment request not found after update"
            )
        
        # The Pydantic schema should handle enum conversion automatically,
        # but ensure we're returning the correct format
        return updated_request
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log unexpected errors and return a user-friendly message
        import traceback
        error_detail = str(e)
        traceback.print_exc()
        print(f"Error updating appointment request {request_id}: {error_detail}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update appointment request: {error_detail}"
        )

