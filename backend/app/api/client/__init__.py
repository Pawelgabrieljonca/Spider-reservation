"""Zasoby dostępne dla roli ROLE_CLIENT (prefiks /api/v1/client)."""

from app.api.client.profile import blp as profile_blp
from app.api.client.progress import blp as progress_blp
from app.api.client.reservations import blp as reservations_blp
from app.api.client.slots import blp as slots_blp

blueprints = [slots_blp, reservations_blp, progress_blp, profile_blp]
