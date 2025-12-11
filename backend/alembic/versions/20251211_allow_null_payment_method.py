"""allow null payment method

Revision ID: 20251211_allow_null_payment_method
Revises: 20251210_fix_insurance_table_schema
Create Date: 2025-12-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251211_allow_null_payment_method'
down_revision: Union[str, None] = '20251210_fix_insurance_table_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make payment_method column nullable
    op.alter_column('payments', 'payment_method',
               existing_type=sa.Enum('online', 'cheque', 'insurance', name='payment_method'),
               nullable=True)


def downgrade() -> None:
    # Make payment_method column not nullable again
    op.alter_column('payments', 'payment_method',
               existing_type=sa.Enum('online', 'cheque', 'insurance', name='payment_method'),
               nullable=False)

