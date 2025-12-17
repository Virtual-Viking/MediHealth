"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { calendarAPI, Appointment, patientAPI, PatientTimelineItem } from "@/services/api";

type ActivityType = "appointment" | "share" | "order" | "therapy" | "chore" | "collect" | "payment";

interface Activity {
  date: string;
  time: string;
  type: ActivityType;
  title: string;
  provider: string;
  location: string;
  description: string;
  dateLabel?: string;
}

export default function PatientDashboardContent() {
  const { user: _user } = useAuth();
  const [upcomingAppointment, setUpcomingAppointment] = useState<Appointment | null>(null);
  const [isLoadingAppointment, setIsLoadingAppointment] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    const fetchUpcomingAppointment = async () => {
      try {
        setIsLoadingAppointment(true);
        const appointments = await calendarAPI.getUpcomingAppointments(1);
        if (appointments.length > 0) {
          setUpcomingAppointment(appointments[0]);
        } else {
          setUpcomingAppointment(null);
        }
      } catch (error) {
        console.error("Failed to fetch upcoming appointments:", error);
        setUpcomingAppointment(null);
      } finally {
        setIsLoadingAppointment(false);
      }
    };

    fetchUpcomingAppointment();
  }, []);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        setIsLoadingTimeline(true);
        const activityType = filterType === "all" ? undefined : filterType;
        const timelineItems = await patientAPI.getTimeline(activityType);
        
        // Convert timeline items to activities
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const convertedActivities: Activity[] = timelineItems.map((item, index) => {
          const itemDate = new Date(item.timestamp);
          const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
          
          // Only show date label if this is the first item or if the date changed from previous item
          let dateLabel: string | undefined;
          if (index === 0) {
            // First item always shows date label
            if (itemDateOnly.getTime() === today.getTime()) {
              dateLabel = "Today";
            } else if (itemDateOnly.getTime() === tomorrow.getTime()) {
              dateLabel = "Tomorrow";
            } else if (itemDateOnly.getTime() === yesterday.getTime()) {
              dateLabel = "Yesterday";
            }
          } else {
            // Check if date changed from previous item
            const prevItem = timelineItems[index - 1];
            const prevDate = new Date(prevItem.timestamp);
            const prevDateOnly = new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate());
            
            if (itemDateOnly.getTime() !== prevDateOnly.getTime()) {
              if (itemDateOnly.getTime() === today.getTime()) {
                dateLabel = "Today";
              } else if (itemDateOnly.getTime() === tomorrow.getTime()) {
                dateLabel = "Tomorrow";
              } else if (itemDateOnly.getTime() === yesterday.getTime()) {
                dateLabel = "Yesterday";
              }
            }
          }

          return {
            date: formatDate(item.timestamp),
            time: formatTime(item.timestamp),
            type: item.type as ActivityType,
            title: item.title,
            provider: item.provider || "System",
            location: item.location || "Online",
            description: item.description || item.detail || "",
            dateLabel,
          };
        });

        setActivities(convertedActivities);
      } catch (error) {
        console.error("Failed to fetch timeline:", error);
        setActivities([]);
      } finally {
        setIsLoadingTimeline(false);
      }
    };

    fetchTimeline();
  }, [filterType]);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Get ordinal suffix for day
    const getOrdinalSuffix = (d: number): string => {
      if (d > 3 && d < 21) return "th";
      switch (d % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
      }
    };
    
    return `${month} ${day}${getOrdinalSuffix(day)} ${year}`;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");
    
    return `${displayHours}:${displayMinutes}${ampm.toLowerCase()}`;
  };

  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case "appointment":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case "share":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        );
      case "order":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case "therapy":
      case "chore":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case "collect":
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
    }
  };

  return (
    <main className="flex-1 p-4 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      {/* CSS Grid Layout - 3 columns, 4 rows */}
      <div 
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gridTemplateRows: "auto auto auto auto"
        }}
      >
        {/* Row 1 - Tracker Cards */}
        {/* Upcoming Appointments Card - Column 1 */}
        <div className="bg-white rounded-lg shadow p-3">
          <div className="border-l-4 border-blue-500 pl-3">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                Upcoming Appointments
                <button className="text-blue-500 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </h3>
            </div>
            {isLoadingAppointment ? (
              <div className="space-y-2">
                <div className="flex justify-center items-center py-4">
                  <div className="text-gray-400 text-xs">Loading...</div>
                </div>
              </div>
            ) : upcomingAppointment ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Doctor</span>
                  <span className="text-gray-500">Appointment</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-gray-900">
                    {upcomingAppointment.doctor 
                      ? `Dr. ${upcomingAppointment.doctor.name} | ${upcomingAppointment.doctor.specialty}`
                      : "Doctor"}
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatDate(upcomingAppointment.start_time)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Physician</span>
                  <span className="text-gray-500">
                    {formatTime(upcomingAppointment.start_time)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-center items-center py-4">
                  <div className="text-gray-400 text-xs">No new appointments</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Blood Sugar Tracker Card - Column 2 */}
        <div className="bg-white rounded-lg shadow p-3">
          <div className="border-l-4 border-red-500 pl-3">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                Blood Sugar Tracker
                <button className="text-red-500 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </h3>
            </div>
            <div className="flex justify-center items-center py-4">
              <div className="text-gray-400 text-xs">No data available</div>
            </div>
          </div>
        </div>

        {/* Blood Pressure Tracker Card - Column 3 */}
        <div className="bg-white rounded-lg shadow p-3">
          <div className="border-l-4 border-green-500 pl-3">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                Blood Pressure Tracker
                <button className="text-green-500 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              </h3>
            </div>
            <div className="flex justify-center items-center py-4">
              <div className="text-gray-400 text-xs">No data available</div>
            </div>
          </div>
        </div>

        {/* Row 2 - Timeline - Spans all 3 columns */}
        <div className="bg-white rounded-lg shadow p-4" style={{ gridRow: "2 / 3", gridColumn: "1 / 4" }}>
          {/* Filter Section */}
          <div className="mb-6 pb-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Activity Timeline</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600">Filter:</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                >
                  <option value="all">All Activities</option>
                  <option value="appointment">Appointments</option>
                  <option value="payment">Payments</option>
                  <option value="order">Orders</option>
                  <option value="share">Share Records</option>
                  <option value="collect">Collect Reports</option>
                  <option value="chore">File Uploads</option>
                </select>
              </div>
            </div>
          </div>

          {isLoadingTimeline ? (
            <div className="flex justify-center items-center py-8">
              <div className="text-gray-400 text-sm">Loading timeline...</div>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex justify-center items-center py-8">
              <div className="text-gray-400 text-sm">No timeline activities yet</div>
            </div>
          ) : (
            activities.map((activity, index) => (
            <div key={index} className="relative">
              {/* Date Label */}
              {activity.dateLabel && (
                <div className="flex justify-center mb-6">
                  <span className="bg-green-100 text-green-800 px-6 py-1.5 rounded-full text-sm font-medium">
                    {activity.dateLabel}
                  </span>
                </div>
              )}

              <div className="flex gap-6 pb-8">
                {/* Date/Time */}
                <div className="w-32 text-right flex-shrink-0">
                  <div className="text-pink-500 font-medium text-sm">{activity.date}</div>
                  <div className="text-pink-500 font-medium text-sm">{activity.time}</div>
                </div>

                {/* Timeline Dot and Line */}
                <div className="relative flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-pink-500 ring-4 ring-pink-100 z-10"></div>
                  {index < activities.length - 1 && (
                    <div className="w-0.5 h-full bg-pink-200 absolute top-3"></div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-2">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-2">
                        <span className="font-semibold text-blue-600">{activity.title}</span>
                        <span className="font-medium text-gray-900">{activity.provider}</span>
                        <div className="flex items-center gap-1 text-gray-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-sm font-medium">{activity.location}</span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {activity.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
          )}
        </div>
      </div>
    </main>
  );
}

