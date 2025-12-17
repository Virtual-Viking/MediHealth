import os
import math
from typing import Any, Dict, Optional

import requests

PROM_URL = os.getenv("PROMETHEUS_URL", "http://localhost:9090")


def _instant(query: str) -> Optional[float]:
    """
    Run an instant PromQL query and return the first value as float, or None.
    """
    try:
        resp = requests.get(
            f"{PROM_URL}/api/v1/query", params={"query": query}, timeout=5
        )
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("status") != "success":
            return None
        results = payload.get("data", {}).get("result", [])
        if not results:
            return None
        value = results[0]["value"][1]
        float_value = float(value)
        # Convert NaN and Infinity to None for JSON serialization
        if math.isnan(float_value) or math.isinf(float_value):
            return None
        return float_value
    except Exception:
        return None


def get_prom_summary() -> Dict[str, Any]:
    """
    Fetch a small summary of metrics from Prometheus.
    """
    api_rps = _instant('sum(rate(admin_api_requests_total[5m]))')
    api_p50 = _instant(
        'histogram_quantile(0.50, sum(rate(admin_api_request_duration_seconds_bucket[5m])) by (le))'
    )
    api_p95 = _instant(
        'histogram_quantile(0.95, sum(rate(admin_api_request_duration_seconds_bucket[5m])) by (le))'
    )
    api_p99 = _instant(
        'histogram_quantile(0.99, sum(rate(admin_api_request_duration_seconds_bucket[5m])) by (le))'
    )
    api_4xx = _instant('sum(rate(admin_api_requests_total{status=~"4.."}[5m]))')
    api_5xx = _instant('sum(rate(admin_api_requests_total{status=~"5.."}[5m]))')

    pg_up = _instant('pg_up{job="postgres"}')
    pg_connections = _instant('sum(pg_stat_activity_count{job="postgres"})')

    node_cpu = _instant('avg(rate(node_cpu_seconds_total{mode!="idle"}[5m]))')
    node_mem = _instant(
        "avg(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)"
    )
    node_disk = _instant(
        'avg(node_filesystem_avail_bytes{fstype!~"tmpfs|devtmpfs"} / node_filesystem_size_bytes{fstype!~"tmpfs|devtmpfs"})'
    )
    node_net_rx = _instant("sum(rate(node_network_receive_bytes_total[5m]))")
    node_net_tx = _instant("sum(rate(node_network_transmit_bytes_total[5m]))")

    return {
        "api_rps": api_rps,
        "api_latency_p50": api_p50,
        "api_latency_p95": api_p95,
        "api_latency_p99": api_p99,
        "api_4xx_rps": api_4xx,
        "api_5xx_rps": api_5xx,
        "postgres_up": pg_up,
        "postgres_connections": pg_connections,
        "node_cpu_utilization": node_cpu,
        "node_memory_available_ratio": node_mem,
        "node_disk_available_ratio": node_disk,
        "node_net_rx_bytes_per_sec": node_net_rx,
        "node_net_tx_bytes_per_sec": node_net_tx,
    }

