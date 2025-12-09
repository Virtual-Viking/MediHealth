from sqlalchemy import select, or_, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from db import DoctorProfile, DoctorSocialLink, User, Address, DoctorSpecialty, Specialty
from db.models.user_model import UserRoleEnum
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
import math


async def get_doctor_profile(user_id: int, session: AsyncSession) -> Optional[DoctorProfile]:
    """Get doctor profile by user_id"""
    result = await session.execute(
        select(DoctorProfile)
        .where(DoctorProfile.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def ensure_doctor_profile(user_id: int, session: AsyncSession) -> DoctorProfile:
    """Ensure a doctor profile exists for the given user. Creates a minimal profile if missing."""
    profile = await get_doctor_profile(user_id, session)
    if profile:
        return profile

    profile = DoctorProfile(
        user_id=user_id,
        specialty="General Practice",
        accepting_new_patients=False,
        offers_virtual_visits=False,
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def get_doctor_profile_with_clinics(user_id: int, session: AsyncSession) -> Dict[str, Any]:
    """Get doctor profile with user info (simplified, no clinics)"""
    # Get user
    user = await session.scalar(
        select(User).where(User.id == user_id)
    )
    
    if not user:
        return None
    
    # Get profile
    profile = await get_doctor_profile(user_id, session)
    social_links: List[Dict[str, Any]] = []

    specialties_data: List[Dict[str, Any]] = []
    if profile:
        specialties_result = await session.execute(
            select(DoctorSpecialty, Specialty)
            .join(Specialty, DoctorSpecialty.specialty_id == Specialty.id)
            .where(DoctorSpecialty.doctor_user_id == user_id)
            .order_by(DoctorSpecialty.is_primary.desc(), DoctorSpecialty.created_at)
        )
        specialties_data = [
            {
                "id": ds.id,
                "doctor_user_id": ds.doctor_user_id,
                "specialty_id": ds.specialty_id,
                "is_primary": ds.is_primary,
                "specialty": {
                    "id": s.id,
                    "nucc_code": s.nucc_code,
                    "value": s.value,
                    "label": s.label,
                    "description": s.description,
                }
            }
            for ds, s in specialties_result.all()
        ]
        
        links_result = await session.execute(
            select(DoctorSocialLink)
            .where(DoctorSocialLink.doctor_profile_id == profile.id)
            .order_by(DoctorSocialLink.display_order, DoctorSocialLink.id)
        )
        social_links = [
            {
                "id": link.id,
                "doctor_profile_id": link.doctor_profile_id,
                "platform": link.platform,
                "url": link.url,
                "display_label": link.display_label,
                "is_visible": link.is_visible,
                "display_order": link.display_order,
                "created_at": link.created_at,
                "updated_at": link.updated_at,
            }
            for link, in links_result.all()
        ]

    return {
        "user": {
            "id": user.id,
            "first_name": user.first_name,
            "middle_name": user.middle_name,
            "last_name": user.last_name,
            "email": user.email,
            "phone": user.phone,
            "emergency_contact": user.emergency_contact,
        },
        "profile": {
            "id": profile.id,
            "user_id": profile.user_id,
            "specialty": profile.specialty,
            "bio": profile.bio,
            "photo_url": profile.photo_url,
            "years_of_experience": profile.years_of_experience,
            "medical_license_number": profile.medical_license_number,
            "board_certifications": profile.board_certifications,
            "languages_spoken": profile.languages_spoken,
            "cover_photo_url": profile.cover_photo_url,
            "accepting_new_patients": profile.accepting_new_patients,
            "offers_virtual_visits": profile.offers_virtual_visits,
            "created_at": profile.created_at,
            "updated_at": profile.updated_at,
            "specialties": specialties_data,
        } if profile else None,
        "clinics": [],  # Empty list for compatibility
        "social_links": social_links,
    }


async def create_doctor_profile(profile_data: dict, user_id: int, session: AsyncSession) -> DoctorProfile:
    """Create a new doctor profile"""
    profile = DoctorProfile(**profile_data, user_id=user_id)
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def update_doctor_profile(
    user_id: int, 
    profile_data: dict, 
    session: AsyncSession
) -> Optional[DoctorProfile]:
    """Update doctor profile"""
    profile = await get_doctor_profile(user_id, session)

    if not profile:
        return None

    # Update fields (allow explicit clearing by passing None)
    for key, value in profile_data.items():
        setattr(profile, key, value)
    
    profile.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(profile)
    return profile


async def update_user_info(
    user_id: int,
    user_data: dict,
    session: AsyncSession
) -> Optional[User]:
    """Update user basic information"""
    user = await session.scalar(select(User).where(User.id == user_id))
    
    if not user:
        return None
    
    # Update fields
    for key, value in user_data.items():
        if value is not None:  # Only update provided fields
            setattr(user, key, value)
    
    user.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(user)
    return user


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in kilometers using Haversine formula."""
    R = 6371  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))
    return R * c


async def list_doctors_with_profiles(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
    specialty: Optional[str] = None,
    patient_latitude: Optional[float] = None,
    patient_longitude: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Return all doctors with their profile information, including all clinic addresses and distances.
    Returns all users with role='doctor' regardless of profile existence or accepting_new_patients status."""
    # Import AccountStatusEnum
    from db.models.user_model import AccountStatusEnum
    
    # Use LEFT JOIN to include all doctors, even those without profiles
    # Exclude deactivated service provider accounts from search
    stmt = (
        select(User, DoctorProfile)
        .outerjoin(DoctorProfile, DoctorProfile.user_id == User.id)
        .where(
            User.role == UserRoleEnum.doctor,
            User.service_provider_status != AccountStatusEnum.deactivated
        )
    )

    if specialty:
        specialty_subquery = select(DoctorSpecialty.doctor_user_id).join(
            Specialty, DoctorSpecialty.specialty_id == Specialty.id
        ).where(
            or_(
                func.lower(Specialty.value) == func.lower(specialty),
                func.lower(Specialty.label) == func.lower(specialty)
            )
        )
        # Handle specialty filter - check both doctor_specialties table and profile specialty field
        specialty_conditions = [User.id.in_(specialty_subquery)]
        # Only check profile specialty if profile exists
        specialty_conditions.append(
            and_(
                DoctorProfile.user_id.is_not(None),
                func.lower(DoctorProfile.specialty) == func.lower(specialty)
            )
        )
        stmt = stmt.where(or_(*specialty_conditions))

    if search:
        search_pattern = f"%{search.lower()}%"
        # Build full name including middle name for better search coverage
        full_name = func.concat(
            func.coalesce(func.lower(User.first_name), ""),
            " ",
            func.coalesce(func.lower(User.middle_name), ""),
            " ",
            func.coalesce(func.lower(User.last_name), "")
        )
        # Also create first+last name for cases where middle name might not be used
        first_last_name = func.concat(
            func.coalesce(func.lower(User.first_name), ""),
            " ",
            func.coalesce(func.lower(User.last_name), "")
        )
        
        specialty_search_subquery = select(DoctorSpecialty.doctor_user_id).join(
            Specialty, DoctorSpecialty.specialty_id == Specialty.id
        ).where(
            or_(
                func.lower(Specialty.label).like(search_pattern),
                func.lower(Specialty.value).like(search_pattern),
                func.lower(Specialty.description).like(search_pattern)
            )
        )
        
        # Build search conditions - handle cases where profile might be None
        search_conditions = [
            func.lower(User.first_name).like(search_pattern),
            func.lower(User.middle_name).like(search_pattern),
            func.lower(User.last_name).like(search_pattern),
            full_name.like(search_pattern),
            first_last_name.like(search_pattern),
            func.lower(User.email).like(search_pattern),
            User.id.in_(specialty_search_subquery)
        ]
        # Only search profile specialty if profile exists
        search_conditions.append(
            and_(
                DoctorProfile.user_id.is_not(None),
                func.lower(DoctorProfile.specialty).like(search_pattern)
            )
        )
        stmt = stmt.where(or_(*search_conditions))

    stmt = stmt.order_by(func.lower(User.last_name), func.lower(User.first_name))
    result = await session.execute(stmt)

    doctors_dict: Dict[int, Dict[str, Any]] = {}
    
    for user, profile in result.all():
        if user.id not in doctors_dict:
            doctors_dict[user.id] = {
                "id": user.id,
                "first_name": user.first_name,
                "middle_name": user.middle_name,
                "last_name": user.last_name,
                "email": user.email,
                "phone": user.phone,
                "specialty": profile.specialty if profile else None,
                "specialties": [],
                "bio": profile.bio if profile else None,
                "photo_url": profile.photo_url if profile else None,
                "years_of_experience": profile.years_of_experience if profile else None,
                "languages_spoken": profile.languages_spoken if profile and profile.languages_spoken is not None else [],
                "board_certifications": profile.board_certifications if profile and profile.board_certifications is not None else [],
                "accepting_new_patients": profile.accepting_new_patients if profile else False,
                "offers_virtual_visits": profile.offers_virtual_visits if profile else False,
                "cover_photo_url": profile.cover_photo_url if profile else None,
                "clinics": [],
                "google_rating": None,
                "google_user_ratings_total": None,
                "distance_km": None,
            }
    
    if doctors_dict:
        addresses_stmt = select(Address).where(
            Address.user_id.in_(list(doctors_dict.keys()))
        ).order_by(Address.is_primary.desc(), Address.id.asc())
        addresses_result = await session.execute(addresses_stmt)
        addresses = addresses_result.scalars().all()
        
        for address in addresses:
            if address.user_id in doctors_dict:
                clinic_data = {
                    "address_id": address.id,
                    "label": address.label,
                    "address_line1": address.address_line1,
                    "address_line2": address.address_line2,
                    "city": address.city,
                    "state": address.state,
                    "postal_code": address.postal_code,
                    "country_code": address.country_code,
                    "latitude": float(address.latitude) if address.latitude else None,
                    "longitude": float(address.longitude) if address.longitude else None,
                    "place_id": address.place_id,
                    "is_primary": address.is_primary,
                    "distance_km": None,
                }
                
                if (
                    patient_latitude
                    and patient_longitude
                    and clinic_data["latitude"]
                    and clinic_data["longitude"]
                ):
                    clinic_data["distance_km"] = round(
                        _haversine_distance_km(
                            patient_latitude,
                            patient_longitude,
                            clinic_data["latitude"],
                            clinic_data["longitude"],
                        ),
                        2,
                    )
                
                doctors_dict[address.user_id]["clinics"].append(clinic_data)
        
        doctor_ids = list(doctors_dict.keys())
        specialties_stmt = select(DoctorSpecialty, Specialty).join(
            Specialty, DoctorSpecialty.specialty_id == Specialty.id
        ).where(DoctorSpecialty.doctor_user_id.in_(doctor_ids)).order_by(
            DoctorSpecialty.is_primary.desc(), DoctorSpecialty.created_at
        )
        specialties_result = await session.execute(specialties_stmt)
        
        for ds, s in specialties_result.all():
            if ds.doctor_user_id in doctors_dict:
                doctors_dict[ds.doctor_user_id]["specialties"].append(s.label)
        
        for doctor_id, doctor_data in doctors_dict.items():
            if doctor_data["clinics"]:
                primary_clinic = next(
                    (c for c in doctor_data["clinics"] if c["is_primary"]),
                    doctor_data["clinics"][0]
                )
                doctor_data["address_line1"] = primary_clinic["address_line1"]
                doctor_data["address_line2"] = primary_clinic["address_line2"]
                doctor_data["city"] = primary_clinic["city"]
                doctor_data["state"] = primary_clinic["state"]
                doctor_data["postal_code"] = primary_clinic["postal_code"]
                doctor_data["country_code"] = primary_clinic["country_code"]
                doctor_data["latitude"] = primary_clinic["latitude"]
                doctor_data["longitude"] = primary_clinic["longitude"]
                doctor_data["place_id"] = primary_clinic["place_id"]
                doctor_data["distance_km"] = primary_clinic["distance_km"]
            else:
                doctor_data["address_line1"] = None
                doctor_data["address_line2"] = None
                doctor_data["city"] = None
                doctor_data["state"] = None
                doctor_data["postal_code"] = None
                doctor_data["country_code"] = None
                doctor_data["latitude"] = None
                doctor_data["longitude"] = None
                doctor_data["place_id"] = None
                doctor_data["distance_km"] = None

    doctors = list(doctors_dict.values())

    if patient_latitude and patient_longitude:
        doctors.sort(
            key=lambda d: (
                d["distance_km"] if d["distance_km"] is not None else float("inf"),
                d["last_name"] or "",
                d["first_name"] or "",
            )
        )

    return doctors


async def list_distinct_specialties(session: AsyncSession) -> List[str]:
    """Return distinct doctor specialties present in the database."""
    stmt = (
        select(func.distinct(DoctorProfile.specialty))
        .where(DoctorProfile.specialty.is_not(None))
        .order_by(func.lower(DoctorProfile.specialty))
    )
    result = await session.execute(stmt)
    return [row[0] for row in result if row[0]]


async def list_social_links(user_id: int, session: AsyncSession) -> List[DoctorSocialLink]:
    """List social links for a doctor's profile."""
    profile = await get_doctor_profile(user_id, session)
    if not profile:
        return []

    result = await session.execute(
        select(DoctorSocialLink)
        .where(DoctorSocialLink.doctor_profile_id == profile.id)
        .order_by(DoctorSocialLink.display_order, DoctorSocialLink.id)
    )
    return [link for (link,) in result.all()]


async def create_social_link(
    user_id: int,
    link_data: dict,
    session: AsyncSession,
) -> DoctorSocialLink:
    """Create a social link for the doctor's profile."""
    profile = await ensure_doctor_profile(user_id, session)

    link = DoctorSocialLink(doctor_profile_id=profile.id, **link_data)
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


async def update_social_link(
    user_id: int,
    link_id: int,
    link_data: dict,
    session: AsyncSession,
) -> Optional[DoctorSocialLink]:
    """Update a social link if it belongs to the doctor's profile."""
    profile = await get_doctor_profile(user_id, session)
    if not profile:
        return None

    result = await session.execute(
        select(DoctorSocialLink)
        .where(
            DoctorSocialLink.id == link_id,
            DoctorSocialLink.doctor_profile_id == profile.id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        return None

    for key, value in link_data.items():
        setattr(link, key, value)

    link.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(link)
    return link


async def delete_social_link(
    user_id: int,
    link_id: int,
    session: AsyncSession,
) -> bool:
    """Delete a social link if it belongs to the doctor."""
    profile = await get_doctor_profile(user_id, session)
    if not profile:
        return False

    result = await session.execute(
        select(DoctorSocialLink)
        .where(
            DoctorSocialLink.id == link_id,
            DoctorSocialLink.doctor_profile_id == profile.id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        return False

    await session.delete(link)
    await session.commit()
    return True
