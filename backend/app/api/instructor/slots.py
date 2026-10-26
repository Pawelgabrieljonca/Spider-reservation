from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.slot import (
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
    description="Instruktor: zarządzanie grafikiem i terminami treningów",
)


@blp.route("")
class InstructorSlotCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(InstructorSlotQuerySchema, location="query")
    @blp.response(200, InstructorSlotSchema(many=True))
    def get(self, args):
        """Mój grafik: lista zaplanowanych slotów z liczbą rezerwacji i uczestnikami."""
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
    @blp.alt_response(409, description="Termin koliduje z innym slotem instruktora")
    @blp.alt_response(422, description="Błędny czas trwania lub data w przeszłości")
    def post(self, payload):
        """Dodanie nowego terminu do grafiku (automatyczny limit miejsc i weryfikacja kolizji)."""
        return slot_service.create_slot(
            db_session,
            instructor_id=current_user().id,
            start_time=payload["start_time"],
            slot_type=payload["slot_type"],
            end_time=payload.get("end_time"),
        )


@blp.route("/<int:slot_id>")
class InstructorSlotItem(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(200, InstructorSlotSchema)
    @blp.alt_response(404, description="Termin nie istnieje lub nie należy do Twojego konta")
    def get(self, slot_id):
        """Szczegóły slotu wraz z pełną listą zapisanych osób i danymi kontaktowymi."""
        return slot_service.get_instructor_slot(
            db_session,
            slot_id=slot_id,
            instructor_id=current_user().id,
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(SlotUpdateSchema)
    @blp.response(200, InstructorSlotSchema)
    @blp.alt_response(404, description="Termin nie istnieje lub nie należy do Twojego konta")
    def patch(self, payload, slot_id):
        """Zablokowanie lub odblokowanie terminu (ukrycie z widoku publicznego)."""
        return slot_service.update_slot_block(
            db_session,
            slot_id=slot_id,
            instructor_id=current_user().id,
            is_blocked=payload["is_blocked"],
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(204)
    @blp.alt_response(404, description="Termin nie istnieje lub nie należy do Twojego konta")
    @blp.alt_response(409, description="Nie można usunąć terminu z aktywnymi rezerwacjami")
    def delete(self, slot_id):
        """Usunięcie terminu z grafiku (dozwolone tylko, gdy brak aktywnych rezerwacji)."""
        slot_service.delete_slot(
            db_session,
            slot_id=slot_id,
            instructor_id=current_user().id,
        )
        return ""
