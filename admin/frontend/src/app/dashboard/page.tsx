"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

type NullableNumber = number | null | undefined;

type PromSummary = {
  api_rps: NullableNumber;
  api_latency_p50: NullableNumber;
  api_latency_p95: NullableNumber;
  api_latency_p99: NullableNumber;
  api_4xx_rps: NullableNumber;
  api_5xx_rps: NullableNumber;
  postgres_up: NullableNumber;
  postgres_connections: NullableNumber;
  node_cpu_utilization: NullableNumber;
  node_memory_available_ratio: NullableNumber;
  node_disk_available_ratio: NullableNumber;
  node_net_rx_bytes_per_sec: NullableNumber;
  node_net_tx_bytes_per_sec: NullableNumber;
};

type GcpSummary = {
  api_latency_ms_p50: NullableNumber;
  api_latency_ms_p95: NullableNumber;
  api_latency_ms_p99: NullableNumber;
  api_rps: NullableNumber;
  api_4xx_rps: NullableNumber;
  api_5xx_rps: NullableNumber;
  cloudsql_cpu_utilization: NullableNumber;
  cloudsql_connections: NullableNumber;
  cloudsql_cache_hit_ratio: NullableNumber;
  redis_ops_per_sec: NullableNumber;
  redis_evictions_per_sec: NullableNumber;
  redis_memory_usage_ratio: NullableNumber;
  gcs_request_rate: NullableNumber;
  project_id?: string | null;
  location?: string | null;
};

type GrafanaSummary = {
  cloudsql_cpu_utilization: NullableNumber;
  cloudsql_connections: NullableNumber;
  gcs_total_bytes: NullableNumber;
  gcs_request_rate: NullableNumber;
  error?: string | null;
  grafana_url?: string;
  datasource_uid?: string;
  fetched_at?: string;
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

type MetricCard = {
  label: string;
  value: string;
  hint?: string;
  status?: "ok" | "warn" | "error";
};

function formatNumber(value: NullableNumber, opts: Intl.NumberFormatOptions = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", opts).format(value);
}

function pct(value: NullableNumber) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function latencyMs(value: NullableNumber) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(0)} ms`;
}

function rps(value: NullableNumber) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)} rps`;
}

function bytesPerSec(value: NullableNumber) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value > 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB/s`;
  if (value > 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${value.toFixed(0)} B/s`;
}

export default function DashboardPage() {
  const [prom, setProm] = useState<PromSummary | null>(null);
  const [gcp, setGcp] = useState<GcpSummary | null>(null);
  const [grafana, setGrafana] = useState<GrafanaSummary | null>(null);
  const [perf, setPerf] = useState<PerformanceMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [p, g, gr, pe] = await Promise.all([
          apiFetch<PromSummary>("/admin/monitoring/prom/summary", { auth: true }).catch(() => null),
          apiFetch<GcpSummary>("/admin/monitoring/gcp/summary", { auth: true }).catch(() => null),
          apiFetch<GrafanaSummary>("/admin/monitoring/grafana/summary", { auth: true }).catch(() => null),
          apiFetch<PerformanceMetrics>("/admin/dashboard/performance", { auth: true }).catch(() => null),
        ]);
        if (cancelled) return;
        setProm(p);
        setGcp(g);
        setGrafana(gr);
        setPerf(pe);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to load metrics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo<MetricCard[]>(() => {
    const c: MetricCard[] = [];
    // API latency / throughput
    c.push({
      label: "API p95 latency (ms)",
      value: latencyMs(gcp?.api_latency_ms_p95 ?? prom?.api_latency_p95),
      hint: gcp?.api_latency_ms_p95 ? "GCP Monitoring" : prom?.api_latency_p95 ? "Prometheus" : undefined,
    });
    c.push({
      label: "API p99 latency (ms)",
      value: latencyMs(gcp?.api_latency_ms_p99 ?? prom?.api_latency_p99),
      hint: gcp?.api_latency_ms_p99 ? "GCP Monitoring" : prom?.api_latency_p99 ? "Prometheus" : undefined,
    });
    c.push({
      label: "API throughput",
      value: rps(gcp?.api_rps ?? prom?.api_rps ?? perf?.throughput_rps),
      hint: gcp?.api_rps ? "GCP Monitoring" : prom?.api_rps ? "Prometheus" : perf ? "Stub" : undefined,
    });
    c.push({
      label: "API 4xx rate",
      value: rps(gcp?.api_4xx_rps ?? prom?.api_4xx_rps),
    });
    c.push({
      label: "API 5xx rate",
      value: rps(gcp?.api_5xx_rps ?? prom?.api_5xx_rps),
      status: (gcp?.api_5xx_rps ?? prom?.api_5xx_rps ?? 0) > 0.1 ? "warn" : "ok",
    });

    // Compute / memory
    c.push({
      label: "App CPU",
      value: prom?.node_cpu_utilization !== undefined ? pct(prom?.node_cpu_utilization) : `${perf?.cpu_pct ?? "—"}%`,
    });
    c.push({
      label: "App memory",
      value: prom?.node_memory_available_ratio !== undefined ? pct(1 - (prom?.node_memory_available_ratio ?? 0)) : `${perf?.memory_pct ?? "—"}%`,
    });

    // Database
    c.push({
      label: "Postgres connections",
      value: formatNumber(prom?.postgres_connections ?? gcp?.cloudsql_connections ?? perf?.db_connections),
    });
    c.push({
      label: "CloudSQL CPU",
      value: gcp ? pct(gcp.cloudsql_cpu_utilization) : pct(grafana?.cloudsql_cpu_utilization),
    });
    c.push({
      label: "PG cache hit ratio",
      value: gcp?.cloudsql_cache_hit_ratio ? pct(gcp.cloudsql_cache_hit_ratio) : "—",
    });

    // Redis
    c.push({
      label: "Redis ops/sec",
      value: rps(gcp?.redis_ops_per_sec),
    });
    c.push({
      label: "Redis evictions/sec",
      value: rps(gcp?.redis_evictions_per_sec),
      status: (gcp?.redis_evictions_per_sec ?? 0) > 0 ? "warn" : "ok",
    });
    c.push({
      label: "Redis memory",
      value: gcp?.redis_memory_usage_ratio ? pct(gcp.redis_memory_usage_ratio) : "—",
    });

    // Storage
    c.push({
      label: "GCS request rate",
      value: rps(gcp?.gcs_request_rate ?? grafana?.gcs_request_rate),
    });
    c.push({
      label: "GCS total bytes",
      value: grafana?.gcs_total_bytes ? formatNumber(grafana.gcs_total_bytes, { notation: "compact", maximumFractionDigits: 1 }) : "—",
    });

    // Network
    c.push({
      label: "Node net RX",
      value: bytesPerSec(prom?.node_net_rx_bytes_per_sec),
    });
    c.push({
      label: "Node net TX",
      value: bytesPerSec(prom?.node_net_tx_bytes_per_sec),
    });

    return c;
  }, [gcp, prom, perf, grafana]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">System Metrics</h1>
          <p className="text-sm text-slate-600">
            Live metrics from Prometheus/GCP Monitoring/Grafana (where configured). Requires admin auth token.
          </p>
        </header>

        {loading && (
          <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
            Loading metrics…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((card) => (
            <article
              key={card.label}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-1"
            >
              <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className="text-xl font-semibold">
                {card.value}
              </div>
              {card.hint && <div className="text-xs text-slate-500">{card.hint}</div>}
              {card.status === "warn" && (
                <div className="text-xs text-amber-600">Check alerts</div>
              )}
              {card.status === "error" && (
                <div className="text-xs text-red-600">Action required</div>
              )}
            </article>
          ))}
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700 space-y-2">
          <div className="font-semibold">Data sources</div>
          <ul className="list-disc list-inside space-y-1">
            <li>Prometheus: `/admin/monitoring/prom/summary`</li>
            <li>GCP Monitoring: `/admin/monitoring/gcp/summary`</li>
            <li>Grafana (Stackdriver datasource): `/admin/monitoring/grafana/summary`</li>
            <li>Fallback stub: `/admin/dashboard/performance` (replace with real queries later)</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
