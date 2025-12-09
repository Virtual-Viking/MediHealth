"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { doctorAPI, DoctorProfileData } from "@/services/api";
import { formatSpecialty } from "@/utils/formatSpecialty";
import DeactivateAccountDialog from "@/components/DeactivateAccountDialog";

const gradientOverlay =
  "linear-gradient(180deg, rgba(10, 12, 29, 0.05) 0%, rgba(10, 12, 29, 0.45) 100%)";

const chipClasses = (active: boolean) =>
  `px-4 py-1 rounded-full text-sm font-medium tracking-wide ${
    active ? "bg-gray-900/90 text-white" : "bg-white/80 text-gray-500"
  }`;

export default function DoctorProfileSummaryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<DoctorProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [accountStatus, setAccountStatus] = useState<{ service_provider_status: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await doctorAPI.getProfile();
        if (!mounted) return;
        setProfileData(data);
        setError(null);
        
        // Load account status
        try {
          const status = await doctorAPI.getAccountStatus();
          if (!mounted) return;
          setAccountStatus(status);
        } catch (err) {
          console.error("Failed to load account status:", err);
        }
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError("Unable to load your public profile right now.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleDeactivate = async (reason: string, feedback: string) => {
    try {
      await doctorAPI.deactivateAccount({
        portal_type: "service_provider",
        reason: reason || undefined,
        feedback: feedback || undefined,
      });
      // Reload account status
      const status = await doctorAPI.getAccountStatus();
      setAccountStatus(status);
      setShowDeactivateDialog(false);
      // Redirect to home or show message
      router.push("/");
    } catch (err: any) {
      throw new Error(err.detail || "Failed to deactivate account");
    }
  };

  const profile = profileData?.profile;
  const socialLinks = useMemo(
    () => (profileData?.social_links ?? []).filter((link) => link.is_visible),
    [profileData?.social_links]
  );

  const profilePhotoUrl = profile?.photo_url ?? null;
  const profileInitial =
    profileData?.user?.first_name?.[0]?.toUpperCase() ||
    profileData?.user?.last_name?.[0]?.toUpperCase() ||
    "D";

  const fullName = useMemo(() => {
    const first = profileData?.user.first_name ?? user?.first_name ?? "";
    const last = profileData?.user.last_name ?? user?.last_name ?? "";
    const suffix = profile?.specialty ? `, ${formatSpecialty(profile.specialty)}` : "";
    return `Dr. ${[first, last].filter(Boolean).join(" ")}${suffix}`;
  }, [profileData?.user.first_name, profileData?.user.last_name, profile?.specialty, user]);

  const headline =
    profile?.bio?.split(".")[0] ||
    "Dedicated physician providing compassionate, evidence-based care.";

  const coverPhoto = profile?.cover_photo_url || null;

  const chips = [
    {
      label: profile?.accepting_new_patients
        ? "Accepting new patients"
        : "Not accepting new patients",
      active: Boolean(profile?.accepting_new_patients),
    },
    { label: "Virtual visits", active: Boolean(profile?.offers_virtual_visits) },
  ];

  const yearsOfExperience = profile?.years_of_experience
    ? `${profile.years_of_experience}+ years`
    : "Experience not set";

  const certifications = profile?.board_certifications ?? [];
  const languages = profile?.languages_spoken ?? [];
  const clinics = profileData?.clinics ?? [];

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ backgroundColor: "#ECF4F9" }}>
        <div className="text-gray-600 text-lg">Loading profile...</div>
      </main>
    );
  }

  if (error || !profileData) {
    return (
      <main className="flex-1 flex items-center justify-center px-6" style={{ backgroundColor: "#ECF4F9" }}>
        <div className="bg-white shadow rounded-2xl p-8 text-center max-w-lg">
          <p className="text-gray-900 font-semibold mb-2">Something went wrong</p>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.refresh()}
            className="px-4 py-2 rounded-full bg-gray-900 text-white hover:bg-gray-800 transition"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      <section className="p-4 md:p-6 lg:p-8">
        <div className="bg-white rounded-[32px] shadow-xl overflow-hidden relative">
          <div className="relative h-64 w-full">
            <div
              className="absolute inset-0"
              style={
                coverPhoto
                  ? {
                      backgroundImage: `url(${coverPhoto})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : {
                      backgroundImage:
                        "linear-gradient(120deg, #111827 0%, #374151 50%, #111827 100%)",
                    }
              }
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: gradientOverlay,
              }}
            />

            <button
              onClick={() => router.push("/dashboard/doctor/settings/edit")}
              className="absolute top-6 left-6 px-4 py-2 rounded-full bg-white/90 text-gray-900 text-sm font-semibold shadow"
            >
              Edit profile
            </button>

            <div className="absolute top-6 right-6 flex gap-3">
              {chips.map((chip) => (
                <span key={chip.label} className={chipClasses(chip.active)}>
                  {chip.label}
                </span>
              ))}
            </div>
          </div>

          <div className="px-6 md:px-12 pb-12">
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 -mt-24">
              <div className="flex flex-col items-center text-center lg:text-left">
                <div className="relative">
                  {profilePhotoUrl ? (
                    <img
                      src={profilePhotoUrl}
                      alt={fullName}
                      className="w-48 h-48 rounded-full border-8 border-white object-cover shadow-xl bg-gray-900"
                    />
                  ) : (
                    <div className="w-48 h-48 rounded-full border-8 border-white bg-gray-900 text-white flex items-center justify-center text-4xl font-semibold shadow-xl">
                      {profileInitial}
                    </div>
                  )}
                </div>
                <p className="text-gray-500 mt-4">{yearsOfExperience}</p>
              </div>

              <div className="flex-1 space-y-6">
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-gray-900">{fullName}</h1>
                  <p className="text-gray-600 mt-3 leading-relaxed">{headline}</p>
                </div>

                <div className="flex flex-wrap gap-4">
                  <InfoPill label="Specialty" value={formatSpecialty(profile?.specialty) || "Not specified"} />
                  <InfoPill label="License" value={profile?.medical_license_number || "Not provided"} />
                  <InfoPill label="Phone" value={profileData.user.phone || "Not provided"} />
                  <InfoPill label="Email" value={profileData.user.email || "Not provided"} />
                </div>
              </div>

              <div className="w-full lg:w-64 bg-gray-50 rounded-2xl p-6 space-y-4">
                <p className="uppercase text-xs tracking-[0.2em] text-gray-500">Contact</p>
                <div className="space-y-3 text-sm text-gray-700">
                  <div>
                    <p className="font-semibold text-gray-900">Phone</p>
                    <p>{profileData.user.phone || "Not provided"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Email</p>
                    <p className="break-all">{profileData.user.email}</p>
                  </div>
                  {clinics[0]?.city && (
                    <div>
                      <p className="font-semibold text-gray-900">Primary clinic</p>
                      <p>
                        {clinics[0].clinic_name}
                        <br />
                        {[clinics[0].city, clinics[0].state].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  )}
                </div>

                {socialLinks.length > 0 && (
                  <div>
                    <p className="uppercase text-xs tracking-[0.2em] text-gray-500 mb-2">Social</p>
                    <div className="flex flex-wrap gap-2">
                      {socialLinks.map((link) => (
                        <Link
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 rounded-full bg-white text-gray-900 text-xs font-semibold shadow-sm hover:bg-gray-100 transition"
                        >
                          {link.display_label || link.platform}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
              <div className="lg:col-span-2 space-y-8">
                <SectionCard title="About">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                    {profile?.bio || "You haven’t added a bio yet. Share your story and care philosophy to build trust with patients."}
                  </p>
                </SectionCard>

                <SectionCard title="Professional Snapshot">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <SnapshotItem label="Primary Specialty" value={formatSpecialty(profile?.specialty) || "Not specified"} />
                    <SnapshotItem label="Years of Experience" value={profile?.years_of_experience ? `${profile.years_of_experience} years` : "Not provided"} />
                    <SnapshotItem label="Board Certifications">
                      <TagList values={certifications} empty="No certifications listed" color="blue" />
                    </SnapshotItem>
                    <SnapshotItem label="Languages Spoken">
                      <TagList values={languages} empty="No languages listed" color="green" />
                    </SnapshotItem>
                  </div>
                </SectionCard>
              </div>

              <div className="space-y-8">
                <SectionCard title="Practice Availability">
                  <div className="flex flex-col gap-3">
                    <AvailabilityRow label="Accepting new patients" active={Boolean(profile?.accepting_new_patients)} />
                    <AvailabilityRow label="Offers virtual visits" active={Boolean(profile?.offers_virtual_visits)} />
                    <AvailabilityRow label="Emergency contact" value={profileData.user.emergency_contact || "Not provided"} />
                  </div>
                </SectionCard>

                <SectionCard title="Clinics">
                  {clinics.length === 0 ? (
                    <p className="text-gray-500 text-sm">No clinics have been linked yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {clinics.map((clinic) => (
                        <div key={clinic.assignment_id} className="rounded-xl border border-gray-100 p-4">
                          <p className="font-semibold text-gray-900">{clinic.clinic_name || "Clinic"}</p>
                          <p className="text-sm text-gray-600">
                            {[clinic.address_line1, clinic.address_line2].filter(Boolean).join(", ")}
                            <br />
                            {[clinic.city, clinic.state, clinic.zip_code].filter(Boolean).join(", ")}
                          </p>
                          <p className="text-sm text-gray-600 mt-2">
                            Phone: {clinic.phone || "Not provided"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Account Management">
                  <div className="space-y-4">
                    {accountStatus?.service_provider_status === "deactivated" ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-yellow-800 mb-2">
                          Your service provider account is currently deactivated.
                        </p>
                        <button
                          onClick={async () => {
                            try {
                              await doctorAPI.reactivateAccount({ portal_type: "service_provider" });
                              const status = await doctorAPI.getAccountStatus();
                              setAccountStatus(status);
                            } catch (err) {
                              console.error("Failed to reactivate:", err);
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                        >
                          Reactivate Account
                        </button>
                      </div>
                    ) : (
                      <div className="border-t border-red-200 pt-4">
                        <p className="text-sm text-gray-600 mb-3">
                          Deactivating your account will hide your profile from searches. You can reactivate it anytime.
                        </p>
                        <button
                          onClick={() => setShowDeactivateDialog(true)}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm"
                        >
                          Deactivate Account
                        </button>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>
        </div>
      </section>

      <DeactivateAccountDialog
        isOpen={showDeactivateDialog}
        onClose={() => setShowDeactivateDialog(false)}
        onConfirm={handleDeactivate}
        portalType="service_provider"
        portalLabel="Service Provider"
      />
    </main>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3 rounded-2xl bg-gray-100 text-sm">
      <p className="text-gray-500 uppercase tracking-[0.2em] text-[10px]">{label}</p>
      <p className="text-gray-900 font-semibold">{value}</p>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-3xl p-6 border border-white shadow-inner">
      <p className="uppercase text-xs tracking-[0.2em] text-gray-500 mb-4">{title}</p>
      {children}
    </div>
  );
}

function SnapshotItem({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-1">{label}</p>
      {children ? (
        children
      ) : (
        <p className="text-gray-900 font-semibold text-sm">{value || "—"}</p>
      )}
    </div>
  );
}

function TagList({
  values,
  empty,
  color,
}: {
  values: string[];
  empty: string;
  color: "blue" | "green";
}) {
  if (!values || values.length === 0) {
    return <p className="text-sm text-gray-500">{empty}</p>;
  }

  const colorMap = {
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-700",
  };

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value, index) => (
        <span key={`${value}-${index}`} className={`px-3 py-1 rounded-full text-xs font-semibold ${colorMap[color]}`}>
          {value}
        </span>
      ))}
    </div>
  );
}

function AvailabilityRow({
  label,
  active,
  value,
}: {
  label: string;
  active?: boolean;
  value?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {value && <p className="text-sm text-gray-600">{value}</p>}
      </div>
      {typeof active === "boolean" && (
        <span
          className={`text-xs px-3 py-1 rounded-full font-semibold ${
            active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"
          }`}
        >
          {active ? "Yes" : "No"}
        </span>
      )}
    </div>
  );
}

