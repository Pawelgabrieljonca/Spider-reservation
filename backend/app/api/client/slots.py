from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, require_roles
from app.models import UserRole
from app.schemas.slot import SlotAvailabilitySchema, SlotQuerySchema
from app.services import slot_service

blp = Blueprint(
    "client_slots",
    __name__,
    url_prefix="/api/v1/client/slots",
    description="Klient: przeglądanie dostępnych terminów",
)


@blp.route("")
@blp.doc(**SECURITY_DOC)
@require_roles(UserRole.CLIENT)
@blp.arguments(SlotQuerySchema, location="query")
@blp.response(200, SlotAvailabilitySchema(many=True))
def list_slots(args):
    """Lista nadchodzących terminów z liczbą wolnych miejsc (1h = 1 osoba, 1.5h = max 3)."""
    return slot_service.list_available_slots(
        db_session,
        date_from=args["date_from"],
        date_to=args["date_to"],
        slot_type=args["slot_type"],
        only_free=args["only_free"],
    )
