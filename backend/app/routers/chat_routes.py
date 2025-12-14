"""
Chat routes - REST API and WebSocket endpoints for chat system.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID
from db.database import get_session
from db.crud import chat_crud
from services.websocket_manager import manager, authenticate_websocket
from services.chat_service import (
    send_message,
    get_conversation_messages_cached,
    get_user_conversations_cached,
    mark_conversation_as_read,
    handle_typing_indicator,
)
from schemas.chat_schema import (
    ConversationCreate,
    ConversationResponse,
    ConversationWithParticipants,
    MessageCreate,
    MessageResponse,
    MessageUpdate,
    ConversationListItem,
    PaginatedMessages,
    WebSocketMessage,
    WebSocketResponse,
    ReadReceiptCreate,
)
from routers.auth_routes import get_current_user
from db.models.user_model import User
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# REST API Routes

@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    conversation_data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new conversation."""
    # Ensure current user is in participants
    if current_user.user_id not in conversation_data.participant_user_ids:
        conversation_data.participant_user_ids.append(current_user.user_id)
    
    conversation = await chat_crud.create_conversation(
        conversation_type=conversation_data.conversation_type,
        participant_user_ids=conversation_data.participant_user_ids,
        appointment_id=conversation_data.appointment_id,
        session=session,
    )
    
    return ConversationResponse(
        conversation_id=conversation.conversation_id,
        conversation_type=conversation.conversation_type,
        appointment_id=conversation.appointment_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.get("/conversations", response_model=List[ConversationListItem])
async def get_conversations(
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    """Get all conversations for the current user."""
    try:
        conversations = await get_user_conversations_cached(
            user_id=current_user.user_id,
            session=session,
            limit=limit,
            offset=offset,
        )
        return conversations
    except Exception as e:
        logger.error(f"Error getting conversations for user {current_user.user_id}: {e}")
        # Return empty list instead of error to prevent frontend crash
        return []


@router.get("/conversations/{conversation_id}", response_model=ConversationWithParticipants)
async def get_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a specific conversation with participants."""
    conversation = await chat_crud.get_conversation_by_id(conversation_id, session)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    
    # Check if user is a participant
    is_participant = any(
        p.user_id == current_user.user_id and p.is_active
        for p in conversation.participants
    )
    if not is_participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this conversation",
        )
    
    participants = [
        {
            "participant_id": p.participant_id,
            "user_id": p.user_id,
            "joined_at": p.joined_at,
            "last_read_at": p.last_read_at,
            "is_active": p.is_active,
        }
        for p in conversation.participants
    ]
    
    return ConversationWithParticipants(
        conversation_id=conversation.conversation_id,
        conversation_type=conversation.conversation_type,
        appointment_id=conversation.appointment_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        participants=participants,
    )


@router.get("/conversations/{conversation_id}/messages", response_model=PaginatedMessages)
async def get_messages(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    before_message_id: Optional[UUID] = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Get messages for a conversation."""
    # Verify user is a participant
    conversation = await chat_crud.get_conversation_by_id(conversation_id, session)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    
    is_participant = any(
        p.user_id == current_user.user_id and p.is_active
        for p in conversation.participants
    )
    if not is_participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this conversation",
        )
    
    messages = await get_conversation_messages_cached(
        conversation_id=conversation_id,
        session=session,
        limit=limit,
        offset=offset,
        before_message_id=before_message_id,
    )
    
    # Get total count (approximate for pagination)
    total_messages = await chat_crud.get_conversation_messages(
        conversation_id=conversation_id,
        session=session,
        limit=10000,  # Large limit to get count
    )
    
    return PaginatedMessages(
        messages=messages,
        total=len(total_messages),
        page=offset // limit + 1,
        page_size=limit,
        has_more=len(messages) == limit,
    )


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    conversation_id: UUID,
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Send a message in a conversation."""
    # Verify user is a participant
    conversation = await chat_crud.get_conversation_by_id(conversation_id, session)
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    
    is_participant = any(
        p.user_id == current_user.user_id and p.is_active
        for p in conversation.participants
    )
    if not is_participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this conversation",
        )
    
    return await send_message(
        conversation_id=conversation_id,
        sender_id=current_user.user_id,
        content=message_data.content,
        message_type=message_data.message_type,
        attachment_url=message_data.attachment_url,
        session=session,
    )


@router.put("/messages/{message_id}", response_model=MessageResponse)
async def update_message(
    message_id: UUID,
    message_data: MessageUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update a message."""
    message = await chat_crud.get_message_by_id(message_id, session)
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )
    
    if message.sender_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own messages",
        )
    
    updated_message = await chat_crud.update_message(
        message_id=message_id,
        content=message_data.content,
        session=session,
    )
    
    if not updated_message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )
    
    read_by = await chat_crud.get_message_read_by_users(message_id, session)
    
    return MessageResponse(
        message_id=updated_message.message_id,
        conversation_id=updated_message.conversation_id,
        sender_id=updated_message.sender_id,
        content=updated_message.content,
        message_type=updated_message.message_type,
        attachment_url=updated_message.attachment_url,
        is_edited=updated_message.is_edited,
        is_deleted=updated_message.is_deleted,
        created_at=updated_message.created_at,
        updated_at=updated_message.updated_at,
        read_by=read_by,
    )


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a message (soft delete)."""
    message = await chat_crud.get_message_by_id(message_id, session)
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )
    
    if message.sender_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own messages",
        )
    
    await chat_crud.delete_message(message_id, session)


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_as_read(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Mark all messages in a conversation as read."""
    await mark_conversation_as_read(
        conversation_id=conversation_id,
        user_id=current_user.user_id,
        session=session,
    )


@router.get("/conversations/{conversation_id}/unread-count", response_model=dict)
async def get_unread_count(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get unread message count for a conversation."""
    count = await chat_crud.get_unread_message_count(
        conversation_id=conversation_id,
        user_id=current_user.user_id,
        session=session,
    )
    return {"unread_count": count}


# WebSocket Route

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time chat.
    Handles: send_message, typing, read_receipt
    """
    # Authenticate connection
    user_id = await authenticate_websocket(websocket)
    if not user_id:
        return
    
    # Connect user
    await manager.connect(websocket, user_id)
    
    try:
        # Send connection confirmation
        await manager.send_to_connection(
            {
                "type": "connected",
                "success": True,
                "data": {"user_id": user_id},
            },
            websocket,
        )
        
        # Listen for messages
        while True:
            try:
                # Receive message from client
                data = await websocket.receive_text()
                message_data = json.loads(data)
                
                message_type = message_data.get("type")
                
                if message_type == "send_message":
                    # Handle message sending via REST API (better for validation)
                    await manager.send_to_connection(
                        {
                            "type": "error",
                            "success": False,
                            "error": "Use REST API /conversations/{id}/messages to send messages",
                        },
                        websocket,
                    )
                
                elif message_type == "typing":
                    conversation_id = UUID(message_data.get("conversation_id"))
                    is_typing = message_data.get("is_typing", False)
                    from db.database import sessionLocal
                    async with sessionLocal() as session:
                        await handle_typing_indicator(conversation_id, user_id, is_typing, session)
                
                elif message_type == "read_receipt":
                    conversation_id = UUID(message_data.get("conversation_id"))
                    # Get session for database operations
                    from db.database import sessionLocal
                    async with sessionLocal() as session:
                        await mark_conversation_as_read(conversation_id, user_id, session)
                
                else:
                    await manager.send_to_connection(
                        {
                            "type": "error",
                            "success": False,
                            "error": f"Unknown message type: {message_type}",
                        },
                        websocket,
                    )
            
            except json.JSONDecodeError:
                await manager.send_to_connection(
                    {
                        "type": "error",
                        "success": False,
                        "error": "Invalid JSON format",
                    },
                    websocket,
                )
            except Exception as e:
                logger.error(f"Error handling WebSocket message: {e}")
                await manager.send_to_connection(
                    {
                        "type": "error",
                        "success": False,
                        "error": str(e),
                    },
                    websocket,
                )
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"WebSocket disconnected for user {user_id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(websocket)

