from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.reservation import ReservationCreateSchema, ReservationQuerySchema, ReservationSchema
from app.services import reservation_service

blp = Blueprint(
    "client_reservations",
    __name__,
    url_prefix="/api/v1/client/reservations",
    description="Klient: rezerwacje własnych treningów",
)


@blp.route("")
class ReservationCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @blp.arguments(ReservationQuerySchema, location="query")
    @blp.response(200, ReservationSchema(many=True))
    def get(self, args):
        """Moje rezerwacje (opcjonalnie filtrowane po statusie), od najbliższej."""
        return reservation_service.list_client_reservations(
            db_session, client_id=current_user().id, status=args["status"]
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @blp.arguments(ReservationCreateSchema)
    @blp.response(201, ReservationSchema)
    @blp.alt_response(404, description="Okno dyżuru lub termin nie istnieje")
    @blp.alt_response(
        409,
        description="Brak miejsc, kolizja z inną rezerwacją, dyżur zablokowany/rozpoczęty lub rezerwacja już istnieje",
    )
    def post(self, payload):
        """Transakcyjny zapis na wybrany przedział czasowy w oknie dyżuru instruktora (SELECT ... FOR UPDATE)."""
        return reservation_service.create_reservation(
            db_session,
            client_id=current_user().id,
            availability_window_id=payload.get("availability_window_id"),
            start_time=payload.get("start_time"),
            slot_type=payload.get("slot_type"),
            slot_id=payload.get("slot_id"),
            needs_equipment=payload["needs_equipment"],
            phone_number=payload.get("phone_number"),
        )


@blp.route("/<int:reservation_id>")
class ReservationItem(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @blp.response(200, ReservationSchema)
    @blp.alt_response(404, description="Rezerwacja nie istnieje")
    @blp.alt_response(409, description="Rezerwacja już anulowana")
    @blp.alt_response(422, description="Do rozpoczęcia zajęć zostało mniej niż 12 h")
    def delete(self, reservation_id):
        """Anulowanie rezerwacji – dozwolone tylko, gdy now() + 12h <= start_time."""
        return reservation_service.cancel_reservation(
            db_session, reservation_id=reservation_id, client_id=current_user().id
        )
