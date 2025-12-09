from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.models import User, AccountStatusLog, AccountStatusEnum


async def update_account_status(
    user_id: int,
    portal_type: str,  # 'patient' or 'service_provider'
    new_status: str,  # 'active', 'deactivated', 'suspended'
    reason: Optional[str] = None,
    ticket_id: Optional[str] = None,
    changed_by: str = "user",
    session: AsyncSession = None,
) -> Dict[str, Any]:
    """
    Update account status for a user's portal and log the change.
    """
    # Get user
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    # Determine which status field to update
    if portal_type == "patient":
        previous_status = user.patient_status.value if isinstance(user.patient_status, AccountStatusEnum) else str(user.patient_status)
        user.patient_status = AccountStatusEnum(new_status)
        current_status = user.patient_status
    elif portal_type == "service_provider":
        previous_status = user.service_provider_status.value if isinstance(user.service_provider_status, AccountStatusEnum) else str(user.service_provider_status)
        user.service_provider_status = AccountStatusEnum(new_status)
        current_status = user.service_provider_status
    else:
        raise ValueError(f"Invalid portal_type: {portal_type}. Must be 'patient' or 'service_provider'")
    
    # Update suspension fields if suspended
    if new_status == "suspended":
        user.suspension_reason = reason
        user.suspension_ticket_id = ticket_id
    elif new_status != "suspended":
        # Clear suspension fields if not suspended
        if portal_type == "patient" or (portal_type == "service_provider" and user.patient_status != AccountStatusEnum.suspended):
            user.suspension_reason = None
            user.suspension_ticket_id = None
    
    # Create status log entry
    status_log = AccountStatusLog(
        user_id=user_id,
        portal_type=portal_type,
        previous_status=previous_status,
        new_status=new_status,
        reason=reason,
        ticket_id=ticket_id,
        changed_by=changed_by,
    )
    session.add(status_log)
    
    await session.commit()
    await session.refresh(user)
    
    return {
        "user_id": user.id,
        "portal_type": portal_type,
        "status": new_status,
        "previous_status": previous_status,
    }


async def get_account_status(user_id: int, session: AsyncSession) -> Dict[str, Any]:
    """
    Get current account status for a user.
    """
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        return None
    
    patient_status = user.patient_status.value if isinstance(user.patient_status, AccountStatusEnum) else str(user.patient_status)
    service_provider_status = user.service_provider_status.value if isinstance(user.service_provider_status, AccountStatusEnum) else str(user.service_provider_status)
    
    return {
        "user_id": user.id,
        "patient_status": patient_status,
        "service_provider_status": service_provider_status,
        "suspension_reason": user.suspension_reason,
        "suspension_ticket_id": user.suspension_ticket_id,
    }


async def get_account_status_logs(
    user_id: int,
    portal_type: Optional[str] = None,
    session: AsyncSession = None,
) -> list[Dict[str, Any]]:
    """
    Get account status change logs for a user.
    """
    stmt = select(AccountStatusLog).where(AccountStatusLog.user_id == user_id)
    
    if portal_type:
        stmt = stmt.where(AccountStatusLog.portal_type == portal_type)
    
    stmt = stmt.order_by(AccountStatusLog.created_at.desc())
    
    result = await session.execute(stmt)
    logs = result.scalars().all()
    
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "portal_type": log.portal_type,
            "previous_status": log.previous_status,
            "new_status": log.new_status,
            "reason": log.reason,
            "ticket_id": log.ticket_id,
            "changed_by": log.changed_by,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]

