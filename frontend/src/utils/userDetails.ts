/**
 * Utility to fetch user details for chat participants
 */

import { doctorAPI, patientAPI } from '@/services/api';

export interface UserDetails {
  user_id: number;
  name: string;
  photo_url?: string;
  role: 'doctor' | 'patient' | 'pharmacist' | 'insurer';
}

const userDetailsCache = new Map<number, UserDetails>();

/**
 * Get user details by user ID
 * Fetches from doctor or patient profile based on role
 */
export async function getUserDetails(userId: number, role?: string): Promise<UserDetails> {
  // Check cache first
  if (userDetailsCache.has(userId)) {
    return userDetailsCache.get(userId)!;
  }

  try {
    let name = 'Unknown User';
    let photo_url: string | undefined;
    let userRole: 'doctor' | 'patient' | 'pharmacist' | 'insurer' = 'patient';

    // If role is provided, use it; otherwise try to determine from profile
    if (role === 'doctor') {
      try {
        // For doctors, we need to fetch their profile
        // Since we can't fetch other users' profiles directly, we'll need to get it from conversation participants
        // For now, return a placeholder - this will be enhanced when we add participant details to the API
        return {
          user_id: userId,
          name: 'Doctor',
          photo_url: undefined,
          role: 'doctor',
        };
      } catch (error) {
        console.error('Failed to fetch doctor details:', error);
      }
    } else if (role === 'patient') {
      try {
        // Similar for patients
        return {
          user_id: userId,
          name: 'Patient',
          photo_url: undefined,
          role: 'patient',
        };
      } catch (error) {
        console.error('Failed to fetch patient details:', error);
      }
    }

    const details: UserDetails = {
      user_id: userId,
      name,
      photo_url,
      role: userRole,
    };

    userDetailsCache.set(userId, details);
    return details;
  } catch (error) {
    console.error('Failed to fetch user details:', error);
    return {
      user_id: userId,
      name: 'Unknown User',
      photo_url: undefined,
      role: role as 'doctor' | 'patient' | 'pharmacist' | 'insurer' || 'patient',
    };
  }
}

/**
 * Get user initials for avatar
 */
export function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Clear user details cache
 */
export function clearUserDetailsCache() {
  userDetailsCache.clear();
}

