#!/usr/bin/env python3
"""
Fix Alembic migration issue when database references a missing migration.
This script updates the alembic_version table to point to the latest valid revision.
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


async def fix_alembic_version():
    """Fix Alembic version by setting it to the latest valid revision before the new one"""
    # Valid revisions in order (up to the one before our new migration):
    valid_revisions = [
        "20241112_add_google_calendar_credentials",
        "20241119_remove_preferred_time_slot_end_and_duration",
        "20241119_add_file_batch_shares",
        "20250101_add_reschedule_count",
        "20250102_add_account_status",
        "20250103_add_finance_tables",
        "20250103_fix_payments_service_id",
        "20251210_fix_insurance_table_schema",
        "20251211_allow_null_payment_method",  # Latest before our new migration
    ]
    
    from core.gcp_credentials import ensure_application_default_credentials
    ensure_application_default_credentials(
        config.GOOGLE_APPLICATION_CREDENTIALS_FILE,
        config.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    )
    
    connector = None
    conn = None
    
    try:
        # Ensure credentials are available
        ensure_application_default_credentials(
            config.GOOGLE_APPLICATION_CREDENTIALS_FILE,
            config.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        )
        
        # Create connector
        connector = Connector(loop=asyncio.get_running_loop())
        
        # Connect to database
        conn = await connector.connect_async(
            config.INSTANCE_CONNECTION_NAME,
            "asyncpg",
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            db=config.DB_NAME,
            ip_type="private" if config.USE_PRIVATE_IP else "public",
        )
        
        # Check current version
        current_version = await conn.fetchval("""
            SELECT version_num FROM alembic_version LIMIT 1;
        """)
        
        print(f"Current database version: {current_version}")
        
        if current_version in valid_revisions:
            print(f"✓ Database version is valid: {current_version}")
            print("You can now run: alembic upgrade head")
            return
        
        # Check if it's the problematic missing revision
        if current_version == "20251213_add_chat_tables":
            print(f"⚠ Found missing migration reference: {current_version}")
            print("Updating to latest valid revision...")
        else:
            print(f"⚠ Current version '{current_version}' is not in valid revisions list")
            print("Updating to latest valid revision...")
        
        # Update to latest valid revision
        target_revision = valid_revisions[-1]
        await conn.execute("""
            UPDATE alembic_version SET version_num = $1;
        """, target_revision)
        
        print(f"✓ Successfully updated Alembic version to: {target_revision}")
        print("\nYou can now run: alembic upgrade head")
        
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
    asyncio.run(fix_alembic_version())

