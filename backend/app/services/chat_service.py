"""
Chat service - business logic layer for chat system.
Handles message sending, caching, and WebSocket broadcasting.
"""
import json
import logging
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import sessionLocal
from db.crud import chat_crud
from services.websocket_manager import manager
from services.message_queue import publish_new_message, publish_typing_indicator
from services.redis_service import (
    get_cache,
    set_cache,
    delete_cache,
    invalidate_conversation_cache,
)
from schemas.chat_schema import (
    MessageResponse,
    ConversationResponse,
    ConversationListItem,
    MessageCreate,
    ParticipantResponse,
)

logger = logging.getLogger(__name__)

# Cache TTL (5 minutes)
CACHE_TTL = 300


async def send_message(
    conversation_id: UUID,
    sender_id: int,
    content: str,
    message_type: str = "text",
    attachment_url: Optional[str] = None,
    session: AsyncSession = None,
) -> MessageResponse:
    """
    Send a message: persist to DB, update cache, broadcast via WebSocket.
    """
    # 1. Create message in database
    message = await chat_crud.create_message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        content=content,
        message_type=message_type,
        attachment_url=attachment_url,
        session=session,
    )
    
    # 2. Get conversation participants
    conversation = await chat_crud.get_conversation_by_id(conversation_id, session)
    if not conversation:
        raise ValueError(f"Conversation {conversation_id} not found")
    
    participant_user_ids = [p.user_id for p in conversation.participants if p.is_active]
    
    # 3. Get read receipts
    read_by = await chat_crud.get_message_read_by_users(message.message_id, session)
    
    # 4. Build message response
    message_response = MessageResponse(
        message_id=message.message_id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        content=message.content,
        message_type=message.message_type,
        attachment_url=message.attachment_url,
        is_edited=message.is_edited,
        is_deleted=message.is_deleted,
        created_at=message.created_at,
        updated_at=message.updated_at,
        read_by=read_by,
    )
    
    # 5. Invalidate cache
    await invalidate_conversation_cache(str(conversation_id))
    
    # 6. Publish to message queue
    message_data = {
        "message_id": str(message.message_id),
        "conversation_id": str(conversation_id),
        "sender_id": sender_id,
        "content": content,
        "message_type": message_type,
        "attachment_url": attachment_url,
        "created_at": message.created_at.isoformat(),
        "participant_user_ids": participant_user_ids,
    }
    await publish_new_message(message_data)
    
    # 7. Broadcast via WebSocket to all participants
    websocket_message = {
        "type": "new_message",
        "data": message_response.model_dump(mode='json'),
    }
    await manager.broadcast_to_conversation(websocket_message, participant_user_ids)
    
    return message_response


async def get_conversation_messages_cached(
    conversation_id: UUID,
    session: AsyncSession = None,
    limit: int = 50,
    offset: int = 0,
    before_message_id: Optional[UUID] = None,
) -> List[MessageResponse]:
    """
    Get conversation messages with caching.
    """
    cache_key = f"conversation:{conversation_id}:messages:latest"
    
    # Try cache first (only for latest messages, no offset)
    if offset == 0 and not before_message_id:
        cached = await get_cache(cache_key)
        if cached:
            try:
                messages_data = json.loads(cached)
                return [MessageResponse(**msg) for msg in messages_data]
            except Exception as e:
                logger.warning(f"Error parsing cached messages: {e}")
    
    # Get from database
    messages = await chat_crud.get_conversation_messages(
        conversation_id=conversation_id,
        session=session,
        limit=limit,
        offset=offset,
        before_message_id=before_message_id,
    )
    
    # Build response with read receipts
    message_responses = []
    for message in messages:
        read_by = await chat_crud.get_message_read_by_users(message.message_id, session)
        message_responses.append(
            MessageResponse(
                message_id=message.message_id,
                conversation_id=message.conversation_id,
                sender_id=message.sender_id,
                content=message.content,
                message_type=message.message_type,
                attachment_url=message.attachment_url,
                is_edited=message.is_edited,
                is_deleted=message.is_deleted,
                created_at=message.created_at,
                updated_at=message.updated_at,
                read_by=read_by,
            )
        )
    
    # Cache latest messages (only if no offset/pagination)
    if offset == 0 and not before_message_id and message_responses:
        cache_data = json.dumps([msg.model_dump(mode='json') for msg in message_responses], default=str)
        await set_cache(cache_key, cache_data, ttl=CACHE_TTL)
    
    return message_responses


async def get_user_conversations_cached(
    user_id: int,
    session: AsyncSession = None,
    limit: int = 50,
    offset: int = 0,
) -> List[ConversationListItem]:
    """
    Get user's conversations with caching and unread counts.
    """
    cache_key = f"user:{user_id}:conversations"
    
    # Try cache first
    if offset == 0:
        cached = await get_cache(cache_key)
        if cached:
            try:
                conversations_data = json.loads(cached)
                return [ConversationListItem(**conv) for conv in conversations_data]
            except Exception as e:
                logger.warning(f"Error parsing cached conversations: {e}")
    
    # Get from database
    conversations = await chat_crud.get_user_conversations(
        user_id=user_id,
        session=session,
        limit=limit,
        offset=offset,
    )
    
    # Build response with last message and unread count
    conversation_items = []
    for conv in conversations:
        # Get last message
        messages = await chat_crud.get_conversation_messages(
            conversation_id=conv.conversation_id,
            session=session,
            limit=1,
        )
        last_message = None
        if messages:
            msg = messages[0]
            read_by = await chat_crud.get_message_read_by_users(msg.message_id, session)
            last_message = MessageResponse(
                message_id=msg.message_id,
                conversation_id=msg.conversation_id,
                sender_id=msg.sender_id,
                content=msg.content,
                message_type=msg.message_type,
                attachment_url=msg.attachment_url,
                is_edited=msg.is_edited,
                is_deleted=msg.is_deleted,
                created_at=msg.created_at,
                updated_at=msg.updated_at,
                read_by=read_by,
            )
        
        # Get unread count
        unread_count = await chat_crud.get_unread_message_count(
            conv.conversation_id,
            user_id,
            session,
        )
        
        # Build participant list
        participants = [
            ParticipantResponse(
                participant_id=p.participant_id,
                user_id=p.user_id,
                joined_at=p.joined_at,
                last_read_at=p.last_read_at,
                is_active=p.is_active,
            )
            for p in conv.participants
        ]
        
        conversation_items.append(
            ConversationListItem(
                conversation_id=conv.conversation_id,
                conversation_type=conv.conversation_type,
                last_message=last_message,
                unread_count=unread_count,
                participants=participants,
                updated_at=conv.updated_at,
            )
        )
    
    # Cache conversations list
    if offset == 0 and conversation_items:
        try:
            # Convert to dict with proper serialization (Pydantic V2 uses model_dump)
            cache_data = json.dumps([conv.model_dump(mode='json') for conv in conversation_items], default=str)
            await set_cache(cache_key, cache_data, ttl=CACHE_TTL)
        except Exception as e:
            logger.warning(f"Failed to cache conversations: {e}")
    
    return conversation_items


async def mark_conversation_as_read(
    conversation_id: UUID,
    user_id: int,
    session: AsyncSession = None,
):
    """Mark conversation as read and invalidate cache."""
    await chat_crud.mark_conversation_as_read(conversation_id, user_id, session)
    await invalidate_conversation_cache(str(conversation_id))
    
    # Broadcast read receipt
    websocket_message = {
        "type": "read_receipt",
        "data": {
            "conversation_id": str(conversation_id),
            "user_id": user_id,
        },
    }
    await manager.send_personal_message(websocket_message, user_id)


async def handle_typing_indicator(
    conversation_id: UUID,
    user_id: int,
    is_typing: bool,
    session: AsyncSession = None,
):
    """Handle typing indicator and broadcast to conversation participants."""
    if not session:
        from db.database import sessionLocal
        async with sessionLocal() as session:
            conversation = await chat_crud.get_conversation_by_id(conversation_id, session)
    else:
        conversation = await chat_crud.get_conversation_by_id(conversation_id, session)
    
    if not conversation:
        return
    
    participant_user_ids = [p.user_id for p in conversation.participants if p.is_active and p.user_id != user_id]
    
    # Publish to queue
    await publish_typing_indicator(str(conversation_id), user_id, is_typing)
    
    # Broadcast via WebSocket
    websocket_message = {
        "type": "typing",
        "data": {
            "conversation_id": str(conversation_id),
            "user_id": user_id,
            "is_typing": is_typing,
        },
    }
    await manager.broadcast_to_conversation(websocket_message, participant_user_ids)

