"use client";

import { useEffect, useMemo, useState } from "react";
import { APIError, FileBatch, ShareableDoctor, ShareBatchRequestPayload, ShareBatchTargetPayload, patientFileAPI } from "@/services/api";

interface ShareReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: FileBatch | null;
  onShared?: (message?: string) => void;
}

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return "Not scheduled";
  const date = new Date(iso);
  return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

export default function ShareReportsModal({ isOpen, onClose, batch, onShared }: ShareReportsModalProps) {
  const [doctors, setDoctors] = useState<ShareableDoctor[]>([]);
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<Set<number>>(new Set());
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setError(null);
    setSelectedDoctorIds(new Set());
    setIsLoadingDoctors(true);
    patientFileAPI
      .listShareableDoctors()
      .then((data) => {
        setDoctors(data);
        if (data.length === 0) {
          setError("No connected doctors yet. Book or request an appointment first.");
        }
      })
      .catch((err) => {
        if (err instanceof APIError) {
          setError(err.detail);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load doctors. Please try again.");
        }
      })
      .finally(() => setIsLoadingDoctors(false));
  }, [isOpen]);

  const toggleDoctor = (doctorId: number) => {
    setSelectedDoctorIds((prev) => {
      const next = new Set(prev);
      if (next.has(doctorId)) {
        next.delete(doctorId);
      } else {
        next.add(doctorId);
      }
      return next;
    });
  };

  const closeModal = () => {
    setSelectedDoctorIds(new Set());
    setError(null);
    onClose();
  };

  const handleShare = async () => {
    if (!batch) {
      setError("Select a report batch to share.");
      return;
    }
    if (selectedDoctorIds.size === 0) {
      setError("Select at least one doctor to share with.");
      return;
    }

    const targets: ShareBatchTargetPayload[] = [];
    for (const doctorId of selectedDoctorIds) {
      const doctor = doctors.find((d) => d.doctor_user_id === doctorId);
      if (!doctor) continue;
      const target: ShareBatchTargetPayload = {
        doctor_user_id: doctor.doctor_user_id,
      };
      if (doctor.relationship_type === "appointment" && doctor.appointment_id) {
        target.appointment_id = doctor.appointment_id;
      } else if (doctor.appointment_request_id) {
        target.appointment_request_id = doctor.appointment_request_id;
      }
      targets.push(target);
    }

    if (targets.length === 0) {
      setError("Unable to share because no appointment context was found.");
      return;
    }

    const payload: ShareBatchRequestPayload = {
      doctor_targets: targets,
    };

    setIsSubmitting(true);
    setError(null);
    try {
      await patientFileAPI.shareBatch(batch.id, payload);
      onShared?.("Reports shared successfully.");
      closeModal();
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.detail);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to share reports. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const heading = useMemo(() => {
    if (!batch) return "";
    if (batch.heading) return batch.heading;
    return `Batch #${batch.id}`;
  }, [batch]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-md">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Share Lab Report Batch</p>
            <h2 className="text-2xl font-semibold text-gray-900">{heading}</h2>
            {batch && (
              <p className="text-xs text-gray-500 mt-1">
                Uploaded on {new Date(batch.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <button
            onClick={closeModal}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close share modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {isLoadingDoctors ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <svg className="w-6 h-6 animate-spin mr-3 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                ></path>
              </svg>
              Loading doctors...
            </div>
          ) : doctors.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-500">
              No doctors available to share with yet.
            </div>
          ) : (
            <div className="space-y-3">
              {doctors.map((doctor) => {
                const isSelected = selectedDoctorIds.has(doctor.doctor_user_id);
                const statusLabel =
                  doctor.relationship_type === "appointment"
                    ? doctor.appointment_status || "Appointment"
                    : doctor.appointment_request_status || "Request pending";
                const badgeColor =
                  doctor.relationship_type === "appointment"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800";
                const schedule =
                  doctor.relationship_type === "appointment"
                    ? formatDateTime(doctor.appointment_date)
                    : formatDateTime(doctor.appointment_request_preferred_date);

                return (
                  <label
                    key={doctor.doctor_user_id}
                    className={`flex items-center gap-4 rounded-2xl border px-4 py-3 transition-colors ${
                      isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      checked={isSelected}
                      onChange={() => toggleDoctor(doctor.doctor_user_id)}
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{doctor.doctor_name}</p>
                          <p className="text-sm text-gray-500">{doctor.doctor_specialty || "Doctor"}</p>
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badgeColor}`}>
                          {doctor.relationship_type === "appointment" ? "Confirmed Appointment" : "Pending Request"}
                        </span>
                        <span className="text-xs text-gray-500">{statusLabel}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">{schedule}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-3 md:flex-row md:items-center">
          <button
            onClick={closeModal}
            className="w-full md:w-auto rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleShare}
            disabled={isSubmitting || selectedDoctorIds.size === 0 || doctors.length === 0}
            className="w-full md:w-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Sharing..." : `Share with ${selectedDoctorIds.size || ""} doctor${selectedDoctorIds.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

