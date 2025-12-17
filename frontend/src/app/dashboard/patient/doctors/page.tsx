"use client";

import { KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { doctorAPI, DoctorListItem, APIError, VisitingDoctor, VisitingDoctorTimelineItem, doctorFinanceAPI } from "@/services/api";
import { formatSpecialty } from "@/utils/formatSpecialty";
import DoctorMapWidget from "@/components/DoctorMapWidget";
import RequestAppointmentModal from "@/components/patient/RequestAppointmentModal";

export default function DoctorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] =
    useState<string>("All Specialties");
  const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
  const [specialtyOptions, setSpecialtyOptions] = useState<string[]>([
    "All Specialties",
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [patientLatitude, setPatientLatitude] = useState<number | null>(null);
  const [patientLongitude, setPatientLongitude] = useState<number | null>(null);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorListItem | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [selectedDoctorForRequest, setSelectedDoctorForRequest] = useState<DoctorListItem | null>(null);
  const [visitingDoctors, setVisitingDoctors] = useState<VisitingDoctor[]>([]);
  const [visitingLoading, setVisitingLoading] = useState(false);
  const [visitingError, setVisitingError] = useState<string | null>(null);
  const [expandedVisitingId, setExpandedVisitingId] = useState<number | null>(null);

  const mergeSpecialties = useCallback((incoming: Array<string | null | undefined | { value?: string; label?: string }>) => {
    setSpecialtyOptions((prev) => {
      const existing = new Set(
        prev.filter((option) => option !== "All Specialties")
      );

      incoming.forEach((value) => {
        // Handle Specialty objects from API
        let stringValue: string;
        if (value && typeof value === 'object' && 'value' in value) {
          stringValue = value.value ?? value.label ?? "";
        } else {
          stringValue = String(value ?? "");
        }
        
        const cleaned = stringValue.trim();
        if (cleaned.length > 0) {
          existing.add(cleaned);
        }
      });

      const sorted = Array.from(existing).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );

      return ["All Specialties", ...sorted];
    });
  }, []);

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPatientLatitude(position.coords.latitude);
        setPatientLongitude(position.coords.longitude);
        setIsLocationLoading(false);
      },
      (err) => {
        setError("Unable to get your location. Please try again.");
        setIsLocationLoading(false);
      }
    );
  }, []);

  const fetchDoctors = useCallback(
    async (filters?: {
      search?: string;
      specialty?: string;
      patient_latitude?: number;
      patient_longitude?: number;
    }) => {
      setIsLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const data = await doctorAPI.listDoctors(filters);
        setDoctors(data);
        const allSpecialties = data.flatMap((doctor) => 
          doctor.specialties && doctor.specialties.length > 0 
            ? doctor.specialties 
            : doctor.specialty 
              ? [doctor.specialty] 
              : []
        );
        mergeSpecialties(allSpecialties);
      } catch (err) {
        if (err instanceof APIError) {
          setError(err.detail);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Unable to load doctors right now.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [mergeSpecialties]
  );

  useEffect(() => {
    let isMounted = true;

    const fetchSpecialties = async () => {
      try {
        const distinct = await doctorAPI.listSpecialties();
        if (!isMounted) return;
        mergeSpecialties(distinct);
      } catch {
        // Ignore specialty load errors; options will be derived from doctor data
      }
    };

    fetchSpecialties();
    fetchVisitingDoctors();

    return () => {
      isMounted = false;
    };
  }, [mergeSpecialties]);

  const filteredDoctors = doctors;

  const buildFilters = useCallback(() => {
    const specialtyFilter =
      selectedSpecialty !== "All Specialties" ? selectedSpecialty : undefined;
    const searchFilter = searchQuery.trim() ? searchQuery.trim() : undefined;

    return {
      specialty: specialtyFilter,
      search: searchFilter,
      patient_latitude: patientLatitude ?? undefined,
      patient_longitude: patientLongitude ?? undefined,
    };
  }, [searchQuery, selectedSpecialty, patientLatitude, patientLongitude]);

  const handleSearch = () => {
    const filters = buildFilters();
    fetchDoctors(filters);
  };

  const handleRefresh = () => {
    const filters = buildFilters();
    fetchDoctors(filters);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch();
    }
  };

  const handleBookAppointment = (doctor: DoctorListItem) => {
    setSelectedDoctorForRequest(doctor);
    setRequestModalOpen(true);
  };

  const handleRequestSuccess = () => {
    // Optionally refresh the list or show a success message
    console.log("Appointment request submitted successfully");
  };

  const fetchVisitingDoctors = async () => {
    try {
      setVisitingLoading(true);
      setVisitingError(null);
      const data = await doctorFinanceAPI.getVisitingDoctors();
      setVisitingDoctors(data);
    } catch (err: any) {
      setVisitingError(err.detail || "Failed to load your doctors.");
    } finally {
      setVisitingLoading(false);
    }
  };

  const handleSendMessage = (doctorId: number) => {
    // TODO: Navigate to chats with doctor pre-selected
    console.log("Send message to doctor:", doctorId);
  };

  const handleViewProfile = (doctorId: number) => {
    // TODO: Navigate to doctor profile page
    console.log("View profile for doctor:", doctorId);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${dayName} ${month} ${day} ${year}`;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const getDateLabel = (itemDate: string, index: number, all: VisitingDoctorTimelineItem[]): string | null => {
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
    if (diffDays === 0) return null;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (c.getTime() !== p.getTime()) {
      return formatDate(itemDate);
    }
    return null;
  };

  const getTypeBadge = (type: string) => {
    const base = "px-3 py-1 text-xs font-medium rounded-full";
    if (type === "payment") return <span className={`${base} bg-green-100 text-green-800`}>Payment</span>;
    if (type === "files") return <span className={`${base} bg-purple-100 text-purple-800`}>Files</span>;
    return <span className={`${base} bg-blue-100 text-blue-800`}>Appointment</span>;
  };

  const placeholderPhoto = "/Avatar.jpg";
  const visitingFiltered = useMemo(() => visitingDoctors, [visitingDoctors]);

  return (
    <main
      className="flex-1 overflow-y-auto p-4"
      style={{ backgroundColor: "#ECF4F9" }}
    >
      <div className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Your Doctors</h2>
              <p className="text-sm text-gray-500">Doctors you’ve consulted or have upcoming visits with.</p>
            </div>
            <button
              onClick={fetchVisitingDoctors}
              className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
              disabled={visitingLoading}
            >
              Refresh
            </button>
          </div>

          {visitingLoading ? (
            <div className="text-center text-gray-500 py-6">Loading...</div>
          ) : visitingError ? (
            <div className="text-center text-red-600 py-6">{visitingError}</div>
          ) : visitingFiltered.length === 0 ? (
            <div className="text-center text-gray-500 py-6">No doctors to show yet.</div>
          ) : (
            <div className="space-y-3">
              {visitingFiltered.map((d) => {
                const isOpen = expandedVisitingId === d.doctor_id;
                return (
                  <div key={d.doctor_id} className="bg-white rounded-lg border border-gray-200 shadow-sm">
                    <button
                      onClick={() => setExpandedVisitingId(isOpen ? null : d.doctor_id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                          {d.photo_url ? (
                            <Image src={d.photo_url} alt={d.name} width={48} height={48} className="h-12 w-12 object-cover" />
                          ) : (
                            <span className="text-gray-500 text-sm font-semibold">
                              {d.name?.[0]?.toUpperCase() || "D"}
                            </span>
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-base font-semibold text-gray-900">{d.name}</p>
                          <p className="text-sm text-gray-600">
                            {d.specialty ? formatSpecialty(d.specialty) : "Doctor"} · {d.status_text}
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4">
                        {d.timeline.length === 0 ? (
                          <div className="text-sm text-gray-600">No timeline data yet.</div>
                        ) : (
                          <div className="border-t border-gray-200 pt-4 space-y-6">
                            {d.timeline.map((item: VisitingDoctorTimelineItem, idx: number) => {
                              const dateLabel = getDateLabel(item.timestamp, idx, d.timeline);
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
                                      {idx < d.timeline.length - 1 && (
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

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Find a Doctor</h2>
              <p className="text-sm text-gray-500">
                Browse licensed doctors connected to MediLink and reach out
                directly from your dashboard.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isLoading || !hasSearched}
              className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          <div className="mb-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search by doctor name, specialty, or keyword"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 pl-12 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <svg
                    className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <button
                  onClick={handleSearch}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "Searching..." : "Search"}
                </button>
              </div>
            </div>
            <div>
              <select
                value={selectedSpecialty}
                onChange={(e) => setSelectedSpecialty(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {specialtyOptions.map((specialty) => (
                  <option key={specialty} value={specialty}>
                    {specialty === "All Specialties"
                      ? specialty
                      : formatSpecialty(specialty)}
                  </option>
                ))}
              </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleUseMyLocation}
                disabled={isLocationLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {isLocationLoading
                  ? "Getting location..."
                  : patientLatitude && patientLongitude
                    ? "Location set ✓"
                    : "Use my location"}
              </button>
              {patientLatitude && patientLongitude && (
                <span className="text-sm text-gray-500">
                  Location: {patientLatitude.toFixed(4)}, {patientLongitude.toFixed(4)}
                </span>
              )}
            </div>
          </div>

          {error && hasSearched && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="flex items-start justify-between gap-4">
                <p>{error}</p>
                <button
                  onClick={handleRefresh}
                  className="text-sm font-medium text-red-700 underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {isLoading
                  ? "Searching doctors..."
                  : hasSearched
                    ? `Search Results (${filteredDoctors.length})`
                    : "Search Results"}
              </h3>
              {hasSearched && !isLoading && (
                <span className="text-sm text-gray-500">
                  Showing {filteredDoctors.length}{" "}
                  {filteredDoctors.length === 1 ? "doctor" : "doctors"}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`doctor-skeleton-${idx}`}
                    className="animate-pulse rounded-lg border border-gray-200 p-5"
                  >
                    <div className="mb-4 flex items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-gray-200" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 rounded bg-gray-200" />
                        <div className="h-3 w-1/2 rounded bg-gray-200" />
                      </div>
                    </div>
                    <div className="mb-4 space-y-2">
                      <div className="h-3 w-full rounded bg-gray-200" />
                      <div className="h-3 w-5/6 rounded bg-gray-200" />
                    </div>
                    <div className="h-10 w-full rounded bg-gray-200" />
                  </div>
                ))}
              </div>
            ) : !hasSearched ? (
              <div className="py-12 text-center text-gray-500">
                <p>Use the search and filters to find doctors.</p>
              </div>
            ) : filteredDoctors.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                <p>No doctors found matching your criteria.</p>
                <p className="mt-2 text-sm">
                  Try adjusting your search terms or refresh the list.
                </p>
              </div>
            ) : (
              <>
                {hasSearched && filteredDoctors.length > 0 && (
                  <div className="mb-6">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Map View
                      </h3>
                      <button
                        onClick={() => setIsMapExpanded(true)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                          />
                        </svg>
                        Expand Map
                      </button>
                    </div>
                    <div className="h-96 rounded-lg border border-gray-200 overflow-hidden">
                      <DoctorMapWidget
                        doctors={filteredDoctors}
                        patientLatitude={patientLatitude}
                        patientLongitude={patientLongitude}
                        onDoctorClick={setSelectedDoctor}
                      />
                    </div>
                  </div>
                )}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredDoctors.map((doctor) => {
                  const fullName = [
                    doctor.first_name,
                    doctor.middle_name,
                    doctor.last_name,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const languages = doctor.languages_spoken.filter(Boolean);
                  const certifications = doctor.board_certifications.filter(
                    Boolean
                  );
                  const photoUrl = doctor.photo_url || placeholderPhoto;
                  const isRemotePhoto = doctor.photo_url
                    ? doctor.photo_url.startsWith("http")
                    : false;

                  return (
                    <div
                      key={doctor.id}
                      className="rounded-lg border border-gray-200 p-5 transition-shadow hover:shadow-lg"
                    >
                      <div className="mb-4 flex items-start gap-4">
                        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200">
                          {isRemotePhoto ? (
                            <img
                              src={photoUrl}
                              alt={fullName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Image
                              src={photoUrl}
                              alt={fullName}
                              width={64}
                              height={64}
                              className="h-full w-full object-cover"
                              unoptimized={isRemotePhoto}
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-lg font-semibold text-gray-900">
                            {fullName || "Unknown Doctor"}
                          </h3>
                          {doctor.specialties && doctor.specialties.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {doctor.specialties.map((spec, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium"
                                >
                                  {spec}
                                </span>
                              ))}
                            </div>
                          ) : doctor.specialty && (
                            <p className="mt-1 text-sm font-medium text-blue-600">
                              {formatSpecialty(doctor.specialty)}
                            </p>
                          )}
                          {doctor.years_of_experience != null && (
                            <p className="mt-1 text-xs text-gray-500">
                              {doctor.years_of_experience} years experience
                            </p>
                          )}
                          {doctor.google_rating && (
                            <div className="mt-1 flex items-center gap-1">
                              <svg
                                className="h-4 w-4 text-yellow-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              <span className="text-sm font-medium text-gray-700">
                                {doctor.google_rating.toFixed(1)}
                              </span>
                              {doctor.google_user_ratings_total && (
                                <span className="text-xs text-gray-500">
                                  ({doctor.google_user_ratings_total})
                                </span>
                              )}
                            </div>
                          )}
                          {doctor.distance_km && (
                            <p className="mt-1 text-xs text-gray-500">
                              📍 {doctor.distance_km.toFixed(1)} km away
                            </p>
                          )}
                        </div>
                      </div>

                      {doctor.bio && (
                        <p className="mb-4 line-clamp-3 text-sm text-gray-600">
                          {doctor.bio}
                        </p>
                      )}

                      <div className="mb-4 space-y-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 flex-shrink-0 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a5.5 5.5 0 01-9 0"
                            />
                          </svg>
                          <span className="truncate">{doctor.email}</span>
                        </div>
                        {doctor.phone && (
                          <div className="flex items-center gap-2">
                            <svg
                              className="h-4 w-4 flex-shrink-0 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                              />
                            </svg>
                            <span>{doctor.phone}</span>
                          </div>
                        )}
                      </div>

                      {languages.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {languages.map((language) => (
                            <span
                              key={`${doctor.id}-lang-${language}`}
                              className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                            >
                              {language}
                            </span>
                          ))}
                        </div>
                      )}

                      {certifications.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                          {certifications.map((cert) => (
                            <span
                              key={`${doctor.id}-cert-${cert}`}
                              className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                            >
                              {cert}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleBookAppointment(doctor)}
                          className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                        >
                          Request Appointment
                        </button>
                        <button
                          onClick={() => handleSendMessage(doctor.id)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          Message
                        </button>
                        <button
                          onClick={() => handleViewProfile(doctor.id)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          Profile
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {isMapExpanded && (
        <div className="fixed inset-0 z-50 flex bg-white">
          <div className="flex h-full w-full">
            <div className="flex-1 relative">
              <button
                onClick={() => setIsMapExpanded(false)}
                className="absolute top-4 right-4 z-10 rounded-full bg-white p-2 shadow-lg transition-colors hover:bg-gray-100"
                aria-label="Close map"
              >
                <svg
                  className="h-6 w-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <DoctorMapWidget
                doctors={filteredDoctors}
                patientLatitude={patientLatitude}
                patientLongitude={patientLongitude}
                onDoctorClick={setSelectedDoctor}
              />
            </div>
            <div className="w-96 border-l border-gray-200 overflow-y-auto bg-white">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Search Results ({filteredDoctors.length})
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {filteredDoctors.map((doctor) => {
                  const fullName = [
                    doctor.first_name,
                    doctor.middle_name,
                    doctor.last_name,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const isSelected = selectedDoctor?.id === doctor.id;
                  const clinics = doctor.clinics && doctor.clinics.length > 0 
                    ? doctor.clinics 
                    : doctor.latitude && doctor.longitude
                      ? [{
                          address_id: 0,
                          label: doctor.address_line1 ? "Primary Clinic" : null,
                          address_line1: doctor.address_line1 || "",
                          address_line2: doctor.address_line2 || null,
                          city: doctor.city || "",
                          state: doctor.state || null,
                          postal_code: doctor.postal_code || null,
                          country_code: doctor.country_code || null,
                          latitude: doctor.latitude,
                          longitude: doctor.longitude,
                          place_id: doctor.place_id || null,
                          is_primary: true,
                          distance_km: doctor.distance_km || null,
                        }]
                      : [];

                  return (
                    <div key={doctor.id}>
                      <div
                        onClick={() => setSelectedDoctor(doctor)}
                        className={`p-4 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-blue-50 border-l-4 border-blue-600"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <h3 className="font-semibold text-gray-900">{fullName}</h3>
                        {doctor.specialties && doctor.specialties.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {doctor.specialties.map((spec, idx) => (
                              <span
                                key={idx}
                                className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium"
                              >
                                {spec}
                              </span>
                            ))}
                          </div>
                        ) : doctor.specialty && (
                          <p className="text-sm text-blue-600 mt-1">
                            {formatSpecialty(doctor.specialty)}
                          </p>
                        )}
                        {doctor.google_rating && (
                          <div className="mt-2 flex items-center gap-1">
                            <svg
                              className="h-4 w-4 text-yellow-400"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700">
                              {doctor.google_rating.toFixed(1)}
                            </span>
                            {doctor.google_user_ratings_total && (
                              <span className="text-xs text-gray-500">
                                ({doctor.google_user_ratings_total})
                              </span>
                            )}
                          </div>
                        )}
                        {clinics.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {clinics.map((clinic, idx) => (
                              <div key={clinic.address_id || idx} className="text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                  {clinic.is_primary && (
                                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                                      Primary
                                    </span>
                                  )}
                                  <span className="font-medium">
                                    {clinic.label || clinic.address_line1 || "Clinic"}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 ml-0">
                                  {clinic.address_line1}
                                  {clinic.city && `, ${clinic.city}`}
                                </p>
                                {clinic.distance_km && (
                                  <p className="text-xs text-gray-500">
                                    📍 {clinic.distance_km.toFixed(1)} km away
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {clinics.length === 0 && doctor.address_line1 && (
                          <p className="text-sm text-gray-600 mt-2">
                            {doctor.address_line1}
                            {doctor.city && `, ${doctor.city}`}
                          </p>
                        )}
                        {clinics.length === 0 && doctor.distance_km && (
                          <p className="text-xs text-gray-500 mt-1">
                            📍 {doctor.distance_km.toFixed(1)} km away
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDoctorForRequest && (
        <RequestAppointmentModal
          isOpen={requestModalOpen}
          onClose={() => {
            setRequestModalOpen(false);
            setSelectedDoctorForRequest(null);
          }}
          doctorId={selectedDoctorForRequest.id}
          doctorName={[
            selectedDoctorForRequest.first_name,
            selectedDoctorForRequest.middle_name,
            selectedDoctorForRequest.last_name,
          ]
            .filter(Boolean)
            .join(" ")}
          onSuccess={handleRequestSuccess}
        />
      )}
    </main>
  );
}
