"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { doctorFinanceAPI, ConsultingPatient, PatientTimelineItem } from "@/services/api";

const statusFilters = [
  { value: "all", label: "All" },
  { value: "payment_pending", label: "Payment pending" },
  { value: "upcoming", label: "Has upcoming" },
  { value: "visited", label: "Has visits" },
];

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayName = days[date.getDay()];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${dayName} ${month} ${day} ${year}`;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, "0");
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

function getDateLabel(itemDate: string, index: number, all: PatientTimelineItem[]): string | null {
  if (index === 0) return "Today";
  const current = new Date(itemDate);
  const prev = new Date(all[index - 1].timestamp);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const c = new Date(current);
  c.setHours(0, 0, 0, 0);
  const p = new Date(prev);
  p.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - c.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return null; // first item is already "Today"
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (c.getTime() !== p.getTime()) {
    return formatDate(itemDate);
  }
  return null;
}

function getTypeBadge(type: string) {
  const base = "px-3 py-1 text-xs font-medium rounded-full";
  if (type === "payment") return <span className={`${base} bg-green-100 text-green-800`}>Payment</span>;
  if (type === "files") return <span className={`${base} bg-purple-100 text-purple-800`}>Files</span>;
  return <span className={`${base} bg-blue-100 text-blue-800`}>Appointment</span>;
}

export default function PatientsPage() {
  const { user: _user } = useAuth();
  const [patients, setPatients] = useState<ConsultingPatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchPatients = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await doctorFinanceAPI.getConsultingPatients();
      setPatients(data);
    } catch (err: any) {
      setError(err.detail || "Failed to load patients. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return patients.filter((p) => {
      const matchesSearch = term
        ? p.name.toLowerCase().includes(term)
        : true;
      const hasPaymentPending = p.status_text.toLowerCase().includes("payment pending");
      const matchesFilter =
        filter === "all" ||
        (filter === "payment_pending" && hasPaymentPending) ||
        (filter === "upcoming" && p.upcoming > 0) ||
        (filter === "visited" && p.visits > 0);
      return matchesSearch && matchesFilter;
    });
  }, [patients, search, filter]);

  return (
    <main className="flex-1 p-4 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="bg-white rounded-lg shadow p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
            <p className="text-gray-600">Patients who have interacted with you</p>
          </div>
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patients..."
              className="w-full md:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full md:w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {statusFilters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            Loading patients...
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={fetchPatients}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No patients found.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const isOpen = expandedId === p.patient_id;
              return (
                <div key={p.patient_id} className="bg-white rounded-lg shadow border border-gray-200">
                  <button
                    onClick={() => setExpandedId(isOpen ? null : p.patient_id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                        {p.photo_url ? (
                          <Image
                            src={p.photo_url}
                            alt={p.name}
                            width={48}
                            height={48}
                            className="h-12 w-12 object-cover"
                          />
                        ) : (
                          <span className="text-gray-500 text-sm font-semibold">
                            {p.name?.[0]?.toUpperCase() || "P"}
                          </span>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-base font-semibold text-gray-900">{p.name}</p>
                        <p className="text-sm text-gray-600">{p.status_text}</p>
                      </div>
                    </div>
                    <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4">
                      {p.timeline.length === 0 ? (
                        <div className="text-sm text-gray-600">No timeline data yet.</div>
                      ) : (
                        <div className="border-t border-gray-200 pt-4 space-y-6">
                          {p.timeline.map((item: PatientTimelineItem, idx: number) => {
                            const dateLabel = getDateLabel(item.timestamp, idx, p.timeline);
                            return (
                              <div key={`${item.timestamp}-${idx}`} className="relative">
                                {dateLabel && (
                                  <div className="flex justify-center mb-4">
                                    <span className="bg-blue-100 text-blue-800 px-4 py-1 rounded-full text-xs font-medium">
                                      {dateLabel}
                                    </span>
                                  </div>
                                )}
                                <div className="flex gap-6">
                                  <div className="w-32 text-right flex-shrink-0">
                                    <div className="text-blue-600 font-medium text-xs">{formatDate(item.timestamp)}</div>
                                    <div className="text-blue-600 font-medium text-xs">{formatTime(item.timestamp)}</div>
                                  </div>
                                  <div className="relative flex flex-col items-center">
                                    <div className="w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-100 z-10"></div>
                                    {idx < p.timeline.length - 1 && (
                                      <div className="w-0.5 h-full bg-blue-200 absolute top-3"></div>
                                    )}
                                  </div>
                                  <div className="flex-1 pb-2">
                                    <div className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition-shadow">
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          {getTypeBadge(item.type)}
                                          <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                                        </div>
                                      </div>
                                      {item.detail && (
                                        <p className="text-xs text-gray-600 mb-2">{item.detail}</p>
                                      )}
                                      {item.files && item.files.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-2">
                                          {item.files.map((f) => (
                                            <a
                                              key={f.url}
                                              href={f.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 11h10M7 15h6" />
                                              </svg>
                                              <span className="truncate max-w-[140px]">{f.name}</span>
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                      <p className="text-xs text-gray-500">
                                        {formatDate(item.timestamp)} · {formatTime(item.timestamp)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

