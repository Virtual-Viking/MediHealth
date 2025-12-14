/**
 * Message Bubble Component
 * Displays individual message with text, images, or files
 */

'use client';

import React from 'react';
import { Message } from '@/services/chatApi';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
}

export default function MessageBubble({ message, isOwn, showAvatar }: MessageBubbleProps) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    } else if (fileType.includes('pdf')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    } else {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }
  };

  const getCategoryBadge = (category?: string) => {
    if (!category) return null;

    const badges = {
      insurance: { color: 'bg-blue-100 text-blue-800', label: 'Insurance' },
      invoice: { color: 'bg-green-100 text-green-800', label: 'Invoice' },
      lab_report: { color: 'bg-purple-100 text-purple-800', label: 'Lab Report' },
      prescription: { color: 'bg-pink-100 text-pink-800', label: 'Prescription' },
      payment: { color: 'bg-yellow-100 text-yellow-800', label: 'Payment' },
      other: { color: 'bg-gray-100 text-gray-800', label: 'Document' },
    };

    const badge = badges[category as keyof typeof badges] || badges.other;

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} items-end gap-2`}>
      {/* Avatar (for other user) */}
      {!isOwn && (
        <div className="w-8 h-8 flex-shrink-0">
          {showAvatar && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-semibold">
              Dr
            </div>
          )}
        </div>
      )}

      {/* Message Content */}
      <div className={`max-w-md ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Text Message */}
        {message.message_type === 'text' && (
          <div
            className={`px-4 py-2 rounded-2xl ${
              isOwn
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-white border border-gray-200 text-gray-900 rounded-bl-none'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        )}

        {/* Image Message */}
        {message.message_type === 'image' && message.attachment_url && (
          <div className={`rounded-2xl overflow-hidden ${isOwn ? 'rounded-br-none' : 'rounded-bl-none'}`}>
            <a href={message.attachment_url} target="_blank" rel="noopener noreferrer">
              <img
                src={message.attachment_url}
                alt={message.attachment_metadata?.filename || 'Image'}
                className="max-w-sm max-h-96 object-cover cursor-pointer hover:opacity-90 transition-opacity"
              />
            </a>
            {message.content && (
              <div
                className={`px-4 py-2 ${
                  isOwn ? 'bg-blue-500 text-white' : 'bg-white border-t border-gray-200 text-gray-900'
                }`}
              >
                <p className="text-sm">{message.content}</p>
              </div>
            )}
          </div>
        )}

        {/* File Message */}
        {message.message_type === 'file' && message.attachment_url && (
          <div
            className={`rounded-2xl overflow-hidden border ${
              isOwn
                ? 'bg-blue-50 border-blue-200 rounded-br-none'
                : 'bg-white border-gray-200 rounded-bl-none'
            }`}
          >
            <a
              href={message.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 hover:bg-opacity-80 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${isOwn ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  {getFileIcon(message.attachment_metadata?.file_type || '')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isOwn ? 'text-blue-900' : 'text-gray-900'}`}>
                    {message.attachment_metadata?.filename || 'File'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {message.attachment_metadata?.file_size && (
                      <span className="text-xs text-gray-500">
                        {formatFileSize(message.attachment_metadata.file_size)}
                      </span>
                    )}
                    {message.attachment_metadata?.category && getCategoryBadge(message.attachment_metadata.category)}
                  </div>
                  {message.content && (
                    <p className={`text-sm mt-2 ${isOwn ? 'text-blue-800' : 'text-gray-700'}`}>
                      {message.content}
                    </p>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 flex-shrink-0 ${isOwn ? 'text-blue-500' : 'text-gray-400'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
            </a>
          </div>
        )}

        {/* Message Footer */}
        <div className={`flex items-center gap-2 mt-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs text-gray-500">{formatTime(message.created_at)}</span>
          {message.is_edited && <span className="text-xs text-gray-400">(edited)</span>}
          {isOwn && (
            <div className="flex items-center">
              {message.read_by.length > 1 ? (
                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  <path d="M12.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                </svg>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Avatar placeholder (for own messages) */}
      {isOwn && <div className="w-8 h-8 flex-shrink-0" />}
    </div>
  );
}

