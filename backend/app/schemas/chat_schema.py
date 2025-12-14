"""
Pydantic schemas for chat system.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


# Conversation Schemas
class ConversationBase(BaseModel):
    conversation_type: str = Field(..., description="Type of conversation: direct, appointment, or support")
    appointment_id: Optional[int] = Field(None, description="Associated appointment ID if applicable")


class ConversationCreate(ConversationBase):
    participant_user_ids: List[int] = Field(..., description="List of user IDs to add as participants")


class ConversationResponse(ConversationBase):
    conversation_id: UUID
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ConversationWithParticipants(ConversationResponse):
    participants: List["ParticipantResponse"] = []


# Participant Schemas
class ParticipantResponse(BaseModel):
    participant_id: UUID
    user_id: int
    joined_at: datetime
    last_read_at: Optional[datetime]
    is_active: bool
    
    class Config:
        from_attributes = True


# Message Schemas
class MessageBase(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000, description="Message content")
    message_type: str = Field("text", description="Type of message: text, image, file, or system")
    attachment_url: Optional[str] = Field(None, description="URL to attachment if applicable")


class MessageCreate(MessageBase):
    # conversation_id is in the URL path, not the body
    # Allow extra fields for frontend compatibility (e.g., attachment_metadata)
    class Config:
        extra = "ignore"
        from_attributes = True


class MessageResponse(MessageBase):
    message_id: UUID
    conversation_id: UUID
    sender_id: int
    is_edited: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    read_by: List[int] = Field(default_factory=list, description="List of user IDs who have read this message")
    
    class Config:
        from_attributes = True


class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)


# WebSocket Message Schemas
class WebSocketMessage(BaseModel):
    """Schema for WebSocket message payload."""
    type: str = Field(..., description="Message type: send_message, typing, read_receipt, etc.")
    conversation_id: Optional[UUID] = None
    content: Optional[str] = None
    message_id: Optional[UUID] = None
    data: Optional[dict] = None


class WebSocketResponse(BaseModel):
    """Schema for WebSocket response."""
    type: str
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None


# Typing Indicator
class TypingIndicator(BaseModel):
    conversation_id: UUID
    user_id: int
    is_typing: bool


# Read Receipt
class ReadReceiptCreate(BaseModel):
    message_id: UUID
    conversation_id: UUID


# Conversation List Response
class ConversationListItem(BaseModel):
    conversation_id: UUID
    conversation_type: str
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0
    participants: List[ParticipantResponse] = []
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Pagination
class PaginatedMessages(BaseModel):
    messages: List[MessageResponse]
    total: int
    page: int
    page_size: int
    has_more: bool

