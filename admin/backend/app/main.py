"""
MediLink Admin Panel - Main Application
FastAPI backend for admin panel with comprehensive security and monitoring
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional, Any, Dict

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from contextlib import asynccontextmanager
import os
from pathlib import Path
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import anyio
import requests
import time
from app.services.grafana_service import get_grafana_service
from app.services.gcp_monitoring_service import GCPMonitoringService
from app.services.prometheus_service import get_prom_summary
import logging
from prometheus_client import Counter, Histogram, CONTENT_TYPE_LATEST, generate_latest
import time as _time

# Import routers (to be implemented)
# from app.routers import (
#     admin_auth_routes,
#     admin_user_routes,
#     admin_monitoring_routes,
#     admin_grievance_routes,
#     admin_finance_routes,
# )

# Import middleware (to be implemented)
# from app.middleware.admin_auth_middleware import AdminAuthMiddleware
# from app.middleware.audit_logging_middleware import AuditLoggingMiddleware

# Import services
# from app.services.database_service import init_db, close_db
from app.services.grafana_service import get_grafana_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for startup and shutdown events
    """
    # Startup
    print("🚀 Starting MediLink Admin Panel...")
    # await init_db()
    print("✅ Admin Panel ready!")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down Admin Panel...")
    # await close_db()
    print("✅ Cleanup complete")


# Create FastAPI application
app = FastAPI(
    title="MediLink Admin Panel API",
    description="Comprehensive admin panel for managing MediLink healthcare platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Load environment from backend/.env regardless of current working directory
BACKEND_ROOT = Path(__file__).resolve().parent.parent

# Ensure backend root on sys.path for absolute imports when run from subdirs
backend_root_str = str(BACKEND_ROOT)
if backend_root_str not in sys.path:
    sys.path.insert(0, backend_root_str)

ENV_PATH = BACKEND_ROOT / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)

# CORS Configuration
ADMIN_CORS_DEFAULT = "http://localhost:3000,http://localhost:3001"
ADMIN_CORS_ORIGINS = os.getenv("ADMIN_CORS_ORIGINS", ADMIN_CORS_DEFAULT).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ADMIN_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=3600,
)

# Add custom middleware
# app.add_middleware(AdminAuthMiddleware)
# app.add_middleware(AuditLoggingMiddleware)


ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
ADMIN_JWT_SECRET_KEY = os.getenv("ADMIN_JWT_SECRET_KEY", "changeme-in-development")

# Admin credential configuration (non-demo)
ADMIN_DEFAULT_EMAIL = os.getenv("ADMIN_DEFAULT_EMAIL", "").strip()
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "").strip()
ADMIN_DEFAULT_PASSWORD = os.getenv("ADMIN_DEFAULT_PASSWORD", "").strip()  # optional, local-only fallback

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/admin/auth/login")

RAW_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
# Normalize to sync driver if asyncpg DSN was provided
DATABASE_URL = RAW_DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
connect_args = {"connect_timeout": 5} if DATABASE_URL.startswith("postgres") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args) if DATABASE_URL else None

GRAFANA_URL = os.getenv("GRAFANA_URL", "http://localhost:3100").rstrip("/")
GRAFANA_API_KEY = os.getenv("GRAFANA_API_KEY", "")
GRAFANA_DS_UID = os.getenv("GRAFANA_DS_UID", "")
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "").strip()
GCP_LOCATION = os.getenv("GCP_LOCATION", "").strip() or None

# Prometheus instrumentation
REQUEST_COUNT = Counter(
    "admin_api_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "admin_api_request_duration_seconds",
    "HTTP request latency",
    ["method", "path", "status"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "").strip()
GCP_LOCATION = os.getenv("GCP_LOCATION", "").strip() or None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminProfile(BaseModel):
    email: str
    role: str = "super_admin"
    display_name: Optional[str] = "Admin"


class SummaryStats(BaseModel):
    users_total: int
    doctors_total: int
    patients_total: int
    appointments_total: int
    revenue_total: float
    currency: str = "USD"
    period: str = "month"


class ActivityItem(BaseModel):
    id: str
    timestamp: datetime
    actor: str
    action: str
    target: str
    detail: str


class HealthCheckItem(BaseModel):
    service: str
    status: str  # ok | warn | error | unknown
    detail: str
    last_checked: datetime


class PerformanceMetrics(BaseModel):
    throughput_rps: float
    p95_latency_ms: float
    error_rate_pct: float
    cpu_pct: float
    memory_pct: float
    db_connections: int
    bucket_ops_per_min: float
    source: str = "stub"


class UserItem(BaseModel):
    id: str
    name: str
    email: str
    role: str  # doctor | patient | admin
    status: str  # active | suspended


def _get_configured_admin() -> tuple[str, str]:
    """
    Return the configured admin email and password hash.
    - Prefer ADMIN_PASSWORD_HASH for security.
    - If only ADMIN_DEFAULT_PASSWORD is set, hash it at runtime (local/dev convenience).
    """
    if not ADMIN_DEFAULT_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ADMIN_DEFAULT_EMAIL is not configured",
        )

    password_hash = ADMIN_PASSWORD_HASH
    if not password_hash and ADMIN_DEFAULT_PASSWORD:
        password_hash = pwd_context.hash(ADMIN_DEFAULT_PASSWORD)

    if not password_hash:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Admin password is not configured. Set ADMIN_PASSWORD_HASH or ADMIN_DEFAULT_PASSWORD.",
        )

    return ADMIN_DEFAULT_EMAIL, password_hash


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(plain_password, password_hash)
    except Exception:
        return False


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": subject, "exp": expire}
    return jwt.encode(to_encode, ADMIN_JWT_SECRET_KEY, algorithm=ALGORITHM)


def get_current_admin(token: str = Depends(oauth2_scheme)) -> AdminProfile:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, ADMIN_JWT_SECRET_KEY, algorithms=[ALGORITHM])
        subject: str | None = payload.get("sub")
        if subject is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    configured_email, _ = _get_configured_admin()
    if subject != configured_email:
        raise credentials_exception

    return AdminProfile(email=configured_email, display_name="Admin")


@app.middleware("http")
async def prometheus_middleware(request, call_next):
    start = _time.time()
    response = await call_next(request)
    elapsed = _time.time() - start
    path = request.url.path
    status_code = str(response.status_code)
    method = request.method
    REQUEST_COUNT.labels(method=method, path=path, status=status_code).inc()
    REQUEST_LATENCY.labels(method=method, path=path, status=status_code).observe(elapsed)
    return response


@app.post("/admin/auth/login", response_model=TokenResponse)
async def admin_login(payload: LoginRequest):
    """Login using configured admin credentials."""
    configured_email, password_hash = _get_configured_admin()

    if payload.email != configured_email or not verify_password(payload.password, password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=payload.email)
    return TokenResponse(access_token=token)


@app.get("/admin/auth/me", response_model=AdminProfile)
async def admin_me(current_admin: AdminProfile = Depends(get_current_admin)):
    """Return current admin profile for authenticated requests."""
    return current_admin


@app.get("/admin/dashboard")
async def admin_dashboard(current_admin: AdminProfile = Depends(get_current_admin)):
    """Minimal dashboard payload for the demo frontend."""
    return {
        "message": "Welcome to the admin dashboard",
        "admin": current_admin.email,
        "role": current_admin.role,
        "stats": {"users": 0, "appointments": 0, "revenue": 0},
    }


@app.get("/admin/dashboard/summary", response_model=SummaryStats)
async def dashboard_summary(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Stubbed summary metrics. Replace with real DB queries or service calls.
    """
    async def _fetch() -> SummaryStats:
        if not engine:
            return SummaryStats(
                users_total=0,
                doctors_total=0,
                patients_total=0,
                appointments_total=0,
                revenue_total=0.0,
                currency="USD",
                period="month",
            )
        try:
            def run_queries() -> Dict[str, Any]:
                with engine.connect() as conn:
                    users_total = conn.execute(text("SELECT COUNT(*) FROM users")).scalar_one()
                    doctors_total = conn.execute(
                        text("SELECT COUNT(*) FROM doctor_profiles")
                    ).scalar_one()
                    patients_total = conn.execute(
                        text("SELECT COUNT(*) FROM patient_profiles")
                    ).scalar_one()
                    appointments_total = conn.execute(
                        text("SELECT COUNT(*) FROM appointments")
                    ).scalar_one()
                    revenue_total = conn.execute(
                        text("SELECT COALESCE(SUM(final_amount),0) FROM payments WHERE payment_status = 'completed'")
                    ).scalar_one()
                    return {
                        "users_total": users_total,
                        "doctors_total": doctors_total,
                        "patients_total": patients_total,
                        "appointments_total": appointments_total,
                        "revenue_total": float(revenue_total or 0),
                    }

            try:
                with anyio.fail_after(5):
                    data = await anyio.to_thread.run_sync(run_queries)
            except TimeoutError:
                print("[dashboard_summary] timed out")
                return SummaryStats(
                    users_total=0,
                    doctors_total=0,
                    patients_total=0,
                    appointments_total=0,
                    revenue_total=0.0,
                    currency="USD",
                    period="month",
                )
            return SummaryStats(currency="USD", period="month", **data)
        except SQLAlchemyError as e:
            # On failure, return zeros to keep UI alive
            print(f"[dashboard_summary] DB error: {e}")
            return SummaryStats(
                users_total=0,
                doctors_total=0,
                patients_total=0,
                appointments_total=0,
                revenue_total=0.0,
                currency="USD",
                period="month",
            )

    return await _fetch()


@app.get("/admin/dashboard/activity", response_model=List[ActivityItem])
async def dashboard_activity(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Stubbed recent activity feed.
    """
    now = datetime.now(timezone.utc)
    return [
        ActivityItem(
            id="act-1",
            timestamp=now - timedelta(minutes=12),
            actor="admin@example.com",
            action="suspended",
            target="patient: P-1022",
            detail="Suspended due to verification pending",
        ),
        ActivityItem(
            id="act-2",
            timestamp=now - timedelta(hours=1),
            actor="finance-admin@example.com",
            action="refunded",
            target="payment: PAY-9913",
            detail="Refunded duplicate charge",
        ),
        ActivityItem(
            id="act-3",
            timestamp=now - timedelta(hours=2, minutes=15),
            actor="monitoring@example.com",
            action="alert_ack",
            target="api-latency",
            detail="Acknowledged p95 latency alert",
        ),
    ]


@app.get("/admin/dashboard/health", response_model=List[HealthCheckItem])
async def dashboard_health(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Health indicators. DB check is live; others remain stubbed for now.
    """
    now = datetime.now(timezone.utc)
    db_status = "unknown"
    db_detail = "not configured"
    if engine:
        try:
            def ping_db():
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1"))

            with anyio.fail_after(5):
                await anyio.to_thread.run_sync(ping_db)
            db_status = "ok"
            db_detail = "reachable"
        except TimeoutError:
            db_status = "warn"
            db_detail = "db ping timed out"
        except SQLAlchemyError as e:
            db_status = "error"
            db_detail = f"db error: {e}"

    return [
        HealthCheckItem(service="main_api", status="ok", detail="reachable (stub)", last_checked=now),
        HealthCheckItem(service="redis", status="ok", detail="reachable (stub)", last_checked=now),
        HealthCheckItem(service="grafana", status="ok", detail="reachable (stub)", last_checked=now),
        HealthCheckItem(service="gcp_db", status=db_status, detail=db_detail, last_checked=now),
        HealthCheckItem(service="gcp_bucket", status="unknown", detail="not probed in local mode", last_checked=now),
    ]


@app.get("/admin/monitoring/grafana/summary")
async def grafana_summary(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Fetch live metrics from Grafana (Cloud Monitoring datasource):
    - Cloud SQL CPU utilization
    - Cloud SQL connections
    - GCS total bytes
    - GCS request rate
    """
    service = get_grafana_service()
    data = service.get_summary()
    data["fetched_at"] = datetime.now(timezone.utc).isoformat()
    data["grafana_url"] = GRAFANA_URL
    data["datasource_uid"] = GRAFANA_DS_UID
    return data


_gcp_monitoring_service: GCPMonitoringService | None = None


def get_gcp_monitoring_service() -> GCPMonitoringService | None:
    global _gcp_monitoring_service
    if _gcp_monitoring_service is not None:
        return _gcp_monitoring_service
    if not GCP_PROJECT_ID:
        return None
    _gcp_monitoring_service = GCPMonitoringService(
        project_id=GCP_PROJECT_ID,
        location=GCP_LOCATION,
    )
    return _gcp_monitoring_service


@app.get("/admin/monitoring/gcp/summary")
async def gcp_monitoring_summary(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Fetch key metrics directly from Cloud Monitoring (no Grafana dependency).
    """
    service = get_gcp_monitoring_service()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GCP_PROJECT_ID is not configured",
        )
    return service.fetch_summary()


@app.get("/admin/monitoring/prom/summary")
async def prom_monitoring_summary(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Fetch key metrics from Prometheus (backend/node/postgres exporters).
    """
    try:
        return get_prom_summary()
    except Exception as exc:
        logging.exception("Failed to fetch Prometheus summary")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching Prometheus metrics: {exc}",
        )


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


_gcp_monitoring_service: GCPMonitoringService | None = None


def get_gcp_monitoring_service() -> GCPMonitoringService | None:
    global _gcp_monitoring_service
    if _gcp_monitoring_service is not None:
        return _gcp_monitoring_service
    if not GCP_PROJECT_ID:
        return None
    _gcp_monitoring_service = GCPMonitoringService(
        project_id=GCP_PROJECT_ID,
        location=GCP_LOCATION,
    )
    return _gcp_monitoring_service


@app.get("/admin/monitoring/gcp/summary")
async def gcp_monitoring_summary(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Fetch key metrics directly from Cloud Monitoring (no Grafana dependency).
    """
    service = get_gcp_monitoring_service()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GCP_PROJECT_ID is not configured",
        )
    return service.fetch_summary()


@app.get("/admin/dashboard/performance", response_model=PerformanceMetrics)
async def dashboard_performance(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Stubbed performance metrics. Wire to Grafana/Prometheus queries for real data.
    """
    return PerformanceMetrics(
        throughput_rps=128.4,
        p95_latency_ms=320.5,
        error_rate_pct=0.8,
        cpu_pct=62.5,
        memory_pct=71.2,
        db_connections=48,
        bucket_ops_per_min=230.0,
        source="stub",
    )


@app.get("/admin/users", response_model=List[UserItem])
async def list_users(current_admin: AdminProfile = Depends(get_current_admin), role: Optional[str] = None, status: Optional[str] = None):
    """
    Stubbed user list. Replace with real DB queries.
    """
    users = [
        UserItem(id="u-1", name="Dr. Alice Patel", email="alice.patel@example.com", role="doctor", status="active"),
        UserItem(id="u-2", name="Dr. Bob Singh", email="bob.singh@example.com", role="doctor", status="active"),
        UserItem(id="u-3", name="Jane Doe", email="jane.doe@example.com", role="patient", status="suspended"),
        UserItem(id="u-4", name="John Smith", email="john.smith@example.com", role="patient", status="active"),
    ]
    if role:
        users = [u for u in users if u.role == role]
    if status:
        users = [u for u in users if u.status == status]
    return users


@app.post("/admin/users/{user_id}/suspend")
async def suspend_user(user_id: str, current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Stubbed suspend endpoint. Implement DB update or call to main API.
    """
    return {"user_id": user_id, "status": "suspended", "message": "User suspended (stubbed)"}


@app.post("/admin/users/{user_id}/activate")
async def activate_user(user_id: str, current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Stubbed activate endpoint. Implement DB update or call to main API.
    """
    return {"user_id": user_id, "status": "active", "message": "User activated (stubbed)"}


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "admin-panel",
        "version": "1.0.0"
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "MediLink Admin Panel API",
        "version": "1.0.0",
        "docs": "/docs"
    }


# Include routers (uncomment as you implement them)
# app.include_router(admin_auth_routes.router, prefix="/admin/auth", tags=["admin-auth"])
# app.include_router(admin_user_routes.router, prefix="/admin/users", tags=["admin-users"])
# app.include_router(admin_monitoring_routes.router, prefix="/admin/monitoring", tags=["admin-monitoring"])
# app.include_router(admin_grievance_routes.router, prefix="/admin/grievances", tags=["admin-grievances"])
# app.include_router(admin_finance_routes.router, prefix="/admin/finance", tags=["admin-finance"])


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("ADMIN_PORT", "8001"))
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True
    )

