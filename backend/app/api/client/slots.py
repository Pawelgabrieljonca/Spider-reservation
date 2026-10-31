from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.slot import SlotAvailabilitySchema, SlotQuerySchema
from app.services import slot_service

blp = Blueprint(
    "client_slots",
    __name__,
    url_prefix="/api/v1/client/slots",
    description="Klient: dynamiczne wyliczanie dostępnych godzin rozpoczęcia treningu",
)


@blp.route("")
@blp.doc(**SECURITY_DOC)
@require_roles(UserRole.CLIENT)
@blp.arguments(SlotQuerySchema, location="query")
@blp.response(200, SlotAvailabilitySchema(many=True))
def list_slots(args):
    """Dynamiczna lista dostępnych godzin rozpoczęcia dla wybranego typu usługi (60 min / 90 min)."""
    return slot_service.list_available_slots(
        db_session,
        date_from=args["date_from"],
        date_to=args["date_to"],
        slot_type=args["slot_type"],
        instructor_id=args["instructor_id"],
        client_id=current_user().id,
        only_free=args["only_free"],
    )
