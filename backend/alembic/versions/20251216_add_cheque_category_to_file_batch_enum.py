"""Add 'cheque' value to file_batch_category enum

This fixes cheque payment uploads that create file batches with category 'cheque'.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "20251216_add_cheque_category_to_file_batch_enum"
down_revision = "20251211_allow_null_payment_method"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add the missing enum value if it is not present
    op.execute("ALTER TYPE file_batch_category ADD VALUE IF NOT EXISTS 'cheque';")


def downgrade() -> None:
    # Enum value removal is not straightforward; document instead of dropping.
    pass


