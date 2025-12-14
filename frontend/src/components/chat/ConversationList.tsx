/**
 * Conversation List Component
 * Shows all conversations with doctors/patients
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { useAuth } from '@/contexts/AuthContext';
import { Conversation } from '@/services/chatApi';
import PotentialChats from './PotentialChats';

export default function ConversationList() {
  const { user } = useAuth();
  const { conversations, currentConversation, selectConversation, isLoading, isConnected, refreshConversations } = useChat();
  const [searchQuery, setSearchQuery] = useState('');

  // Filter conversations based on search
  const filteredConversations = conversations.filter((conv) => {
    // Get other participant (not current user)
    const otherParticipant = conv.participants.find((p) => p.user_id !== user?.user_id);
    // TODO: Fetch user details and filter by name
    return true; // For now, show all
  });

  const handleConversationCreated = async (conversationId: string) => {
    // Refresh conversations list
    await refreshConversations();
    // Select the new conversation
    await selectConversation(conversationId);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffInHours < 168) {
      // Less than a week
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-gray-900">Messages</h2>
          <div className="flex items-center gap-2">
            {/* Connection Status */}
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg
            className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && conversations.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading conversations...</div>
          </div>
        ) : filteredConversations.length === 0 ? (
          // Show potential chats when no conversations exist
          <PotentialChats onConversationCreated={handleConversationCreated} />
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredConversations.map((conversation) => (
              <ConversationItem
                key={conversation.conversation_id}
                conversation={conversation}
                isActive={currentConversation?.conversation_id === conversation.conversation_id}
                onClick={() => selectConversation(conversation.conversation_id)}
                currentUserId={user?.user_id || 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  currentUserId: number;
}

function ConversationItem({ conversation, isActive, onClick, currentUserId }: ConversationItemProps) {
  // Get other participant (not current user)
  const otherParticipant = conversation.participants.find((p) => p.user_id !== currentUserId);
  const lastMessage = conversation.last_message;

  // Truncate message content
  const truncateMessage = (content: string, maxLength: number = 50) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
        isActive ? 'bg-blue-50 border-l-4 border-blue-500' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
          {/* TODO: Replace with actual user initials/photo */}
          {otherParticipant ? 'Dr' : 'U'}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-900 truncate">
              {/* TODO: Replace with actual user name */}
              {conversation.conversation_type === 'appointment' ? 'Appointment Chat' : 'Doctor/Patient'}
            </h3>
            {lastMessage && (
              <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                {formatTime(lastMessage.created_at)}
              </span>
            )}
          </div>

          {/* Last Message */}
          {lastMessage && (
            <div className="flex items-center justify-between">
              <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                {lastMessage.message_type === 'file' || lastMessage.message_type === 'image' ? (
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                    {lastMessage.message_type === 'image' ? 'Photo' : 'File'}
                  </span>
                ) : (
                  truncateMessage(lastMessage.content)
                )}
              </p>
              {conversation.unread_count > 0 && (
                <span className="bg-blue-500 text-white text-xs font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5 ml-2 flex-shrink-0">
                  {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                </span>
              )}
            </div>
          )}

          {/* Appointment Indicator */}
          {conversation.conversation_type === 'appointment' && (
            <div className="flex items-center mt-1">
              <svg className="w-3 h-3 text-blue-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs text-blue-600">Appointment #{conversation.appointment_id}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

