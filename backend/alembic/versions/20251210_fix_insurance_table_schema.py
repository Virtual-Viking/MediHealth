"""fix insurance table schema

Revision ID: 20251210_fix_insurance_table_schema
Revises: 20250103_fix_payments_service_id
Create Date: 2025-12-10 22:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251210_fix_insurance_table_schema'
down_revision: Union[str, None] = '20250103_fix_payments_service_id'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add missing columns to patient_insurance_policies table
    op.add_column('patient_insurance_policies', 
                  sa.Column('plan_name', sa.String(200), nullable=True))
    
    # Rename columns to match model
    op.alter_column('patient_insurance_policies', 'insurance_id',
                    new_column_name='insurance_number',
                    existing_type=sa.String(100))
    
    op.alter_column('patient_insurance_policies', 'effective_date',
                    new_column_name='coverage_start',
                    existing_type=sa.Date)
    
    op.alter_column('patient_insurance_policies', 'termination_date',
                    new_column_name='coverage_end',
                    existing_type=sa.Date)
    
    # Add cover_amount column
    op.add_column('patient_insurance_policies',
                  sa.Column('cover_amount', sa.Numeric(12, 2), nullable=True))
    
    # Drop old URL columns that are replaced by policy_documents table
    op.drop_column('patient_insurance_policies', 'policy_document_url')
    op.drop_column('patient_insurance_policies', 'insurance_card_url')


def downgrade() -> None:
    # Reverse the changes
    op.add_column('patient_insurance_policies',
                  sa.Column('insurance_card_url', sa.String(500), nullable=True))
    op.add_column('patient_insurance_policies',
                  sa.Column('policy_document_url', sa.String(500), nullable=True))
    
    op.drop_column('patient_insurance_policies', 'cover_amount')
    
    op.alter_column('patient_insurance_policies', 'coverage_end',
                    new_column_name='termination_date',
                    existing_type=sa.Date)
    
    op.alter_column('patient_insurance_policies', 'coverage_start',
                    new_column_name='effective_date',
                    existing_type=sa.Date)
    
    op.alter_column('patient_insurance_policies', 'insurance_number',
                    new_column_name='insurance_id',
                    existing_type=sa.String(100))
    
    op.drop_column('patient_insurance_policies', 'plan_name')

