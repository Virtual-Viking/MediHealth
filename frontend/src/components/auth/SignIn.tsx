import React, { useState } from "react";
import { authAPI, APIError, CurrentUserResponse } from "@/services/api";
import { useAuth, User } from "@/contexts/AuthContext";

interface SignInProps {
  selectedRole?: string;
  onSuccess?: (user: User) => void;
  onSwitchToSignUp?: () => void;
}

const SignIn: React.FC<SignInProps> = ({ selectedRole, onSuccess, onSwitchToSignUp }) => {
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [loginData, setLoginData] = useState<{
    userId: number;
    identifier: string;
  } | null>(null);
  const [requiresAction, setRequiresAction] = useState<{
    action_type: string;
    options: {
      option1: { action: string; label: string; role?: string };
      option2: { action: string; label: string; role?: string };
    };
    message: string;
  } | null>(null);
  const [accountStatus, setAccountStatus] = useState<{
    account_status: "deactivated" | "suspended";
    portal_type?: string;
    can_reactivate?: boolean;
    suspension_reason?: string;
    suspension_ticket_id?: string;
    support_email?: string;
  } | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      // Map selected role to backend format (normalize to lowercase)
      let roleForLogin: string | undefined = undefined;
      if (selectedRole) {
        const roleLower = selectedRole.toLowerCase();
        if (roleLower === "doctor" || roleLower === "patient" || roleLower === "insurer" || 
            roleLower === "pharmacist" || roleLower === "pharmasist") {
          roleForLogin = roleLower === "pharmasist" ? "pharmacist" : roleLower;
        }
      }

      // 2FA DISABLED: Login now directly returns tokens
      const response = await authAPI.login({
        email_or_phone: email,
        password: password,
        role: roleForLogin,
      });

      // Check if response requires action (role conflict)
      if (response.requires_action && response.options) {
        setRequiresAction({
          action_type: response.action_type || "",
          options: response.options,
          message: response.msg || "Action required",
        });
        setError(null);
        return;
      }

      // Success - tokens are stored in cookies
      setError(null);

      // Use user data from login response if available, otherwise fetch it
      let userData: CurrentUserResponse;
      if (response.user) {
        // User data included in login response
        userData = response.user;
      } else {
        // Fallback: fetch user data if not in response
        try {
          userData = await authAPI.getCurrentUser();
        } catch (fetchError) {
          console.error("Failed to fetch user data:", fetchError);
          // Even if fetch fails, still proceed with login
          if (onSuccess && response.user_id) {
            const user: User = {
              id: response.user_id,
              first_name: "",
              last_name: "",
              email: email,
              phone: "",
              role: "patient",
            };
            onSuccess(user);
          }
          return;
        }
      }
      
      // For doctors/patients, fetch profile to get photo_url
      let photoUrl: string | undefined = undefined;
      if (userData.role.toLowerCase() === "doctor") {
        try {
          const { doctorAPI } = await import("@/services/api");
          const profileData = await doctorAPI.getProfile();
          if (profileData.profile?.photo_url) {
            // Store base URL without cache-busting params (we'll add them when displaying)
            photoUrl = profileData.profile.photo_url;
          }
        } catch (profileError) {
          console.error("Failed to fetch doctor profile:", profileError);
          // Continue without photo_url
        }
      } else if (userData.role.toLowerCase() === "patient") {
        try {
          const { patientAPI } = await import("@/services/api");
          const profileData = await patientAPI.getProfile();
          if (profileData.profile?.photo_url) {
            photoUrl = profileData.profile.photo_url;
          }
        } catch (profileError) {
          console.error("Failed to fetch patient profile:", profileError);
        }
      }
      
      // Map role to include pharmacist
      let role: "doctor" | "patient" | "insurer" | "pharmacist" = "patient";
      const userRole = userData.role.toLowerCase();
      if (userRole === "doctor") role = "doctor";
      else if (userRole === "insurer") role = "insurer";
      else if (userRole === "patient") role = "patient";
      else if (userRole === "pharmacist" || userRole === "pharmasist") role = "pharmacist";
      
      const user: User = {
        id: userData.id,
        first_name: userData.first_name,
        last_name: userData.last_name,
        email: userData.email,
        phone: userData.phone,
        role: role,
        photo_url: photoUrl,
      };
      
      // Store user in context
      setUser(user);

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(user);
      }
    } catch (err) {
      if (err instanceof APIError) {
        // Check if this is an account status error (403)
        if (err.status === 403) {
          try {
            // Try to parse the error detail as JSON to get account status info
            const errorData = JSON.parse(err.detail);
            if (errorData.account_status) {
              setAccountStatus({
                account_status: errorData.account_status,
                portal_type: errorData.portal_type,
                can_reactivate: errorData.can_reactivate,
                suspension_reason: errorData.suspension_reason,
                suspension_ticket_id: errorData.suspension_ticket_id,
                support_email: errorData.support_email,
              });
              setError(null);
              return;
            }
          } catch {
            // If parsing fails, treat as regular error
          }
        }
        setError(err.detail);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp || otp.length !== 6) {
      setError("Please enter a valid 6-digit OTP");
      return;
    }

    if (!loginData) {
      setError("Login data not found. Please try again.");
      return;
    }

    setLoading(true);

    try {
      await authAPI.verifyOTP({
        user_id: loginData.userId,
        identifier: loginData.identifier,
        otp_code: otp,
      });

      // Success - tokens are stored in cookies
      setError(null);

      // Fetch current user data
      try {
        const userData = await authAPI.getCurrentUser();
        
        // For doctors/patients, fetch profile to get photo_url
        let photoUrl: string | undefined = undefined;
        if (userData.role.toLowerCase() === "doctor") {
          try {
            const { doctorAPI } = await import("@/services/api");
            const profileData = await doctorAPI.getProfile();
            if (profileData.profile?.photo_url) {
              // Store base URL without cache-busting params
              photoUrl = profileData.profile.photo_url;
            }
          } catch (profileError) {
            console.error("Failed to fetch doctor profile:", profileError);
          }
        } else if (userData.role.toLowerCase() === "patient") {
          try {
            const { patientAPI } = await import("@/services/api");
            const profileData = await patientAPI.getProfile();
            if (profileData.profile?.photo_url) {
              photoUrl = profileData.profile.photo_url;
            }
          } catch (profileError) {
            console.error("Failed to fetch patient profile:", profileError);
          }
        }
        
        // Map role to include pharmacist
        let role: "doctor" | "patient" | "insurer" | "pharmacist" = "patient";
        const userRole = userData.role.toLowerCase();
        if (userRole === "doctor") role = "doctor";
        else if (userRole === "insurer") role = "insurer";
        else if (userRole === "patient") role = "patient";
        else if (userRole === "pharmacist" || userRole === "pharmasist") role = "pharmacist";
        
        const user: User = {
          id: userData.id,
          first_name: userData.first_name,
          last_name: userData.last_name,
          email: userData.email,
          phone: userData.phone,
          role: role,
          photo_url: photoUrl,
        };
        
        // Store user in context
        setUser(user);

        // Call success callback if provided
        if (onSuccess) {
          onSuccess(user);
        }
      } catch (fetchError) {
        console.error("Failed to fetch user data:", fetchError);
        // Even if fetch fails, still call onSuccess since OTP was verified
        if (onSuccess) {
          // Create a basic user object with available data
          const user: User = {
            id: loginData.userId,
            first_name: "",
            last_name: "",
            email: loginData.identifier,
            phone: "",
            role: "patient",
          };
          onSuccess(user);
        }
      }
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.detail);
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
      console.error("OTP verification error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowOtpInput(false);
    setOtp("");
    setLoginData(null);
    setError(null);
  };

  const handleActionOption = async (action: string, role?: string) => {
    if (action === "go_to_patient_dashboard") {
      // Login as patient and redirect
      try {
        const response = await authAPI.login({
          email_or_phone: email,
          password: password,
          role: "patient",
        });
        if (response.user && onSuccess) {
          const user: User = {
            id: response.user.id,
            first_name: response.user.first_name,
            last_name: response.user.last_name,
            email: response.user.email,
            phone: response.user.phone,
            role: "patient",
          };
          setUser(user);
          onSuccess(user);
        }
      } catch (err) {
        if (err instanceof APIError) {
          setError(err.detail);
        }
      }
    } else if (action === "continue_with_service_provider" && role) {
      // Login with existing service provider role
      try {
        const response = await authAPI.login({
          email_or_phone: email,
          password: password,
          role: role,
        });
        if (response.user && onSuccess) {
          let userRole: "doctor" | "patient" | "insurer" | "pharmacist" = "patient";
          const userRoleLower = response.user.role.toLowerCase();
          if (userRoleLower === "doctor") userRole = "doctor";
          else if (userRoleLower === "insurer") userRole = "insurer";
          else if (userRoleLower === "patient") userRole = "patient";
          else if (userRoleLower === "pharmacist") userRole = "pharmacist";
          
          const user: User = {
            id: response.user.id,
            first_name: response.user.first_name,
            last_name: response.user.last_name,
            email: response.user.email,
            phone: response.user.phone,
            role: userRole,
          };
          setUser(user);
          onSuccess(user);
        }
      } catch (err) {
        if (err instanceof APIError) {
          setError(err.detail);
        }
      }
    } else if (action === "create_patient_account") {
      // Create patient account for existing service provider
      try {
        const response = await authAPI.createPatientAccount({
          email_or_phone: email,
          password: password,
        });
        if (response.user && onSuccess) {
          const user: User = {
            id: response.user.id,
            first_name: response.user.first_name,
            last_name: response.user.last_name,
            email: response.user.email,
            phone: response.user.phone,
            role: "patient",
          };
          setUser(user);
          setRequiresAction(null);
          onSuccess(user);
        }
      } catch (err) {
        if (err instanceof APIError) {
          setError(err.detail);
        }
      }
    } else if (action === "create_service_provider_account") {
      // Switch to signup mode for service provider account creation
      setRequiresAction(null);
      setError(null);
      if (onSwitchToSignUp) {
        onSwitchToSignUp();
      }
    }
  };

  // Show account status screen if account is deactivated or suspended
  if (accountStatus) {
    if (accountStatus.account_status === "suspended") {
      return (
        <div className="flex justify-center text-[#111] items-center h-full w-3/5">
          <div className="w-full max-w-[600px] bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Suspended</h2>
              <p className="text-gray-600">This account has been suspended by an administrator.</p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              {accountStatus.suspension_reason && (
                <div className="mb-3">
                  <p className="text-sm font-semibold text-red-900 mb-1">Reason:</p>
                  <p className="text-sm text-red-700">{accountStatus.suspension_reason}</p>
                </div>
              )}
              {accountStatus.suspension_ticket_id && (
                <div>
                  <p className="text-sm font-semibold text-red-900 mb-1">Ticket ID:</p>
                  <p className="text-sm text-red-700 font-mono">{accountStatus.suspension_ticket_id}</p>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                To resolve this issue, please submit a grievance at{" "}
                <a href={`mailto:${accountStatus.support_email || "support@medilink.com"}`} className="font-semibold underline">
                  {accountStatus.support_email || "support@medilink.com"}
                </a>
                {accountStatus.suspension_ticket_id && ` with ticket ID: ${accountStatus.suspension_ticket_id}`}.
              </p>
            </div>

            <button
              onClick={() => {
                setAccountStatus(null);
                setError(null);
              }}
              className="w-full bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700 transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      );
    } else if (accountStatus.account_status === "deactivated") {
      return (
        <div className="flex justify-center text-[#111] items-center h-full w-3/5">
          <div className="w-full max-w-[600px] bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Disabled</h2>
              <p className="text-gray-600">This account has been deactivated.</p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                Your account is currently disabled. You can reactivate it to regain access to your account.
              </p>
            </div>

            {accountStatus.can_reactivate && (
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    const portalType = accountStatus.portal_type || "patient";
                    const api = portalType === "patient" 
                      ? (await import("@/services/api")).patientAPI
                      : (await import("@/services/api")).doctorAPI;
                    
                    await api.reactivateAccount({ portal_type: portalType });
                    
                    // Retry login
                    const response = await authAPI.login({
                      email_or_phone: email,
                      password: password,
                      role: portalType === "patient" ? "patient" : selectedRole?.toLowerCase(),
                    });
                    
                    if (response.user && onSuccess) {
                      const user: User = {
                        id: response.user.id,
                        first_name: response.user.first_name,
                        last_name: response.user.last_name,
                        email: response.user.email,
                        phone: response.user.phone,
                        role: portalType === "patient" ? "patient" : (response.user.role as any),
                      };
                      setUser(user);
                      setAccountStatus(null);
                      onSuccess(user);
                    }
                  } catch (err) {
                    if (err instanceof APIError) {
                      setError(err.detail);
                    } else {
                      setError("Failed to reactivate account. Please try again.");
                    }
                    setAccountStatus(null);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 mb-3"
              >
                {loading ? "Reactivating..." : "Reactivate Account"}
              </button>
            )}

            <button
              onClick={() => {
                setAccountStatus(null);
                setError(null);
              }}
              className="w-full bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700 transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex justify-center text-[#111] items-center h-full w-3/5">
      {!showOtpInput ? (
        // Login Form
        <form
          onSubmit={handleLoginSubmit}
          className="w-full max-w-[600px] flex flex-col gap-[20px]"
        >
          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Requires Action Dialog */}
          {requiresAction && (
            <div className="bg-blue-50 border border-blue-400 text-blue-800 px-4 py-3 rounded-lg">
              <p className="font-semibold mb-3">{requiresAction.message}</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleActionOption(
                    requiresAction.options.option1.action,
                    requiresAction.options.option1.role
                  )}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  {requiresAction.options.option1.label}
                </button>
                <button
                  type="button"
                  onClick={() => handleActionOption(
                    requiresAction.options.option2.action,
                    requiresAction.options.option2.role
                  )}
                  className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
                >
                  {requiresAction.options.option2.label}
                </button>
              </div>
            </div>
          )}

          {/* Email Form Group */}
          <div className="flex flex-col">
            <label className="font-semibold mb-[6px]">Email Address</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="py-[12px] px-[16px] border border-[#bbb] rounded-[25px] text-[14px] outline-none focus:border-[#333] disabled:opacity-50 text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* Password Form Group */}
          <div className="flex flex-col">
            <label className="font-semibold mb-[6px]">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="py-[12px] px-[16px] border border-[#bbb] rounded-[25px] text-[14px] outline-none focus:border-[#333] disabled:opacity-50 text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white text-[18px] p-[14px] border-none rounded-[30px] cursor-pointer transition-colors duration-300 hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>
      ) : (
        // OTP Verification Form
        <form
          onSubmit={handleOtpSubmit}
          className="w-full max-w-[600px] flex flex-col gap-[20px]"
        >
          {/* Info Message */}
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg text-sm">
            An OTP has been sent to your email. Please enter it below to
            complete sign in.
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* OTP Form Group */}
          <div className="flex flex-col">
            <label className="font-semibold mb-[6px]">Enter OTP</label>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => {
                // Only allow numbers and max 6 digits
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtp(value);
              }}
              disabled={loading}
              maxLength={6}
              className="py-[12px] px-[16px] border border-[#bbb] rounded-[25px] text-[14px] outline-none focus:border-[#333] disabled:opacity-50 text-center text-2xl tracking-widest text-gray-900 placeholder:text-gray-400"
            />
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-[10px]">
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white text-[18px] p-[14px] border-none rounded-[30px] cursor-pointer transition-colors duration-300 hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            <button
              type="button"
              onClick={handleBackToLogin}
              disabled={loading}
              className="bg-gray-200 text-gray-700 text-[16px] p-[12px] border-none rounded-[30px] cursor-pointer transition-colors duration-300 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back to Login
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SignIn;
