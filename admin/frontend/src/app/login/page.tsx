"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { saveToken } from "../../lib/auth";

type TokenResponse = { access_token: string; token_type: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<TokenResponse>("/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveToken(data.access_token);
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div
        style={{
          width: 360,
          padding: 28,
          background: "var(--panel)",
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>MediLink Admin</h1>
        <p style={{ margin: "0 0 18px", color: "var(--muted)" }}>
          Sign in to continue to the admin dashboard.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #30363d",
                background: "#0d1117",
                color: "var(--text)",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #30363d",
                background: "#0d1117",
                color: "var(--text)",
              }}
            />
          </label>

          {error && (
            <div
              style={{
                background: "rgba(239,68,68,0.12)",
                color: "var(--danger)",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: "12px 14px",
              borderRadius: 8,
              border: "none",
              background: loading ? "var(--accent-strong)" : "var(--accent)",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
              transition: "transform 120ms ease, filter 120ms ease",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

          <p style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
            Use your configured admin email/password. Set in backend env: ADMIN_DEFAULT_EMAIL and ADMIN_PASSWORD_HASH (or ADMIN_DEFAULT_PASSWORD for local).
          </p>
      </div>
    </div>
  );
}

