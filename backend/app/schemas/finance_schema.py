from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime


# ==================== Doctor Service Schemas ====================

class DoctorServiceCreate(BaseModel):
    service_name: str = Field(..., min_length=1, max_length=200, description="Name of the service")
    description: Optional[str] = Field(None, description="Description of the service")
    price: float = Field(..., gt=0, description="Price of the service")


class DoctorServiceUpdate(BaseModel):
    service_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    price: Optional[float] = Field(None, gt=0)
    is_active: Optional[bool] = None


class DoctorServiceRead(BaseModel):
    id: int
    doctor_user_id: int
    service_name: str
    description: Optional[str]
    price: float
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Saved Payment Card Schemas ====================

class SavedPaymentCardCreate(BaseModel):
    card_last_four: str = Field(..., min_length=4, max_length=4, description="Last 4 digits of card")
    card_brand: str = Field(..., min_length=1, max_length=50, description="Card brand (Visa, Mastercard, etc.)")
    expiry_month: int = Field(..., ge=1, le=12, description="Expiry month (1-12)")
    expiry_year: int = Field(..., ge=2024, description="Expiry year")
    cardholder_name: Optional[str] = Field(None, max_length=200, description="Cardholder name")
    is_default: bool = Field(False, description="Set as default card")


class SavedPaymentCardRead(BaseModel):
    id: int
    patient_user_id: int
    card_last_four: str
    card_brand: str
    expiry_month: int
    expiry_year: int
    cardholder_name: Optional[str]
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Payment Schemas ====================

class PaymentRead(BaseModel):
    id: int
    appointment_id: int
    doctor_user_id: int
    patient_user_id: int
    service_id: Optional[int]
    base_amount: float
    discount_amount: float
    final_amount: float
    payment_method: str
    payment_status: str
    transaction_id: Optional[str]
    saved_card_id: Optional[int]
    cheque_batch_id: Optional[int]
    insurance_batch_id: Optional[int]
    insurance_policy_id: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentWithDetails(PaymentRead):
    """Payment with related appointment and service details"""
    appointment_date: Optional[datetime] = None
    appointment_status: Optional[str] = None
    service_name: Optional[str] = None
    doctor_name: Optional[str] = None
    patient_name: Optional[str] = None


class OnlinePaymentRequest(BaseModel):
    appointment_id: int
    card_last_four: str = Field(..., min_length=4, max_length=4)
    card_brand: str = Field(..., min_length=1, max_length=50)
    expiry_month: int = Field(..., ge=1, le=12)
    expiry_year: int = Field(..., ge=2024)
    cardholder_name: Optional[str] = Field(None, max_length=200)
    save_card: bool = Field(False, description="Save card for future use")


class ChequePaymentRequest(BaseModel):
    appointment_id: int


class InsurancePaymentRequest(BaseModel):
    appointment_id: int
    insurance_policy_id: str = Field(..., description="UUID of the insurance policy")


# ==================== Pending Payment Schemas ====================

class PendingPaymentItem(BaseModel):
    """Appointment with payment information for patient/doctor dashboard"""
    appointment_id: int
    appointment_date: datetime
    appointment_status: str
    doctor_user_id: int
    doctor_name: str
    doctor_photo_url: Optional[str]
    patient_user_id: int
    patient_name: str
    service_id: Optional[int]
    service_name: Optional[str]
    base_amount: float
    discount_amount: float
    final_amount: float
    payment_id: Optional[int]
    payment_status: Optional[str]
    payment_method: Optional[str]
    payment_created_at: Optional[datetime] = None  # When payment record was created
    payment_updated_at: Optional[datetime] = None  # When payment was last updated/completed

    class Config:
        from_attributes = True

