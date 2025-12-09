from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from db.crud import auth_crud as crud, address_crud
from schemas import (
    CreateUser,
    UserLogin,
    ReadUser,
    OTPVerification,
    AddressUpdate,
    AddressRead,
)
from services import create_tokens, hash_password, verify_password, verify_access_token
from datetime import datetime
import json
from core import config

router = APIRouter()

ACCESS_TOKEN_MAX_AGE = config.ACCESS_TOKEN_EXPIRE_MIN * 60


# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check endpoint for container orchestration."""
    return {"status": "healthy", "service": "medilink-backend"}


# Dependency to get current user from access token
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

    user = await crud.get_user_by_id(user_id, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    return user


# API Endpoints
@router.post("/signup", response_model=ReadUser)
async def create_user(user: CreateUser, session: AsyncSession = Depends(get_session)):
    # Determine if this is a patient or service provider account
    is_patient_account = user.role == "patient"
    service_provider_role = user.role if not is_patient_account else None
    
    # Check if email already exists (phone number is not unique - can be used for multiple accounts)
    existing_user_by_email = await crud.check_user_by_email(user.email, session)
    
    if existing_user_by_email:
        # Email exists - check if we can add the complementary role
        existing_is_patient = existing_user_by_email.is_patient
        existing_role = existing_user_by_email.role
        existing_role_value = existing_role.value if existing_role and hasattr(existing_role, 'value') else str(existing_role) if existing_role else None
        
        if is_patient_account:
            # Trying to create patient account
            if existing_is_patient:
                # Already has patient account - error
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use! Please sign in"
                )
            else:
                # Email exists as service provider - can add patient account via signup
                # Verify password matches
                if not await verify_password(user.password, existing_user_by_email.password_hash):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid password. Please use the correct password for this email."
                    )
                # Update existing user to add patient account
                updated_user = await crud.update_user_patient_status(existing_user_by_email.id, True, session)
                if not updated_user:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create patient account"
                    )
                # Return the updated user
                return ReadUser(
                    id=updated_user.id,
                    first_name=updated_user.first_name,
                    last_name=updated_user.last_name,
                    email=updated_user.email,
                    phone=updated_user.phone,
                    role=None,
                    is_patient=True,
                    accepted_terms=updated_user.accepted_terms,
                    created_at=updated_user.created_at,
                    updated_at=updated_user.updated_at,
                )
        else:
            # Trying to create service provider account
            if existing_role_value:
                # Already has a service provider role - cannot change
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use! Please sign in"
                )
            else:
                # Email exists as patient only - can add service provider role via signup
                # Verify password matches
                if not await verify_password(user.password, existing_user_by_email.password_hash):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid password. Please use the correct password for this email."
                    )
                # Update existing user to add service provider role
                # Import UserRoleEnum for proper enum assignment
                from db.models.user_model import UserRoleEnum
                if service_provider_role == "doctor":
                    existing_user_by_email.role = UserRoleEnum.doctor
                elif service_provider_role == "pharmacist":
                    existing_user_by_email.role = UserRoleEnum.pharmacist
                elif service_provider_role == "insurer":
                    existing_user_by_email.role = UserRoleEnum.insurer
                # Keep existing patient status (is_patient=True) - user can have both
                existing_user_by_email.is_patient = existing_is_patient
                await session.commit()
                await session.refresh(existing_user_by_email)
                # Return the updated user
                return ReadUser(
                    id=existing_user_by_email.id,
                    first_name=existing_user_by_email.first_name,
                    last_name=existing_user_by_email.last_name,
                    email=existing_user_by_email.email,
                    phone=existing_user_by_email.phone,
                    role=service_provider_role,
                    is_patient=existing_user_by_email.is_patient,
                    accepted_terms=existing_user_by_email.accepted_terms,
                    created_at=existing_user_by_email.created_at,
                    updated_at=existing_user_by_email.updated_at,
                )
    
    # Prepare user data for creation
    hashed = await hash_password(user.password)
    user_data_dict = user.model_dump(exclude={"password"})
    
    # Set is_patient and role based on account type
    if is_patient_account:
        user_data_dict["is_patient"] = True
        user_data_dict["role"] = None
    else:
        user_data_dict["is_patient"] = False
        user_data_dict["role"] = service_provider_role
    
    return await crud.create_user(user_data_dict, hashed, session)


@router.post("/login")
async def user_login(
    user: UserLogin, response: Response, session: AsyncSession = Depends(get_session)
):
    # Get the selected role from login request (normalized to lowercase)
    selected_role = user.role.lower() if user.role else None
    
    # Verify user credentials - find user by email or phone
    validated_user = await crud.login_user(user, session)
    if not validated_user or not await verify_password(
        user.password, validated_user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    
    # Check if user is a patient account
    is_existing_patient = validated_user.is_patient
    existing_role = validated_user.role
    # Convert role enum to string value (e.g., UserRoleEnum.doctor -> "doctor")
    existing_role_value = existing_role.value if existing_role and hasattr(existing_role, 'value') else str(existing_role) if existing_role else None
    # Convert role to capitalized string for display (e.g., "doctor" -> "Doctor")
    existing_role_str = existing_role_value.capitalize() if existing_role_value else None
    
    # Check account status based on selected role (only if columns exist)
    # Handle case where migration hasn't run yet - default to active status
    try:
        patient_status = validated_user.patient_status.value if hasattr(validated_user.patient_status, 'value') else str(validated_user.patient_status) if hasattr(validated_user, 'patient_status') else "active"
        service_provider_status = validated_user.service_provider_status.value if hasattr(validated_user.service_provider_status, 'value') else str(validated_user.service_provider_status) if hasattr(validated_user, 'service_provider_status') else "active"
    except (AttributeError, KeyError):
        # Migration hasn't run yet - default to active
        patient_status = "active"
        service_provider_status = "active"
    
    # Check if account is suspended (suspension affects both portals)
    if patient_status == "suspended" or service_provider_status == "suspended":
        suspension_reason = getattr(validated_user, 'suspension_reason', None)
        suspension_ticket_id = getattr(validated_user, 'suspension_ticket_id', None)
        return Response(
            status_code=status.HTTP_403_FORBIDDEN,
            content=json.dumps({
                "msg": "This account has been suspended",
                "account_status": "suspended",
                "suspension_reason": suspension_reason,
                "suspension_ticket_id": suspension_ticket_id,
                "support_email": "support@medilink.com",
            }),
            media_type="application/json",
        )
    
    # Check if trying to login to deactivated portal
    if selected_role == "patient" and patient_status == "deactivated":
        return Response(
            status_code=status.HTTP_403_FORBIDDEN,
            content=json.dumps({
                "msg": "This account is disabled",
                "account_status": "deactivated",
                "portal_type": "patient",
                "can_reactivate": True,
            }),
            media_type="application/json",
        )
    
    if selected_role in ["doctor", "pharmacist", "insurer"] and service_provider_status == "deactivated":
        return Response(
            status_code=status.HTTP_403_FORBIDDEN,
            content=json.dumps({
                "msg": "This account is disabled",
                "account_status": "deactivated",
                "portal_type": "service_provider",
                "can_reactivate": True,
            }),
            media_type="application/json",
        )
    
    # Determine role for token based on selected role and existing account
    role_for_token = None
    
    # Handle role logic based on existing account and selected role
    if selected_role == "patient":
        # User selected patient role
        if is_existing_patient:
            # User has patient account - login as patient
            role_for_token = "patient"
        else:
            # User selected patient but only has service provider account
            # Return special response with two options
            return Response(
                status_code=status.HTTP_200_OK,
                content=json.dumps({
                    "msg": f"Email already registered as {existing_role_str}",
                    "requires_action": True,
                    "action_type": "service_provider_to_patient",
                    "options": {
                        "option1": {
                            "action": "continue_with_service_provider",
                            "label": f"Continue as a {existing_role_str}",
                            "role": existing_role_value
                        },
                        "option2": {
                            "action": "create_patient_account",
                            "label": "Create patient account"
                        }
                    },
                    "user": {
                        "id": validated_user.id,
                        "email": validated_user.email,
                        "is_patient": False,
                        "role": existing_role_value
                    }
                }),
                media_type="application/json",
            )
    elif selected_role in ["doctor", "pharmacist", "insurer"]:
        # User selected a service provider role
        if existing_role_value:
            # User has a service provider role
            if selected_role == existing_role_value:
                # User selected matching service provider role - login as that role
                role_for_token = selected_role
            else:
                # User selected different service provider role - error
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Email already registered with {existing_role_str} role"
                )
        else:
            # User doesn't have service provider role (only patient or new)
            if is_existing_patient:
                # Email exists as patient only - show options
                return Response(
                    status_code=status.HTTP_200_OK,
                    content=json.dumps({
                        "msg": "Email already registered as patient",
                        "requires_action": True,
                        "action_type": "patient_to_service_provider",
                        "options": {
                            "option1": {
                                "action": "go_to_patient_dashboard",
                                "label": "Go to patient dashboard"
                            },
                            "option2": {
                                "action": "create_service_provider_account",
                                "label": f"Create {selected_role} account",
                                "role": selected_role
                            }
                        },
                        "user": {
                            "id": validated_user.id,
                            "email": validated_user.email,
                            "is_patient": True,
                            "role": None
                        }
                    }),
                    media_type="application/json",
                )
            else:
                # This shouldn't happen - user exists but no role and not patient
                role_for_token = selected_role
    else:
        # No role selected - default to patient if they have patient account
        role_for_token = "patient" if is_existing_patient else (existing_role_value or "patient")
    
    # Ensure role_for_token is set
    if not role_for_token:
        role_for_token = "patient" if is_existing_patient else (existing_role_value or "patient")
    
    # 2FA DISABLED: Create tokens directly after password verification
    # create tokens
    access_token, refresh_token, refresh_exp = await create_tokens(
        validated_user.id, role_for_token
    )
    # hash refresh_token
    hashed_refresh_token = await hash_password(refresh_token)
    # store session in db
    await crud.create_session(
        validated_user.id, hashed_refresh_token, refresh_exp, session
    )

    # Access Token (short-lived)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="Lax",
        path="/",  # Set path to root so it works with rewrites
        max_age=ACCESS_TOKEN_MAX_AGE,
    )

    # Refresh Token (long-lived)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="Lax",
        path="/",  # Set path to root so it works with rewrites
        expires=refresh_exp,  # Uses the calculated datetime for long expiry
    )

    # Return user data in response to avoid immediate getCurrentUser call
    # Note: Cookies are already set on the response parameter, so return a dict
    # FastAPI will use the response parameter with cookies set
    return {
        "msg": "Login successful",
        "user_id": validated_user.id,
        "user": {
            "id": validated_user.id,
            "first_name": validated_user.first_name,
            "last_name": validated_user.last_name,
            "email": validated_user.email,
            "phone": validated_user.phone,
            "role": role_for_token,
            "is_patient": is_existing_patient,
            "accepted_terms": validated_user.accepted_terms,
        }
    }


@router.post("/create-patient-account")
async def create_patient_account(
    user_login: UserLogin, response: Response, session: AsyncSession = Depends(get_session)
):
    """Create patient account for existing service provider email"""
    # Verify user credentials first
    validated_user = await crud.login_user(user_login, session)
    if not validated_user or not await verify_password(
        user_login.password, validated_user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    
    # Check if user already has patient account
    if validated_user.is_patient:
        # Already has patient account - just login as patient
        role_for_token = "patient"
    else:
        # Update user to add patient account
        updated_user = await crud.update_user_patient_status(validated_user.id, True, session)
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create patient account"
            )
        role_for_token = "patient"
    
    # Create tokens and proceed with login
    access_token, refresh_token, refresh_exp = await create_tokens(
        validated_user.id, role_for_token
    )
    hashed_refresh_token = await hash_password(refresh_token)
    await crud.create_session(
        validated_user.id, hashed_refresh_token, refresh_exp, session
    )
    
    # Set cookies
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="Lax",
        path="/",
        max_age=ACCESS_TOKEN_MAX_AGE,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="Lax",
        path="/",
        expires=refresh_exp,
    )
    
    # Return user data
    return Response(
        status_code=status.HTTP_200_OK,
        content=json.dumps({
            "msg": "Patient account created successfully",
            "user_id": validated_user.id,
            "user": {
                "id": validated_user.id,
                "first_name": validated_user.first_name,
                "last_name": validated_user.last_name,
                "email": validated_user.email,
                "phone": validated_user.phone,
                "role": role_for_token,
                "is_patient": True,
                "accepted_terms": validated_user.accepted_terms,
            }
        }),
        media_type="application/json",
    )


@router.post("/verify-account")
async def verify_account(
    userdata: OTPVerification,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    is_otp_valid = await crud.verify_otp(
        userdata.user_id, userdata.identifier, userdata.otp_code, session
    )
    if not is_otp_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="OTP verification failed"
        )
    # Fetch User data using the ID linked in the OTP record
    current_user_data = await crud.current_user(userdata.identifier, session)

    # Handle role for token creation (patient accounts have role=None)
    role_for_token = "patient" if current_user_data.is_patient else (current_user_data.role or "patient")

    # create tokens
    access_token, refresh_token, refresh_exp = await create_tokens(
        current_user_data.id, role_for_token
    )
    # hash refresh_token
    hashed_refresh_token = await hash_password(refresh_token)
    # store session in db
    await crud.create_session(
        current_user_data.id, hashed_refresh_token, refresh_exp, session
    )

    # Access Token (short-lived)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="Lax",
        path="/",  # Set path to root so it works with rewrites
        max_age=ACCESS_TOKEN_MAX_AGE,
    )

    # Refresh Token (long-lived)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,
        samesite="Lax",
        path="/",  # Set path to root so it works with rewrites
        expires=refresh_exp,  # Uses the calculated datetime for long expiry
    )

    # Return user data in response
    # Return role_for_token for frontend (patient accounts have role=None in DB)
    return {
        "msg": "OTP verification successful",
        "user": {
            "id": current_user_data.id,
            "first_name": current_user_data.first_name,
            "last_name": current_user_data.last_name,
            "email": current_user_data.email,
            "phone": current_user_data.phone,
            "role": role_for_token,
            "is_patient": current_user_data.is_patient,
            "accepted_terms": current_user_data.accepted_terms,
        }
    }


@router.post("/token/refresh", tags=["auth"])
async def refresh_access_token(
    response: Response,
    # 1. Access the Refresh Token sent in the cookie
    refresh_token: str = Cookie(None),
    session: AsyncSession = Depends(get_session),
):
    # --- 401 Unauthorized Checks ---
    if not refresh_token:
        # Deny access if the refresh cookie is missing
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required for renewal.",
        )

    # 2. Hash the received token to check against the database hash
    hashed_incoming_token = await hash_password(refresh_token)

    # 3. Query the DB for an active session matching the hashed token
    result = await crud.active_sessions(hashed_incoming_token, session)
    db_session = result[0] if result else None

    if not db_session:
        # Token might be fake or revoked
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked token.")

    # 4. Check if the session has expired (Server-side expiry check)
    if db_session.expires_at < datetime.utcnow():
        # Clean up the expired record
        await crud.delete_session(db_session, session)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Session expired, please log in again."
        )

    # --- Token Renewal ---

    # 5. Fetch the user associated with the session
    user = await crud.get_user_by_id(db_session.user_id, session)
    if not user:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "User associated with session not found."
        )

    # 6. Generate a NEW Access Token
    # Handle role for token creation (patient accounts have role=None)
    role_for_token = "patient" if user.is_patient else (user.role or "patient")
    access_token, _, _ = await create_tokens(user.id, role_for_token)

    # 7. Set the NEW Access Token in the response cookie (OVERWRITING the expired one)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,
        samesite="Lax",
        max_age=ACCESS_TOKEN_MAX_AGE,
    )

    return {"msg": "Access token refreshed successfully."}


@router.get("/me", response_model=ReadUser)
async def get_me(current_user = Depends(get_current_user)):
    """Get current authenticated user's information."""
    # ReadUser has from_attributes=True, so we can use model_validate
    # But we need to handle the role enum conversion from UserRoleEnum to UserRole
    from schemas.user_schema import UserRole
    
    # Convert role if present
    role_value = None
    if current_user.role:
        role_value = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
        try:
            role_value = UserRole(role_value.lower())
        except (ValueError, AttributeError):
            role_value = None
    
    # Use model_validate with role override
    try:
        user_data = ReadUser.model_validate(current_user, from_attributes=True)
        # Override role if we converted it
        if role_value is not None:
            user_data.role = role_value
        return user_data
    except Exception as e:
        # Fallback: manual construction
        return ReadUser(
            id=current_user.id,
            first_name=current_user.first_name,
            middle_name=current_user.middle_name,
            last_name=current_user.last_name,
            email=current_user.email,
            phone=current_user.phone,
            emergency_contact=current_user.emergency_contact,
            role=role_value,
            is_patient=current_user.is_patient,
            accepted_terms=current_user.accepted_terms,
            created_at=current_user.created_at,
            updated_at=current_user.updated_at,
        )


@router.get("/address", response_model=AddressRead | None)
async def get_my_address(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return the current user's primary address, if one exists.
    Shared by both doctor and patient account settings pages.
    """
    address = await address_crud.get_primary_address_for_user(current_user.id, session)
    return address


@router.put("/address", response_model=AddressRead)
async def upsert_my_address(
    payload: AddressUpdate,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Create or update the current user's primary address.

    At minimum, address_line1 and city must be provided; other fields are optional.
    """
    data = payload.model_dump(exclude_unset=True)

    required_fields = ["address_line1", "city"]
    if any(not data.get(field) for field in required_fields):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="address_line1 and city are required fields.",
        )

    # Normalize basic fields
    if "country_code" in data and data["country_code"]:
        data["country_code"] = data["country_code"].upper()

    # For now, mark the source as manual; geocoding can be layered later.
    data.setdefault("location_source", "manual")

    # Remove raw_geocoding_payload if it's None to avoid type mismatch
    if "raw_geocoding_payload" in data and data["raw_geocoding_payload"] is None:
        del data["raw_geocoding_payload"]

    address = await address_crud.upsert_primary_address_for_user(
        current_user.id, data, session
    )
    return address
