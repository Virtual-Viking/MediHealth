"""
Prometheus metrics for business/product metrics.
These metrics track appointments, payments, and authentication events.
"""
from prometheus_client import Counter

# Appointment metrics
appointments_created_total = Counter(
    "appointments_created_total",
    "Total appointments created",
    ["status", "channel"],
)

# Payment metrics
payments_total = Counter(
    "payments_total",
    "Total payment events",
    ["method", "status"],
)

payments_amount_cents_total = Counter(
    "payments_amount_cents_total",
    "Total payment amounts in cents",
    ["method", "status", "role"],
)

platform_commission_cents_total = Counter(
    "platform_commission_cents_total",
    "Total platform commission in cents",
    ["method", "status"],
)

# Authentication metrics
auth_events_total = Counter(
    "auth_events_total",
    "Total authentication events",
    ["type", "outcome"],
)

