from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.slot import (
    BulkSlotsCreateSchema,
    BulkSlotsResponseSchema,
    InstructorSlotQuerySchema,
    InstructorSlotSchema,
    SlotCreateSchema,
    SlotUpdateSchema,
)
from app.services import slot_service

blp = Blueprint(
    "instructor_slots",
    __name__,
    url_prefix="/api/v1/instructor/slots",
    description="Instruktor: zarządzanie elastycznymi dyżurami (oknami dyspozycyjności)",
)


@blp.route("")
class InstructorSlotCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(InstructorSlotQuerySchema, location="query")
    @blp.response(200, InstructorSlotSchema(many=True))
    def get(self, args):
        """Mój grafik: lista dyżurów instruktora wraz z osadzonymi w nich rezerwacjami klientów."""
        return slot_service.list_instructor_slots(
            db_session,
            instructor_id=current_user().id,
            date_from=args.get("date_from"),
            date_to=args.get("date_to"),
            is_blocked=args.get("is_blocked"),
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(SlotCreateSchema)
    @blp.response(201, InstructorSlotSchema)
    @blp.alt_response(409, description="Dyżur koliduje z innym dyżurem instruktora")
    @blp.alt_response(422, description="Dyżur krótszy niż 60 min, godziny poza 09:00-22:00 lub data w przeszłości")
    def post(self, payload):
        """Deklaracja nowego okna dyżuru (start_time – end_time, bez sztywnego typu slotu)."""
        return slot_service.create_availability_window(
            db_session,
            instructor_id=current_user().id,
            start_time=payload["start_time"],
            end_time=payload["end_time"],
        )


@blp.route("/bulk")
class InstructorSlotBulkCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(BulkSlotsCreateSchema)
    @blp.response(201, BulkSlotsResponseSchema)
    def post(self, payload):
        """Seryjne dodanie dyżurów dla zakresu dni (np. wybrany tydzień lub miesiąc)."""
        return slot_service.create_availability_windows_bulk(
            db_session,
            instructor_id=current_user().id,
            windows=payload["windows"],
        )


@blp.route("/<int:slot_id>")
class InstructorSlotItem(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(200, InstructorSlotSchema)
    @blp.alt_response(403, description="Dyżur należy do innego instruktora")
    @blp.alt_response(404, description="Dyżur nie istnieje")
    def get(self, slot_id):
        """Szczegóły własnego dyżuru wraz z listą zapisanych osób i danymi kontaktowymi."""
        return slot_service.get_instructor_slot(
            db_session,
            slot_id=slot_id,
            instructor_id=current_user().id,
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(SlotUpdateSchema)
    @blp.response(200, InstructorSlotSchema)
    @blp.alt_response(403, description="Dyżur należy do innego instruktora")
    @blp.alt_response(404, description="Dyżur nie istnieje")
    def patch(self, payload, slot_id):
        """Zablokowanie lub odblokowanie własnego dyżuru dla nowych rezerwacji."""
        return slot_service.update_slot_block(
            db_session,
            slot_id=slot_id,
            instructor_id=current_user().id,
            is_blocked=payload["is_blocked"],
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(204)
    @blp.alt_response(403, description="Dyżur należy do innego instruktora")
    @blp.alt_response(404, description="Dyżur nie istnieje")
    @blp.alt_response(409, description="Nie można usunąć dyżuru z aktywnymi rezerwacjami")
    def delete(self, slot_id):
        """Usunięcie dyżuru z grafiku (dozwolone tylko, gdy brak aktywnych rezerwacji)."""
        slot_service.delete_slot(
            db_session,
            slot_id=slot_id,
            instructor_id=current_user().id,
        )
        return ""
