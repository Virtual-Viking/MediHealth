from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from db.crud import auth_crud, appointment_crud, doctor_crud
from db.models import User, DoctorProfile
from sqlalchemy import select
from schemas.appointment_schema import AppointmentCreate
from services import (
    fetch_holiday_events,
    fetch_service_calendar_events,
    verify_access_token,
)

router = APIRouter()


async def get_authenticated_user(
    access_token: str | None = Cookie(default=None),
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
    return user


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None

    sanitized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(sanitized)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ISO datetime value: {value}",
        ) from exc


async def _serialize_appointment(model, session: AsyncSession) -> dict:
    start = model.appointment_date
    duration = model.duration_minutes or 0
    if duration <= 0:
        duration = 30
    end = start + timedelta(minutes=duration)
    title = model.reason or model.appointment_type or "Appointment"
    description = model.notes
    category = model.appointment_type
    is_all_day = model.status == "all-day" or duration >= 1440

    doctor_info = None
    if model.doctor_user_id:
        doctor_user = await session.scalar(
            select(User).where(User.id == model.doctor_user_id)
        )
        if doctor_user:
            doctor_profile = await doctor_crud.get_doctor_profile(model.doctor_user_id, session)
            specialty = doctor_profile.specialty if doctor_profile else None
            doctor_name = f"{doctor_user.first_name} {doctor_user.last_name}".strip()
            doctor_info = {
                "id": doctor_user.id,
                "name": doctor_name,
                "specialty": specialty or "General Practice",
            }

    return {
        "id": model.appointment_id,
        "patient_user_id": model.patient_user_id,
        "doctor_user_id": model.doctor_user_id,
        "clinic_id": model.clinic_id,
        "title": title,
        "description": description,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "duration_minutes": duration,
        "status": model.status,
        "category": category,
        "location": None,
        "is_all_day": is_all_day,
        "created_at": model.created_at.isoformat() if model.created_at else None,
        "updated_at": model.updated_at.isoformat() if model.updated_at else None,
        "doctor": doctor_info,
    }


def _normalize_event(event: dict) -> dict:
    return {
        "id": event.get("id"),
        "summary": event.get("summary"),
        "description": event.get("description"),
        "start": event.get("start"),
        "end": event.get("end"),
        "location": event.get("location"),
    }


@router.get("/events")
async def list_calendar_events(
    current_user=Depends(get_authenticated_user),
    session: AsyncSession = Depends(get_session),
    time_min: str | None = Query(None),
    time_max: str | None = Query(None),
    include_holidays: bool = Query(False),
    max_results: int = Query(50, ge=1, le=2500),
):
    start_dt = _parse_iso_datetime(time_min)
    end_dt = _parse_iso_datetime(time_max)

    appointments = await appointment_crud.list_appointments(
        session,
        user_id=current_user.id,
        time_min=start_dt,
        time_max=end_dt,
    )

    response: dict = {
        "appointments": [await _serialize_appointment(item, session) for item in appointments],
        "holidays": [],
        "service_events": [],
    }

    if include_holidays:
        try:
            holidays = await fetch_holiday_events(
                time_min=time_min,
                time_max=time_max,
                max_results=max_results,
            )
            response["holidays"] = [_normalize_event(event) for event in holidays]
        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            # Log error but don't fail the entire request
            print(f"Warning: Failed to fetch holiday events: {e}")
            response["holidays"] = []

    try:
        service_events = await fetch_service_calendar_events(
            time_min=time_min,
            time_max=time_max,
            max_results=max_results,
        )
        response["service_events"] = [_normalize_event(event) for event in service_events]
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Log error but don't fail the entire request - return empty service events
        print(f"Warning: Failed to fetch service calendar events: {e}")
        response["service_events"] = []

    return response


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_calendar_event(
    payload: AppointmentCreate,
    current_user=Depends(get_authenticated_user),
    session: AsyncSession = Depends(get_session),
):
    if payload.end_time <= payload.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_time must be after start_time.",
        )

    duration_minutes = int(
        (payload.end_time - payload.start_time).total_seconds() // 60
    )
    if payload.is_all_day:
        duration_minutes = 24 * 60
    if duration_minutes <= 0:
        duration_minutes = 30

    patient_user_id = payload.patient_user_id
    doctor_user_id = payload.doctor_user_id

    role_value = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role) if current_user.role else None
    if role_value == "doctor":
        doctor_user_id = doctor_user_id or current_user.id
        patient_user_id = patient_user_id or current_user.id
    else:
        patient_user_id = patient_user_id or current_user.id

    if patient_user_id is None and doctor_user_id is None:
        patient_user_id = current_user.id

    created = await appointment_crud.create_appointment(
        session,
        patient_user_id=patient_user_id,
        doctor_user_id=doctor_user_id,
        clinic_id=payload.clinic_id,
        appointment_date=payload.start_time,
        duration_minutes=duration_minutes,
        status=payload.status or "scheduled",
        appointment_type=payload.category or (payload.title or "appointment"),
        reason=payload.title,
        notes=payload.description,
    )

    # Track appointment creation metric
    from services.metrics import appointments_created_total
    appointment_status = payload.status or "scheduled"
    channel = "web"  # Could be determined from request headers or payload
    appointments_created_total.labels(status=appointment_status, channel=channel).inc()

    return await _serialize_appointment(created, session)

