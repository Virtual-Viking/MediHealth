import os
import time
from typing import Any, Dict, Optional

from google.api_core import exceptions as gexceptions
from google.cloud import monitoring_v3
from google.cloud.monitoring_v3 import types


class GCPMonitoringService:
    """
    Thin wrapper around Cloud Monitoring to pull a handful of live metrics.
    Intended for quick summaries on the admin dashboard; not a full query layer.
    """

    def __init__(self, project_id: str, location: Optional[str] = None):
        self.project_id = project_id
        self.location = location
        self.project_name = f"projects/{project_id}"
        self.client = monitoring_v3.MetricServiceClient()

    def _time_interval(self, minutes: int = 10) -> types.TimeInterval:
        now = int(time.time())
        return types.TimeInterval(
            end_time={"seconds": now},
            start_time={"seconds": now - minutes * 60},
        )

    def _aggregation(
        self,
        per_series_aligner: types.Aggregation.Aligner,
        alignment_seconds: int = 300,
        group_by_fields: Optional[list[str]] = None,
        cross_series_reducer: Optional[types.Aggregation.Reducer] = None,
    ) -> types.Aggregation:
        return types.Aggregation(
            alignment_period={"seconds": alignment_seconds},
            per_series_aligner=per_series_aligner,
            group_by_fields=group_by_fields or [],
            cross_series_reducer=cross_series_reducer
            or types.Aggregation.Reducer.REDUCE_NONE,
        )

    def _latest_point(
        self,
        metric_filter: str,
        per_series_aligner: types.Aggregation.Aligner,
        alignment_seconds: int = 300,
    ) -> Optional[float]:
        try:
            series_iter = self.client.list_time_series(
                request={
                    "name": self.project_name,
                    "filter": metric_filter,
                    "interval": self._time_interval(),
                    "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
                    "aggregation": self._aggregation(
                        per_series_aligner=per_series_aligner,
                        alignment_seconds=alignment_seconds,
                    ),
                    "page_size": 1,
                }
            )
            ts = next(iter(series_iter), None)
            if not ts or not ts.points:
                return None
            point = ts.points[0].value
            if point.double_value is not None:
                return float(point.double_value)
            if point.int64_value is not None:
                return float(point.int64_value)
            return None
        except (StopIteration, gexceptions.GoogleAPICallError, gexceptions.RetryError):
            return None

    def fetch_summary(self) -> Dict[str, Any]:
        """
        Collect a small set of metrics. All fields are nullable if data is missing.
        """
        # API metrics (Cloud Run / LB). If your service uses a different metric type, adjust filters accordingly.
        api_latency_p50 = self._latest_point(
            'metric.type="run.googleapis.com/request_latencies"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_PERCENTILE_50,
        )
        api_latency_p95 = self._latest_point(
            'metric.type="run.googleapis.com/request_latencies"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_PERCENTILE_95,
        )
        api_latency_p99 = self._latest_point(
            'metric.type="run.googleapis.com/request_latencies"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_PERCENTILE_99,
        )
        api_rps = self._latest_point(
            'metric.type="run.googleapis.com/request_count"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_RATE,
            alignment_seconds=60,
        )
        api_4xx_rps = self._latest_point(
            'metric.type="run.googleapis.com/request_count" AND metric.label.response_code_class="4xx"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_RATE,
            alignment_seconds=60,
        )
        api_5xx_rps = self._latest_point(
            'metric.type="run.googleapis.com/request_count" AND metric.label.response_code_class="5xx"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_RATE,
            alignment_seconds=60,
        )

        # Cloud SQL
        cloudsql_cpu = self._latest_point(
            'metric.type="cloudsql.googleapis.com/database/cpu/utilization"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_MEAN,
        )
        cloudsql_connections = self._latest_point(
            'metric.type="cloudsql.googleapis.com/database/postgresql/num_backends"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_MEAN,
        )
        cloudsql_cache_hit = self._latest_point(
            'metric.type="cloudsql.googleapis.com/database/postgresql/buffer_cache_hit_ratio"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_MEAN,
        )

        # Redis (MemoryStore)
        redis_ops = self._latest_point(
            'metric.type="redis.googleapis.com/stats/commands"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_RATE,
            alignment_seconds=60,
        )
        redis_evictions = self._latest_point(
            'metric.type="redis.googleapis.com/stats/evicted_keys_count"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_RATE,
            alignment_seconds=60,
        )
        redis_memory_ratio = self._latest_point(
            'metric.type="redis.googleapis.com/stats/memory/usage_ratio"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_MEAN,
        )

        # GCS
        gcs_req_rate = self._latest_point(
            'metric.type="storage.googleapis.com/api/request_count"',
            per_series_aligner=types.Aggregation.Aligner.ALIGN_RATE,
            alignment_seconds=60,
        )

        return {
            "api_latency_ms_p50": api_latency_p50,
            "api_latency_ms_p95": api_latency_p95,
            "api_latency_ms_p99": api_latency_p99,
            "api_rps": api_rps,
            "api_4xx_rps": api_4xx_rps,
            "api_5xx_rps": api_5xx_rps,
            "cloudsql_cpu_utilization": cloudsql_cpu,
            "cloudsql_connections": cloudsql_connections,
            "cloudsql_cache_hit_ratio": cloudsql_cache_hit,
            "redis_ops_per_sec": redis_ops,
            "redis_evictions_per_sec": redis_evictions,
            "redis_memory_usage_ratio": redis_memory_ratio,
            "gcs_request_rate": gcs_req_rate,
            "project_id": self.project_id,
            "location": self.location,
        }

