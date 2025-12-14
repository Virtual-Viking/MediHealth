import os
import sys
import asyncio
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from alembic import context

BASE_DIR = Path(__file__).resolve().parents[1]
APP_DIR = BASE_DIR / "app"

sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(APP_DIR))

from dotenv import load_dotenv  # noqa: E402
from db.base import Base  # noqa: E402
# Import all models so Alembic can track them
import db.models  # noqa: E402, F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

dotenv_path = BASE_DIR / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path)

target_metadata = Base.metadata

# Try to use Cloud SQL Connector if available, otherwise fall back to direct URL
USE_CLOUD_SQL_CONNECTOR = False
getconn = None

try:
    from core import config as app_config
    from core.gcp_credentials import ensure_application_default_credentials
    from google.cloud.sql.connector import Connector
    import asyncpg
    
    # Check if Cloud SQL config is available
    if (hasattr(app_config, 'INSTANCE_CONNECTION_NAME') and 
        app_config.INSTANCE_CONNECTION_NAME and
        hasattr(app_config, 'DB_USER') and app_config.DB_USER):
        
        # Ensure ADC is available
        # Prioritize file path over JSON string
        ensure_application_default_credentials(
            app_config.GOOGLE_APPLICATION_CREDENTIALS_FILE,
            app_config.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        )
        
        # Create connector factory function
        def create_getconn():
            connector = None
            connector_loop = None
            
            async def getconn_inner() -> asyncpg.Connection:
                """Create a connection to Cloud SQL using Cloud SQL Python Connector."""
                nonlocal connector, connector_loop
                current_loop = asyncio.get_running_loop()
                
                if connector is None or connector_loop != current_loop:
                    connector = Connector(loop=current_loop)
                    connector_loop = current_loop
                
                conn: asyncpg.Connection = await connector.connect_async(
                    app_config.INSTANCE_CONNECTION_NAME,
                    "asyncpg",
                    user=app_config.DB_USER,
                    password=app_config.DB_PASSWORD,
                    db=app_config.DB_NAME,
                    ip_type="private" if app_config.USE_PRIVATE_IP else "public",
                )
                return conn
            
            return getconn_inner
        
        getconn = create_getconn()
        USE_CLOUD_SQL_CONNECTOR = True
except (ImportError, AttributeError, RuntimeError, Exception) as e:
    # Fall back to direct database URL
    database_url = (
        os.getenv("ASYNC_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or config.get_main_option("sqlalchemy.url")
    )
    if not database_url:
        print(f"Warning: Cloud SQL Connector not available ({e}). Trying direct database URL.")
        print("Set ASYNC_DATABASE_URL or DATABASE_URL environment variable.")
    else:
        config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    async def run_async_migrations() -> None:
        connector = None
        try:
            if USE_CLOUD_SQL_CONNECTOR:
                # Use Cloud SQL Connector - create connector inside async context
                connector = Connector(loop=asyncio.get_running_loop())
                
                async def getconn_inner() -> asyncpg.Connection:
                    return await connector.connect_async(
                        app_config.INSTANCE_CONNECTION_NAME,
                        "asyncpg",
                        user=app_config.DB_USER,
                        password=app_config.DB_PASSWORD,
                        db=app_config.DB_NAME,
                        ip_type="private" if app_config.USE_PRIVATE_IP else "public",
                    )
                
                connectable: AsyncEngine = create_async_engine(
                    "postgresql+asyncpg://",
                    async_creator=getconn_inner,
                    poolclass=pool.NullPool,
                )
            else:
                # Use direct database URL
                database_url = (
                    os.getenv("ASYNC_DATABASE_URL")
                    or os.getenv("DATABASE_URL")
                    or config.get_main_option("sqlalchemy.url")
                )
                if not database_url:
                    raise RuntimeError(
                        "Database URL not configured. Set ASYNC_DATABASE_URL or DATABASE_URL."
                    )
                connectable: AsyncEngine = create_async_engine(
                    database_url,
                    poolclass=pool.NullPool,
                )
            
            async with connectable.connect() as connection:
                await connection.run_sync(do_run_migrations)
            await connectable.dispose()
        finally:
            if connector is not None:
                try:
                    await connector.close_async()
                except Exception:
                    pass

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
