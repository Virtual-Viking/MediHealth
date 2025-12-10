"""Quick script to verify finance tables were created"""
import asyncio
import sys
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from db.database import get_session

async def check_tables():
    async for session in get_session():
        try:
            result = await session.execute(
                text("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name IN ('doctor_services', 'payments', 'saved_payment_cards')
                    ORDER BY table_name
                """)
            )
            tables = [row[0] for row in result]
            
            print("=" * 50)
            print("Finance Tables Check")
            print("=" * 50)
            
            expected_tables = ['doctor_services', 'payments', 'saved_payment_cards']
            for table in expected_tables:
                status = "✓" if table in tables else "✗"
                print(f"{status} {table}")
            
            if len(tables) == len(expected_tables):
                print("\n✓ All finance tables created successfully!")
            else:
                print(f"\n✗ Missing {len(expected_tables) - len(tables)} table(s)")
            
            # Check enum types
            result = await session.execute(
                text("""
                    SELECT typname 
                    FROM pg_type 
                    WHERE typname IN ('payment_method', 'payment_status')
                    ORDER BY typname
                """)
            )
            enums = [row[0] for row in result]
            print("\nEnum Types:")
            for enum in ['payment_method', 'payment_status']:
                status = "✓" if enum in enums else "✗"
                print(f"{status} {enum}")
            
            # Check file_batch_category enum has new values
            result = await session.execute(
                text("""
                    SELECT enumlabel 
                    FROM pg_enum 
                    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'file_batch_category')
                    ORDER BY enumlabel
                """)
            )
            categories = [row[0] for row in result]
            print("\nFileBatchCategory values:")
            for cat in categories:
                print(f"  - {cat}")
            
            await session.close()
            break
        except Exception as e:
            print(f"Error: {e}")
            await session.close()
            break

if __name__ == "__main__":
    asyncio.run(check_tables())

