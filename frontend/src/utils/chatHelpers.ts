/**
 * Chat Helper Utilities
 * Functions to help with chat filtering and conversation management
 */

import { Conversation } from '@/services/chatApi';
import api from '@/services/api';

/**
 * Check if user has appointments with a specific doctor/patient
 */
export async function hasAppointmentWith(userId: number): Promise<boolean> {
  try {
    const response = await api.get(`/appointment-requests`);
    const appointments = response.data;
    
    // Check if there's any appointment with this user
    return appointments.some(
      (apt: any) => 
        apt.doctor_id === userId || 
        apt.patient_id === userId
    );
  } catch (error) {
    console.error('Error checking appointments:', error);
    return false;
  }
}

/**
 * Filter conversations to only show those with appointments
 * @param conversations - List of all conversations
 * @param currentUserId - Current user's ID
 * @returns Filtered conversations with appointments only
 */
export function filterConversationsWithAppointments(
  conversations: Conversation[],
  currentUserId: number
): Conversation[] {
  return conversations.filter((conv) => {
    // Always show appointment-type conversations
    if (conv.conversation_type === 'appointment') {
      return true;
    }
    
    // For direct chats, we would need to verify if there's an appointment
    // This would require an API call or having appointment data in the conversation
    // For now, show all direct conversations
    return true;
  });
}

/**
 * Get other participant from conversation (not current user)
 */
export function getOtherParticipant(
  conversation: Conversation,
  currentUserId: number
) {
  return conversation.participants.find((p) => p.user_id !== currentUserId);
}

/**
 * Get conversation type label
 */
export function getConversationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    direct: 'Direct Message',
    appointment: 'Appointment Chat',
    support: 'Support Chat',
  };
  return labels[type] || type;
}

/**
 * Sort conversations by latest activity
 */
export function sortConversationsByLatest(
  conversations: Conversation[]
): Conversation[] {
  return [...conversations].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

/**
 * Group conversations by type
 */
export function groupConversationsByType(
  conversations: Conversation[]
): Record<string, Conversation[]> {
  const groups: Record<string, Conversation[]> = {
    appointment: [],
    direct: [],
    support: [],
  };

  conversations.forEach((conv) => {
    if (groups[conv.conversation_type]) {
      groups[conv.conversation_type].push(conv);
    }
  });

  return groups;
}

/**
 * Check if conversation has unread messages
 */
export function hasUnreadMessages(conversation: Conversation): boolean {
  return conversation.unread_count > 0;
}

/**
 * Get total unread count across all conversations
 */
export function getTotalUnreadCount(conversations: Conversation[]): number {
  return conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
}

/**
 * Search conversations by participant name or message content
 * Note: This is a client-side filter. For better performance, 
 * implement server-side search in production.
 */
export function searchConversations(
  conversations: Conversation[],
  query: string
): Conversation[] {
  if (!query.trim()) {
    return conversations;
  }

  const lowercaseQuery = query.toLowerCase();

  return conversations.filter((conv) => {
    // Search in last message content
    if (conv.last_message?.content.toLowerCase().includes(lowercaseQuery)) {
      return true;
    }

    // Search by conversation type
    if (conv.conversation_type.toLowerCase().includes(lowercaseQuery)) {
      return true;
    }

    // Search by appointment ID
    if (
      conv.appointment_id &&
      conv.appointment_id.toString().includes(lowercaseQuery)
    ) {
      return true;
    }

    // TODO: Add participant name search once user details are available
    // This would require fetching user details for each participant

    return false;
  });
}

/**
 * Get conversation status (active, archived, etc.)
 * This is a placeholder for future implementation
 */
export function getConversationStatus(
  conversation: Conversation
): 'active' | 'archived' | 'ended' {
  // All conversations are active for now
  // In future, you can check appointment status, etc.
  return 'active';
}

/**
 * Check if user can send messages in conversation
 * This is a placeholder for future permission checks
 */
export function canSendMessages(
  conversation: Conversation,
  currentUserId: number
): boolean {
  // Check if user is an active participant
  const participant = conversation.participants.find(
    (p) => p.user_id === currentUserId
  );

  return participant?.is_active ?? false;
}

