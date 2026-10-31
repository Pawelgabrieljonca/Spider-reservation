"""Client climber profile fields and in-app notification center

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-31 21:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Dodaje pola profilu wspinacza do users oraz tabelę in_app_notifications."""
    op.add_column('users', sa.Column('shoe_size', sa.String(length=16), nullable=True))
    op.add_column('users', sa.Column('experience_level', sa.String(length=32), nullable=True))

    op.create_table(
        'in_app_notifications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(length=40), nullable=False),
        sa.Column('title', sa.String(length=180), nullable=False),
        sa.Column('body', sa.String(length=600), nullable=False),
        sa.Column('link_url', sa.String(length=255), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('dedupe_key', sa.String(length=120), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('dedupe_key', name='uq_in_app_notifications_dedupe_key'),
    )
    op.create_index(
        op.f('ix_in_app_notifications_user_id'),
        'in_app_notifications',
        ['user_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_in_app_notifications_is_read'),
        'in_app_notifications',
        ['is_read'],
        unique=False,
    )


def downgrade() -> None:
    """Wycofuje tabelę in_app_notifications oraz kolumny profilu wspinacza."""
    op.drop_index(op.f('ix_in_app_notifications_is_read'), table_name='in_app_notifications')
    op.drop_index(op.f('ix_in_app_notifications_user_id'), table_name='in_app_notifications')
    op.drop_table('in_app_notifications')
    op.drop_column('users', 'experience_level')
    op.drop_column('users', 'shoe_size')

