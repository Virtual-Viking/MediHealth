from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Cookie,
    UploadFile,
    File,
    Query,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from db import get_session
from db.crud import auth_crud, doctor_crud, address_crud, specialty_crud, patient_file_crud, account_status_crud
from schemas import (
    DoctorProfileUpdate,
    DoctorListItem,
    DoctorSocialLinkCreate,
    DoctorSocialLinkRead,
    DoctorSocialLinkUpdate,
    AddressUpdate,
    AddressRead,
    SpecialtyRead,
    DoctorSpecialtyRead,
    FileBatchShareRead,
    AccountDeactivateRequest,
    AccountReactivateRequest,
    AccountStatusResponse,
    AccountStatusInfo,
)
from services import verify_access_token, get_storage_service
from services.google_places import (
    fetch_place_details_by_address,
    # fetch_place_details_by_place_id,  # Not currently used (disabled rating fetch)
)
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from db.models.appointment_model import Appointment
from db.models.finance_model import Payment
from db.models.patient_file_model import FileBatchShare, FileBatch
from db.models.user_model import User
from db.models.patient_model import PatientProfile
import uuid
import os

class PatientTimelineItem(BaseModel):
    type: str
    title: str
    detail: Optional[str] = None
    timestamp: str
    files: Optional[List[Dict[str, str]]] = None


class ConsultingPatient(BaseModel):
    patient_id: int
    name: str
    photo_url: Optional[str] = None
    status_text: str
    visits: int
    upcoming: int
    timeline: List[PatientTimelineItem]


router = APIRouter()


# Dependency to get current doctor from access token
async def get_current_user(
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
    
    # Verify user is a doctor
    role_value = user.role.value if hasattr(user.role, 'value') else str(user.role) if user.role else None
    if role_value != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only accessible to doctors"
        )

    return user


# Generic authenticated user dependency (patients/providers)
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


@router.get("", response_model=List[DoctorListItem])
async def list_doctors(
    search: Optional[str] = Query(None, description="Search by name, email, or specialty"),
    specialty: Optional[str] = Query(None, description="Filter by specialty"),
    patient_latitude: Optional[float] = Query(None, description="Patient latitude for distance calculation"),
    patient_longitude: Optional[float] = Query(None, description="Patient longitude for distance calculation"),
    session: AsyncSession = Depends(get_session),
    _: Any = Depends(get_authenticated_user),
):
    """List all doctors with profile information, including address, distance, and ratings."""
    # DISABLED: Google Places imports for rating fetching
    # from services.google_places import (
    #     fetch_place_details_by_address,
    #     fetch_place_details_by_place_id,
    # )
    
    doctors = await doctor_crud.list_doctors_with_profiles(
        session,
        search=search,
        specialty=specialty,
        patient_latitude=patient_latitude,
        patient_longitude=patient_longitude,
    )
    
    # DISABLED: Google ratings fetch to improve performance
    # This was causing significant slowdowns in doctor search
    # Uncomment the code below if ratings need to be fetched in the future
    # 
    # # Fetch Google ratings for doctors and their clinics
    # for doctor in doctors:
    #     # Fetch rating for primary clinic
    #     if doctor.get("place_id") and not doctor.get("google_rating"):
    #         place_data = await fetch_place_details_by_place_id(doctor["place_id"])
    #         if place_data:
    #             doctor["google_rating"] = place_data.get("rating")
    #             doctor["google_user_ratings_total"] = place_data.get("user_ratings_total")
    #     elif doctor.get("latitude") and doctor.get("longitude") and not doctor.get("google_rating"):
    #         address_parts = [
    #             doctor.get("address_line1"),
    #             doctor.get("city"),
    #             doctor.get("state"),
    #             doctor.get("postal_code"),
    #         ]
    #         address_str = ", ".join([p for p in address_parts if p])
    #         if address_str:
    #             place_data = await fetch_place_details_by_address(address_str)
    #             if place_data:
    #                 doctor["google_rating"] = place_data.get("rating")
    #                 doctor["google_user_ratings_total"] = place_data.get("user_ratings_total")
    #                 doctor["place_id"] = place_data.get("place_id")
    #     
    #     # Fetch ratings for all clinics
    #     if doctor.get("clinics"):
    #         for clinic in doctor["clinics"]:
    #             if clinic.get("place_id") and not clinic.get("google_rating"):
    #                 place_data = await fetch_place_details_by_place_id(clinic["place_id"])
    #                 if place_data:
    #                     clinic["google_rating"] = place_data.get("rating")
    #                     clinic["google_user_ratings_total"] = place_data.get("user_ratings_total")
    #             elif clinic.get("latitude") and clinic.get("longitude") and not clinic.get("google_rating"):
    #                 clinic_address_parts = [
    #                     clinic.get("address_line1"),
    #                     clinic.get("city"),
    #                     clinic.get("state"),
    #                     clinic.get("postal_code"),
    #                 ]
    #                 clinic_address_str = ", ".join([p for p in clinic_address_parts if p])
    #                 if clinic_address_str:
    #                     place_data = await fetch_place_details_by_address(clinic_address_str)
    #                     if place_data:
    #                         clinic["google_rating"] = place_data.get("rating")
    #                         clinic["google_user_ratings_total"] = place_data.get("user_ratings_total")
    #                         clinic["place_id"] = place_data.get("place_id")
    
    return doctors


@router.get("/specialties", response_model=List[SpecialtyRead])
async def list_specialties(
    session: AsyncSession = Depends(get_session),
    _: Any = Depends(get_authenticated_user),
):
    """Return all available medical specialties."""
    specialties = await specialty_crud.get_all_specialties(session)
    return specialties


@router.get("/my-specialties", response_model=List[DoctorSpecialtyRead])
async def get_my_specialties(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get all specialties for the current doctor."""
    specialties = await specialty_crud.get_doctor_specialties(current_user.id, session)
    return specialties


@router.post("/specialties", response_model=DoctorSpecialtyRead, status_code=status.HTTP_201_CREATED)
async def add_specialty(
    specialty_id: int = Query(..., description="Specialty ID to add"),
    is_primary: bool = Query(False, description="Set as primary specialty"),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Add a specialty to the current doctor."""
    specialty = await specialty_crud.get_specialty_by_id(specialty_id, session)
    if not specialty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Specialty not found"
        )
    
    doctor_specialty = await specialty_crud.add_doctor_specialty(
        current_user.id, specialty_id, is_primary, session
    )
    await session.refresh(doctor_specialty)
    await session.refresh(doctor_specialty.specialty)
    return doctor_specialty


@router.delete("/specialties/{specialty_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_specialty(
    specialty_id: int,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Remove a specialty from the current doctor."""
    deleted = await specialty_crud.remove_doctor_specialty(
        current_user.id, specialty_id, session
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Specialty not found for this doctor"
        )
    return None


@router.put("/specialties/{specialty_id}/set-primary", response_model=DoctorSpecialtyRead)
async def set_primary_specialty(
    specialty_id: int,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Set a specialty as the primary specialty for the current doctor."""
    doctor_specialty = await specialty_crud.set_primary_specialty(
        current_user.id, specialty_id, session
    )
    if not doctor_specialty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Specialty not found for this doctor"
        )
    await session.refresh(doctor_specialty)
    await session.refresh(doctor_specialty.specialty)
    return doctor_specialty


class UpdateSpecialtiesRequest(BaseModel):
    specialty_ids: List[int] = Field(..., description="List of specialty IDs")
    primary_specialty_id: Optional[int] = Field(None, description="Primary specialty ID")


@router.put("/specialties", response_model=List[DoctorSpecialtyRead])
async def update_specialties(
    request: UpdateSpecialtiesRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update all specialties for the current doctor. Replaces existing specialties."""
    for specialty_id in request.specialty_ids:
        specialty = await specialty_crud.get_specialty_by_id(specialty_id, session)
        if not specialty:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Specialty {specialty_id} not found"
            )
    
    if request.primary_specialty_id and request.primary_specialty_id not in request.specialty_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary specialty must be in the list of specialties"
        )
    
    doctor_specialties = await specialty_crud.update_doctor_specialties(
        current_user.id, request.specialty_ids, request.primary_specialty_id, session
    )
    
    for ds in doctor_specialties:
        await session.refresh(ds)
        await session.refresh(ds.specialty)
    
    return doctor_specialties


@router.get("/report-shares", response_model=List[FileBatchShareRead])
async def list_report_shares(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return lab report batches that patients have shared with the doctor."""
    shares = await patient_file_crud.list_file_batch_shares_for_doctor(
        doctor_user_id=current_user.id,
        session=session,
    )
    return [
        patient_file_crud.serialize_file_batch_share(share)
        for share in shares
    ]




@router.get("/profile", response_model=Dict[str, Any])
async def get_doctor_profile(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Get doctor profile with user info"""
    profile_data = await doctor_crud.get_doctor_profile_with_clinics(
        current_user.id, session
    )
    
    if not profile_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    
    return profile_data


@router.put("/profile", response_model=Dict[str, Any])
async def update_doctor_profile(
    profile_update: DoctorProfileUpdate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Update doctor profile"""
    # Convert Pydantic model to dict, excluding None values
    update_data = profile_update.model_dump(exclude_unset=True, exclude_none=False)
    
    # Remove None values manually to allow clearing fields
    update_data = {k: v for k, v in update_data.items() if v is not None}
    
    updated_profile = await doctor_crud.update_doctor_profile(
        current_user.id, update_data, session
    )
    
    if not updated_profile:
        # Profile doesn't exist, create it
        create_data = profile_update.model_dump(exclude_unset=True)
        updated_profile = await doctor_crud.create_doctor_profile(
            create_data, current_user.id, session
        )
    
    # Return updated profile with user info
    profile_data = await doctor_crud.get_doctor_profile_with_clinics(
        current_user.id, session
    )
    
    return profile_data


@router.put("/user-info")
async def update_user_info(
    user_data: Dict[str, Any],
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Update doctor's basic user information"""
    # Only allow updating specific fields
    allowed_fields = ["first_name", "middle_name", "last_name", "phone", "emergency_contact"]
    update_data = {k: v for k, v in user_data.items() if k in allowed_fields and v is not None}
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update"
        )
    
    updated_user = await doctor_crud.update_user_info(
        current_user.id, update_data, session
    )
    
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Return updated profile with user info
    profile_data = await doctor_crud.get_doctor_profile_with_clinics(
        current_user.id, session
    )
    
    return profile_data


@router.post("/upload-profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Upload a profile picture for the doctor"""
    # Validate file type
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 5MB)
    file_content = await file.read()
    if len(file_content) > 5 * 1024 * 1024:  # 5MB
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 5MB limit"
        )
    
    try:
        # Get current profile to check for existing photo
        profile = await doctor_crud.get_doctor_profile(current_user.id, session)
        
        storage_service = get_storage_service()
        
        # Delete ALL old profile pictures for this doctor
        # This ensures we clean up any orphaned files from previous uploads
        doctor_profile_prefix = f"doctor-profiles/{current_user.id}/"
        deleted_count = await storage_service.delete_files_by_prefix(doctor_profile_prefix)
        
        if deleted_count > 0:
            print(f"Deleted {deleted_count} old profile picture(s) for doctor {current_user.id}")
        
        # Generate unique filename using UUID
        file_extension = os.path.splitext(file.filename)[1] or ".jpg"
        unique_filename = f"doctor-profiles/{current_user.id}/{uuid.uuid4()}{file_extension}"
        
        # Upload to GCP Storage
        public_url = await storage_service.upload_file(
            file_content,
            unique_filename,
            content_type=file.content_type
        )
        
        # Update or create doctor profile with new photo URL
        update_data = {"photo_url": public_url}
        updated_profile = await doctor_crud.update_doctor_profile(
            current_user.id, update_data, session
        )
        
        if not updated_profile:
            # Profile doesn't exist yet – create it with the photo URL and a default specialty
            create_data = {
                "photo_url": public_url,
                "specialty": "General Practice",
            }
            await doctor_crud.create_doctor_profile(
                create_data, current_user.id, session
            )
        
        return {
            "message": "Profile picture uploaded successfully",
            "photo_url": public_url
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload profile picture: {str(e)}"
        )


@router.delete("/profile-picture")
async def delete_profile_picture(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    """Delete the doctor's profile picture"""
    try:
        # Get current profile
        profile = await doctor_crud.get_doctor_profile(current_user.id, session)
        
        if not profile or not profile.photo_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No profile picture found"
            )
        
        # Extract file path from URL and delete from storage
        photo_url = profile.photo_url
        storage_service = get_storage_service()
        file_path = storage_service.extract_file_path_from_url(photo_url)
        
        if file_path:
            # Delete from storage
            await storage_service.delete_file(file_path)
        
        # Clear photo_url in database
        update_data = {"photo_url": None}
        await doctor_crud.update_doctor_profile(
            current_user.id, update_data, session
        )
        
        return {"message": "Profile picture deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete profile picture: {str(e)}"
        )


@router.post("/upload-cover-photo")
async def upload_cover_photo(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Upload a cover photo for the doctor profile."""
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}",
        )

    file_content = await file.read()
    if len(file_content) > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 8MB limit",
        )

    try:
        await doctor_crud.ensure_doctor_profile(current_user.id, session)

        storage_service = get_storage_service()
        cover_prefix = f"doctor-covers/{current_user.id}/"
        await storage_service.delete_files_by_prefix(cover_prefix)

        file_extension = os.path.splitext(file.filename)[1] or ".jpg"
        unique_filename = f"doctor-covers/{current_user.id}/{uuid.uuid4()}{file_extension}"

        public_url = await storage_service.upload_file(
            file_content,
            unique_filename,
            content_type=file.content_type,
        )

        await doctor_crud.update_doctor_profile(
            current_user.id,
            {"cover_photo_url": public_url},
            session,
        )

        return {
            "message": "Cover photo uploaded successfully",
            "cover_photo_url": public_url,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload cover photo: {str(e)}",
        )


@router.delete("/cover-photo")
async def delete_cover_photo(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete the doctor's cover photo."""
    try:
        profile = await doctor_crud.get_doctor_profile(current_user.id, session)

        if not profile or not profile.cover_photo_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No cover photo found",
            )

        storage_service = get_storage_service()
        file_path = storage_service.extract_file_path_from_url(profile.cover_photo_url)

        if file_path:
            await storage_service.delete_file(file_path)

        await doctor_crud.update_doctor_profile(
            current_user.id,
            {"cover_photo_url": None},
            session,
        )

        return {"message": "Cover photo deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete cover photo: {str(e)}",
        )


@router.get("/social-links", response_model=List[DoctorSocialLinkRead])
async def list_social_links(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List social links for the current doctor."""
    links = await doctor_crud.list_social_links(current_user.id, session)
    return links


@router.post("/social-links", response_model=DoctorSocialLinkRead, status_code=status.HTTP_201_CREATED)
async def create_social_link(
    payload: DoctorSocialLinkCreate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a social link for the current doctor."""
    link = await doctor_crud.create_social_link(
        current_user.id,
        payload.model_dump(exclude_unset=True),
        session,
    )
    return link


@router.put("/social-links/{link_id}", response_model=DoctorSocialLinkRead)
async def update_social_link(
    link_id: int,
    payload: DoctorSocialLinkUpdate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update a social link."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No data provided for update",
        )

    link = await doctor_crud.update_social_link(
        current_user.id,
        link_id,
        update_data,
        session,
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Social link not found",
        )
    return link


@router.delete("/social-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_social_link(
    link_id: int,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a social link."""
    deleted = await doctor_crud.delete_social_link(
        current_user.id,
        link_id,
        session,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Social link not found",
        )
    return None


@router.get("/clinics", response_model=List[AddressRead])
async def list_my_clinics(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all clinics (addresses) for the current doctor."""
    clinics = await address_crud.list_addresses_for_user(current_user.id, session)
    return clinics


@router.post("/clinics", response_model=AddressRead, status_code=status.HTTP_201_CREATED)
async def create_clinic(
    payload: AddressUpdate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new clinic address for the doctor."""
    data = payload.model_dump(exclude_unset=True)
    
    required_fields = ["address_line1", "city"]
    if any(not data.get(field) for field in required_fields):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="address_line1 and city are required fields.",
        )
    
    if "country_code" in data and data["country_code"]:
        data["country_code"] = data["country_code"].upper()
    
    data.setdefault("location_source", "manual")
    data.setdefault("is_primary", False)
    data.setdefault("label", data.get("label") or "Clinic")
    
    address_str = ", ".join([
        data.get("address_line1", ""),
        data.get("city", ""),
        data.get("state", ""),
        data.get("postal_code", ""),
    ])
    
    if address_str.strip():
        place_data = await fetch_place_details_by_address(address_str)
        if place_data:
            data["latitude"] = place_data.get("latitude")
            data["longitude"] = place_data.get("longitude")
            data["place_id"] = place_data.get("place_id")
            data["formatted_address"] = place_data.get("formatted_address")
    
    if not data.get("formatted_address"):
        formatted = ", ".join(
            [
                data.get("address_line1"),
                data.get("address_line2"),
                data.get("city"),
                data.get("state"),
                data.get("postal_code"),
                data.get("country_code"),
            ]
        ).replace(" ,", "").strip(", ")
        if formatted:
            data["formatted_address"] = formatted

    # Remove raw_geocoding_payload if it's None to avoid type mismatch
    if "raw_geocoding_payload" in data and data["raw_geocoding_payload"] is None:
        del data["raw_geocoding_payload"]

    try:
        clinic = await address_crud.create_address_for_user(current_user.id, data, session)
        return clinic
    except SQLAlchemyError as exc:
        await session.rollback()
        import traceback
        error_detail = str(exc)
        print(f"Error creating clinic: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to create clinic: {error_detail}",
        ) from exc
    except Exception as exc:
        await session.rollback()
        import traceback
        error_detail = str(exc)
        print(f"Unexpected error creating clinic: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to create clinic: {error_detail}",
        ) from exc


@router.put("/clinics/{clinic_id}", response_model=AddressRead)
async def update_clinic(
    clinic_id: int,
    payload: AddressUpdate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update an existing clinic address."""
    data = payload.model_dump(exclude_unset=True)
    
    if "country_code" in data and data["country_code"]:
        data["country_code"] = data["country_code"].upper()
    
    address_str = ", ".join([
        data.get("address_line1", ""),
        data.get("city", ""),
        data.get("state", ""),
        data.get("postal_code", ""),
    ])
    
    if address_str.strip():
        place_data = await fetch_place_details_by_address(address_str)
        if place_data:
            data["latitude"] = place_data.get("latitude")
            data["longitude"] = place_data.get("longitude")
            data["place_id"] = place_data.get("place_id")
            data["formatted_address"] = place_data.get("formatted_address")
    
    if not data.get("formatted_address"):
        formatted = ", ".join(
            [
                data.get("address_line1"),
                data.get("address_line2"),
                data.get("city"),
                data.get("state"),
                data.get("postal_code"),
                data.get("country_code"),
            ]
        ).replace(" ,", "").strip(", ")
        if formatted:
            data["formatted_address"] = formatted

    # Remove raw_geocoding_payload if it's None to avoid type mismatch
    if "raw_geocoding_payload" in data and data["raw_geocoding_payload"] is None:
        del data["raw_geocoding_payload"]

    try:
        clinic = await address_crud.update_address_for_user(
            clinic_id, current_user.id, data, session
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        import traceback
        error_detail = str(exc)
        print(f"Error updating clinic: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to update clinic: {error_detail}",
        ) from exc
    except Exception as exc:
        await session.rollback()
        import traceback
        error_detail = str(exc)
        print(f"Unexpected error updating clinic: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to update clinic: {error_detail}",
        ) from exc
    
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found",
        )
    
    return clinic


@router.delete("/clinics/{clinic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_clinic(
    clinic_id: int,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a clinic address."""
    try:
        deleted = await address_crud.delete_address_for_user(
            clinic_id, current_user.id, session
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        import traceback
        error_detail = str(exc)
        print(f"Error deleting clinic: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to delete clinic: {error_detail}",
        ) from exc
    except Exception as exc:
        await session.rollback()
        import traceback
        error_detail = str(exc)
        print(f"Unexpected error deleting clinic: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to delete clinic: {error_detail}",
        ) from exc
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found",
        )
    
    return None


@router.put("/clinics/{clinic_id}/set-primary", response_model=AddressRead)
async def set_primary_clinic(
    clinic_id: int,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Set a clinic as the primary clinic."""
    try:
        clinic = await address_crud.set_primary_address(
            clinic_id, current_user.id, session
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        import traceback
        error_detail = str(exc)
        print(f"Error setting primary clinic: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to set primary clinic: {error_detail}",
        ) from exc
    except Exception as exc:
        await session.rollback()
        import traceback
        error_detail = str(exc)
        print(f"Unexpected error setting primary clinic: {error_detail}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to set primary clinic: {error_detail}",
        ) from exc
    
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found",
        )
    
    return clinic


@router.post("/deactivate-account", response_model=AccountStatusResponse)
async def deactivate_doctor_account(
    request: AccountDeactivateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Deactivate service provider account portal."""
    if request.portal_type != "service_provider":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid portal_type. Must be 'service_provider' for this endpoint.",
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
        portal_type="service_provider",
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
async def reactivate_doctor_account(
    request: AccountReactivateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Reactivate service provider account portal."""
    if request.portal_type != "service_provider":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid portal_type. Must be 'service_provider' for this endpoint.",
        )
    
    result = await account_status_crud.update_account_status(
        user_id=current_user.id,
        portal_type="service_provider",
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


@router.get("/patients/consulting", response_model=List[ConsultingPatient])
async def list_consulting_patients(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List patients who have interacted with the doctor, with a timeline summary."""
    appt_result = await session.execute(
        select(Appointment).where(Appointment.doctor_user_id == current_user.id)
    )
    appointments = appt_result.scalars().all()

    if not appointments:
        return []

    patient_ids = {appt.patient_user_id for appt in appointments if appt.patient_user_id}
    if not patient_ids:
        return []

    users_result = await session.execute(
        select(User)
        .where(User.id.in_(patient_ids))
        .options(selectinload(User.patient_profile))
    )
    users_map = {u.id: u for u in users_result.scalars().all()}

    payments_result = await session.execute(
        select(Payment).where(
            Payment.doctor_user_id == current_user.id,
            Payment.patient_user_id.in_(patient_ids),
        )
    )
    payments = payments_result.scalars().all()
    payments_by_appt = {p.appointment_id: p for p in payments}

    # Collect batch ids from payments for file lookup
    batch_ids: List[int] = []
    for p in payments:
        if p.cheque_batch_id:
            batch_ids.append(p.cheque_batch_id)
        if p.insurance_batch_id:
            batch_ids.append(p.insurance_batch_id)

    batches_by_id: Dict[int, FileBatch] = {}
    if batch_ids:
        batch_result = await session.execute(
            select(FileBatch)
            .where(FileBatch.id.in_(batch_ids))
            .options(selectinload(FileBatch.files))
        )
        for b in batch_result.scalars().all():
            batches_by_id[b.id] = b

    shares_result = await session.execute(
        select(FileBatchShare)
        .where(
            FileBatchShare.doctor_user_id == current_user.id,
            FileBatchShare.patient_user_id.in_(patient_ids),
            FileBatchShare.share_status == "active",
        )
        .options(selectinload(FileBatchShare.batch).selectinload(FileBatch.files))
    )
    shares_by_patient: Dict[int, List[FileBatchShare]] = {}
    for share in shares_result.scalars().all():
        shares_by_patient.setdefault(share.patient_user_id, []).append(share)

    appts_by_patient: Dict[int, List[Appointment]] = {}
    for appt in appointments:
        appts_by_patient.setdefault(appt.patient_user_id, []).append(appt)

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    consulting_patients: List[ConsultingPatient] = []

    for patient_id, appts in appts_by_patient.items():
        user = users_map.get(patient_id)
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

        events: List[PatientTimelineItem] = []
        for appt in appts:
            ts_created = getattr(appt, "created_at", None) or appt.appointment_date
            if ts_created:
                events.append(
                    PatientTimelineItem(
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
                        PatientTimelineItem(
                            type="appointment",
                            title="Appointment confirmed",
                            detail=None,
                            timestamp=ts_conf.isoformat(),
                        )
                    )
            payment = payments_by_appt.get(appt.appointment_id)
            if payment:
                ts_pay = getattr(payment, "updated_at", None) or getattr(payment, "created_at", None)
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
                if ts_pay:
                    events.append(
                        PatientTimelineItem(
                            type="payment",
                            title=f"Payment {payment.payment_status}",
                            detail=f"Method: {payment.payment_method or 'N/A'}",
                            timestamp=ts_pay.isoformat(),
                            files=files_payload,
                        )
                    )

        for share in shares_by_patient.get(patient_id, []):
            ts_share = getattr(share, "shared_at", None) or getattr(share, "updated_at", None)
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
            if ts_share:
                events.append(
                    PatientTimelineItem(
                        type="files",
                        title="Files shared",
                        detail=f"Category: {cat}" if cat else None,
                        timestamp=ts_share.isoformat(),
                        files=files_payload,
                    )
                )

        events.sort(key=lambda e: e.timestamp, reverse=True)

        name = " ".join(
            [p for p in [user.first_name, user.last_name] if p]
        ).strip()
        photo_url = None
        if user.patient_profile and user.patient_profile.photo_url:
            photo_url = user.patient_profile.photo_url

        consulting_patients.append(
            ConsultingPatient(
                patient_id=patient_id,
                name=name or "Patient",
                photo_url=photo_url,
                status_text=status_text,
                visits=visits,
                upcoming=upcoming,
                timeline=events,
            )
        )

    return consulting_patients


@router.get("/account-status", response_model=AccountStatusInfo)
async def get_doctor_account_status(
    current_user=Depends(get_current_user),
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
