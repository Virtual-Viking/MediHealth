/**
 * Chat Context
 * Global state management for chat functionality
 */

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import chatApi, { Conversation, Message, ConversationDetails } from '@/services/chatApi';

interface TypingUser {
  userId: number;
  conversationId: string;
}

interface ChatContextType {
  conversations: Conversation[];
  currentConversation: ConversationDetails | null;
  messages: Message[];
  isLoading: boolean;
  isConnected: boolean;
  typingUsers: TypingUser[];
  
  // Actions
  loadConversations: () => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string, attachmentUrl?: string, attachmentMetadata?: any) => Promise<void>;
  sendTypingIndicator: (isTyping: boolean) => void;
  uploadAndSendFile: (file: File, category?: string) => Promise<void>;
  markCurrentAsRead: () => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  refreshConversations: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<ConversationDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  // WebSocket handlers
  const handleNewMessage = useCallback((message: Message) => {
    console.log('New message received:', message);
    
    // Add message to current conversation if it matches
    if (currentConversation && message.conversation_id === currentConversation.conversation_id) {
      setMessages((prev) => {
        // Check if message already exists (avoid duplicates)
        if (prev.some((m) => m.message_id === message.message_id)) {
          return prev;
        }
        return [...prev, message];
      });
    }

    // Update conversation list with new message
    setConversations((prev) => {
      return prev.map((conv) => {
        if (conv.conversation_id === message.conversation_id) {
          return {
            ...conv,
            last_message: message,
            unread_count: conv.conversation_id === currentConversation?.conversation_id 
              ? conv.unread_count 
              : conv.unread_count + 1,
            updated_at: message.created_at,
          };
        }
        return conv;
      }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    });
  }, [currentConversation]);

  const handleTyping = useCallback((data: { conversation_id: string; user_id: number; is_typing: boolean }) => {
    if (data.is_typing) {
      setTypingUsers((prev) => {
        // Add if not already present
        if (!prev.some((u) => u.userId === data.user_id && u.conversationId === data.conversation_id)) {
          return [...prev, { userId: data.user_id, conversationId: data.conversation_id }];
        }
        return prev;
      });
    } else {
      setTypingUsers((prev) =>
        prev.filter((u) => !(u.userId === data.user_id && u.conversationId === data.conversation_id))
      );
    }
  }, []);

  const handleReadReceipt = useCallback((data: { conversation_id: string; user_id: number }) => {
    console.log('Read receipt received:', data);
    // Update read receipts in messages
    if (currentConversation && data.conversation_id === currentConversation.conversation_id) {
      setMessages((prev) =>
        prev.map((msg) => ({
          ...msg,
          read_by: msg.read_by.includes(data.user_id) ? msg.read_by : [...msg.read_by, data.user_id],
        }))
      );
    }
  }, [currentConversation]);

  // Initialize WebSocket
  const { 
    isConnected, 
    sendTypingIndicator: wsSendTypingIndicator, 
    sendReadReceipt: wsSendReadReceipt 
  } = useWebSocket({
    userId: user?.id,
    token: user ? document.cookie.split('access_token=')[1]?.split(';')[0] : undefined,
    onNewMessage: handleNewMessage,
    onTyping: handleTyping,
    onReadReceipt: handleReadReceipt,
  });

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const data = await chatApi.getConversations();
      setConversations(data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      // Set empty array on error instead of crashing
      setConversations([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Select conversation and load messages
  const selectConversation = useCallback(async (conversationId: string) => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      // Load conversation details
      const conversation = await chatApi.getConversation(conversationId);
      setCurrentConversation(conversation);

      // Load messages
      const messagesData = await chatApi.getMessages(conversationId, 50, 0);
      setMessages(messagesData.messages.reverse()); // Reverse to show oldest first
      setHasMoreMessages(messagesData.has_more);

      // Mark as read
      await chatApi.markAsRead(conversationId);
      wsSendReadReceipt(conversationId);

      // Update unread count in conversations list
      setConversations((prev) =>
        prev.map((conv) =>
          conv.conversation_id === conversationId ? { ...conv, unread_count: 0 } : conv
        )
      );
    } catch (error) {
      console.error('Failed to select conversation:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, wsSendReadReceipt]);

  // Send message
  const sendMessage = useCallback(
    async (content: string, attachmentUrl?: string, attachmentMetadata?: any) => {
      if (!currentConversation || !content.trim()) return;

      try {
        const messageType = attachmentUrl ? (attachmentMetadata?.file_type?.startsWith('image/') ? 'image' : 'file') : 'text';
        
        const message = await chatApi.sendMessage(currentConversation.conversation_id, {
          content,
          message_type: messageType,
          attachment_url: attachmentUrl,
          attachment_metadata: attachmentMetadata,
        });

        // Message will be added via WebSocket, but add optimistically
        setMessages((prev) => [...prev, message]);
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      }
    },
    [currentConversation]
  );

  // Send typing indicator
  const sendTypingIndicator = useCallback(
    (isTyping: boolean) => {
      if (currentConversation) {
        wsSendTypingIndicator(currentConversation.conversation_id, isTyping);
      }
    },
    [currentConversation, wsSendTypingIndicator]
  );

  // Upload and send file
  const uploadAndSendFile = useCallback(
    async (file: File, category?: string) => {
      if (!currentConversation) return;

      try {
        setIsLoading(true);
        
        // Upload file
        const uploadedFile = await chatApi.uploadChatFile(file, category);

        // Send message with file attachment
        await sendMessage(
          `Shared ${category ? category.replace('_', ' ') : 'file'}: ${uploadedFile.filename}`,
          uploadedFile.file_url,
          {
            filename: uploadedFile.filename,
            file_type: uploadedFile.file_type,
            file_size: uploadedFile.file_size,
            category: category,
          }
        );
      } catch (error) {
        console.error('Failed to upload and send file:', error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [currentConversation, sendMessage]
  );

  // Mark current conversation as read
  const markCurrentAsRead = useCallback(async () => {
    if (!currentConversation) return;

    try {
      await chatApi.markAsRead(currentConversation.conversation_id);
      wsSendReadReceipt(currentConversation.conversation_id);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }, [currentConversation, wsSendReadReceipt]);

  // Load more messages (pagination)
  const loadMoreMessages = useCallback(async () => {
    if (!currentConversation || !hasMoreMessages || isLoading) return;

    try {
      setIsLoading(true);
      const oldestMessage = messages[0];
      
      const messagesData = await chatApi.getMessages(
        currentConversation.conversation_id,
        50,
        0,
        oldestMessage?.message_id
      );

      setMessages((prev) => [...messagesData.messages.reverse(), ...prev]);
      setHasMoreMessages(messagesData.has_more);
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentConversation, hasMoreMessages, isLoading, messages]);

  // Refresh conversations
  const refreshConversations = useCallback(async () => {
    await loadConversations();
  }, [loadConversations]);

  // Load conversations on mount
  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        currentConversation,
        messages,
        isLoading,
        isConnected,
        typingUsers,
        loadConversations,
        selectConversation,
        sendMessage,
        sendTypingIndicator,
        uploadAndSendFile,
        markCurrentAsRead,
        loadMoreMessages,
        refreshConversations,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
};

