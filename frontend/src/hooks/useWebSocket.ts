/**
 * WebSocket Hook for Real-time Chat
 * Manages WebSocket connection, message handling, and reconnection
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Message } from '@/services/chatApi';

interface WebSocketMessage {
  type: 'new_message' | 'typing' | 'read_receipt' | 'connected' | 'error';
  success?: boolean;
  data?: any;
  error?: string;
}

interface UseWebSocketProps {
  userId?: number;
  token?: string;
  onNewMessage?: (message: Message) => void;
  onTyping?: (data: { conversation_id: string; user_id: number; is_typing: boolean }) => void;
  onReadReceipt?: (data: { conversation_id: string; user_id: number }) => void;
  onError?: (error: string) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  sendTypingIndicator: (conversationId: string, isTyping: boolean) => void;
  sendReadReceipt: (conversationId: string) => void;
  disconnect: () => void;
  reconnect: () => void;
}

export const useWebSocket = ({
  userId,
  token,
  onNewMessage,
  onTyping,
  onReadReceipt,
  onError,
}: UseWebSocketProps): UseWebSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3 seconds

  const connect = useCallback(() => {
    if (!userId || !token) {
      console.warn('WebSocket: Missing userId or token');
      return;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    // Determine WebSocket URL (adjust for your environment)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = process.env.NEXT_PUBLIC_WS_URL || 'localhost:8000';
    const wsUrl = `${wsProtocol}//${wsHost}/chat/ws?token=${token}`;

    console.log('WebSocket: Connecting to', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket: Connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('WebSocket: Message received', message);

          switch (message.type) {
            case 'connected':
              console.log('WebSocket: Connection confirmed', message.data);
              break;

            case 'new_message':
              if (onNewMessage && message.data) {
                onNewMessage(message.data);
              }
              break;

            case 'typing':
              if (onTyping && message.data) {
                onTyping(message.data);
              }
              break;

            case 'read_receipt':
              if (onReadReceipt && message.data) {
                onReadReceipt(message.data);
              }
              break;

            case 'error':
              console.error('WebSocket: Server error', message.error);
              if (onError) {
                onError(message.error || 'Unknown error');
              }
              break;

            default:
              console.warn('WebSocket: Unknown message type', message.type);
          }
        } catch (error) {
          console.error('WebSocket: Error parsing message', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket: Connection error', error);
        setIsConnected(false);
        if (onError) {
          onError('WebSocket connection error');
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket: Connection closed', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(
            `WebSocket: Reconnecting (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`
          );
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.error('WebSocket: Max reconnection attempts reached');
          if (onError) {
            onError('Failed to reconnect to chat server');
          }
        }
      };
    } catch (error) {
      console.error('WebSocket: Failed to create connection', error);
      setIsConnected(false);
      if (onError) {
        onError('Failed to create WebSocket connection');
      }
    }
  }, [userId, token, onNewMessage, onTyping, onReadReceipt, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket: Cannot send message, not connected');
    }
  }, []);

  const sendTypingIndicator = useCallback(
    (conversationId: string, isTyping: boolean) => {
      sendMessage({
        type: 'typing',
        conversation_id: conversationId,
        is_typing: isTyping,
      });
    },
    [sendMessage]
  );

  const sendReadReceipt = useCallback(
    (conversationId: string) => {
      sendMessage({
        type: 'read_receipt',
        conversation_id: conversationId,
      });
    },
    [sendMessage]
  );

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  // Connect on mount
  useEffect(() => {
    if (userId && token) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [userId, token, connect, disconnect]);

  return {
    isConnected,
    sendTypingIndicator,
    sendReadReceipt,
    disconnect,
    reconnect,
  };
};

