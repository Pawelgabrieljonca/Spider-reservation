from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.config import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas import (
    BulkSlotsCreateSchema,
    BulkSlotsResponseSchema,
    InstructorClientDetailSchema,
    InstructorClientNoteInputSchema,
    InstructorClientNoteSchema,
    InstructorClientSummarySchema,
    InstructorSlotQuerySchema,
    InstructorSlotSchema,
    InstructorVerifyExperienceSchema,
    ProgressEntryCreateSchema,
    ProgressEntrySchema,
    ProgressEntryUpdateSchema,
    SlotCreateSchema,
    SlotUpdateSchema,
)
from app.services import client_service, progress_service, slot_service

slots_blp = Blueprint("instructor_slots", __name__, url_prefix="/api/v1/instructor/slots", description="Instruktor: dyżury")
progress_blp = Blueprint("instructor_progress", __name__, url_prefix="/api/v1/instructor/progress", description="Instruktor: dziennik postępów")
clients_blp = Blueprint("instructor_clients", __name__, url_prefix="/api/v1/instructor/clients", description="Instruktor: klienci i weryfikacja")


@slots_blp.route("")
class InstructorSlotCollection(MethodView):
    @slots_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @slots_blp.arguments(InstructorSlotQuerySchema, location="query")
    @slots_blp.response(200, InstructorSlotSchema(many=True))
    def get(self, args):
        return slot_service.list_instructor_slots(
            db_session,
            instructor_id=current_user().id,
            date_from=args.get("date_from"),
            date_to=args.get("date_to"),
            is_blocked=args.get("is_blocked"),
        )

    @slots_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @slots_blp.arguments(SlotCreateSchema)
    @slots_blp.response(201, InstructorSlotSchema)
    @slots_blp.alt_response(409, description="Dyżur koliduje z innym dyżurem instruktora")
    @slots_blp.alt_response(422, description="Nieprawidłowy czas trwania lub godziny dyżuru")
    def post(self, payload):
        return slot_service.create_availability_window(
            db_session, instructor_id=current_user().id, start_time=payload["start_time"], end_time=payload["end_time"]
        )


@slots_blp.route("/bulk")
class InstructorSlotBulkCollection(MethodView):
    @slots_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @slots_blp.arguments(BulkSlotsCreateSchema)
    @slots_blp.response(201, BulkSlotsResponseSchema)
    def post(self, payload):
        return slot_service.create_availability_windows_bulk(db_session, instructor_id=current_user().id, windows=payload["windows"])


@slots_blp.route("/<int:slot_id>")
class InstructorSlotItem(MethodView):
    @slots_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @slots_blp.response(200, InstructorSlotSchema)
    def get(self, slot_id):
        return slot_service.get_instructor_slot(db_session, slot_id=slot_id, instructor_id=current_user().id)

    @slots_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @slots_blp.arguments(SlotUpdateSchema)
    @slots_blp.response(200, InstructorSlotSchema)
    def patch(self, payload, slot_id):
        return slot_service.update_slot_block(db_session, slot_id=slot_id, instructor_id=current_user().id, is_blocked=payload["is_blocked"])

    @slots_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @slots_blp.response(204)
    def delete(self, slot_id):
        slot_service.delete_slot(db_session, slot_id=slot_id, instructor_id=current_user().id)
        return None


@progress_blp.route("")
class InstructorProgressCollection(MethodView):
    @progress_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @progress_blp.response(200, ProgressEntrySchema(many=True))
    def get(self):
        return progress_service.list_instructor_progress(db_session, instructor_id=current_user().id)

    @progress_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @progress_blp.arguments(ProgressEntryCreateSchema)
    @progress_blp.response(201, ProgressEntrySchema)
    def post(self, payload):
        return progress_service.create_progress_entry(
            db_session,
            instructor_id=current_user().id,
            client_id=payload["client_id"],
            grade=payload["grade"],
            instructor_feedback=payload["instructor_feedback"],
            route_name=payload.get("route_name"),
        )


@progress_blp.route("/<int:entry_id>")
class InstructorProgressItem(MethodView):
    @progress_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @progress_blp.arguments(ProgressEntryUpdateSchema)
    @progress_blp.response(200, ProgressEntrySchema)
    def patch(self, payload, entry_id):
        return progress_service.update_progress_entry(db_session, entry_id=entry_id, instructor_id=current_user().id, changes=payload)

    @progress_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @progress_blp.response(204)
    def delete(self, entry_id):
        progress_service.delete_progress_entry(db_session, entry_id=entry_id, instructor_id=current_user().id)
        return None


@progress_blp.route("/client/<int:client_id>")
class InstructorClientProgress(MethodView):
    @progress_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @progress_blp.response(200, ProgressEntrySchema(many=True))
    def get(self, client_id):
        return progress_service.list_client_progress_for_instructor(db_session, instructor_id=current_user().id, client_id=client_id)


@clients_blp.route("")
class InstructorClientsCollection(MethodView):
    @clients_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @clients_blp.response(200, InstructorClientSummarySchema(many=True))
    def get(self):
        return client_service.list_instructor_clients(db_session, instructor_id=current_user().id)


@clients_blp.route("/<int:client_id>")
class InstructorClientDetailResource(MethodView):
    @clients_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @clients_blp.response(200, InstructorClientDetailSchema)
    def get(self, client_id):
        return client_service.get_instructor_client_detail(db_session, instructor_id=current_user().id, client_id=client_id)


@clients_blp.route("/<int:client_id>/experience")
class InstructorClientExperienceResource(MethodView):
    @clients_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @clients_blp.arguments(InstructorVerifyExperienceSchema)
    @clients_blp.response(200, InstructorClientDetailSchema)
    def patch(self, payload, client_id):
        return client_service.verify_client_experience(
            db_session,
            instructor_id=current_user().id,
            client_id=client_id,
            experience_level=payload["experience_level"],
            verified=payload.get("verified", True),
        )


@clients_blp.route("/<int:client_id>/notes")
class InstructorClientNotesCollection(MethodView):
    @clients_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @clients_blp.arguments(InstructorClientNoteInputSchema)
    @clients_blp.response(201, InstructorClientNoteSchema)
    def post(self, payload, client_id):
        return client_service.create_client_note(
            db_session, instructor_id=current_user().id, client_id=client_id, content=payload["content"]
        )


@clients_blp.route("/<int:client_id>/notes/<int:note_id>")
class InstructorClientNoteItem(MethodView):
    @clients_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @clients_blp.arguments(InstructorClientNoteInputSchema)
    @clients_blp.response(200, InstructorClientNoteSchema)
    def patch(self, payload, client_id, note_id):
        return client_service.update_client_note(
            db_session, note_id=note_id, instructor_id=current_user().id, client_id=client_id, content=payload["content"]
        )

    @clients_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @clients_blp.response(204)
    def delete(self, client_id, note_id):
        client_service.delete_client_note(db_session, note_id=note_id, instructor_id=current_user().id, client_id=client_id)
        return None


blueprints = [slots_blp, progress_blp, clients_blp]
