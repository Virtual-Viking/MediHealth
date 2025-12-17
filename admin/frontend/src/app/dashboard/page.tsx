"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getWidgetStats, WidgetStats, getSigninLogs, getPaymentLogs, getAppointmentLogs, LogEntry, getCloudSQLBackupLogs, BackupLogEntry } from "../../lib/api";
import { getToken, clearToken } from "../../lib/auth";

type Embed = {
  title: string;
  src: string;
};

const embeds: Embed[] = [
  {
    title: "FastAPI Counter 1",
    src: "http://localhost:3100/d-solo/adc9f7n/fast-api-counter?orgId=1&from=1765970424625&to=1765981224625&timezone=browser&panelId=panel-2&__feature.dashboardSceneSolo=true",
  },
  {
    title: "FastAPI Counter 2",
    src: "http://localhost:3100/d-solo/adc9f7n/fast-api-counter?orgId=1&from=1765974083192&to=1765984883192&timezone=browser&panelId=panel-1&__feature.dashboardSceneSolo=true",
  },
  {
    title: "Cloud SQL panel 4",
    src: "http://localhost:3100/d-solo/06698db1-c460-4ef1-8b7e-3de5e019fd50/cloud-sql-monitoring?orgId=1&from=1765894812209&to=1765981212209&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-4&__feature.dashboardSceneSolo=true",
  },
  {
    title: "Cloud SQL panel 6",
    src: "http://localhost:3100/d-solo/06698db1-c460-4ef1-8b7e-3de5e019fd50/cloud-sql-monitoring?orgId=1&from=1765894812209&to=1765981212209&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-6&__feature.dashboardSceneSolo=true",
  },
  {
    title: "Cloud SQL panel 10",
    src: "http://localhost:3100/d-solo/06698db1-c460-4ef1-8b7e-3de5e019fd50/cloud-sql-monitoring?orgId=1&from=1765894812209&to=1765981212209&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-10&__feature.dashboardSceneSolo=true",
  },
  {
    title: "GCS panel 5",
    src: "http://localhost:3100/d-solo/05c3cd9b-1577-4bc8-9c64-2075d4c39c34/cloud-storage-monitoring?orgId=1&from=1765894818577&to=1765981218577&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-5&__feature.dashboardSceneSolo=true",
  },
  {
    title: "GCS panel 6",
    src: "http://localhost:3100/d-solo/05c3cd9b-1577-4bc8-9c64-2075d4c39c34/cloud-storage-monitoring?orgId=1&from=1765894818577&to=1765981218577&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-6&__feature.dashboardSceneSolo=true",
  },
];

function StatWidget({
  title,
  value1,
  label1,
  value2,
  label2,
}: {
  title: string;
  value1: string | number;
  label1: string;
  value2?: string | number;
  label2?: string;
}) {
  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <h3
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#64748b",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: "4px",
            }}
          >
            {typeof value1 === "number" && value1 % 1 !== 0
              ? value1.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : value1.toLocaleString("en-US")}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>{label1}</div>
        </div>
        {value2 !== undefined && label2 && (
          <div
            style={{
              paddingTop: "12px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <div
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: "#475569",
                marginBottom: "4px",
              }}
            >
              {typeof value2 === "number" && value2 % 1 !== 0
                ? value2.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : value2.toLocaleString("en-US")}
            </div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>{label2}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function LogWidget({ title, logs, loading }: { title: string; logs: LogEntry[]; loading: boolean }) {
  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        height: "400px",
      }}
    >
      <h3
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#0f172a",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          paddingBottom: "8px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {title}
      </h3>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {loading ? (
          <div style={{ color: "#94a3b8", fontSize: "12px", textAlign: "center", padding: "20px" }}>
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: "12px", textAlign: "center", padding: "20px" }}>
            No logs available
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                padding: "8px",
                backgroundColor: "#f8fafc",
                borderRadius: "6px",
                borderLeft: "3px solid #3b82f6",
              }}
            >
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>
                {new Date(log.timestamp).toLocaleString()}
              </div>
              <div style={{ fontSize: "12px", color: "#0f172a", fontWeight: 500 }}>
                {log.message}
              </div>
              {log.details && (
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                  {log.details}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BackupLogWidget({ title, backups, loading }: { title: string; backups: BackupLogEntry[]; loading: boolean }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "SUCCESSFUL":
        return "#10b981";
      case "FAILED":
        return "#ef4444";
      case "RUNNING":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  const getStatusBadge = (status: string) => {
    const color = getStatusColor(status);
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "10px",
          fontWeight: 600,
          backgroundColor: `${color}20`,
          color: color,
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div
      style={{
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        height: "400px",
      }}
    >
      <h3
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#0f172a",
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          paddingBottom: "8px",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {title}
      </h3>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {loading ? (
          <div style={{ color: "#94a3b8", fontSize: "12px", textAlign: "center", padding: "20px" }}>
            Loading backup logs...
          </div>
        ) : backups.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: "12px", textAlign: "center", padding: "20px" }}>
            No backup logs available
          </div>
        ) : (
          backups.map((backup) => (
            <div
              key={backup.id}
              style={{
                padding: "8px",
                backgroundColor: "#f8fafc",
                borderRadius: "6px",
                borderLeft: `3px solid ${getStatusColor(backup.status)}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <div style={{ fontSize: "11px", color: "#64748b" }}>
                  {backup.end_time
                    ? new Date(backup.end_time).toLocaleString()
                    : backup.start_time
                    ? new Date(backup.start_time).toLocaleString()
                    : "N/A"}
                </div>
                {getStatusBadge(backup.status)}
              </div>
              <div style={{ fontSize: "12px", color: "#0f172a", fontWeight: 500 }}>
                {backup.type} Backup
              </div>
              {backup.description && (
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                  {backup.description}
                </div>
              )}
              {backup.location && (
                <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>
                  Location: {backup.location}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [widgetStats, setWidgetStats] = useState<WidgetStats | null>(null);
  const [signinLogs, setSigninLogs] = useState<LogEntry[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<LogEntry[]>([]);
  const [appointmentLogs, setAppointmentLogs] = useState<LogEntry[]>([]);
  const [backupLogs, setBackupLogs] = useState<BackupLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = () => {
    clearToken();
    router.push("/login");
  };

  useEffect(() => {
    // Check authentication
    const token = getToken();
    const fallbackToken = process.env.NEXT_PUBLIC_ADMIN_TOKEN;
    
    if (!token && !fallbackToken) {
      console.warn("No authentication token found, redirecting to login");
      router.push("/login");
      return;
    }

    async function fetchWidgetStats() {
      try {
        setLoading(true);
        const stats = await getWidgetStats();
        setWidgetStats(stats);
        setError(null);
      } catch (err: any) {
        console.error("Failed to fetch widget stats:", err);
        
        // If it's an authentication error, redirect to login
        if (err.message && (err.message.includes("credentials") || err.message.includes("401") || err.message.includes("Unauthorized"))) {
          console.warn("Authentication failed, redirecting to login");
          router.push("/login");
          return;
        }
        
        setError(err.message || "Failed to load statistics");
      } finally {
        setLoading(false);
      }
    }

    async function fetchLogs() {
      try {
        setLogsLoading(true);
        const [signin, payments, appointments, backups] = await Promise.all([
          getSigninLogs(15),
          getPaymentLogs(15),
          getAppointmentLogs(15),
          getCloudSQLBackupLogs(10),
        ]);
        setSigninLogs(signin);
        setPaymentLogs(payments);
        setAppointmentLogs(appointments);
        setBackupLogs(backups);
      } catch (err: any) {
        console.error("Failed to fetch logs:", err);
      } finally {
        setLogsLoading(false);
      }
    }

    fetchWidgetStats();
    fetchLogs();
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        color: "#0f172a",
        padding: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1920px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            paddingBottom: "16px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}>
              Admin Dashboard
            </h1>
            <p style={{ fontSize: "14px", color: "#475569", margin: 0 }}>
              Embedded Grafana panels (uses your local Grafana at localhost:3100). Ensure Grafana
              allows embedding and you are authenticated.
            </p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              backgroundColor: "#ffffff",
              color: "#0f172a",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f8fafc";
              e.currentTarget.style.borderColor = "#cbd5e1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#ffffff";
              e.currentTarget.style.borderColor = "#e2e8f0";
            }}
          >
            Log Out
          </button>
        </header>

        {/* Widgets Section */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "20px",
            width: "100%",
          }}
        >
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                    padding: "20px",
                    minHeight: "120px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#94a3b8",
                  }}
                >
                  Loading...
                </div>
              ))}
            </>
          ) : error ? (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "20px",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                color: "#991b1b",
              }}
            >
              Error loading statistics: {error}
            </div>
          ) : widgetStats ? (
            <>
              <StatWidget
                title="Doctors"
                value1={widgetStats.doctors_enrolled}
                label1="Doctors Enrolled"
                value2={widgetStats.doctors_approved}
                label2="Doctors Approved"
              />
              <StatWidget
                title="Patients"
                value1={widgetStats.total_patients}
                label1="Total Patients"
                value2={widgetStats.patients_this_month}
                label2="Enrolled This Month"
              />
              <StatWidget
                title="Payments"
                value1={`$${widgetStats.total_payments_received.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
                label1="Total Payments Received"
              />
              <StatWidget
                title="Commission"
                value1={`$${widgetStats.platform_commission.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
                label1="Platform Commission (9%)"
              />
            </>
          ) : null}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "24px",
            width: "100%",
          }}
        >
          {embeds.map((panel, index) => (
            <article
              key={panel.src + panel.title}
              style={{
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
                overflow: "hidden",
                width: "100%",
                gridColumn: index === 6 ? "2 / 3" : "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid #f1f5f9",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                {panel.title}
              </div>
              <div
                style={{
                  aspectRatio: "16 / 9",
                  minHeight: "260px",
                  width: "100%",
                  position: "relative",
                }}
              >
                <iframe
                  title={panel.title}
                  src={panel.src}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                  }}
                  frameBorder="0"
                  allowFullScreen
                />
              </div>
            </article>
          ))}
        </section>

        {/* Logs Section */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "24px",
            width: "100%",
          }}
        >
          <LogWidget title="Sign-In Logs" logs={signinLogs} loading={logsLoading} />
          <LogWidget title="Payment Logs" logs={paymentLogs} loading={logsLoading} />
          <LogWidget title="Appointment Logs" logs={appointmentLogs} loading={logsLoading} />
        </section>

        {/* Cloud SQL Backups Section */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "24px",
            width: "100%",
          }}
        >
          <BackupLogWidget title="Cloud SQL Backups (7-Day PITR)" backups={backupLogs} loading={logsLoading} />
        </section>
      </div>
    </main>
  );
}
