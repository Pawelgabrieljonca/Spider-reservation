from typing import Sequence, Union

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_training_slots_instructor_id", "training_slots", ["instructor_id"], unique=False, if_not_exists=True)
    op.create_index("ix_reservations_client_id", "reservations", ["client_id"], unique=False, if_not_exists=True)
    op.create_index("ix_progress_entries_client_id", "progress_entries", ["client_id"], unique=False, if_not_exists=True)
    op.create_index("ix_progress_entries_instructor_id", "progress_entries", ["instructor_id"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_progress_entries_instructor_id", table_name="progress_entries", if_exists=True)
    op.drop_index("ix_progress_entries_client_id", table_name="progress_entries", if_exists=True)
    op.drop_index("ix_reservations_client_id", table_name="reservations", if_exists=True)
    op.drop_index("ix_training_slots_instructor_id", table_name="training_slots", if_exists=True)
