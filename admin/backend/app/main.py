"""
MediLink Admin Panel - Main Application
FastAPI backend for admin panel with comprehensive security and monitoring
"""

# IMPORTANT: Load environment variables FIRST before any other imports
# that might depend on them (like database_service)
import os
from pathlib import Path
import sys
from dotenv import load_dotenv

# Load environment from backend/.env regardless of current working directory
BACKEND_ROOT = Path(__file__).resolve().parent.parent
backend_root_str = str(BACKEND_ROOT)
if backend_root_str not in sys.path:
    sys.path.insert(0, backend_root_str)

ENV_PATH = BACKEND_ROOT / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=False)

# Now import everything else
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Any, Dict

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from contextlib import asynccontextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import anyio
import requests
import time
from app.services.grafana_service import get_grafana_service
from app.services.gcp_monitoring_service import GCPMonitoringService
from app.services.prometheus_service import get_prom_summary
from app.services.cloudsql_backup_service import get_cloudsql_backup_service
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

# Import services (AFTER .env is loaded!)
from app.services.database_service import init_connector, close_connector, engine
from app.services.grafana_service import get_grafana_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for startup and shutdown events
    """
    # Startup
    print("🚀 Starting MediLink Admin Panel...")
    # Initialize Cloud SQL connector if using Cloud SQL
    try:
        init_connector()
        print("✅ Database connector initialized")
    except Exception as e:
        print(f"⚠️  Database connector initialization failed: {e}")
        print("   Falling back to direct database connection if configured")
    print("✅ Admin Panel ready!")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down Admin Panel...")
    try:
        close_connector()
        print("✅ Database connector closed")
    except Exception as e:
        print(f"⚠️  Error closing database connector: {e}")
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

# Database engine is now initialized in database_service.py
# Import it from there

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


class WidgetStats(BaseModel):
    doctors_enrolled: int
    doctors_approved: int
    total_patients: int
    patients_this_month: int
    total_payments_received: float
    platform_commission: float
    currency: str = "USD"


@app.get("/admin/dashboard/widgets", response_model=WidgetStats)
async def dashboard_widgets(current_admin: AdminProfile = Depends(get_current_admin)):
    """
    Fetch widget statistics for the admin dashboard.
    """
    async def _fetch() -> WidgetStats:
        if not engine:
            print("[dashboard_widgets] WARNING: Database engine not initialized. Returning zeros.")
            return WidgetStats(
                doctors_enrolled=0,
                doctors_approved=0,
                total_patients=0,
                patients_this_month=0,
                total_payments_received=0.0,
                platform_commission=0.0,
                currency="USD",
            )
        try:
            def run_queries() -> Dict[str, Any]:
                now = datetime.now(timezone.utc)
                start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                
                with engine.connect() as conn:
                    # Doctors enrolled (total count)
                    doctors_enrolled = conn.execute(
                        text("SELECT COUNT(*) FROM doctor_profiles")
                    ).scalar_one()
                    
                    # Doctors approved (same as enrolled for now)
                    doctors_approved = doctors_enrolled
                    
                    # Total patients
                    total_patients = conn.execute(
                        text("SELECT COUNT(*) FROM patient_profiles")
                    ).scalar_one()
                    
                    # Patients enrolled this month
                    patients_this_month = conn.execute(
                        text("""
                            SELECT COUNT(*) FROM patient_profiles 
                            WHERE created_at >= :start_of_month
                        """),
                        {"start_of_month": start_of_month}
                    ).scalar_one()
                    
                    # Total payments received by doctors (completed payments)
                    total_payments_result = conn.execute(
                        text("""
                            SELECT COALESCE(SUM(final_amount), 0) 
                            FROM payments 
                            WHERE payment_status = 'completed'
                        """)
                    ).scalar_one()
                    total_payments_received = float(total_payments_result or 0)
                    
                    # Platform commission: 9% of total payments
                    # Note: The user mentioned 8.5% tax goes to doctor and 9% is platform commission
                    # So commission = 9% of the base amount (before tax)
                    # But since we're calculating from final_amount, we need to reverse calculate
                    # If final_amount = base_amount * 1.085 (8.5% tax) + base_amount * 0.09 (9% commission)
                    # final_amount = base_amount * 1.175
                    # So commission = final_amount * (0.09 / 1.175) = final_amount * 0.0766
                    # Actually, let's simplify: commission is 9% of the payment amount
                    # Based on user's description: for $100 payment, platform adds 8.5% tax and 9% platform fees
                    # So if base is $100, tax = $8.5, commission = $9, total = $117.5
                    # Commission = 9/117.5 = 7.66% of final_amount
                    # But the user said "9% is our commission", so let's use 9% of the base amount
                    # Since we have final_amount, we calculate: commission = final_amount * (0.09 / 1.175)
                    platform_commission = total_payments_received * (0.09 / 1.175)
                    
                    return {
                        "doctors_enrolled": doctors_enrolled,
                        "doctors_approved": doctors_approved,
                        "total_patients": total_patients,
                        "patients_this_month": patients_this_month,
                        "total_payments_received": total_payments_received,
                        "platform_commission": platform_commission,
                    }

            try:
                # Increase timeout to 30 seconds for remote database connections
                with anyio.fail_after(30):
                    data = await anyio.to_thread.run_sync(run_queries)
            except TimeoutError:
                print("[dashboard_widgets] Query execution timed out after 30 seconds")
                return WidgetStats(
                    doctors_enrolled=0,
                    doctors_approved=0,
                    total_patients=0,
                    patients_this_month=0,
                    total_payments_received=0.0,
                    platform_commission=0.0,
                    currency="USD",
                )
            return WidgetStats(currency="USD", **data)
        except SQLAlchemyError as e:
            error_msg = str(e)
            print(f"[dashboard_widgets] DB error: {error_msg}")
            # Log more details for debugging
            if "timeout" in error_msg.lower() or "connection" in error_msg.lower():
                print(f"[dashboard_widgets] Connection issue detected. DATABASE_URL configured: {bool(DATABASE_URL)}")
                if DATABASE_URL:
                    # Mask password in URL for logging
                    safe_url = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "***"
                    print(f"[dashboard_widgets] Attempting to connect to: ...@{safe_url}")
            return WidgetStats(
                doctors_enrolled=0,
                doctors_approved=0,
                total_patients=0,
                patients_this_month=0,
                total_payments_received=0.0,
                platform_commission=0.0,
                currency="USD",
            )

    return await _fetch()


class LogEntry(BaseModel):
    id: str
    timestamp: datetime
    message: str
    details: Optional[str] = None


class BackupLogEntry(BaseModel):
    id: str
    status: str
    type: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    description: str
    location: str


@app.get("/admin/dashboard/logs/signin", response_model=List[LogEntry])
async def dashboard_signin_logs(current_admin: AdminProfile = Depends(get_current_admin), limit: int = 20):
    """
    Fetch recent sign-in logs from the database.
    Shows recently created user accounts as a proxy for sign-ins.
    """
    if not engine:
        return []
    
    try:
        def run_query() -> List[Dict[str, Any]]:
            with engine.connect() as conn:
                # Query users table for recent account creations
                result = conn.execute(text("""
                    SELECT 
                        u.user_id,
                        u.email,
                        u.role,
                        u.created_at
                    FROM users u
                    ORDER BY u.created_at DESC
                    LIMIT :limit
                """), {"limit": limit})
                
                logs = []
                for row in result:
                    user_id, email, role, created_at = row
                    role_display = role.capitalize() if role else 'User'
                    logs.append({
                        "id": f"signin-{user_id}",
                        "timestamp": created_at,
                        "message": f"{role_display} registered: {email}",
                        "details": f"User ID: {user_id}"
                    })
                return logs
        
        logs_data = await anyio.to_thread.run_sync(run_query)
        return [LogEntry(**log) for log in logs_data]
    except Exception as e:
        print(f"[signin_logs] Error: {e}")
        return []


@app.get("/admin/dashboard/logs/payments", response_model=List[LogEntry])
async def dashboard_payment_logs(current_admin: AdminProfile = Depends(get_current_admin), limit: int = 20):
    """
    Fetch recent payment logs from the database.
    """
    if not engine:
        return []
    
    try:
        def run_query() -> List[Dict[str, Any]]:
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT 
                        p.payment_id,
                        p.final_amount,
                        p.payment_status,
                        p.payment_method,
                        p.created_at,
                        p.updated_at,
                        u.email as patient_email
                    FROM payments p
                    LEFT JOIN users u ON p.patient_user_id = u.user_id
                    ORDER BY p.updated_at DESC
                    LIMIT :limit
                """), {"limit": limit})
                
                logs = []
                for row in result:
                    payment_id, final_amount, status, method, created_at, updated_at, patient_email = row
                    timestamp = updated_at or created_at
                    status_display = status.replace('_', ' ').title()
                    method_display = method if method else 'Pending'
                    logs.append({
                        "id": f"payment-{payment_id}",
                        "timestamp": timestamp,
                        "message": f"Payment {status_display}: ${float(final_amount):.2f} via {method_display}",
                        "details": f"Patient: {patient_email or 'Unknown'} | Payment ID: {payment_id}"
                    })
                return logs
        
        logs_data = await anyio.to_thread.run_sync(run_query)
        return [LogEntry(**log) for log in logs_data]
    except Exception as e:
        print(f"[payment_logs] Error: {e}")
        return []


@app.get("/admin/dashboard/logs/appointments", response_model=List[LogEntry])
async def dashboard_appointment_logs(current_admin: AdminProfile = Depends(get_current_admin), limit: int = 20):
    """
    Fetch recent appointment logs from the database.
    """
    if not engine:
        return []
    
    try:
        def run_query() -> List[Dict[str, Any]]:
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT 
                        a.appointment_id,
                        a.appointment_date,
                        a.status,
                        a.created_at,
                        a.updated_at,
                        p.email as patient_email,
                        d.email as doctor_email
                    FROM appointments a
                    LEFT JOIN users p ON a.patient_user_id = p.user_id
                    LEFT JOIN users d ON a.doctor_user_id = d.user_id
                    ORDER BY a.updated_at DESC
                    LIMIT :limit
                """), {"limit": limit})
                
                logs = []
                for row in result:
                    apt_id, apt_date, status, created_at, updated_at, patient_email, doctor_email = row
                    timestamp = updated_at or created_at
                    status_display = status.replace('_', ' ').title() if status else 'Pending'
                    date_str = apt_date.strftime('%b %d, %Y') if apt_date else 'N/A'
                    logs.append({
                        "id": f"appointment-{apt_id}",
                        "timestamp": timestamp,
                        "message": f"Appointment {status_display} for {date_str}",
                        "details": f"Patient: {patient_email or 'Unknown'} | Doctor: {doctor_email or 'Unknown'}"
                    })
                return logs
        
        logs_data = await anyio.to_thread.run_sync(run_query)
        return [LogEntry(**log) for log in logs_data]
    except Exception as e:
        print(f"[appointment_logs] Error: {e}")
        return []


@app.get("/admin/dashboard/logs/cloudsql-backups", response_model=List[BackupLogEntry])
async def dashboard_cloudsql_backup_logs(current_admin: AdminProfile = Depends(get_current_admin), limit: int = 10):
    """
    Fetch Cloud SQL backup logs from GCP Cloud SQL Admin API.
    Shows automated PITR backups and their status.
    """
    try:
        backup_service = get_cloudsql_backup_service()
        if not backup_service:
            print("[cloudsql_backups] Backup service not available")
            return []
        
        backups = backup_service.fetch_recent_backups(max_results=limit)
        return [BackupLogEntry(**backup) for backup in backups]
        
    except Exception as e:
        print(f"[cloudsql_backups] Error: {e}")
        return []


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

