"""add account status fields and logs

Revision ID: 20250102_add_account_status
Revises: 20250101_add_reschedule_count
Create Date: 2025-01-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20250102_add_account_status"
down_revision: Union[str, None] = "20250101_add_reschedule_count"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create account_status enum type if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE account_status AS ENUM ('active', 'deactivated', 'suspended');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    # Add account status columns to users table if they don't exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='patient_status') THEN
                ALTER TABLE users ADD COLUMN patient_status account_status NOT NULL DEFAULT 'active';
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='service_provider_status') THEN
                ALTER TABLE users ADD COLUMN service_provider_status account_status NOT NULL DEFAULT 'active';
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='suspension_reason') THEN
                ALTER TABLE users ADD COLUMN suspension_reason VARCHAR(500);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name='users' AND column_name='suspension_ticket_id') THEN
                ALTER TABLE users ADD COLUMN suspension_ticket_id VARCHAR(100);
            END IF;
        END $$;
    """)
    
    # Create account_status_logs table if it doesn't exist
    op.execute("""
        CREATE TABLE IF NOT EXISTS account_status_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            portal_type VARCHAR(20) NOT NULL,
            previous_status VARCHAR(20) NOT NULL,
            new_status VARCHAR(20) NOT NULL,
            reason TEXT,
            ticket_id VARCHAR(100),
            changed_by VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT account_status_logs_user_id_fkey 
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        );
    """)
    
    # Create indexes if they don't exist
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_account_status_logs_id') THEN
                CREATE INDEX ix_account_status_logs_id ON account_status_logs(id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_account_status_logs_user_id') THEN
                CREATE INDEX ix_account_status_logs_user_id ON account_status_logs(user_id);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Drop account_status_logs table
    op.drop_index(op.f("ix_account_status_logs_user_id"), table_name="account_status_logs")
    op.drop_index(op.f("ix_account_status_logs_id"), table_name="account_status_logs")
    op.drop_table("account_status_logs")
    
    # Remove columns from users table
    op.drop_column("users", "suspension_ticket_id")
    op.drop_column("users", "suspension_reason")
    op.drop_column("users", "service_provider_status")
    op.drop_column("users", "patient_status")
    
    # Drop account_status enum type if it exists
    op.execute("""
        DO $$ BEGIN
            DROP TYPE account_status;
        EXCEPTION
            WHEN undefined_object THEN null;
        END $$;
    """)

