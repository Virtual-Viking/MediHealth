/**
 * Shared Files Panel
 * Shows history of all files shared in the conversation
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useChat } from '@/contexts/ChatContext';
import chatApi, { Message } from '@/services/chatApi';

interface SharedFilesPanelProps {
  onClose: () => void;
}

export default function SharedFilesPanel({ onClose }: SharedFilesPanelProps) {
  const { currentConversation } = useChat();
  const [files, setFiles] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadFiles();
  }, [currentConversation]);

  const loadFiles = async () => {
    if (!currentConversation) return;

    try {
      setIsLoading(true);
      const sharedFiles = await chatApi.getConversationFiles(currentConversation.conversation_id);
      setFiles(sharedFiles);
    } catch (error) {
      console.error('Failed to load shared files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFiles = files.filter((file) => {
    if (filter === 'all') return true;
    return file.attachment_metadata?.category === filter;
  });

  const groupFilesByCategory = () => {
    const groups: Record<string, Message[]> = {};
    filteredFiles.forEach((file) => {
      const category = file.attachment_metadata?.category || 'other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(file);
    });
    return groups;
  };

  const getCategoryInfo = (category: string) => {
    const categories: Record<string, { label: string; icon: string; color: string }> = {
      insurance: { label: 'Insurance', icon: '🏥', color: 'blue' },
      invoice: { label: 'Invoices', icon: '💰', color: 'green' },
      lab_report: { label: 'Lab Reports', icon: '🧪', color: 'purple' },
      prescription: { label: 'Prescriptions', icon: '💊', color: 'pink' },
      payment: { label: 'Payments', icon: '💳', color: 'yellow' },
      other: { label: 'Other', icon: '📄', color: 'gray' },
    };
    return categories[category] || categories.other;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const groupedFiles = groupFilesByCategory();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Shared Files</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition-colors">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-3 border-b border-gray-200 overflow-x-auto">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              filter === 'all' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({files.length})
          </button>
          {Object.keys(groupedFiles).map((category) => {
            const info = getCategoryInfo(category);
            return (
              <button
                key={category}
                onClick={() => setFilter(category)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  filter === category
                    ? `bg-${info.color}-100 text-${info.color}-700`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {info.icon} {info.label} ({groupedFiles[category].length})
              </button>
            );
          })}
        </div>
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading files...</div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-16 h-16 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-600 font-medium">No files shared yet</p>
            <p className="text-gray-400 text-sm mt-1">Files you share will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((file) => {
              const category = getCategoryInfo(file.attachment_metadata?.category || 'other');
              return (
                <a
                  key={file.message_id}
                  href={file.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-3 bg-white border border-gray-200 rounded-lg hover:shadow-md hover:border-gray-300 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      {file.message_type === 'image' ? (
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.attachment_metadata?.filename || 'File'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {file.attachment_metadata?.file_size && (
                          <span className="text-xs text-gray-500">
                            {formatFileSize(file.attachment_metadata.file_size)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">{formatDate(file.created_at)}</span>
                      </div>
                      {file.attachment_metadata?.category && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-2 bg-${category.color}-100 text-${category.color}-800`}>
                          {category.icon} {category.label}
                        </span>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {filteredFiles.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-600">
            Total: {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''} •{' '}
            {(() => {
              const totalSize = filteredFiles.reduce(
                (acc, file) => acc + (file.attachment_metadata?.file_size || 0),
                0
              );
              return formatFileSize(totalSize);
            })()}
          </p>
        </div>
      )}
    </div>
  );
}

