"use client";

import { useState } from "react";

interface DeactivateAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, feedback: string) => Promise<void>;
  portalType: "patient" | "service_provider";
  portalLabel: string;
}

export default function DeactivateAccountDialog({
  isOpen,
  onClose,
  onConfirm,
  portalType,
  portalLabel,
}: DeactivateAccountDialogProps) {
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onConfirm(reason, feedback);
      // Reset form
      setReason("");
      setFeedback("");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to deactivate account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setReason("");
    setFeedback("");
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-white/20 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Deactivate {portalLabel} Account
          </h2>
          <p className="text-gray-600 mb-6">
            Deactivating your account will prevent other users from finding you in searches. 
            Your account information and history will be preserved, but your profile will be hidden.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                Reason for deactivation <span className="text-gray-400">(optional)</span>
              </label>
              <select
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a reason...</option>
                <option value="temporary_break">Taking a temporary break</option>
                <option value="privacy_concerns">Privacy concerns</option>
                <option value="not_using_platform">Not using the platform</option>
                <option value="found_alternative">Found an alternative solution</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-2">
                Additional feedback <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                placeholder="Tell us more about why you're deactivating your account..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {isSubmitting ? "Deactivating..." : "Deactivate Account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

