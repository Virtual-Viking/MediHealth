"""fix payments service_id column

Revision ID: 20250103_fix_payments_service_id
Revises: 20250103_add_finance_tables
Create Date: 2025-01-03 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20250103_fix_payments_service_id"
down_revision: Union[str, None] = "20250103_add_finance_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add service_id column if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'payments' AND column_name = 'service_id'
            ) THEN
                ALTER TABLE payments ADD COLUMN service_id INTEGER;
            END IF;
        END $$;
    """)
    
    # Add foreign key constraint if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'payments_service_id_fkey'
            ) THEN
                ALTER TABLE payments 
                ADD CONSTRAINT payments_service_id_fkey 
                FOREIGN KEY (service_id) REFERENCES doctor_services(service_id) ON DELETE SET NULL;
            END IF;
        END $$;
    """)
    
    # Add index if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes 
                WHERE indexname = 'ix_payments_service_id'
            ) THEN
                CREATE INDEX ix_payments_service_id ON payments(service_id);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Remove index
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_indexes 
                WHERE indexname = 'ix_payments_service_id'
            ) THEN
                DROP INDEX ix_payments_service_id;
            END IF;
        END $$;
    """)
    
    # Remove foreign key constraint
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'payments_service_id_fkey'
            ) THEN
                ALTER TABLE payments DROP CONSTRAINT payments_service_id_fkey;
            END IF;
        END $$;
    """)
    
    # Remove column
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'payments' AND column_name = 'service_id'
            ) THEN
                ALTER TABLE payments DROP COLUMN service_id;
            END IF;
        END $$;
    """)

