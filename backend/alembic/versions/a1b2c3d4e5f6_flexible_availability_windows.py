"""Flexible availability windows (Booksy/Calendly shift model)

Revision ID: a1b2c3d4e5f6
Revises: c60fe8f04475
Create Date: 2026-10-31 13:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c60fe8f04475'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to flexible availability windows."""
    op.create_table(
        'availability_windows',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('instructor_id', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_blocked', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('end_time > start_time', name='check_window_end_after_start'),
        sa.ForeignKeyConstraint(['instructor_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_availability_windows_instructor_id'),
        'availability_windows',
        ['instructor_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_availability_windows_start_time'),
        'availability_windows',
        ['start_time'],
        unique=False,
    )

    op.add_column(
        'training_slots',
        sa.Column('availability_window_id', sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f('ix_training_slots_availability_window_id'),
        'training_slots',
        ['availability_window_id'],
        unique=False,
    )
    op.create_foreign_key(
        'fk_training_slots_availability_window_id',
        'training_slots',
        'availability_windows',
        ['availability_window_id'],
        ['id'],
        ondelete='SET NULL',
    )

    # Bezstratna migracja istniejących slotów do elastycznych okien dyżurów:
    # sąsiadujące sloty tego samego instruktora (o tym samym is_blocked) są scalane w ciągłe dyżury.
    bind = op.get_bind()
    existing_slots = bind.execute(
        sa.text(
            """
            SELECT ts.id, ts.instructor_id, ts.start_time, ts.end_time, ts.is_blocked,
                   COUNT(r.id) AS res_count
            FROM training_slots ts
            LEFT JOIN reservations r ON r.slot_id = ts.id
            GROUP BY ts.id, ts.instructor_id, ts.start_time, ts.end_time, ts.is_blocked
            ORDER BY ts.instructor_id ASC, ts.is_blocked ASC, ts.start_time ASC, ts.id ASC
            """
        )
    ).mappings().all()

    merged_groups = []
    for row in existing_slots:
        if merged_groups:
            prev = merged_groups[-1]
            same_day = prev['start_time'].date() == row['start_time'].date()
            if (
                prev['instructor_id'] == row['instructor_id']
                and prev['is_blocked'] == row['is_blocked']
                and same_day
                and row['start_time'] <= prev['end_time']
            ):
                if row['end_time'] > prev['end_time']:
                    prev['end_time'] = row['end_time']
                prev['slots'].append(row)
                continue

        merged_groups.append(
            {
                'instructor_id': row['instructor_id'],
                'start_time': row['start_time'],
                'end_time': row['end_time'],
                'is_blocked': row['is_blocked'],
                'slots': [row],
            }
        )

    for grp in merged_groups:
        win_id = bind.execute(
            sa.text(
                """
                INSERT INTO availability_windows (instructor_id, start_time, end_time, is_blocked)
                VALUES (:instructor_id, :start_time, :end_time, :is_blocked)
                RETURNING id
                """
            ),
            {
                'instructor_id': grp['instructor_id'],
                'start_time': grp['start_time'],
                'end_time': grp['end_time'],
                'is_blocked': grp['is_blocked'],
            },
        ).scalar_one()

        for slot_row in grp['slots']:
            if slot_row['res_count'] > 0:
                bind.execute(
                    sa.text(
                        "UPDATE training_slots SET availability_window_id = :win_id WHERE id = :slot_id"
                    ),
                    {'win_id': win_id, 'slot_id': slot_row['id']},
                )
            else:
                bind.execute(
                    sa.text("DELETE FROM training_slots WHERE id = :slot_id"),
                    {'slot_id': slot_row['id']},
                )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_training_slots_availability_window_id', 'training_slots', type_='foreignkey')
    op.drop_index(op.f('ix_training_slots_availability_window_id'), table_name='training_slots')
    op.drop_column('training_slots', 'availability_window_id')
    op.drop_index(op.f('ix_availability_windows_start_time'), table_name='availability_windows')
    op.drop_index(op.f('ix_availability_windows_instructor_id'), table_name='availability_windows')
    op.drop_table('availability_windows')

