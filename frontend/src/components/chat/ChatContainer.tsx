/**
 * Main Chat Container Component
 * Displays conversation list and chat window side by side
 */

'use client';

import React, { useState } from 'react';
import { ChatProvider } from '@/contexts/ChatContext';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import SharedFilesPanel from './SharedFilesPanel';

export default function ChatContainer() {
  const [showFilesPanel, setShowFilesPanel] = useState(false);

  return (
    <ChatProvider>
      <div className="flex h-full bg-gray-50">
        {/* Conversation List - Left Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex-shrink-0">
          <ConversationList />
        </div>

        {/* Chat Window - Main Area */}
        <div className="flex-1 flex flex-col">
          <ChatWindow onToggleFiles={() => setShowFilesPanel(!showFilesPanel)} />
        </div>

        {/* Shared Files Panel - Right Sidebar (Collapsible) */}
        {showFilesPanel && (
          <div className="w-80 bg-white border-l border-gray-200 flex-shrink-0">
            <SharedFilesPanel onClose={() => setShowFilesPanel(false)} />
          </div>
        )}
      </div>
    </ChatProvider>
  );
}

