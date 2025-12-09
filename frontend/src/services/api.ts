// API base resolution
// Prefer explicit backend URL via NEXT_PUBLIC_API_URL, otherwise fall back to Next.js rewrite (/api -> backend origin)
const RELATIVE_API_BASE = "/api";
const RAW_ABSOLUTE_API_BASE = process.env.NEXT_PUBLIC_API_URL?.trim();
const ABSOLUTE_API_BASE = RAW_ABSOLUTE_API_BASE
  ? RAW_ABSOLUTE_API_BASE.replace(/\/$/, "")
  : "";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isLocalHostname = (hostname: string): boolean => {
  if (!hostname) {
    return false;
  }
  if (LOCAL_HOSTNAMES.has(hostname)) {
    return true;
  }
  return hostname.endsWith(".local");
};

type ApiBaseResolution = {
  mode: "absolute" | "relative";
  base: string;
};

let cachedAbsoluteUrl: URL | null = null;
if (ABSOLUTE_API_BASE) {
  try {
    cachedAbsoluteUrl = new URL(ABSOLUTE_API_BASE);
  } catch (error) {
    console.warn(
      "NEXT_PUBLIC_API_URL must be an absolute URL including protocol. Ignoring invalid value:",
      ABSOLUTE_API_BASE
    );
    cachedAbsoluteUrl = null;
  }
}

const resolveAbsoluteBaseForBrowser = (): string | null => {
  if (!cachedAbsoluteUrl) {
    return null;
  }

  if (typeof window === "undefined") {
    return cachedAbsoluteUrl.href.replace(/\/$/, "");
  }

  const browserHostname = window.location.hostname;
  const browserIsLocal = isLocalHostname(browserHostname);
  const absoluteHostname = cachedAbsoluteUrl.hostname;
  const absoluteIsLocal = isLocalHostname(absoluteHostname);

  // Prevent exposing localhost/127.* targets to real users (causes failed requests)
  // Exception: If the absolute URL is on the same domain as the browser (e.g., both through tunnel),
  // allow it even if it looks like localhost (might be internal routing)
  const sameDomain = browserHostname === absoluteHostname;
  if (absoluteIsLocal && !browserIsLocal && !sameDomain) {
    return null;
  }

  // Avoid mixed content in HTTPS environments unless the target is also local or same domain
  if (
    window.location.protocol === "https:" &&
    cachedAbsoluteUrl.protocol === "http:" &&
    !absoluteIsLocal &&
    !sameDomain
  ) {
    return null;
  }

  return cachedAbsoluteUrl.href.replace(/\/$/, "");
};

const resolveApiBase = (): ApiBaseResolution => {
  const absoluteBase = resolveAbsoluteBaseForBrowser();
  if (absoluteBase) {
    return { mode: "absolute", base: absoluteBase };
  }
  
  // When accessed via Cloudflare tunnel or remote domain, prefer relative path
  // which will be proxied by Next.js to the backend
  // This ensures the request goes through the same domain/tunnel
  return { mode: "relative", base: RELATIVE_API_BASE };
};

const buildApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const { base } = resolveApiBase();
  if (base.endsWith("/")) {
    return `${base}${normalizedPath.replace(/^\//, "")}`;
  }
  return `${base}${normalizedPath}`;
};

const logApiBase = () => {
  if (typeof window === "undefined") {
    return;
  }
  const baseInfo = resolveApiBase();
  const key = `${baseInfo.mode}:${baseInfo.base}`;
  const globalObj = window as any;
  if (globalObj.__medilinkLoggedApiBase !== key) {
    // Use JSON.stringify to avoid syntax errors in console
    console.info("🌐 MediLink API base:", JSON.stringify(baseInfo, null, 2));
    globalObj.__medilinkLoggedApiBase = key;
  }
};

// API Response types
export interface SignUpRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  role: "doctor" | "patient" | "insurer" | "pharmacist";
  accepted_terms: boolean;
}

export interface SignUpResponse {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  accepted_terms: boolean;
}

export interface LoginRequest {
  email_or_phone: string;
  password: string;
  role?: string; // Optional role selection for login
}

export interface LoginResponse {
  msg: string;
  user_id?: number;
  user?: CurrentUserResponse;
  requires_action?: boolean;
  action_type?: "patient_to_service_provider" | "service_provider_to_patient";
  options?: {
    option1: {
      action: string;
      label: string;
      role?: string;
    };
    option2: {
      action: string;
      label: string;
      role?: string;
    };
  };
}

export interface OTPVerificationRequest {
  user_id: number;
  identifier: string;
  otp_code: string;
}

export interface OTPVerificationResponse {
  msg: string;
}

export interface CurrentUserResponse {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  accepted_terms: boolean;
}

export interface Address {
  address_id: number;
  user_id: number;
  label?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  formatted_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  location_source?: string | null;
  timezone?: string | null;
  raw_geocoding_payload?: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

// API Error type
export class APIError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(detail);
    this.name = "APIError";
  }
}

type APIRequestOptions = RequestInit & {
  skipAuth?: boolean;
  retry?: boolean;
  defaultError?: string;
  expectJson?: boolean;
};

let refreshPromise: Promise<void> | null = null;

const parseErrorDetail = async (response: Response, fallback: string) => {
  try {
    const text = await response.text();
    if (!text) return fallback;
    const data = JSON.parse(text);
    // For account status errors (403), return the full JSON as string
    if (response.status === 403 && data.account_status) {
      return JSON.stringify(data);
    }
    return typeof data?.detail === "string" ? data.detail : fallback;
  } catch {
    return fallback;
  }
};

const refreshAccessToken = async (): Promise<void> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(buildApiUrl("/auth/token/refresh"), {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const detail = await parseErrorDetail(
          response,
          "Failed to refresh session."
        );
        throw new APIError(response.status, detail);
      }
    })();
  }

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const apiFetch = async <T = unknown>(
  path: string,
  options: APIRequestOptions = {}
): Promise<T> => {
  logApiBase();
  const {
    skipAuth = false,
    retry = true,
    defaultError = "Request failed",
    expectJson = true,
    credentials,
    ...init
  } = options;

  // Set a longer timeout for file uploads
  const isFileUpload = init.method === "POST" && init.body instanceof FormData;
  const timeout = isFileUpload ? 300000 : 30000; // 5 minutes for uploads, 30 seconds otherwise
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  // For FormData, we MUST NOT set Content-Type header - browser sets it automatically with boundary
  const fetchOptions: RequestInit = {
    credentials: credentials ?? "include",
    signal: controller.signal,
    ...init,
  };
  
  // Remove Content-Type header if body is FormData (browser will set it with boundary)
  if (init.body instanceof FormData) {
    if (fetchOptions.headers) {
      const headers = new Headers(fetchOptions.headers);
      headers.delete("Content-Type");
      fetchOptions.headers = headers;
    } else {
      // Ensure no Content-Type is set at all for FormData
      fetchOptions.headers = {};
    }
  }
  
  // Debug logging for file uploads
  if (isFileUpload) {
    console.log("📤 File upload request:", {
      url: buildApiUrl(path),
      method: fetchOptions.method,
      hasBody: !!fetchOptions.body,
      bodyType: fetchOptions.body?.constructor?.name,
      headers: fetchOptions.headers ? Object.fromEntries(new Headers(fetchOptions.headers).entries()) : {},
    });
  }
  
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), fetchOptions);
    clearTimeout(timeoutId);
    
    if (isFileUpload) {
      console.log("📥 File upload response:", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
    }
  } catch (fetchError: any) {
    clearTimeout(timeoutId);
    if (fetchError.name === "AbortError") {
      throw new APIError(408, "Request timeout. Please try again with smaller files.");
    }
    if (fetchError instanceof TypeError && fetchError.message === "Failed to fetch") {
      throw new APIError(0, "Network error: Unable to reach server. Please check your connection and ensure the backend server is running.");
    }
    throw fetchError;
  }

  if (response.status === 401 && !skipAuth && retry) {
    try {
      await refreshAccessToken();
      return apiFetch<T>(path, { ...options, retry: false });
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(401, "Session expired. Please log in again.");
    }
  }

  if (!response.ok) {
    const detail = await parseErrorDetail(response, defaultError);
    console.error(`API Error [${response.status}]: ${detail}`);
    throw new APIError(response.status, detail);
  }

  if (!expectJson || response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();
  if (!responseText) {
    return undefined as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new APIError(response.status, "Invalid response format.");
  }
};

// API Functions
export const authAPI = {
  // Sign up new user
  signUp: async (data: SignUpRequest): Promise<SignUpResponse> => {
    return apiFetch<SignUpResponse>("/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      skipAuth: true,
      defaultError: "Sign up failed",
    });
  },

  // Login user
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    return apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      skipAuth: true,
      defaultError: "Login failed",
    });
  },

  // Verify OTP
  verifyOTP: async (
    data: OTPVerificationRequest
  ): Promise<OTPVerificationResponse> => {
    return apiFetch<OTPVerificationResponse>("/auth/verify-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      skipAuth: true,
      defaultError: "OTP verification failed",
    });
  },

  // Refresh access token
  refreshToken: async (): Promise<{ msg: string }> => {
    return apiFetch<{ msg: string }>("/auth/token/refresh", {
      method: "POST",
      skipAuth: true,
      defaultError: "Token refresh failed",
    });
  },

  // Get current user (requires authentication)
  getCurrentUser: async (): Promise<CurrentUserResponse> => {
    return apiFetch<CurrentUserResponse>("/auth/me", {
      method: "GET",
      defaultError: "Failed to fetch user data",
    });
  },

  // Create patient account for existing service provider
  createPatientAccount: async (data: LoginRequest): Promise<LoginResponse> => {
    return apiFetch<LoginResponse>("/auth/create-patient-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to create patient account",
    });
  },

  // Get current user's primary address (doctor or patient)
  getAddress: async (): Promise<Address | null> => {
    return apiFetch<Address | null>("/auth/address", {
      method: "GET",
      defaultError: "Failed to fetch address",
    });
  },

  // Create or update current user's primary address
  upsertAddress: async (
    data: Partial<
      Pick<
        Address,
        | "address_line1"
        | "address_line2"
        | "city"
        | "state"
        | "postal_code"
        | "country_code"
        | "label"
      >
    >
  ): Promise<Address> => {
    return apiFetch<Address>("/auth/address", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to update address",
    });
  },
};

// Doctor Profile Types
export interface Specialty {
  id: number;
  nucc_code: string;
  value: string;
  label: string;
  description?: string | null;
}

export interface DoctorSpecialty {
  id: number;
  doctor_user_id: number;
  specialty_id: number;
  is_primary: boolean;
  specialty: Specialty;
}

export interface DoctorProfile {
  id: number;
  user_id: number;
  specialty: string;
  bio?: string;
  photo_url?: string;
  cover_photo_url?: string;
  years_of_experience?: number;
  medical_license_number?: string;
  board_certifications?: string[];
  languages_spoken?: string[];
  accepting_new_patients: boolean;
  offers_virtual_visits: boolean;
  created_at: string;
  updated_at?: string;
  specialties?: DoctorSpecialty[];
}

export interface DoctorClinic {
  assignment_id: number;
  clinic_id: number;
  clinic_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  is_primary: boolean;
  consultation_fee?: number;
  available_from?: string;
  available_to?: string;
  days_of_week?: number[];
  accepting_new_patients: boolean;
}

export interface DoctorProfileData {
  user: {
    id: number;
    first_name: string;
    middle_name?: string;
    last_name: string;
    email: string;
    phone: string;
    emergency_contact?: string;
  };
  profile: DoctorProfile | null;
  clinics: DoctorClinic[];
  social_links: DoctorSocialLink[];
  specialties?: DoctorSpecialty[];
}

export interface PatientUserSummary {
  id: number;
  first_name?: string;
  middle_name?: string | null;
  last_name?: string;
  email?: string;
  phone?: string;
  emergency_contact?: string | null;
}

export interface PatientProfile {
  id: number;
  user_id: number;
  date_of_birth?: string | null;
  bio?: string | null;
  gender?: string | null;
  blood_type?: string | null;
  photo_url?: string | null;
  cover_photo_url?: string | null;
  current_height_cm?: number | null;
  current_weight_kg?: number | null;
  last_height_recorded_at?: string | null;
  last_weight_recorded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientConditionStatus = "active" | "managed" | "resolved";
export type PatientDiagnosisStatus = "active" | "in_remission" | "resolved";

export interface PatientMedicalCondition {
  id: number;
  condition_name: string;
  status: PatientConditionStatus;
  diagnosed_on?: string | null;
  notes?: string | null;
  is_chronic: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientDiagnosis {
  id: number;
  disease_name: string;
  status: PatientDiagnosisStatus;
  diagnosed_on?: string | null;
  notes?: string | null;
  icd10_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientMeasurement {
  id: number;
  measurement_type: "height" | "weight";
  value?: number | null;
  unit: string;
  source?: string | null;
  recorded_at: string;
}

export interface PatientProfileData {
  user: PatientUserSummary;
  profile: PatientProfile | null;
  medical_conditions: PatientMedicalCondition[];
  diagnosed_diseases: PatientDiagnosis[];
  measurements: {
    height_history: PatientMeasurement[];
    weight_history: PatientMeasurement[];
  };
}

export interface PatientConditionInput {
  condition_name: string;
  status?: PatientConditionStatus;
  diagnosed_on?: string;
  notes?: string;
  is_chronic?: boolean;
}

export interface PatientDiagnosisInput {
  disease_name: string;
  status?: PatientDiagnosisStatus;
  diagnosed_on?: string;
  notes?: string;
  icd10_code?: string;
}

export interface PatientProfileUpdatePayload {
  bio?: string;
  date_of_birth?: string;
  gender?: string;
  blood_type?: string;
  height_cm?: number;
  weight_kg?: number;
  medical_conditions?: PatientConditionInput[];
  diagnosed_diseases?: PatientDiagnosisInput[];
}

export interface PatientUserInfoUpdate {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  phone?: string;
  emergency_contact?: string;
}

export interface DoctorProfileUpdate {
  specialty?: string;
  bio?: string;
  photo_url?: string;
  cover_photo_url?: string;
  years_of_experience?: number;
  medical_license_number?: string;
  board_certifications?: string[];
  languages_spoken?: string[];
  accepting_new_patients?: boolean;
  offers_virtual_visits?: boolean;
}

export interface UserInfoUpdate {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  phone?: string;
  emergency_contact?: string;
}

export interface ClinicLocation {
  address_id: number;
  label?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  is_primary: boolean;
  distance_km?: number | null;
}

export interface DoctorListItem {
  id: number;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email: string;
  phone?: string | null;
  specialty?: string | null;
  specialties?: string[];
  bio?: string | null;
  photo_url?: string | null;
  years_of_experience?: number | null;
  languages_spoken: string[];
  board_certifications: string[];
  accepting_new_patients: boolean;
  offers_virtual_visits: boolean;
  cover_photo_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  google_rating?: number | null;
  google_user_ratings_total?: number | null;
  distance_km?: number | null;
  clinics?: ClinicLocation[];
}

export interface DoctorSocialLink {
  id: number;
  doctor_profile_id: number;
  platform: string;
  url: string;
  display_label?: string | null;
  is_visible: boolean;
  display_order?: number | null;
  created_at: string;
  updated_at: string;
}

export interface DoctorSocialLinkCreatePayload {
  platform: string;
  url: string;
  display_label?: string;
  is_visible?: boolean;
  display_order?: number;
}

export interface DoctorSocialLinkUpdatePayload {
  platform?: string;
  url?: string;
  display_label?: string;
  is_visible?: boolean;
  display_order?: number;
}

export interface AppointmentDoctor {
  id: number;
  name: string;
  specialty: string;
}

export interface Appointment {
  id: number;
  patient_user_id: number | null;
  doctor_user_id: number | null;
  clinic_id?: number | null;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status?: string | null;
  category?: string | null;
  location?: string | null;
  is_all_day: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  doctor?: AppointmentDoctor | null;
}

export interface HolidayEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  location?: string;
}

export interface CalendarEventsResponse {
  appointments: Appointment[];
  holidays: HolidayEvent[];
  service_events: HolidayEvent[];
}

export interface CreateAppointmentRequest {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  category?: string;
  location?: string;
  is_all_day?: boolean;
  patient_user_id?: number;
  doctor_user_id?: number;
  clinic_id?: number;
  status?: string;
}

// Doctor API Functions
export const doctorAPI = {
  // List doctors for discovery
  listDoctors: async (
    params?: {
      search?: string;
      specialty?: string;
      patient_latitude?: number;
      patient_longitude?: number;
    }
  ): Promise<DoctorListItem[]> => {
    const query = new URLSearchParams();
    if (params?.search) {
      query.append("search", params.search);
    }
    if (params?.specialty && params.specialty !== "All Specialties") {
      query.append("specialty", params.specialty);
    }
    if (params?.patient_latitude !== undefined) {
      query.append("patient_latitude", params.patient_latitude.toString());
    }
    if (params?.patient_longitude !== undefined) {
      query.append("patient_longitude", params.patient_longitude.toString());
    }

    const path = query.toString() ? `/doctors?${query.toString()}` : "/doctors";
    return apiFetch<DoctorListItem[]>(path, {
      method: "GET",
      defaultError: "Failed to fetch doctors",
    });
  },

  listSpecialties: async (): Promise<Specialty[]> => {
    return apiFetch<Specialty[]>("/doctors/specialties", {
      method: "GET",
      defaultError: "Failed to fetch specialties",
    });
  },

  // Get doctor profile
  getProfile: async (): Promise<DoctorProfileData> => {
    return apiFetch<DoctorProfileData>("/doctors/profile", {
      method: "GET",
      defaultError: "Failed to fetch doctor profile",
    });
  },

  // Update doctor profile
  updateProfile: async (
    data: DoctorProfileUpdate
  ): Promise<DoctorProfileData> => {
    return apiFetch<DoctorProfileData>("/doctors/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to update doctor profile",
    });
  },

  // Update user info
  updateUserInfo: async (data: UserInfoUpdate): Promise<DoctorProfileData> => {
    return apiFetch<DoctorProfileData>("/doctors/user-info", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to update user information",
    });
  },

  // Upload profile picture
  uploadProfilePicture: async (file: File): Promise<{ message: string; photo_url: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    return apiFetch<{ message: string; photo_url: string }>("/doctors/upload-profile-picture", {
      method: "POST",
      body: formData,
      defaultError: "Failed to upload profile picture",
    });
  },

  // Delete profile picture
  deleteProfilePicture: async (): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>("/doctors/profile-picture", {
      method: "DELETE",
      defaultError: "Failed to delete profile picture",
    });
  },

  uploadCoverPhoto: async (file: File): Promise<{ message: string; cover_photo_url: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    return apiFetch<{ message: string; cover_photo_url: string }>("/doctors/upload-cover-photo", {
      method: "POST",
      body: formData,
      defaultError: "Failed to upload cover photo",
    });
  },

  deleteCoverPhoto: async (): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>("/doctors/cover-photo", {
      method: "DELETE",
      defaultError: "Failed to delete cover photo",
    });
  },

  listSocialLinks: async (): Promise<DoctorSocialLink[]> => {
    return apiFetch<DoctorSocialLink[]>("/doctors/social-links", {
      method: "GET",
      defaultError: "Failed to fetch social links",
    });
  },

  createSocialLink: async (payload: DoctorSocialLinkCreatePayload): Promise<DoctorSocialLink> => {
    return apiFetch<DoctorSocialLink>("/doctors/social-links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      defaultError: "Failed to create social link",
    });
  },

  updateSocialLink: async (linkId: number, payload: DoctorSocialLinkUpdatePayload): Promise<DoctorSocialLink> => {
    return apiFetch<DoctorSocialLink>(`/doctors/social-links/${linkId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      defaultError: "Failed to update social link",
    });
  },

  deleteSocialLink: async (linkId: number): Promise<void> => {
    await apiFetch<void>(`/doctors/social-links/${linkId}`, {
      method: "DELETE",
      expectJson: false,
      defaultError: "Failed to delete social link",
    });
  },

  listClinics: async (): Promise<Address[]> => {
    return apiFetch<Address[]>("/doctors/clinics", {
      method: "GET",
      defaultError: "Failed to fetch clinics",
    });
  },

  createClinic: async (payload: Partial<Pick<Address, "address_line1" | "address_line2" | "city" | "state" | "postal_code" | "country_code" | "label">>): Promise<Address> => {
    return apiFetch<Address>("/doctors/clinics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      defaultError: "Failed to create clinic",
    });
  },

  updateClinic: async (clinicId: number, payload: Partial<Pick<Address, "address_line1" | "address_line2" | "city" | "state" | "postal_code" | "country_code" | "label">>): Promise<Address> => {
    return apiFetch<Address>(`/doctors/clinics/${clinicId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      defaultError: "Failed to update clinic",
    });
  },

  deleteClinic: async (clinicId: number): Promise<void> => {
    await apiFetch<void>(`/doctors/clinics/${clinicId}`, {
      method: "DELETE",
      expectJson: false,
      defaultError: "Failed to delete clinic",
    });
  },

  setPrimaryClinic: async (clinicId: number): Promise<Address> => {
    return apiFetch<Address>(`/doctors/clinics/${clinicId}/set-primary`, {
      method: "PUT",
      defaultError: "Failed to set primary clinic",
    });
  },

  getMySpecialties: async (): Promise<DoctorSpecialty[]> => {
    return apiFetch<DoctorSpecialty[]>("/doctors/my-specialties", {
      method: "GET",
      defaultError: "Failed to fetch doctor specialties",
    });
  },

  addSpecialty: async (specialtyId: number, isPrimary: boolean = false): Promise<DoctorSpecialty> => {
    const query = new URLSearchParams();
    query.append("specialty_id", specialtyId.toString());
    query.append("is_primary", isPrimary.toString());
    return apiFetch<DoctorSpecialty>(`/doctors/specialties?${query.toString()}`, {
      method: "POST",
      defaultError: "Failed to add specialty",
    });
  },

  removeSpecialty: async (specialtyId: number): Promise<void> => {
    await apiFetch<void>(`/doctors/specialties/${specialtyId}`, {
      method: "DELETE",
      expectJson: false,
      defaultError: "Failed to remove specialty",
    });
  },

  setPrimarySpecialty: async (specialtyId: number): Promise<DoctorSpecialty> => {
    return apiFetch<DoctorSpecialty>(`/doctors/specialties/${specialtyId}/set-primary`, {
      method: "PUT",
      defaultError: "Failed to set primary specialty",
    });
  },

  updateSpecialties: async (specialtyIds: number[], primarySpecialtyId?: number): Promise<DoctorSpecialty[]> => {
    return apiFetch<DoctorSpecialty[]>("/doctors/specialties", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        specialty_ids: specialtyIds,
        primary_specialty_id: primarySpecialtyId,
      }),
      defaultError: "Failed to update specialties",
    });
  },

  listReportShares: async (): Promise<FileBatchShare[]> => {
    return apiFetch<FileBatchShare[]>("/doctors/report-shares", {
      method: "GET",
      defaultError: "Failed to fetch shared reports",
    });
  },

  deactivateAccount: async (data: { portal_type: string; reason?: string; feedback?: string }): Promise<{ user_id: number; portal_type: string; status: string; previous_status: string }> => {
    return apiFetch<{ user_id: number; portal_type: string; status: string; previous_status: string }>("/doctors/deactivate-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to deactivate account",
    });
  },

  reactivateAccount: async (data: { portal_type: string }): Promise<{ user_id: number; portal_type: string; status: string; previous_status: string }> => {
    return apiFetch<{ user_id: number; portal_type: string; status: string; previous_status: string }>("/doctors/reactivate-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to reactivate account",
    });
  },

  getAccountStatus: async (): Promise<{ user_id: number; patient_status: string; service_provider_status: string; suspension_reason?: string; suspension_ticket_id?: string }> => {
    return apiFetch<{ user_id: number; patient_status: string; service_provider_status: string; suspension_reason?: string; suspension_ticket_id?: string }>("/doctors/account-status", {
      method: "GET",
      defaultError: "Failed to fetch account status",
    });
  },
};

export const patientAPI = {
  getProfile: async (): Promise<PatientProfileData> => {
    return apiFetch<PatientProfileData>("/patients/profile", {
      method: "GET",
      defaultError: "Failed to fetch patient profile",
    });
  },

  updateProfile: async (payload: PatientProfileUpdatePayload): Promise<PatientProfileData> => {
    return apiFetch<PatientProfileData>("/patients/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      defaultError: "Failed to update patient profile",
    });
  },

  updateUserInfo: async (payload: PatientUserInfoUpdate): Promise<PatientProfileData> => {
    return apiFetch<PatientProfileData>("/patients/user-info", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      defaultError: "Failed to update patient information",
    });
  },

  uploadProfilePicture: async (file: File): Promise<{ message: string; photo_url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<{ message: string; photo_url: string }>("/patients/upload-profile-picture", {
      method: "POST",
      body: formData,
      defaultError: "Failed to upload profile picture",
    });
  },

  deleteProfilePicture: async (): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>("/patients/profile-picture", {
      method: "DELETE",
      defaultError: "Failed to delete profile picture",
    });
  },

  uploadCoverPhoto: async (file: File): Promise<{ message: string; cover_photo_url: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<{ message: string; cover_photo_url: string }>("/patients/upload-cover-photo", {
      method: "POST",
      body: formData,
      defaultError: "Failed to upload cover photo",
    });
  },

  deleteCoverPhoto: async (): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>("/patients/cover-photo", {
      method: "DELETE",
      defaultError: "Failed to delete cover photo",
    });
  },

  deactivateAccount: async (data: { portal_type: string; reason?: string; feedback?: string }): Promise<{ user_id: number; portal_type: string; status: string; previous_status: string }> => {
    return apiFetch<{ user_id: number; portal_type: string; status: string; previous_status: string }>("/patients/deactivate-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to deactivate account",
    });
  },

  reactivateAccount: async (data: { portal_type: string }): Promise<{ user_id: number; portal_type: string; status: string; previous_status: string }> => {
    return apiFetch<{ user_id: number; portal_type: string; status: string; previous_status: string }>("/patients/reactivate-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to reactivate account",
    });
  },

  getAccountStatus: async (): Promise<{ user_id: number; patient_status: string; service_provider_status: string; suspension_reason?: string; suspension_ticket_id?: string }> => {
    return apiFetch<{ user_id: number; patient_status: string; service_provider_status: string; suspension_reason?: string; suspension_ticket_id?: string }>("/patients/account-status", {
      method: "GET",
      defaultError: "Failed to fetch account status",
    });
  },
};

export const calendarAPI = {
  listEvents: async (params?: {
    timeMin?: string;
    timeMax?: string;
    includeHolidays?: boolean;
    maxResults?: number;
  }): Promise<CalendarEventsResponse> => {
    const query = new URLSearchParams();
    if (params?.timeMin) query.append("time_min", params.timeMin);
    if (params?.timeMax) query.append("time_max", params.timeMax);
    if (params?.includeHolidays) query.append("include_holidays", "true");
    if (params?.maxResults) query.append("max_results", params.maxResults.toString());

    const path = query.toString()
      ? `/calendar/google/events?${query.toString()}`
      : "/calendar/google/events";

    return apiFetch<CalendarEventsResponse>(path, {
      method: "GET",
      defaultError: "Failed to fetch calendar events",
    });
  },

  createAppointment: async (
    payload: CreateAppointmentRequest
  ): Promise<Appointment> => {
    return apiFetch<Appointment>("/calendar/google/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      defaultError: "Failed to create appointment",
    });
  },

  getUpcomingAppointments: async (limit: number = 5): Promise<Appointment[]> => {
    const now = new Date();
    const timeMin = now.toISOString();
    // Get appointments for the next 3 months
    const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendarAPI.listEvents({
      timeMin,
      timeMax,
      includeHolidays: false,
      maxResults: limit,
    });

    // Filter to only scheduled/confirmed appointments and sort by start_time
    return response.appointments
      .filter((apt) => apt.status === "scheduled" || apt.status === "confirmed")
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, limit);
  },
};

export interface AppointmentRequest {
  request_id: number;
  patient_user_id: number;
  doctor_user_id: number;
  clinic_id?: number | null;
  preferred_date: string;
  preferred_time_slot_start: string;
  is_flexible: boolean;
  status: string;
  reason?: string | null;
  notes?: string | null;
  suggested_date?: string | null;
  suggested_time_slot_start?: string | null;
  appointment_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentRequestCreate {
  doctor_user_id: number;
  clinic_id?: number;
  preferred_date: string;
  preferred_time_slot_start: string;
  is_flexible: boolean;
  reason?: string;
  notes?: string;
}

export interface AppointmentRequestUpdate {
  status?: string;
  preferred_date?: string;
  preferred_time_slot_start?: string;
  suggested_date?: string;
  suggested_time_slot_start?: string;
  notes?: string;
}

export interface Notification {
  notification_id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  status: string;
  related_entity_type?: string | null;
  related_entity_id?: number | null;
  appointment_request_id?: number | null;
  appointment_id?: number | null;
  notification_metadata?: Record<string, any> | null;
  created_at: string;
  read_at?: string | null;
  archived_at?: string | null;
}

export const appointmentRequestAPI = {
  create: async (data: AppointmentRequestCreate): Promise<AppointmentRequest> => {
    return apiFetch<AppointmentRequest>("/appointment-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to create appointment request",
    });
  },

  listForPatient: async (status?: string): Promise<AppointmentRequest[]> => {
    const query = status ? `?status=${status}` : "";
    return apiFetch<AppointmentRequest[]>(`/appointment-requests/patient${query}`, {
      method: "GET",
      defaultError: "Failed to fetch appointment requests",
    });
  },

  listForDoctor: async (status?: string): Promise<AppointmentRequest[]> => {
    const query = status ? `?status=${status}` : "";
    return apiFetch<AppointmentRequest[]>(`/appointment-requests/doctor${query}`, {
      method: "GET",
      defaultError: "Failed to fetch appointment requests",
    });
  },

  get: async (requestId: number): Promise<AppointmentRequest> => {
    return apiFetch<AppointmentRequest>(`/appointment-requests/${requestId}`, {
      method: "GET",
      defaultError: "Failed to fetch appointment request",
    });
  },

  update: async (requestId: number, data: AppointmentRequestUpdate): Promise<AppointmentRequest> => {
    return apiFetch<AppointmentRequest>(`/appointment-requests/${requestId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to update appointment request",
    });
  },
};

export interface DoctorDashboardStats {
  completed_appointments: number;
  upcoming_appointments: number;
  pending_requests: number;
  total_appointments_this_week: number;
  cancelled_appointments_this_week: number;
  reschedule_requests: number;
  unique_patients_this_week: number;
}

export const doctorDashboardAPI = {
  getStats: async (): Promise<DoctorDashboardStats> => {
    return apiFetch<DoctorDashboardStats>("/doctors/dashboard/stats", {
      method: "GET",
      defaultError: "Failed to fetch dashboard statistics",
    });
  },
};

export const notificationAPI = {
  list: async (params?: { status?: string; limit?: number; offset?: number }): Promise<Notification[]> => {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.offset) query.append("offset", params.offset.toString());

    const path = query.toString() ? `/notifications?${query.toString()}` : "/notifications";
    return apiFetch<Notification[]>(path, {
      method: "GET",
      defaultError: "Failed to fetch notifications",
    });
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    return apiFetch<{ count: number }>("/notifications/unread/count", {
      method: "GET",
      defaultError: "Failed to fetch unread count",
    });
  },

  get: async (notificationId: number): Promise<Notification> => {
    return apiFetch<Notification>(`/notifications/${notificationId}`, {
      method: "GET",
      defaultError: "Failed to fetch notification",
    });
  },

  markAsRead: async (notificationId: number): Promise<Notification> => {
    return apiFetch<Notification>(`/notifications/${notificationId}/read`, {
      method: "PATCH",
      defaultError: "Failed to mark notification as read",
    });
  },

  markAllAsRead: async (): Promise<{ count: number }> => {
    return apiFetch<{ count: number }>("/notifications/read-all", {
      method: "POST",
      defaultError: "Failed to mark all notifications as read",
    });
  },

  archive: async (notificationId: number): Promise<Notification> => {
    return apiFetch<Notification>(`/notifications/${notificationId}/archive`, {
      method: "PATCH",
      defaultError: "Failed to archive notification",
    });
  },
};

// Patient File Types
export interface PatientFile {
  id: number;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface FileBatch {
  id: number;
  patient_user_id: number;
  category: "insurance" | "lab_report";
  heading?: string | null;
  created_at: string;
  updated_at: string;
  files: PatientFile[];
}

export interface FileBatchCreate {
  category: "insurance" | "lab_report";
  heading?: string;
}

export type ShareRelationshipType = "appointment" | "appointment_request";

export interface ShareableDoctor {
  doctor_user_id: number;
  doctor_name: string;
  doctor_photo_url?: string | null;
  doctor_specialty?: string | null;
  relationship_type: ShareRelationshipType;
  appointment_id?: number | null;
  appointment_status?: string | null;
  appointment_date?: string | null;
  appointment_request_id?: number | null;
  appointment_request_status?: string | null;
  appointment_request_preferred_date?: string | null;
}

export interface ShareBatchTargetPayload {
  doctor_user_id: number;
  appointment_id?: number;
  appointment_request_id?: number;
}

export interface ShareBatchRequestPayload {
  doctor_targets: ShareBatchTargetPayload[];
}

export interface FileBatchShare {
  share_id: number;
  file_batch_id: number;
  batch_heading?: string | null;
  batch_category: "insurance" | "lab_report";
  share_status: string;
  shared_at: string;
  patient_user_id: number;
  patient_name: string;
  doctor_user_id: number;
  doctor_name?: string | null;
  doctor_photo_url?: string | null;
  doctor_specialty?: string | null;
  appointment_id?: number | null;
  appointment_status?: string | null;
  appointment_date?: string | null;
  appointment_request_id?: number | null;
  appointment_request_status?: string | null;
  appointment_request_preferred_date?: string | null;
  files: PatientFile[];
}

export const patientFileAPI = {
  // Upload multiple files as a batch
  uploadFiles: async (
    category: "insurance" | "lab_report",
    files: File[],
    heading?: string
  ): Promise<FileBatch> => {
    // Validate inputs
    if (!files || files.length === 0) {
      throw new APIError(400, "No files provided");
    }
    
    if (!category || (category !== "insurance" && category !== "lab_report")) {
      throw new APIError(400, `Invalid category: ${category}. Must be 'insurance' or 'lab_report'`);
    }

    const formData = new FormData();
    formData.append("category", category);
    if (heading) {
      formData.append("heading", heading);
    }
    // Append each file with the same field name "files" for FastAPI List[UploadFile]
    files.forEach((file) => {
      formData.append("files", file);
    });

    console.log(`📎 Preparing to upload ${files.length} files for category: ${category}`, {
      category,
      heading,
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      fileSizes: files.map(f => f.size),
      formDataEntries: Array.from(formData.entries()).map(([key, value]) => ({
        key,
        value: value instanceof File ? `${value.name} (${value.size} bytes)` : value
      })),
    });

    try {
      const result = await apiFetch<FileBatch>("/patient-files/", {
        method: "POST",
        body: formData,
        expectJson: true,
        defaultError: "Failed to upload files",
        credentials: "include",
        // DO NOT set headers here - FormData needs browser to set Content-Type with boundary
      });
      console.log("✅ Upload successful:", result);
      return result;
    } catch (error) {
      console.error("❌ Upload API error:", error);
      // Re-throw APIError as-is, wrap others
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(500, error instanceof Error ? error.message : "Failed to upload files");
    }
  },

  // List all file batches, optionally filtered by category
  listBatches: async (category?: "insurance" | "lab_report"): Promise<FileBatch[]> => {
    const query = category ? `?category=${category}` : "";
    return apiFetch<FileBatch[]>(`/patient-files${query}`, {
      method: "GET",
      defaultError: "Failed to fetch file batches",
    });
  },

  // Get a specific file batch
  getBatch: async (batchId: number): Promise<FileBatch> => {
    return apiFetch<FileBatch>(`/patient-files/${batchId}`, {
      method: "GET",
      defaultError: "Failed to fetch file batch",
    });
  },

  // Delete a file batch
  deleteBatch: async (batchId: number): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>(`/patient-files/${batchId}`, {
      method: "DELETE",
      defaultError: "Failed to delete file batch",
    });
  },

  // Delete a single file
  deleteFile: async (fileId: number): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>(`/patient-files/files/${fileId}`, {
      method: "DELETE",
      defaultError: "Failed to delete file",
    });
  },

  listShareableDoctors: async (): Promise<ShareableDoctor[]> => {
    return apiFetch<ShareableDoctor[]>(`/patient-files/shareable-doctors`, {
      method: "GET",
      defaultError: "Failed to load shareable doctors",
    });
  },

  shareBatch: async (batchId: number, payload: ShareBatchRequestPayload): Promise<FileBatchShare[]> => {
    return apiFetch<FileBatchShare[]>(`/patient-files/${batchId}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      defaultError: "Failed to share files",
    });
  },
};

// Insurance Types
export interface InsuranceMember {
  name: string;
  relationship?: string | null;
  date_of_birth?: string | null;
}

export interface PolicyFile {
  id: number;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_at?: string | null;
}

export interface InsurancePolicy {
  id: string;
  patient_user_id: number;
  insurer_name: string;
  plan_name?: string | null;
  policy_number: string;
  group_number?: string | null;
  insurance_number?: string | null;
  coverage_start?: string | null;
  coverage_end?: string | null;
  is_primary: boolean;
  cover_amount?: number | null;
  policy_members?: InsuranceMember[] | null;
  document_id?: string | null;
  policy_files?: PolicyFile[] | null;
  created_at: string;
  updated_at: string;
}

export interface InsurancePolicySummary {
  total_active: number;
  total_expired: number;
  policies: InsurancePolicy[];
}

export interface InsurancePolicyCreate {
  insurer_name: string;
  plan_name?: string;
  policy_number: string;
  group_number?: string;
  insurance_number?: string;
  coverage_start?: string;
  coverage_end?: string;
  is_primary?: boolean;
  cover_amount?: number;
  policy_members?: InsuranceMember[];
  document_id?: string;
}

export interface ConsultingDoctor {
  id: number;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email: string;
  phone?: string | null;
  specialty?: string | null;
  photo_url?: string | null;
}

export const insuranceAPI = {
  // Get insurance summary
  getSummary: async (): Promise<InsurancePolicySummary> => {
    return apiFetch<InsurancePolicySummary>("/insurance/summary", {
      method: "GET",
      defaultError: "Failed to fetch insurance summary",
    });
  },

  // List all insurance policies
  listPolicies: async (): Promise<InsurancePolicy[]> => {
    return apiFetch<InsurancePolicy[]>("/insurance", {
      method: "GET",
      defaultError: "Failed to fetch insurance policies",
    });
  },

  // Get a specific insurance policy
  getPolicy: async (policyId: string): Promise<InsurancePolicy> => {
    return apiFetch<InsurancePolicy>(`/insurance/${policyId}`, {
      method: "GET",
      defaultError: "Failed to fetch insurance policy",
    });
  },

  // Create a new insurance policy
  createPolicy: async (data: InsurancePolicyCreate): Promise<InsurancePolicy> => {
    return apiFetch<InsurancePolicy>("/insurance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to create insurance policy",
    });
  },

  // Create a new insurance policy with files
  createPolicyWithFiles: async (
    data: InsurancePolicyCreate,
    files: File[]
  ): Promise<InsurancePolicy> => {
    const formData = new FormData();
    formData.append("policy_json", JSON.stringify(data));
    files.forEach((file) => {
      formData.append("files", file);
    });

    return apiFetch<InsurancePolicy>("/insurance/with-files", {
      method: "POST",
      body: formData,
      defaultError: "Failed to create insurance policy with files",
    });
  },

  // Update an insurance policy
  updatePolicy: async (
    policyId: string,
    data: Partial<InsurancePolicyCreate>
  ): Promise<InsurancePolicy> => {
    return apiFetch<InsurancePolicy>(`/insurance/${policyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      defaultError: "Failed to update insurance policy",
    });
  },

  // Delete an insurance policy
  deletePolicy: async (policyId: string): Promise<void> => {
    await apiFetch<void>(`/insurance/${policyId}`, {
      method: "DELETE",
      expectJson: false,
      defaultError: "Failed to delete insurance policy",
    });
  },

  // Get consulting doctors
  getConsultingDoctors: async (): Promise<ConsultingDoctor[]> => {
    return apiFetch<ConsultingDoctor[]>("/insurance/consulting-doctors", {
      method: "GET",
      defaultError: "Failed to fetch consulting doctors",
    });
  },
};

