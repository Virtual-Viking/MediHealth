"""Fix finance tables - add missing columns if they don't exist"""
import asyncio
from sqlalchemy import text
from db.database import get_session

async def fix_tables():
    async for session in get_session():
        try:
            print("Checking and fixing finance tables...")
            
            # Check if payments table exists and has service_id
            result = await session.execute(
                text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'payments' AND column_name = 'service_id'
                """)
            )
            has_service_id = result.fetchone() is not None
            
            if not has_service_id:
                print("Adding missing service_id column to payments table...")
                await session.execute(
                    text("""
                        ALTER TABLE payments 
                        ADD COLUMN IF NOT EXISTS service_id INTEGER;
                    """)
                )
                await session.execute(
                    text("""
                        ALTER TABLE payments 
                        ADD CONSTRAINT payments_service_id_fkey 
                        FOREIGN KEY (service_id) REFERENCES doctor_services(service_id) ON DELETE SET NULL;
                    """)
                )
                await session.execute(
                    text("""
                        CREATE INDEX IF NOT EXISTS ix_payments_service_id ON payments(service_id);
                    """)
                )
                await session.commit()
                print("✓ Added service_id column to payments table")
            else:
                print("✓ service_id column already exists")
            
            # Check all required columns in payments table
            result = await session.execute(
                text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'payments'
                    ORDER BY column_name
                """)
            )
            existing_columns = {row[0] for row in result}
            
            required_columns = {
                'payment_id', 'appointment_id', 'doctor_user_id', 'patient_user_id',
                'service_id', 'base_amount', 'discount_amount', 'final_amount',
                'payment_method', 'payment_status', 'transaction_id',
                'saved_card_id', 'cheque_batch_id', 'insurance_batch_id',
                'insurance_policy_id', 'created_at', 'updated_at'
            }
            
            missing_columns = required_columns - existing_columns
            if missing_columns:
                print(f"\n⚠ Missing columns: {', '.join(missing_columns)}")
                print("Please run the full migration: alembic upgrade head")
            else:
                print("\n✓ All required columns exist in payments table")
            
            # Check if doctor_services table exists
            result = await session.execute(
                text("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_name = 'doctor_services'
                """)
            )
            if result.fetchone():
                print("✓ doctor_services table exists")
            else:
                print("✗ doctor_services table missing - run migration")
            
            # Check if saved_payment_cards table exists
            result = await session.execute(
                text("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_name = 'saved_payment_cards'
                """)
            )
            if result.fetchone():
                print("✓ saved_payment_cards table exists")
            else:
                print("✗ saved_payment_cards table missing - run migration")
            
            await session.close()
            print("\n" + "="*50)
            print("Fix complete! Please restart your backend server.")
            print("="*50)
            break
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            await session.close()
            break

if __name__ == "__main__":
    asyncio.run(fix_tables())

