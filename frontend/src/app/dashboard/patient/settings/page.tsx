"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { patientAPI, PatientProfileData } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import DeactivateAccountDialog from "@/components/DeactivateAccountDialog";

const gradientOverlay =
  "linear-gradient(180deg, rgba(10, 12, 29, 0.05) 0%, rgba(10, 12, 29, 0.45) 100%)";

export default function PatientProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [profileData, setProfileData] = useState<PatientProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [accountStatus, setAccountStatus] = useState<{ patient_status: string } | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const data = await patientAPI.getProfile();
        setProfileData(data);
        setError(null);
        
        // Load account status
        try {
          const status = await patientAPI.getAccountStatus();
          setAccountStatus(status);
        } catch (err) {
          console.error("Failed to load account status:", err);
        }
      } catch (err) {
        console.error(err);
        setError("Unable to load your profile.");
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const handleDeactivate = async (reason: string, feedback: string) => {
    try {
      await patientAPI.deactivateAccount({
        portal_type: "patient",
        reason: reason || undefined,
        feedback: feedback || undefined,
      });
      // Reload account status
      const status = await patientAPI.getAccountStatus();
      setAccountStatus(status);
      setShowDeactivateDialog(false);
      // Redirect to home or show message
      router.push("/");
    } catch (err: any) {
      throw new Error(err.detail || "Failed to deactivate account");
    }
  };

  const profile = profileData?.profile;
  const coverPhoto = profile?.cover_photo_url || null;
  const profilePhoto = profile?.photo_url || null;
  const profileInitial =
    profileData?.user?.first_name?.[0]?.toUpperCase() ??
    profileData?.user?.last_name?.[0]?.toUpperCase() ??
    user?.first_name?.[0]?.toUpperCase() ??
    "P";

  const ageLabel = useMemo(() => {
    if (!profile?.date_of_birth) return "Not set";
    const dob = new Date(profile.date_of_birth);
    const diff = Date.now() - dob.getTime();
    const ageDate = new Date(diff);
    return `${Math.abs(ageDate.getUTCFullYear() - 1970)} years`;
  }, [profile?.date_of_birth]);

  const latestHeight = profile?.current_height_cm
    ? `${profile.current_height_cm} cm`
    : "Not recorded";
  const latestWeight = profile?.current_weight_kg
    ? `${profile.current_weight_kg} kg`
    : "Not recorded";

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ backgroundColor: "#ECF4F9" }}>
        <div className="text-gray-600 text-lg">Loading profile...</div>
      </main>
    );
  }

  if (error || !profileData) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ backgroundColor: "#ECF4F9" }}>
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</p>
          <p className="text-gray-600 mb-6">{error ?? "Unable to load profile data."}</p>
          <button
            onClick={() => location.reload()}
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
      <section className="p-4 md:p-6 lg:p-8 space-y-6">
        <div className="bg-white rounded-[32px] shadow-xl overflow-hidden relative">
          <div className="relative h-60 w-full">
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
                        "linear-gradient(120deg, #2563eb 0%, #1d4ed8 60%, #1e3a8a 100%)",
                    }
              }
            />
            <div className="absolute inset-0" style={{ backgroundImage: gradientOverlay }} />

            <Link
              href="/dashboard/patient/settings/edit"
              className="absolute top-6 left-6 px-5 py-2 rounded-full bg-white/90 text-gray-900 text-sm font-semibold shadow hover:bg-white transition"
            >
              Edit profile
            </Link>
          </div>

          <div className="px-6 md:px-12 pb-12">
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 -mt-20">
              <div className="flex flex-col items-center text-center lg:text-left">
                <div className="relative">
                  {profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt="Patient"
                      className="w-40 h-40 rounded-full border-8 border-white object-cover shadow-xl bg-gray-100"
                    />
                  ) : (
                    <div className="w-40 h-40 rounded-full border-8 border-white bg-gray-900 text-white flex items-center justify-center text-4xl font-semibold shadow-xl">
                      {profileInitial}
                    </div>
                  )}
                </div>
                <p className="text-gray-500 mt-4 text-sm">
                  Member since {new Date(profile?.created_at ?? Date.now()).getFullYear()}
                </p>
              </div>

              <div className="flex-1 space-y-6">
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-gray-900">
                    {[profileData.user.first_name, profileData.user.last_name].filter(Boolean).join(" ") ||
                      user?.first_name ||
                      "Patient"}
                  </h1>
                  <p className="text-gray-600 mt-3 leading-relaxed">
                    {profile?.bio ||
                      "Share your health goals, preferences, and anything else that helps providers personalize your care."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <InfoCard label="Date of Birth" value={profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : "Not set"} />
                  <InfoCard label="Age" value={ageLabel} />
                  <InfoCard label="Blood Type" value={profile?.blood_type || "Not set"} />
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
                    <p className="break-all">{profileData.user.email || "Not provided"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Emergency Contact</p>
                    <p>{profileData.user.emergency_contact || "Not provided"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
              <div className="lg:col-span-2 space-y-8">
                <SectionCard title="Health Metrics">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InfoCard label="Height" value={latestHeight} highlight />
                    <InfoCard label="Weight" value={latestWeight} highlight />
                  </div>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <HistoryList
                      label="Recent height entries"
                      entries={profileData.measurements.height_history}
                      emptyLabel="No height history yet."
                      formatter={(entry) => `${entry.value ?? "—"} ${entry.unit}`}
                    />
                    <HistoryList
                      label="Recent weight entries"
                      entries={profileData.measurements.weight_history}
                      emptyLabel="No weight history yet."
                      formatter={(entry) => `${entry.value ?? "—"} ${entry.unit}`}
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Medical Conditions">
                  {profileData.medical_conditions.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      Track chronic or recurring conditions to help clinicians prepare before appointments.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {profileData.medical_conditions.map((condition) => (
                        <span
                          key={condition.id}
                          className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium"
                        >
                          {condition.condition_name}
                        </span>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-8">
                <SectionCard title="Diagnosed Diseases">
                  {profileData.diagnosed_diseases.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      Keep an accurate list of diagnoses, including resolved or managed conditions.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {profileData.diagnosed_diseases.map((diagnosis) => (
                        <div key={diagnosis.id} className="border border-gray-100 rounded-2xl p-4">
                          <p className="font-semibold text-gray-900">{diagnosis.disease_name}</p>
                          <p className="text-sm text-gray-600 capitalize">{diagnosis.status.replace("_", " ")}</p>
                          {diagnosis.diagnosed_on && (
                            <p className="text-xs text-gray-500 mt-1">
                              Diagnosed {new Date(diagnosis.diagnosed_on).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Next Steps">
                  <ul className="text-sm text-gray-700 space-y-3 list-disc list-inside">
                    <li>Keep your emergency contact up-to-date.</li>
                    <li>Add new diagnoses or conditions as they arise.</li>
                    <li>Share your care preferences to improve coordination.</li>
                  </ul>
                </SectionCard>

                <SectionCard title="Account Management">
                  <div className="space-y-4">
                    {accountStatus?.patient_status === "deactivated" ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-yellow-800 mb-2">
                          Your patient account is currently deactivated.
                        </p>
                        <button
                          onClick={async () => {
                            try {
                              await patientAPI.reactivateAccount({ portal_type: "patient" });
                              const status = await patientAPI.getAccountStatus();
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
        portalType="patient"
        portalLabel="Patient"
      />
    </main>
  );
}

function InfoCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`px-5 py-4 rounded-2xl ${
        highlight ? "bg-blue-50 text-blue-900 border border-blue-100" : "bg-gray-100 text-gray-900"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
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

function HistoryList({
  label,
  entries,
  emptyLabel,
  formatter,
}: {
  label: string;
  entries: PatientProfileData["measurements"]["height_history"];
  emptyLabel: string;
  formatter: (entry: PatientProfileData["measurements"]["height_history"][number]) => string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">{label}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="text-sm text-gray-700 flex items-center justify-between">
              <span>{formatter(entry)}</span>
              <span className="text-xs text-gray-500">
                {new Date(entry.recorded_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

