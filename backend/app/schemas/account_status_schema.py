from pydantic import BaseModel, Field
from typing import Optional


class AccountDeactivateRequest(BaseModel):
    portal_type: str = Field(..., description="Portal type: 'patient' or 'service_provider'")
    reason: Optional[str] = Field(None, description="Reason for deactivation")
    feedback: Optional[str] = Field(None, description="User feedback about deactivation")


class AccountReactivateRequest(BaseModel):
    portal_type: str = Field(..., description="Portal type: 'patient' or 'service_provider'")


class AccountStatusResponse(BaseModel):
    user_id: int
    portal_type: str
    status: str
    previous_status: Optional[str] = None


class AccountStatusInfo(BaseModel):
    user_id: int
    patient_status: str
    service_provider_status: str
    suspension_reason: Optional[str] = None
    suspension_ticket_id: Optional[str] = None


class AccountStatusLogEntry(BaseModel):
    id: int
    user_id: int
    portal_type: str
    previous_status: str
    new_status: str
    reason: Optional[str] = None
    ticket_id: Optional[str] = None
    changed_by: str
    created_at: Optional[str] = None

