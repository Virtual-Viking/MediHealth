"""Check and fix Alembic version in database"""
import asyncio
import sys
import os
from pathlib import Path

# Add app directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app_dir = os.path.join(backend_dir, 'app')
sys.path.insert(0, backend_dir)
sys.path.insert(0, app_dir)

from dotenv import load_dotenv
from core import config
from core.gcp_credentials import ensure_application_default_credentials
from google.cloud.sql.connector import Connector
import asyncpg

# Load environment variables
dotenv_path = Path(backend_dir) / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path)

# Ensure ADC is available
ensure_application_default_credentials(
    config.GOOGLE_APPLICATION_CREDENTIALS_FILE,
    config.GOOGLE_APPLICATION_CREDENTIALS_JSON,
)


async def get_connection():
    """Get a database connection"""
    connector = Connector(loop=asyncio.get_running_loop())
    conn = await connector.connect_async(
        config.INSTANCE_CONNECTION_NAME,
        "asyncpg",
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        db=config.DB_NAME,
        ip_type="private" if config.USE_PRIVATE_IP else "public",
    )
    return conn, connector


async def check_alembic_version():
    """Check current Alembic version in database"""
    conn, connector = await get_connection()
    try:
        # Check if alembic_version table exists
        result = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'alembic_version'
            );
        """)
        
        if not result:
            print("ERROR: alembic_version table does not exist!")
            print("   This might mean migrations have never been run.")
            return None
        
        # Get all versions
        versions = await conn.fetch("""
            SELECT version_num FROM alembic_version;
        """)
        
        if versions:
            print(f"Found {len(versions)} version(s) in database:")
            for v in versions:
                print(f"  - {v['version_num']}")
            return versions[0]['version_num'] if len(versions) == 1 else None
        else:
            print("No versions found in database")
            return None
    finally:
        await conn.close()
        await connector.close_async()


async def fix_alembic_version(target_revision: str = None):
    """Fix Alembic version by setting it to a valid revision"""
    conn, connector = await get_connection()
    try:
        # Valid revisions in order:
        valid_revisions = [
            "20241112_add_google_calendar_credentials",
            "20241119_remove_preferred_time_slot_end_and_duration",
            "20241119_add_file_batch_shares",
            "20250101_add_reschedule_count",
            "20250102_add_account_status",
            "20250103_add_finance_tables",
            "20250103_fix_payments_service_id",
            "20251210_fix_insurance_table_schema",
            "20251211_allow_null_payment_method",
        ]
        
        if target_revision is None:
            # Use the latest revision
            target_revision = valid_revisions[-1]
            print(f"No target revision specified, using latest: {target_revision}")
        
        if target_revision not in valid_revisions:
            print(f"ERROR: Invalid revision '{target_revision}'")
            print(f"   Valid revisions: {', '.join(valid_revisions)}")
            return False
        
        # Check if alembic_version table exists, create if not
        table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'alembic_version'
            );
        """)
        
        if not table_exists:
            print("Creating alembic_version table...")
            await conn.execute("""
                CREATE TABLE alembic_version (
                    version_num VARCHAR(32) NOT NULL,
                    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
                );
            """)
        
        # Get all versions (there should only be one, but check)
        versions = await conn.fetch("""
            SELECT version_num FROM alembic_version;
        """)
        
        if versions:
            print(f"Found {len(versions)} version(s) in database:")
            for v in versions:
                print(f"  - {v['version_num']}")
            
            # Delete all existing versions
            await conn.execute("""
                DELETE FROM alembic_version;
            """)
            print("Cleared existing versions")
        
        # Insert the target revision
        print(f"Setting version to: {target_revision}")
        await conn.execute("""
            INSERT INTO alembic_version (version_num) VALUES ($1)
        """, target_revision)
        
        print(f"SUCCESS: Successfully set Alembic version to: {target_revision}")
        return True
    finally:
        await conn.close()
        await connector.close_async()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Check or fix Alembic version")
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Fix the Alembic version (sets to latest valid revision)"
    )
    parser.add_argument(
        "--revision",
        type=str,
        help="Specific revision to set (only used with --fix)"
    )
    
    args = parser.parse_args()
    
    try:
        if args.fix:
            asyncio.run(fix_alembic_version(args.revision))
        else:
            asyncio.run(check_alembic_version())
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

