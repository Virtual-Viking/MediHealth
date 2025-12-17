"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { clearToken, getToken } from "../../lib/auth";

type DashboardResponse = {
  message: string;
  admin: string;
  role: string;
  stats: { users: number; appointments: number; revenue: number };
};

type SummaryStats = {
  users_total: number;
  doctors_total: number;
  patients_total: number;
  appointments_total: number;
  revenue_total: number;
  currency: string;
  period: string;
};

type ActivityItem = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
};

type HealthItem = {
  service: string;
  status: string;
  detail: string;
  last_checked: string;
};

type PerformanceMetrics = {
  throughput_rps: number;
  p95_latency_ms: number;
  error_rate_pct: number;
  cpu_pct: number;
  memory_pct: number;
  db_connections: number;
  bucket_ops_per_min: number;
  source: string;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [health, setHealth] = useState<HealthItem[]>([]);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const token = getToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      try {
        const [res, sum, act, hlth, perf, usr] = await Promise.all([
          apiFetch<DashboardResponse>("/admin/dashboard", { method: "GET", auth: true }),
          apiFetch<SummaryStats>("/admin/dashboard/summary", { method: "GET", auth: true }),
          apiFetch<ActivityItem[]>("/admin/dashboard/activity", { method: "GET", auth: true }),
          apiFetch<HealthItem[]>("/admin/dashboard/health", { method: "GET", auth: true }),
          apiFetch<PerformanceMetrics>("/admin/dashboard/performance", { method: "GET", auth: true }),
          apiFetch<UserItem[]>("/admin/users", { method: "GET", auth: true }),
        ]);
        setData(res);
        setSummary(sum);
        setActivity(act);
        setHealth(hlth);
        setPerformance(perf);
        setUsers(usr);
      } catch (err) {
        const status = (err as any)?.status;
        if (status === 401) {
          clearToken();
          setError("Session expired, please sign in again.");
          router.replace("/login");
        } else {
          setError("Dashboard data failed to load. Please retry.");
        }
      }
    };
    load();

    const interval = setInterval(load, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, [router]);

  const statsCards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Users", value: summary.users_total },
      { label: "Doctors", value: summary.doctors_total },
      { label: "Patients", value: summary.patients_total },
      { label: "Appointments", value: summary.appointments_total },
      { label: "Revenue", value: `${summary.currency} ${summary.revenue_total.toLocaleString()}` },
    ];
  }, [summary]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #30363d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>MediLink Admin</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Dashboard preview</div>
        </div>
        <button
          onClick={() => {
            clearToken();
            router.replace("/login");
          }}
          style={{
            background: "transparent",
            color: "var(--muted)",
            border: "1px solid #30363d",
            padding: "8px 12px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </header>

      <main style={{ padding: 20, display: "grid", gap: 16 }}>
        <div
          style={{
            padding: 16,
            background: "var(--panel)",
            borderRadius: 12,
            border: "1px solid #30363d",
          }}
        >
          <h2 style={{ margin: "0 0 6px" }}>
            {data ? `Welcome, ${data.admin}` : "Loading dashboard..."}
          </h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            {error || data?.message || "Fetching your data"}
          </p>
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {statsCards.length === 0
            ? ["Users", "Appointments", "Revenue"].map((label) => (
                <div
                  key={label}
                  style={{
                    padding: 14,
                    background: "var(--panel)",
                    borderRadius: 12,
                    border: "1px solid #30363d",
                  }}
                >
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>...</div>
                </div>
              ))
            : statsCards.map((card) => (
                <div
                  key={card.label}
                  style={{
                    padding: 14,
                    background: "var(--panel)",
                    borderRadius: 12,
                    border: "1px solid #30363d",
                  }}
                >
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{card.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{card.value}</div>
                </div>
              ))}
        </div>

        <div
          style={{
            padding: 16,
            background: "var(--panel)",
            borderRadius: 12,
            border: "1px solid #30363d",
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700 }}>System health</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {health.map((h) => (
              <div
                key={h.service}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "1px solid #30363d",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{h.service.replace("_", " ")}</div>
                <div style={{ color: h.status === "ok" ? "#16a34a" : h.status === "warn" ? "#eab308" : "#ef4444" }}>
                  {h.status}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>{h.detail}</div>
              </div>
            ))}
            {health.length === 0 && <div style={{ color: "var(--muted)" }}>Loading health...</div>}
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: "var(--panel)",
            borderRadius: 12,
            border: "1px solid #30363d",
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>Performance</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{performance?.source || "stub"}</div>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {performance ? (
              <>
                <Metric label="Throughput (rps)" value={performance.throughput_rps.toFixed(1)} />
                <Metric label="p95 latency (ms)" value={performance.p95_latency_ms.toFixed(1)} />
                <Metric label="Error rate (%)" value={performance.error_rate_pct.toFixed(2)} />
                <Metric label="CPU (%)" value={performance.cpu_pct.toFixed(1)} />
                <Metric label="Memory (%)" value={performance.memory_pct.toFixed(1)} />
                <Metric label="DB connections" value={performance.db_connections} />
                <Metric label="Bucket ops/min" value={performance.bucket_ops_per_min.toFixed(1)} />
              </>
            ) : (
              <div style={{ color: "var(--muted)" }}>Loading performance...</div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: "var(--panel)",
            borderRadius: 12,
            border: "1px solid #30363d",
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700 }}>Recent activity</div>
          {activity.length === 0 ? (
            <div style={{ color: "var(--muted)" }}>No activity yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {activity.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #30363d",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{item.action} → {item.target}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{item.detail}</div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>
                    {new Date(item.timestamp).toLocaleString()} · {item.actor}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 16,
            background: "var(--panel)",
            borderRadius: 12,
            border: "1px solid #30363d",
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>Users</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Doctors/Patients with suspend/activate</div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {users.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>Loading users...</div>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 1.5fr 1fr auto",
                    gap: 8,
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #30363d",
                  }}
                >
                  <div>{u.name}</div>
                  <div style={{ color: "var(--muted)" }}>{u.email}</div>
                  <div style={{ color: "var(--muted)" }}>{u.role}</div>
                  <button
                    onClick={async () => {
                      const endpoint = u.status === "active" ? "/admin/users/" + u.id + "/suspend" : "/admin/users/" + u.id + "/activate";
                      try {
                        await apiFetch(endpoint, { method: "POST", auth: true });
                        setUsers((prev) =>
                          prev.map((user) =>
                            user.id === u.id ? { ...user, status: user.status === "active" ? "suspended" : "active" } : user
                          )
                        );
                      } catch (e) {
                        alert("Action failed");
                      }
                    }}
                    style={{
                      background: u.status === "active" ? "#ef4444" : "#22c55e",
                      color: "white",
                      border: "none",
                      padding: "8px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    {u.status === "active" ? "Suspend" : "Activate"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        border: "1px solid #30363d",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

