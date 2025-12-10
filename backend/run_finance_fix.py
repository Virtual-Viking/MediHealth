"""
Direct SQL execution script to fix finance tables
This bypasses alembic and SQLAlchemy to directly execute SQL on the database
"""
import asyncio
import sys
from pathlib import Path
from google.cloud.sql.connector import Connector
import asyncpg
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Add app directory to path for config
sys.path.insert(0, str(Path(__file__).parent / "app"))

async def fix_finance_tables(skip_confirm=False):
    """Run the finance tables fix SQL script"""
    
    # Get connection parameters
    instance_connection_name = os.getenv("INSTANCE_CONNECTION_NAME")
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_name = os.getenv("DB_NAME")
    use_private_ip = os.getenv("USE_PRIVATE_IP", "false").lower() == "true"
    
    if not all([instance_connection_name, db_user, db_password, db_name]):
        print("[ERROR] Missing database configuration!")
        print(f"INSTANCE_CONNECTION_NAME: {'OK' if instance_connection_name else 'MISSING'}")
        print(f"DB_USER: {'OK' if db_user else 'MISSING'}")
        print(f"DB_PASSWORD: {'OK' if db_password else 'MISSING'}")
        print(f"DB_NAME: {'OK' if db_name else 'MISSING'}")
        return
    
    print("=" * 60)
    print("Finance Tables Fix Script")
    print("=" * 60)
    print(f"Database: {db_name}")
    print(f"Instance: {instance_connection_name}")
    print(f"User: {db_user}")
    print("=" * 60)
    
    # Read SQL script
    sql_file = Path(__file__).parent / "recreate_finance_tables.sql"
    if not sql_file.exists():
        print(f"[ERROR] SQL script not found: {sql_file}")
        return
    
    with open(sql_file, 'r') as f:
        sql_script = f.read()
    
    if not skip_confirm:
        print("\n[WARNING] This will DROP and recreate finance tables!")
        print("[WARNING] Any existing data in payments, doctor_services, saved_payment_cards will be LOST!")
        print("[INFO] Run with --yes flag to auto-proceed")
        return
    
    # Initialize connector with current event loop
    loop = asyncio.get_running_loop()
    connector = Connector(loop=loop)
    
    try:
        print("\n[INFO] Connecting to Cloud SQL...")
        
        # Connect using Cloud SQL Connector
        conn: asyncpg.Connection = await connector.connect_async(
            instance_connection_name,
            "asyncpg",
            user=db_user,
            password=db_password,
            db=db_name,
            ip_type="private" if use_private_ip else "public",
        )
        
        print("[SUCCESS] Connected successfully!")
        print("\n[INFO] Executing SQL script...")
        
        # Execute the SQL script
        await conn.execute(sql_script)
        
        print("[SUCCESS] SQL script executed successfully!")
        
        # Verify tables were created
        print("\n[INFO] Verifying tables...")
        tables = await conn.fetch("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('doctor_services', 'saved_payment_cards', 'payments')
            ORDER BY table_name
        """)
        
        for table in tables:
            print(f"  [OK] {table['table_name']}")
        
        # Check payments columns
        print("\n[INFO] Payments table columns:")
        columns = await conn.fetch("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'payments'
            ORDER BY ordinal_position
        """)
        
        for col in columns:
            print(f"  [OK] {col['column_name']}: {col['data_type']}")
        
        # Check alembic version
        version = await conn.fetchrow("SELECT version_num FROM alembic_version")
        print(f"\n[SUCCESS] Alembic version set to: {version['version_num']}")
        
        await conn.close()
        
        print("\n" + "=" * 60)
        print("[SUCCESS] Finance tables fixed successfully!")
        print("=" * 60)
        print("\n[NEXT STEPS]")
        print("1. Restart your backend server")
        print("2. Test the finance dashboards")
        print("3. The errors should be gone!")
        
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        await connector.close_async()

if __name__ == "__main__":
    import sys
    skip_confirm = "--yes" in sys.argv or "-y" in sys.argv
    asyncio.run(fix_finance_tables(skip_confirm))

