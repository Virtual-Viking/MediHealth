"use client";

import ChatContainer from "@/components/chat/ChatContainer";

export default function ChatsPage() {
  return (
    <main className="flex-1 overflow-hidden" style={{ backgroundColor: "#ECF4F9" }}>
      <div className="h-full">
        <ChatContainer />
      </div>
    </main>
  );
}

