"use client";

import { useState } from "react";
import { appointmentRequestAPI, APIError } from "@/services/api";

interface RequestAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorId: number;
  doctorName: string;
  onSuccess?: () => void;
}

export default function RequestAppointmentModal({
  isOpen,
  onClose,
  doctorId,
  doctorName,
  onSuccess,
}: RequestAppointmentModalProps) {
  const [preferredDate, setPreferredDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [isFlexible, setIsFlexible] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!preferredDate || !startTime) {
        setError("Please fill in all required fields");
        setIsSubmitting(false);
        return;
      }

      const preferredDateTime = new Date(`${preferredDate}T${startTime}`);
      const [startHour, startMinute] = startTime.split(":").map(Number);

      const startTimeStr = `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00`;

      await appointmentRequestAPI.create({
        doctor_user_id: doctorId,
        preferred_date: preferredDateTime.toISOString(),
        preferred_time_slot_start: startTimeStr,
        is_flexible: isFlexible,
        reason: reason || undefined,
        notes: notes || undefined,
      });

      onSuccess?.();
      onClose();
      resetForm();
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.detail);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to request appointment. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setPreferredDate("");
    setStartTime("");
    setIsFlexible(false);
    setReason("");
    setNotes("");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-md">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Request Appointment</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Requesting appointment with <span className="font-semibold">{doctorName}</span>
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="preferredDate" className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                id="preferredDate"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                min={today}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                id="startTime"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isFlexible"
              checked={isFlexible}
              onChange={(e) => setIsFlexible(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isFlexible" className="ml-2 block text-sm text-gray-700">
              I'm flexible with the time slot (allows doctor to suggest alternative times)
            </label>
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Visit
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Brief description of why you need this appointment"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">{reason.length}/1000 characters</p>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Any additional information you'd like to share"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">{notes.length}/2000 characters</p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Request Appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

