import time
from typing import Any, Dict, Optional
import requests
import os


class GrafanaService:
    def __init__(self, base_url: str, api_key: str, ds_uid: str):
        self.base_url = (base_url or "http://localhost:3100").rstrip("/")
        self.api_key = api_key
        self.ds_uid = ds_uid
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
        )

    def _query(self, queries: list[Dict[str, Any]]) -> Dict[str, Any]:
        now_ms = int(time.time() * 1000)
        fr_ms = now_ms - 30 * 60 * 1000  # last 30 minutes
        payload = {
            "queries": queries,
            "range": {"from": fr_ms, "to": now_ms},
        }
        resp = self.session.post(f"{self.base_url}/api/ds/query", json=payload, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def _empty_result(self, error: str) -> Dict[str, Any]:
        return {
            "cloudsql_cpu_utilization": None,
            "cloudsql_connections": None,
            "gcs_total_bytes": None,
            "gcs_request_rate": None,
            "error": error,
        }

    def _latest_from_result(self, result: Dict[str, Any]) -> Optional[float]:
        # Prefer data frames
        frames = result.get("frames") or []
        if frames:
            frame = frames[0]
            data = frame.get("data") or {}
            values = data.get("values") or []
            if values and len(values) >= 2:
                series = values[1]
                if series:
                    try:
                        return float(series[-1])
                    except Exception:
                        pass
        # Fallback to legacy series format
        series_list = result.get("series") or []
        if series_list:
            points = series_list[0].get("points") or []
            if points:
                try:
                    return float(points[-1][0])
                except Exception:
                    return None
        return None

    def get_summary(self) -> Dict[str, Any]:
        """
        Fetch a few key metrics via Grafana datasource (Cloud Monitoring):
        - Cloud SQL CPU utilization
        - Cloud SQL connections
        - GCS total bytes
        - GCS request count (last point)
        """
        if not self.api_key:
            return self._empty_result("Grafana API key is not configured")
        if not self.ds_uid:
            return self._empty_result("Grafana datasource UID is not configured")

        common = {"intervalMs": 60000, "maxDataPoints": 1440}
        queries: list[Dict[str, Any]] = [
            {
                "datasource": {"type": "stackdriver", "uid": self.ds_uid},
                "refId": "A",
                "queryType": "timeSeriesQuery",
                **common,
                "timeSeriesQuery": {
                    "timeSeriesFilter": {
                        "filter": 'metric.type="database.googleapis.com/database/cpu/utilization"',
                        "aggregation": {
                            "perSeriesAligner": "ALIGN_MEAN",
                            "alignmentPeriod": "300s",
                        },
                    },
                    "unit": "1",
                },
            },
            {
                "datasource": {"type": "stackdriver", "uid": self.ds_uid},
                "refId": "B",
                "queryType": "timeSeriesQuery",
                **common,
                "timeSeriesQuery": {
                    "timeSeriesFilter": {
                        "filter": 'metric.type="database.googleapis.com/database/postgresql/num_connections"',
                        "aggregation": {
                            "perSeriesAligner": "ALIGN_MEAN",
                            "alignmentPeriod": "300s",
                        },
                    },
                    "unit": "1",
                },
            },
            {
                "datasource": {"type": "stackdriver", "uid": self.ds_uid},
                "refId": "C",
                "queryType": "timeSeriesQuery",
                **common,
                "timeSeriesQuery": {
                    "timeSeriesFilter": {
                        "filter": 'metric.type="storage.googleapis.com/storage/total_bytes"',
                        "aggregation": {
                            "perSeriesAligner": "ALIGN_MEAN",
                            "alignmentPeriod": "300s",
                        },
                    },
                    "unit": "By",
                },
            },
            {
                "datasource": {"type": "stackdriver", "uid": self.ds_uid},
                "refId": "D",
                "queryType": "timeSeriesQuery",
                **common,
                "timeSeriesQuery": {
                    "timeSeriesFilter": {
                        "filter": 'metric.type="storage.googleapis.com/api/request_count"',
                        "aggregation": {
                            "perSeriesAligner": "ALIGN_RATE",
                            "alignmentPeriod": "300s",
                        },
                    },
                    "unit": "1",
                },
            },
        ]

        try:
            data = self._query(queries)
            results = data.get("results", {})
            cpu = self._latest_from_result(results.get("A", {})) or 0.0
            conns = self._latest_from_result(results.get("B", {})) or 0.0
            bucket_bytes = self._latest_from_result(results.get("C", {})) or 0.0
            bucket_rps = self._latest_from_result(results.get("D", {})) or 0.0
            return {
                "cloudsql_cpu_utilization": cpu,
                "cloudsql_connections": conns,
                "gcs_total_bytes": bucket_bytes,
                "gcs_request_rate": bucket_rps,
                "error": None,
            }
        except Exception as e:
            return self._empty_result(str(e))


def get_grafana_service() -> GrafanaService:
    base = os.getenv("GRAFANA_URL", "http://localhost:3100")
    key = os.getenv("GRAFANA_API_KEY", "")
    uid = os.getenv("GRAFANA_DS_UID", "P3BE906CE9E430760")
    return GrafanaService(base, key, uid)

