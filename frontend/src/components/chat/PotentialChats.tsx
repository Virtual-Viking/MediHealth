/**
 * Potential Chats Component
 * Shows list of doctors/patients based on appointments
 * Allows starting new conversations
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import chatApi from '@/services/chatApi';

interface PotentialContact {
  user_id: number;
  name: string;
  photo_url?: string;
  specialty?: string;
  appointment_id?: number;
  appointment_status?: string;
  appointment_date?: string;
  relationship: 'appointment' | 'appointment_request';
}

interface PotentialChatsProps {
  onConversationCreated: (conversationId: string) => void;
}

export default function PotentialChats({ onConversationCreated }: PotentialChatsProps) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<PotentialContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creatingFor, setCreatingFor] = useState<number | null>(null);

  useEffect(() => {
    loadPotentialContacts();
  }, [user]);

  const loadPotentialContacts = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      // Fetch appointments based on role
      if (user.role === 'patient') {
        // Get appointments as patient
        const response = await api.get<any[]>('/appointment-requests/patient');
        const uniqueContacts = new Map<number, PotentialContact>();
        
        response.forEach((apt: any) => {
          if (!uniqueContacts.has(apt.doctor_user_id)) {
            uniqueContacts.set(apt.doctor_user_id, {
              user_id: apt.doctor_user_id,
              name: `Doctor`, // TODO: Fetch actual doctor name
              appointment_id: apt.appointment_id,
              appointment_status: apt.status,
              appointment_date: apt.preferred_date,
              relationship: apt.appointment_id ? 'appointment' : 'appointment_request',
            });
          }
        });
        
        setContacts(Array.from(uniqueContacts.values()));
      } else if (user.role === 'doctor') {
        // Get appointments as doctor
        const response = await api.get<any[]>('/appointment-requests/doctor');
        const uniqueContacts = new Map<number, PotentialContact>();
        
        response.forEach((apt: any) => {
          if (!uniqueContacts.has(apt.patient_user_id)) {
            uniqueContacts.set(apt.patient_user_id, {
              user_id: apt.patient_user_id,
              name: `Patient`, // TODO: Fetch actual patient name
              appointment_id: apt.appointment_id,
              appointment_status: apt.status,
              appointment_date: apt.preferred_date,
              relationship: apt.appointment_id ? 'appointment' : 'appointment_request',
            });
          }
        });
        
        setContacts(Array.from(uniqueContacts.values()));
      }
    } catch (error) {
      console.error('Failed to load potential contacts:', error);
      setContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const startConversation = async (contact: PotentialContact) => {
    if (!user) return;

    try {
      setCreatingFor(contact.user_id);
      
      // Create conversation
      const conversation = await chatApi.createConversation({
        conversation_type: contact.appointment_id ? 'appointment' : 'direct',
        participant_user_ids: [user.id, contact.user_id],
        appointment_id: contact.appointment_id,
      });

      // Notify parent to select this conversation
      onConversationCreated(conversation.conversation_id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      alert('Failed to start conversation. Please try again.');
    } finally {
      setCreatingFor(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading contacts...</div>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <svg
          className="w-16 h-16 text-gray-300 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <p className="text-gray-600 font-medium mb-2">No contacts yet</p>
        <p className="text-gray-400 text-sm">
          {user?.role === 'patient'
            ? 'Book an appointment with a doctor to start chatting'
            : 'Patients with appointments will appear here'}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700">
          {user?.role === 'patient' ? 'Your Doctors' : 'Your Patients'}
        </h3>
        <p className="text-xs text-gray-500 mt-1">Click to start a conversation</p>
      </div>
      
      {contacts.map((contact) => (
        <button
          key={contact.user_id}
          onClick={() => startConversation(contact)}
          disabled={creatingFor === contact.user_id}
          className="w-full p-4 hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
        >
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
              {contact.photo_url ? (
                <img
                  src={contact.photo_url}
                  alt={contact.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span>{contact.name[0]}</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{contact.name}</h3>
              {contact.specialty && (
                <p className="text-sm text-gray-600 truncate">{contact.specialty}</p>
              )}
              {contact.appointment_date && (
                <p className="text-xs text-gray-500 mt-1">
                  {contact.relationship === 'appointment' ? 'Appointment' : 'Requested'} •{' '}
                  {new Date(contact.appointment_date).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Action */}
            <div className="flex-shrink-0">
              {creatingFor === contact.user_id ? (
                <svg
                  className="animate-spin h-5 w-5 text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 text-blue-500"
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
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

