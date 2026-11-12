"""Zasoby dostępne dla roli ROLE_INSTRUCTOR (prefiks /api/v1/instructor)."""

from app.api.instructor.clients import blp as clients_blp
from app.api.instructor.progress import blp as progress_blp
from app.api.instructor.slots import blp as slots_blp

blueprints = [slots_blp, progress_blp, clients_blp]
