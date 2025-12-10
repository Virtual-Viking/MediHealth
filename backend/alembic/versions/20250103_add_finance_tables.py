"""add finance tables

Revision ID: 20250103_add_finance_tables
Revises: 20250102_add_account_status
Create Date: 2025-01-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20250103_add_finance_tables"
down_revision: Union[str, None] = "20250102_add_account_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create payment_method enum type if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE payment_method AS ENUM ('online', 'cheque', 'insurance');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    # Create payment_status enum type if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    # Update file_batch_category enum to include new categories
    op.execute("""
        DO $$ BEGIN
            -- Check if cheque value exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum 
                WHERE enumlabel = 'cheque' 
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'file_batch_category')
            ) THEN
                ALTER TYPE file_batch_category ADD VALUE 'cheque';
            END IF;
            
            -- Check if insurance_payment value exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum 
                WHERE enumlabel = 'insurance_payment' 
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'file_batch_category')
            ) THEN
                ALTER TYPE file_batch_category ADD VALUE 'insurance_payment';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN null;
        END $$;
    """)
    
    # Create doctor_services table
    op.execute("""
        CREATE TABLE IF NOT EXISTS doctor_services (
            service_id SERIAL PRIMARY KEY,
            doctor_user_id INTEGER NOT NULL,
            service_name VARCHAR(200) NOT NULL,
            description TEXT,
            price NUMERIC(10, 2) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT doctor_services_doctor_user_id_fkey 
                FOREIGN KEY (doctor_user_id) REFERENCES users(user_id) ON DELETE CASCADE
        );
    """)
    
    # Create indexes for doctor_services
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_doctor_services_service_id') THEN
                CREATE INDEX ix_doctor_services_service_id ON doctor_services(service_id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_doctor_services_doctor_user_id') THEN
                CREATE INDEX ix_doctor_services_doctor_user_id ON doctor_services(doctor_user_id);
            END IF;
        END $$;
    """)
    
    # Create saved_payment_cards table
    op.execute("""
        CREATE TABLE IF NOT EXISTS saved_payment_cards (
            card_id SERIAL PRIMARY KEY,
            patient_user_id INTEGER NOT NULL,
            card_last_four VARCHAR(4) NOT NULL,
            card_brand VARCHAR(50) NOT NULL,
            expiry_month INTEGER NOT NULL,
            expiry_year INTEGER NOT NULL,
            cardholder_name VARCHAR(200),
            is_default BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT saved_payment_cards_patient_user_id_fkey 
                FOREIGN KEY (patient_user_id) REFERENCES users(user_id) ON DELETE CASCADE
        );
    """)
    
    # Create indexes for saved_payment_cards
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_saved_payment_cards_card_id') THEN
                CREATE INDEX ix_saved_payment_cards_card_id ON saved_payment_cards(card_id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_saved_payment_cards_patient_user_id') THEN
                CREATE INDEX ix_saved_payment_cards_patient_user_id ON saved_payment_cards(patient_user_id);
            END IF;
        END $$;
    """)
    
    # Create payments table
    op.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            payment_id SERIAL PRIMARY KEY,
            appointment_id INTEGER NOT NULL UNIQUE,
            doctor_user_id INTEGER NOT NULL,
            patient_user_id INTEGER NOT NULL,
            service_id INTEGER,
            base_amount NUMERIC(10, 2) NOT NULL,
            discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
            final_amount NUMERIC(10, 2) NOT NULL,
            payment_method payment_method NOT NULL,
            payment_status payment_status NOT NULL DEFAULT 'pending',
            transaction_id VARCHAR(100),
            saved_card_id INTEGER,
            cheque_batch_id INTEGER,
            insurance_batch_id INTEGER,
            insurance_policy_id VARCHAR(36),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT payments_appointment_id_fkey 
                FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id) ON DELETE CASCADE,
            CONSTRAINT payments_doctor_user_id_fkey 
                FOREIGN KEY (doctor_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            CONSTRAINT payments_patient_user_id_fkey 
                FOREIGN KEY (patient_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            CONSTRAINT payments_service_id_fkey 
                FOREIGN KEY (service_id) REFERENCES doctor_services(service_id) ON DELETE SET NULL,
            CONSTRAINT payments_saved_card_id_fkey 
                FOREIGN KEY (saved_card_id) REFERENCES saved_payment_cards(card_id) ON DELETE SET NULL,
            CONSTRAINT payments_cheque_batch_id_fkey 
                FOREIGN KEY (cheque_batch_id) REFERENCES file_batches(file_batch_id) ON DELETE SET NULL,
            CONSTRAINT payments_insurance_batch_id_fkey 
                FOREIGN KEY (insurance_batch_id) REFERENCES file_batches(file_batch_id) ON DELETE SET NULL
        );
    """)
    
    # Create indexes for payments
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_payment_id') THEN
                CREATE INDEX ix_payments_payment_id ON payments(payment_id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_appointment_id') THEN
                CREATE INDEX ix_payments_appointment_id ON payments(appointment_id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_doctor_user_id') THEN
                CREATE INDEX ix_payments_doctor_user_id ON payments(doctor_user_id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_patient_user_id') THEN
                CREATE INDEX ix_payments_patient_user_id ON payments(patient_user_id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_service_id') THEN
                CREATE INDEX ix_payments_service_id ON payments(service_id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_transaction_id') THEN
                CREATE INDEX ix_payments_transaction_id ON payments(transaction_id);
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_payments_payment_status') THEN
                CREATE INDEX ix_payments_payment_status ON payments(payment_status);
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Drop payments table
    op.drop_index(op.f("ix_payments_payment_status"), table_name="payments")
    op.drop_index(op.f("ix_payments_transaction_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_service_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_patient_user_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_doctor_user_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_appointment_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_payment_id"), table_name="payments")
    op.drop_table("payments")
    
    # Drop saved_payment_cards table
    op.drop_index(op.f("ix_saved_payment_cards_patient_user_id"), table_name="saved_payment_cards")
    op.drop_index(op.f("ix_saved_payment_cards_card_id"), table_name="saved_payment_cards")
    op.drop_table("saved_payment_cards")
    
    # Drop doctor_services table
    op.drop_index(op.f("ix_doctor_services_doctor_user_id"), table_name="doctor_services")
    op.drop_index(op.f("ix_doctor_services_service_id"), table_name="doctor_services")
    op.drop_table("doctor_services")
    
    # Note: We don't remove enum values from file_batch_category as they might be used elsewhere
    # We also don't drop payment_method and payment_status enums as they might be referenced elsewhere

