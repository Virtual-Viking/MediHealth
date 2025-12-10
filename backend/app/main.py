import os
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import init_db
from db.database import init_connector, close_connector
from routers import (
    auth_routes,
    doctor_routes,
    google_calendar_routes,
    appointment_request_routes,
    notification_routes,
    doctor_dashboard_routes,
    chat_routes,
    patient_file_routes,
    patient_routes,
    insurance_routes,
    patient_finance_routes,
    doctor_finance_routes,
)
from services.redis_service import get_redis_client, close_redis_client


app = FastAPI()

DEFAULT_CORS_ORIGINS = [
    "http://localhost",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # Cloudflare tunnel / production domain (HTTPS)
    "https://medilink.virtual-viking.dev",
    # Common Cloudflare tunnel patterns (add your specific domain via CORS_ALLOW_ORIGINS env var)
    # Pattern: *.trycloudflare.com, *.cfargotunnel.com, or your custom domain
]


def _parse_env_origins(raw_value: str | None) -> List[str]:
    """Parse CORS origins from a comma-separated env var."""
    if not raw_value:
        return []

    parsed: List[str] = []
    for origin in raw_value.split(","):
        normalized = origin.strip().rstrip("/")
        if normalized:
            parsed.append(normalized)
    return parsed


def _build_allowed_origins() -> List[str]:
    env_origins = _parse_env_origins(os.getenv("CORS_ALLOW_ORIGINS"))
    combined = DEFAULT_CORS_ORIGINS + env_origins
    # Preserve ordering while removing duplicates
    seen = set()
    deduped: List[str] = []
    for origin in combined:
        if origin not in seen:
            seen.add(origin)
            deduped.append(origin)
    return deduped


origins = _build_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,
)


# Run this function exactly once, when the application first starts up
@app.on_event("startup")
async def on_startup():
    # Initialize Cloud SQL connector first (if using Cloud SQL)
    await init_connector()
    # Then initialize the database
    await init_db()
    # Initialize Redis connection
    try:
        await get_redis_client()
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}. Chat features may not work properly.")


# Close Cloud SQL connector on shutdown
@app.on_event("shutdown")
async def on_shutdown():
    await close_connector()
    await close_redis_client()


# Include Routers
app.include_router(auth_routes.router, prefix="/auth", tags=["auth"])
app.include_router(doctor_routes.router, prefix="/doctors", tags=["doctors"])
app.include_router(patient_routes.router, prefix="/patients", tags=["patients"])
app.include_router(google_calendar_routes.router, prefix="/calendar/google", tags=["google-calendar"])
app.include_router(appointment_request_routes.router, prefix="/appointment-requests", tags=["appointment-requests"])
app.include_router(notification_routes.router, prefix="/notifications", tags=["notifications"])
app.include_router(doctor_dashboard_routes.router, prefix="/doctors", tags=["doctor-dashboard"])
app.include_router(chat_routes.router, prefix="/chat", tags=["chat"])
app.include_router(patient_file_routes.router, prefix="/patient-files", tags=["patient-files"])
app.include_router(insurance_routes.router, prefix="/insurance", tags=["insurance"])
app.include_router(patient_finance_routes.router, prefix="/patient-finance", tags=["patient-finance"])
app.include_router(doctor_finance_routes.router, prefix="/doctor-finance", tags=["doctor-finance"])
