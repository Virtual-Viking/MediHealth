/**
 * Chat API Service
 * Handles all chat-related API calls
 */

import api from './api';

export interface Message {
  message_id: string;
  conversation_id: string;
  sender_id: number;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'system';
  attachment_url?: string;
  attachment_metadata?: {
    filename: string;
    file_type: string;
    file_size: number;
    category?: 'insurance' | 'invoice' | 'lab_report' | 'prescription' | 'payment' | 'other';
  };
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  read_by: number[];
}

export interface Participant {
  participant_id: string;
  user_id: number;
  joined_at: string;
  last_read_at?: string;
  is_active: boolean;
}

export interface Conversation {
  conversation_id: string;
  conversation_type: 'direct' | 'appointment' | 'support';
  appointment_id?: number;
  last_message?: Message;
  unread_count: number;
  participants: Participant[];
  updated_at: string;
}

export interface ConversationDetails extends Conversation {
  messages?: Message[];
}

export interface SendMessagePayload {
  content: string;
  message_type?: 'text' | 'image' | 'file';
  attachment_url?: string;
  attachment_metadata?: {
    filename: string;
    file_type: string;
    file_size: number;
    category?: string;
  };
}

export interface CreateConversationPayload {
  conversation_type: 'direct' | 'appointment' | 'support';
  participant_user_ids: number[];
  appointment_id?: number;
}

class ChatAPI {
  /**
   * Get all conversations for current user
   */
  async getConversations(limit: number = 50, offset: number = 0): Promise<Conversation[]> {
    return await api.get<Conversation[]>(`/chat/conversations?limit=${limit}&offset=${offset}`);
  }

  /**
   * Get specific conversation with participants
   */
  async getConversation(conversationId: string): Promise<ConversationDetails> {
    return await api.get<ConversationDetails>(`/chat/conversations/${conversationId}`);
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(
    conversationId: string,
    limit: number = 50,
    offset: number = 0,
    beforeMessageId?: string
  ): Promise<{
    messages: Message[];
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
  }> {
    let url = `/chat/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`;
    if (beforeMessageId) {
      url += `&before_message_id=${beforeMessageId}`;
    }
    return await api.get(url);
  }

  /**
   * Send a message
   */
  async sendMessage(conversationId: string, payload: SendMessagePayload): Promise<Message> {
    return await api.post<Message>(`/chat/conversations/${conversationId}/messages`, payload);
  }

  /**
   * Create a new conversation
   */
  async createConversation(payload: CreateConversationPayload): Promise<Conversation> {
    return await api.post<Conversation>('/chat/conversations', payload);
  }

  /**
   * Mark conversation as read
   */
  async markAsRead(conversationId: string): Promise<void> {
    await api.post(`/chat/conversations/${conversationId}/read`);
  }

  /**
   * Get unread count for a conversation
   */
  async getUnreadCount(conversationId: string): Promise<number> {
    const response = await api.get(`/chat/conversations/${conversationId}/unread-count`);
    return response.data.unread_count;
  }

  /**
   * Update a message
   */
  async updateMessage(messageId: string, content: string): Promise<Message> {
    const response = await api.put(`/chat/messages/${messageId}`, { content });
    return response.data;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<void> {
    await api.delete(`/chat/messages/${messageId}`);
  }

  /**
   * Upload file for chat (uses existing patient-files endpoint)
   */
  async uploadChatFile(
    file: File,
    category?: string
  ): Promise<{ file_url: string; filename: string; file_type: string; file_size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    if (category) {
      formData.append('category', category);
    }

    const response = await api.post('/patient-files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return {
      file_url: response.data.file_url,
      filename: file.name,
      file_type: file.type,
      file_size: file.size,
    };
  }

  /**
   * Get all shared files in a conversation
   */
  async getConversationFiles(conversationId: string): Promise<Message[]> {
    const response = await api.get(`/chat/conversations/${conversationId}/messages?limit=1000`);
    // Filter messages that have attachments
    return response.data.messages.filter(
      (msg: Message) => msg.message_type === 'file' || msg.message_type === 'image'
    );
  }
}

export const chatApi = new ChatAPI();
export default chatApi;

