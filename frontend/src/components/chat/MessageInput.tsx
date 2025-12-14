/**
 * Message Input Component
 * Text input with drag-and-drop file upload support
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@/contexts/ChatContext';

interface MessageInputProps {
  onOpenFileDialog: () => void;
}

export default function MessageInput({ onOpenFileDialog }: MessageInputProps) {
  const { sendMessage, sendTypingIndicator, currentConversation } = useChat();
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [message]);

  const handleSend = async () => {
    if (!message.trim() || !currentConversation) return;

    try {
      await sendMessage(message.trim());
      setMessage('');
      setIsTyping(false);
      sendTypingIndicator(false);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Send typing indicator
    if (!isTyping && e.target.value.trim()) {
      setIsTyping(true);
      sendTypingIndicator(true);
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing indicator after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTypingIndicator(false);
    }, 2000);
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Open file dialog with the dropped file
      onOpenFileDialog();
      // TODO: Pass the file to the dialog
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative"
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-50 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center z-10">
          <div className="text-center">
            <svg
              className="w-12 h-12 text-blue-500 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-blue-600 font-medium">Drop files here to upload</p>
            <p className="text-blue-500 text-sm mt-1">Documents, images, and more</p>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-end gap-2">
        {/* File Upload Button */}
        <button
          onClick={onOpenFileDialog}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 text-gray-600"
          title="Attach file"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
            />
          </svg>
        </button>

        {/* Text Input */}
        <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            rows={1}
            className="w-full px-4 py-3 bg-transparent resize-none focus:outline-none max-h-32"
          />
        </div>

        {/* Emoji Button */}
        <button
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 text-gray-600"
          title="Add emoji"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
            message.trim()
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title="Send message"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      {/* Hint Text */}
      <p className="text-xs text-gray-400 mt-2">
        Press <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Enter</kbd> to send,{' '}
        <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}

