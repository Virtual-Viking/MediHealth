"""add chat tables

Revision ID: 20251213_add_chat_tables
Revises: 20251211_allow_null_payment_method
Create Date: 2025-12-13

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251213_add_chat_tables'
down_revision = '20251211_allow_null_payment_method'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Get connection and check which tables exist
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    
    # Helper to check if table exists
    def table_exists(table_name: str) -> bool:
        return table_name in existing_tables
    
    # Helper to check if index exists
    def index_exists(index_name: str, table_name: str) -> bool:
        if not table_exists(table_name):
            return False
        try:
            indexes = inspector.get_indexes(table_name)
            return any(idx['name'] == index_name for idx in indexes)
        except Exception:
            return False
    
    # Create conversations table (skip if already exists)
    if not table_exists('conversations'):
        op.create_table(
            'conversations',
            sa.Column('conversation_id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('conversation_type', sa.String(50), nullable=False),
            sa.Column('appointment_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.ForeignKeyConstraint(['appointment_id'], ['appointments.appointment_id'], ondelete='CASCADE'),
        )
    
    # Create indexes for conversations
    if not index_exists('ix_conversations_conversation_id', 'conversations'):
        op.create_index('ix_conversations_conversation_id', 'conversations', ['conversation_id'])
    if not index_exists('ix_conversations_appointment_id', 'conversations'):
        op.create_index('ix_conversations_appointment_id', 'conversations', ['appointment_id'])
    
    # Create conversation_participants table (skip if already exists)
    if not table_exists('conversation_participants'):
        op.create_table(
            'conversation_participants',
            sa.Column('participant_id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.Column('last_read_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
            sa.ForeignKeyConstraint(['conversation_id'], ['conversations.conversation_id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ondelete='CASCADE'),
        )
    
    # Create indexes for conversation_participants
    if not index_exists('ix_conversation_participants_conversation_id', 'conversation_participants'):
        op.create_index('ix_conversation_participants_conversation_id', 'conversation_participants', ['conversation_id'])
    if not index_exists('ix_conversation_participants_user_id', 'conversation_participants'):
        op.create_index('ix_conversation_participants_user_id', 'conversation_participants', ['user_id'])
    
    # Create messages table (skip if already exists)
    if not table_exists('messages'):
        op.create_table(
            'messages',
            sa.Column('message_id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('sender_id', sa.Integer(), nullable=False),
            sa.Column('message_type', sa.String(50), nullable=False, server_default='text'),
            sa.Column('content', sa.Text(), nullable=True),
            sa.Column('file_url', sa.Text(), nullable=True),
            sa.Column('file_name', sa.String(255), nullable=True),
            sa.Column('file_size', sa.BigInteger(), nullable=True),
            sa.Column('file_category', sa.String(100), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.ForeignKeyConstraint(['conversation_id'], ['conversations.conversation_id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['sender_id'], ['users.user_id'], ondelete='CASCADE'),
        )
    
    # Create indexes for messages
    if not index_exists('ix_messages_conversation_id', 'messages'):
        op.create_index('ix_messages_conversation_id', 'messages', ['conversation_id'])
    if not index_exists('ix_messages_sender_id', 'messages'):
        op.create_index('ix_messages_sender_id', 'messages', ['sender_id'])
    if not index_exists('ix_messages_created_at', 'messages'):
        op.create_index('ix_messages_created_at', 'messages', ['created_at'])
    
    # Create message_read_receipts table (skip if already exists)
    if not table_exists('message_read_receipts'):
        op.create_table(
            'message_read_receipts',
            sa.Column('receipt_id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('message_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('read_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
            sa.ForeignKeyConstraint(['message_id'], ['messages.message_id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], ondelete='CASCADE'),
            sa.UniqueConstraint('message_id', 'user_id', name='uq_message_read_receipt'),
        )
    
    # Create indexes for message_read_receipts
    if not index_exists('ix_message_read_receipts_message_id', 'message_read_receipts'):
        op.create_index('ix_message_read_receipts_message_id', 'message_read_receipts', ['message_id'])
    if not index_exists('ix_message_read_receipts_user_id', 'message_read_receipts'):
        op.create_index('ix_message_read_receipts_user_id', 'message_read_receipts', ['user_id'])


def downgrade() -> None:
    op.drop_table('message_read_receipts')
    op.drop_table('messages')
    op.drop_table('conversation_participants')
    op.drop_table('conversations')

