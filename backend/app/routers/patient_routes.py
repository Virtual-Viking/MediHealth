import os
import uuid
from typing import Any

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from db.crud import auth_crud, patient_crud, account_status_crud
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

