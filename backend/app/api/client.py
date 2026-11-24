from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.config import db_session
from app.core.security import SECURITY_DOC, current_user, optional_roles, require_roles
from app.models import UserRole
from app.schemas import (
    ClientProfileSchema,
    ClientProfileUpdateSchema,
    ProgressEntrySchema,
    ReservationCreateSchema,
    ReservationQuerySchema,
    ReservationSchema,
    ReservationUpdateSchema,
    SlotAvailabilitySchema,
    SlotQuerySchema,
)
from app.services import client_service, progress_service, reservation_service, slot_service

slots_blp = Blueprint("client_slots", __name__, url_prefix="/api/v1/client/slots", description="Klient: wolne terminy")
reservations_blp = Blueprint("client_reservations", __name__, url_prefix="/api/v1/client/reservations", description="Klient: rezerwacje")
progress_blp = Blueprint("client_progress", __name__, url_prefix="/api/v1/client/progress", description="Klient: dziennik postępów")
profile_blp = Blueprint("client_profile", __name__, url_prefix="/api/v1/client/profile", description="Klient: profil wspinacza")


@slots_blp.route("")
@slots_blp.doc(**SECURITY_DOC)
@optional_roles(UserRole.CLIENT)
@slots_blp.arguments(SlotQuerySchema, location="query")
@slots_blp.response(200, SlotAvailabilitySchema(many=True))
def list_slots(args):
    user = current_user()
    return slot_service.list_available_slots(
        db_session,
        date_from=args["date_from"],
        date_to=args["date_to"],
        slot_type=args["slot_type"],
        instructor_id=args["instructor_id"],
        client_id=user.id if user else None,
        only_free=args["only_free"],
    )


@reservations_blp.route("")
class ReservationCollection(MethodView):
    @reservations_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @reservations_blp.arguments(ReservationQuerySchema, location="query")
    @reservations_blp.response(200, ReservationSchema(many=True))
    def get(self, args):
        return reservation_service.list_client_reservations(db_session, client_id=current_user().id, status=args["status"])

    @reservations_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @reservations_blp.arguments(ReservationCreateSchema)
    @reservations_blp.response(201, ReservationSchema)
    @reservations_blp.alt_response(404, description="Okno dyżuru lub termin nie istnieje")
    @reservations_blp.alt_response(409, description="Brak miejsc, kolizja lub dyżur zablokowany")
    def post(self, payload):
        return reservation_service.create_reservation(
            db_session,
            client_id=current_user().id,
            availability_window_id=payload["availability_window_id"],
            start_time=payload["start_time"],
            slot_type=payload["slot_type"],
            needs_equipment=payload["needs_equipment"],
            phone_number=payload.get("phone_number"),
        )


@reservations_blp.route("/<int:reservation_id>")
class ReservationItem(MethodView):
    @reservations_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @reservations_blp.arguments(ReservationUpdateSchema)
    @reservations_blp.response(200, ReservationSchema)
    @reservations_blp.alt_response(404, description="Rezerwacja nie istnieje")
    @reservations_blp.alt_response(409, description="Rezerwacja anulowana lub trening rozpoczęty")
    def patch(self, payload, reservation_id):
        return reservation_service.update_reservation_equipment(
            db_session, reservation_id=reservation_id, client_id=current_user().id, needs_equipment=payload["needs_equipment"]
        )

    @reservations_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @reservations_blp.response(200, ReservationSchema)
    @reservations_blp.alt_response(404, description="Rezerwacja nie istnieje")
    @reservations_blp.alt_response(409, description="Rezerwacja już anulowana")
    @reservations_blp.alt_response(422, description="Do rozpoczęcia zajęć zostało mniej niż 12 h")
    def delete(self, reservation_id):
        return reservation_service.cancel_reservation(db_session, reservation_id=reservation_id, client_id=current_user().id)


@progress_blp.route("")
@progress_blp.doc(**SECURITY_DOC)
@require_roles(UserRole.CLIENT)
@progress_blp.response(200, ProgressEntrySchema(many=True))
def list_progress():
    return progress_service.list_client_progress(db_session, client_id=current_user().id)


@profile_blp.route("")
class ClientProfileResource(MethodView):
    @profile_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @profile_blp.response(200, ClientProfileSchema)
    def get(self):
        return client_service.get_client_profile(db_session, user_id=current_user().id)

    @profile_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @profile_blp.arguments(ClientProfileUpdateSchema)
    @profile_blp.response(200, ClientProfileSchema)
    def put(self, payload):
        return client_service.update_client_profile(
            db_session,
            user_id=current_user().id,
            phone_number=payload.get("phone_number"),
            shoe_size=payload.get("shoe_size"),
            experience_level=payload.get("experience_level"),
        )


blueprints = [slots_blp, reservations_blp, progress_blp, profile_blp]
