"""Instructor verification of climber experience level and private coaching notes

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-10 17:41:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Dodaje kolumny weryfikacji poziomu wspinacza w users oraz tabelę instructor_client_notes."""
    op.add_column(
        'users',
        sa.Column(
            'experience_verified',
            sa.Boolean(),
            server_default=sa.text('false'),
            nullable=False,
        ),
    )
    op.add_column(
        'users',
        sa.Column('experience_verified_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('experience_verified_by_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_users_experience_verified_by_id',
        'users',
        'users',
        ['experience_verified_by_id'],
        ['id'],
        ondelete='SET NULL',
    )

    op.create_table(
        'instructor_client_notes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('instructor_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
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
        sa.ForeignKeyConstraint(['client_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['instructor_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_instructor_client_notes_client_id'),
        'instructor_client_notes',
        ['client_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_instructor_client_notes_instructor_id'),
        'instructor_client_notes',
        ['instructor_id'],
        unique=False,
    )


def downgrade() -> None:
    """Wycofuje tabelę instructor_client_notes oraz kolumny weryfikacji poziomu w users."""
    op.drop_index(
        op.f('ix_instructor_client_notes_instructor_id'),
        table_name='instructor_client_notes',
    )
    op.drop_index(
        op.f('ix_instructor_client_notes_client_id'),
        table_name='instructor_client_notes',
    )
    op.drop_table('instructor_client_notes')
    op.drop_constraint('fk_users_experience_verified_by_id', 'users', type_='foreignkey')
    op.drop_column('users', 'experience_verified_by_id')
    op.drop_column('users', 'experience_verified_at')
    op.drop_column('users', 'experience_verified')

