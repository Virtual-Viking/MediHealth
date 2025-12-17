"""
Database service for admin backend using Google Cloud SQL Python Connector
"""
import os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from google.cloud.sql.connector import Connector
import pg8000
from typing import Optional
from app.services.gcp_credentials import ensure_application_default_credentials

# Ensure GCP credentials are set up before initializing connector
# Check for credentials in common locations
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent

# Try to find GCP credentials
_default_gcp_key = str(PROJECT_ROOT / "gcp-key.json") if (PROJECT_ROOT / "gcp-key.json").exists() else ""
GCP_CREDENTIALS_FILE = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_FILE", _default_gcp_key)
GCP_CREDENTIALS_JSON = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "")

ensure_application_default_credentials(GCP_CREDENTIALS_FILE, GCP_CREDENTIALS_JSON)

# Global connector instance
connector: Optional[Connector] = None


def init_connector():
    """Initialize the Cloud SQL connector for sync connections."""
    global connector
    if connector is None:
        connector = Connector()


def getconn() -> pg8000.dbapi.Connection:
    """
    Create a connection to Cloud SQL using Cloud SQL Python Connector.
    This function is called by SQLAlchemy when creating a new connection.
    """
    global connector
    if connector is None:
        raise RuntimeError(
            "Connector not initialized. Call init_connector() during startup."
        )

    # Get connection details from environment
    instance_connection_name = os.getenv("INSTANCE_CONNECTION_NAME", "").strip()
    db_user = os.getenv("DB_USER", "").strip()
    # Support both DB_PASSWORD and DB_PASS env names
    db_password = (
        os.getenv("DB_PASSWORD", "") or os.getenv("DB_PASS", "")
    ).strip()
    db_name = os.getenv("DB_NAME", "").strip()
    use_private_ip = os.getenv("USE_PRIVATE_IP", "false").lower() == "true"

    if not all([instance_connection_name, db_user, db_password, db_name]):
        raise ValueError(
            "Missing required database configuration. Set INSTANCE_CONNECTION_NAME, DB_USER, DB_PASSWORD, and DB_NAME"
        )

    conn: pg8000.dbapi.Connection = connector.connect(
        instance_connection_name,
        "pg8000",
        user=db_user,
        password=db_password,
        db=db_name,
        ip_type="private" if use_private_ip else "public",
    )
    return conn


def close_connector():
    """Close the Cloud SQL connector on application shutdown."""
    global connector
    if connector is not None:
        try:
            connector.close()
        except Exception as e:
            print(f"Error closing connector: {e}")
        finally:
            connector = None


# Create engine using Cloud SQL Connector
# Check if we should use Cloud SQL Connector or direct connection
INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME", "").strip()
USE_CLOUD_SQL_CONNECTOR = bool(INSTANCE_CONNECTION_NAME)

# Declare engine at module level
engine = None

if USE_CLOUD_SQL_CONNECTOR:
    # Use Cloud SQL Connector
    engine = create_engine(
        "postgresql+pg8000://",
        creator=getconn,
        poolclass=NullPool,  # Cloud SQL Connector handles connection pooling
        echo=False,
    )
else:
    # Fallback to direct connection (for local development)
    RAW_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
    if not RAW_DATABASE_URL:
        async_dsn = os.getenv("ASYNC_DATABASE_URL", "").strip()
        if async_dsn:
            RAW_DATABASE_URL = async_dsn
    DATABASE_URL = RAW_DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
    connect_args = {"connect_timeout": 30} if DATABASE_URL.startswith("postgres") else {}
    engine = (
        create_engine(
            DATABASE_URL,
            connect_args=connect_args,
            pool_pre_ping=True,
            pool_recycle=3600,
            pool_size=5,
            max_overflow=10,
        )
        if DATABASE_URL
        else None
    )
    if not engine:
        print("[database_service] WARNING: No database connection configured!")

