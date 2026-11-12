from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.instructor_client import (
    InstructorClientDetailSchema,
    InstructorClientNoteCreateSchema,
    InstructorClientNoteSchema,
    InstructorClientNoteUpdateSchema,
    InstructorClientSummarySchema,
    InstructorVerifyExperienceSchema,
)
from app.services import instructor_client_service

blp = Blueprint(
    "instructor_clients",
    __name__,
    url_prefix="/api/v1/instructor/clients",
    description="Instruktor: weryfikacja profilu klienta, zatwierdzanie poziomu, notatki i historia treningów",
)


@blp.route("")
class InstructorClientsCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(200, InstructorClientSummarySchema(many=True))
    def get(self):
        """Lista podopiecznych instruktora z podsumowaniem poziomu, notatek i treningów."""
        return instructor_client_service.list_instructor_clients(
            db_session,
            instructor_id=current_user().id,
        )


@blp.route("/<int:client_id>")
class InstructorClientDetailResource(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(200, InstructorClientDetailSchema)
    @blp.alt_response(403, description="Brak dostępu do klienta spoza własnych zajęć")
    @blp.alt_response(404, description="Klient nie istnieje")
    def get(self, client_id):
        """Karta wspinacza: poziom zaawansowania, historia treningów, Dziennik postępów i notatki."""
        return instructor_client_service.get_instructor_client_detail(
            db_session,
            instructor_id=current_user().id,
            client_id=client_id,
        )


@blp.route("/<int:client_id>/experience")
class InstructorClientExperienceResource(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(InstructorVerifyExperienceSchema)
    @blp.response(200, InstructorClientDetailSchema)
    @blp.alt_response(403, description="Brak dostępu do klienta spoza własnych zajęć")
    @blp.alt_response(404, description="Klient nie istnieje")
    def patch(self, payload, client_id):
        """Zatwierdzenie (lub zmiana i zatwierdzenie) poziomu wspinaczki klienta po lub przed zajęciami."""
        return instructor_client_service.verify_client_experience(
            db_session,
            instructor_id=current_user().id,
            client_id=client_id,
            experience_level=payload["experience_level"],
            verified=payload.get("verified", True),
        )


@blp.route("/<int:client_id>/notes")
class InstructorClientNotesCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(InstructorClientNoteCreateSchema)
    @blp.response(201, InstructorClientNoteSchema)
    @blp.alt_response(403, description="Brak dostępu do klienta spoza własnych zajęć")
    @blp.alt_response(404, description="Klient nie istnieje")
    def post(self, payload, client_id):
        """Dodanie prywatnej notatki instruktora dla danego wspinacza."""
        return instructor_client_service.create_client_note(
            db_session,
            instructor_id=current_user().id,
            client_id=client_id,
            content=payload["content"],
        )


@blp.route("/<int:client_id>/notes/<int:note_id>")
class InstructorClientNoteItem(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(InstructorClientNoteUpdateSchema)
    @blp.response(200, InstructorClientNoteSchema)
    @blp.alt_response(403, description="Notatka należy do innego instruktora lub innego klienta")
    @blp.alt_response(404, description="Notatka nie istnieje")
    def patch(self, payload, client_id, note_id):
        """Edycja własnej notatki o podopiecznym."""
        return instructor_client_service.update_client_note(
            db_session,
            note_id=note_id,
            instructor_id=current_user().id,
            client_id=client_id,
            content=payload["content"],
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(204)
    @blp.alt_response(403, description="Notatka należy do innego instruktora lub innego klienta")
    @blp.alt_response(404, description="Notatka nie istnieje")
    def delete(self, client_id, note_id):
        """Usunięcie własnej notatki o podopiecznym."""
        instructor_client_service.delete_client_note(
            db_session,
            note_id=note_id,
            instructor_id=current_user().id,
            client_id=client_id,
        )
        return None

