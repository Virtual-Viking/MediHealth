#!/usr/bin/env python3
"""
Quick fix for Alembic migration issue - directly updates the database version.
Run this script to fix the missing migration reference.
"""
import asyncio
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")

from core import config
from core.gcp_credentials import ensure_application_default_credentials
from google.cloud.sql.connector import Connector
import asyncpg


async def fix_db_version():
    """Directly fix the alembic_version table"""
    ensure_application_default_credentials(
        config.GOOGLE_APPLICATION_CREDENTIALS_FILE,
        config.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    )
    
    connector = None
    conn = None
    
    try:
        connector = Connector(loop=asyncio.get_running_loop())
        conn = await connector.connect_async(
            config.INSTANCE_CONNECTION_NAME,
            "asyncpg",
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            db=config.DB_NAME,
            ip_type="private" if config.USE_PRIVATE_IP else "public",
        )
        
        # Get current version
        current = await conn.fetchval("SELECT version_num FROM alembic_version LIMIT 1;")
        print(f"Current version in database: {current}")
        
        # Set to the latest valid revision before our new migration
        target = "20251211_allow_null_payment_method"
        print(f"Updating to: {target}")
        
        await conn.execute("UPDATE alembic_version SET version_num = $1;", target)
        
        # Verify
        new_version = await conn.fetchval("SELECT version_num FROM alembic_version LIMIT 1;")
        print(f"✓ Successfully updated to: {new_version}")
        print("\nNow you can run: alembic upgrade head")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if conn:
            await conn.close()
        if connector:
            await connector.close_async()


if __name__ == "__main__":
    asyncio.run(fix_db_version())

