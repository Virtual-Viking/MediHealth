/**
 * Chat Window Component
 * Main chat area with messages and input
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { useAuth } from '@/contexts/AuthContext';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import FileUploadDialog from './FileUploadDialog';

interface ChatWindowProps {
  onToggleFiles: () => void;
}

export default function ChatWindow({ onToggleFiles }: ChatWindowProps) {
  const { user } = useAuth();
  const { currentConversation, messages, isLoading, typingUsers, loadMoreMessages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showFileDialog, setShowFileDialog] = useState(false);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  // Handle scroll to show/hide scroll button
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);

      // Load more messages if scrolled to top
      if (scrollTop === 0) {
        loadMoreMessages();
      }
    }
  };

  // Get typing indicator text
  const getTypingText = () => {
    if (!currentConversation) return null;
    
    const typingInThisConv = typingUsers.filter(
      (u) => u.conversationId === currentConversation.conversation_id && u.userId !== user?.user_id
    );

    if (typingInThisConv.length === 0) return null;
    if (typingInThisConv.length === 1) return 'Someone is typing...';
    return 'Multiple people are typing...';
  };

  if (!currentConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg
            className="w-24 h-24 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Welcome to Messages</h3>
          <p className="text-gray-500">Select a conversation to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Chat Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold">
              Dr
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">
                {currentConversation.conversation_type === 'appointment'
                  ? `Appointment #${currentConversation.appointment_id}`
                  : 'Doctor/Patient Chat'}
              </h2>
              <p className="text-sm text-gray-500">
                {currentConversation.participants.length} participant(s)
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Shared Files Button */}
            <button
              onClick={onToggleFiles}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="View shared files"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>

            {/* More Options */}
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="More options"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gray-50"
      >
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading messages...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <p>No messages yet</p>
              <p className="text-sm mt-1">Send a message to start the conversation</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const isOwn = message.sender_id === user?.user_id;
              const showAvatar =
                index === messages.length - 1 ||
                messages[index + 1]?.sender_id !== message.sender_id;

              return (
                <MessageBubble
                  key={message.message_id}
                  message={message}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}

        {/* Typing Indicator */}
        {getTypingText() && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>{getTypingText()}</span>
          </div>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute right-8 bottom-24 bg-white border border-gray-200 rounded-full p-2 shadow-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Message Input */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <MessageInput onOpenFileDialog={() => setShowFileDialog(true)} />
      </div>

      {/* File Upload Dialog */}
      {showFileDialog && <FileUploadDialog onClose={() => setShowFileDialog(false)} />}
    </div>
  );
}

