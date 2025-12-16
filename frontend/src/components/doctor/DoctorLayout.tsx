"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { doctorAPI } from "@/services/api";
import NotificationBell from "@/components/common/NotificationBell";

interface DoctorLayoutProps {
  children: React.ReactNode;
}

export default function DoctorLayout({ children }: DoctorLayoutProps) {
  const { user, isAuthenticated, isLoading, logout, setUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [photoVersion, setPhotoVersion] = useState(0); // For cache-busting

  // Fetch profile picture on mount and when user changes
  useEffect(() => {
    const fetchProfilePhoto = async () => {
      if (user?.role === "doctor" && isAuthenticated && user?.id) {
        try {
          setLoadingPhoto(true);
          const profileData = await doctorAPI.getProfile();
          if (profileData.profile?.photo_url) {
            // Store base URL without cache-busting (we'll add it when displaying)
            const photoUrl = profileData.profile.photo_url;
            setProfilePhotoUrl(photoUrl);
            setPhotoVersion(prev => prev + 1);
            
            // Update user context with photo_url (base URL only)
            if (user && user.photo_url !== photoUrl) {
              setUser({ ...user, photo_url: photoUrl });
            }
          } else {
            setProfilePhotoUrl(null);
            // Clear photo_url from user context if no photo
            if (user && user.photo_url) {
              setUser({ ...user, photo_url: undefined });
            }
          }
        } catch (error) {
          console.error("Failed to fetch profile photo:", error);
          setProfilePhotoUrl(null);
        } finally {
          setLoadingPhoto(false);
        }
      } else {
        setLoadingPhoto(false);
      }
    };

    fetchProfilePhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAuthenticated]);

  // Also refresh photo when user.photo_url changes (from settings page)
  useEffect(() => {
    if (user?.photo_url && user.role === "doctor") {
      setProfilePhotoUrl(user.photo_url);
      setPhotoVersion(prev => prev + 1);
    } else if (!user?.photo_url && user?.role === "doctor") {
      setProfilePhotoUrl(null);
    }
  }, [user?.photo_url]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    } else if (!isLoading && user?.role !== "doctor") {
      router.push(`/dashboard/${user?.role}`);
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !isAuthenticated || user?.role !== "doctor") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const doctorName = `Dr. ${user.first_name} ${user.last_name}`;

  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ECF4F9" }}>
      {/* Sidebar - 256px, positioned outside and to the left of 1280px boundary, below header and welcome div (118px from top), aligned with body section */}
      <aside className="flex flex-col flex-shrink-0" style={{ width: "256px", backgroundColor: "#ECF4F9", height: "calc(100vh - 118px)", position: "fixed", left: "calc((100% - 256px - 1280px) / 2)", top: "118px", zIndex: 10 }}>
            <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
              {/* Overview Section */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Overview
                </h3>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/dashboard/doctor/dashboard"
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                        isActive("/dashboard/doctor/dashboard")
                          ? "bg-white text-gray-800 font-medium shadow-sm"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <Image
                        src="/icons/dashboard.svg"
                        alt="Dashboard"
                        width={20}
                        height={20}
                      />
                      Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/dashboard/doctor/appointments"
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                        isActive("/dashboard/doctor/appointments")
                          ? "bg-white text-gray-800 font-medium shadow-sm"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <Image
                        src="/icons/calendar-clock.svg"
                        alt="Appointments"
                        width={20}
                        height={20}
                      />
                      Appointments
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/dashboard/doctor/patients"
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                        isActive("/dashboard/doctor/patients")
                          ? "bg-white text-gray-800 font-medium shadow-sm"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <Image
                        src="/icons/users.svg"
                        alt="Patients"
                        width={20}
                        height={20}
                      />
                      Patients
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/dashboard/doctor/reports"
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                        isActive("/dashboard/doctor/reports")
                          ? "bg-white text-gray-800 font-medium shadow-sm"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <Image
                        src="/icons/data-report.svg"
                        alt="Reports"
                        width={20}
                        height={20}
                      />
                      Reports
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Finance Section */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Finance
                </h3>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/dashboard/doctor/finance"
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                        isActive("/dashboard/doctor/finance")
                          ? "bg-white text-gray-800 font-medium shadow-sm"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <Image
                        src="/icons/dashboard.svg"
                        alt="Dashboard"
                        width={20}
                        height={20}
                      />
                      Dashboard
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/dashboard/doctor/payment-history"
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                        isActive("/dashboard/doctor/payment-history")
                          ? "bg-white text-gray-800 font-medium shadow-sm"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <Image
                        src="/icons/file-invoice-dollar.svg"
                        alt="Payment History"
                        width={20}
                        height={20}
                      />
                      Payment History
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/dashboard/doctor/finance-reports"
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                        isActive("/dashboard/doctor/finance-reports")
                          ? "bg-white text-gray-800 font-medium shadow-sm"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <Image
                        src="/icons/data-report.svg"
                        alt="Reports"
                        width={20}
                        height={20}
                      />
                      Reports
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Account Settings Section */}
              <div className="border-t border-gray-200 pt-6">
                <div className="space-y-1">
                  <Link
                    href="/dashboard/doctor/settings"
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                      isActive("/dashboard/doctor/settings")
                        ? "bg-white text-gray-800 font-medium shadow-sm"
                        : "text-gray-600 hover:bg-white"
                    }`}
                  >
                    <Image
                      src="/icons/account-settings.svg"
                      alt="Account Settings"
                      width={20}
                      height={20}
                    />
                    Account Settings
                  </Link>
                  <Link
                    href="/dashboard/doctor/support"
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                      isActive("/dashboard/doctor/support")
                        ? "bg-white text-gray-800 font-medium shadow-sm"
                        : "text-gray-600 hover:bg-white"
                    }`}
                  >
                    <Image
                      src="/icons/headphones.svg"
                      alt="Help & Support"
                      width={20}
                      height={20}
                    />
                    Help & Support
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-gray-600 hover:bg-white rounded-lg transition"
                  >
                    <Image
                      src="/icons/log-out.svg"
                      alt="Logout"
                      width={20}
                      height={20}
                    />
                    Logout
                  </button>
                </div>
              </div>
            </nav>
          </aside>

      {/* Main container - 1280px boundary, centered and offset by sidebar */}
      <div className="flex flex-col mx-auto" style={{ maxWidth: "1280px", marginLeft: "calc(256px + (100% - 256px - 1280px) / 2)", width: "1280px" }}>
        {/* Header - No white background, no shadow */}
        <header className="px-6 py-3 w-full">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center">
              <Image
                src="/logo.svg"
                alt="MEDIHEALTH"
                width={190}
                height={50}
              />
            </div>

            {/* Right Side - Search, Icons and Profile */}
            <div className="flex items-center gap-3 ml-auto">
              {/* Search Bar - Wider with fully rounded ends */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  className="rounded-full border border-gray-300 px-4 py-2 pl-10 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white text-gray-900 placeholder:text-gray-400"
                  style={{ width: "400px" }}
                />
                <svg
                  className="w-4 h-4 absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400"
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

              <button className="text-gray-600 hover:text-gray-800">
                <Image
                  src="/icons/messages.svg"
                  alt="Chat"
                  width={20}
                  height={20}
                />
              </button>
              <NotificationBell />

              <div className="flex items-center gap-3 ml-2 pl-3 border-l border-gray-200">
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden relative">
                  {profilePhotoUrl || user?.photo_url ? (
                    <Image
                      key={`header-photo-${photoVersion}`}
                      src={`${profilePhotoUrl || user.photo_url}?v=${photoVersion}&t=${Date.now()}`}
                      alt="Profile"
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                      unoptimized // Bypass Next.js image optimization for external URLs
                      onError={(e) => {
                        // Hide image if it fails to load, show placeholder
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                      onLoad={(e) => {
                        // Show image when it loads successfully
                        (e.target as HTMLImageElement).style.display = 'block';
                      }}
                    />
                  ) : null}
                  {(!profilePhotoUrl && !user?.photo_url) && (
                    <svg
                      className="w-6 h-6 text-gray-600"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {doctorName}
                  </p>
                  <p className="text-xs text-gray-500">
                    General Practitioner G.P.
                  </p>
                  <p className="text-xs text-gray-500">since 2004</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Welcome Message Div - Full width, centered text, no background, no shadows */}
        <div className="w-full text-center py-2">
          <p className="text-gray-700">Welcome back {doctorName}</p>
        </div>

        {/* Main Content - 1280px */}
        <div className="flex flex-col flex-1" style={{ width: "1280px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

