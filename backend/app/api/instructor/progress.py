from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.progress import (
    ProgressEntryCreateSchema,
    ProgressEntrySchema,
    ProgressEntryUpdateSchema,
)
from app.services import progress_service

blp = Blueprint(
    "instructor_progress",
    __name__,
    url_prefix="/api/v1/instructor/progress",
    description="Instruktor: Dziennik postępów (dodawanie wycen w skali krakowskiej i notatek)",
)


@blp.route("")
class InstructorProgressCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(200, ProgressEntrySchema(many=True))
    def get(self):
        """Lista wpisów Dziennika postępów wystawionych przez zalogowanego instruktora."""
        return progress_service.list_instructor_progress(
            db_session,
            instructor_id=current_user().id,
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(ProgressEntryCreateSchema)
    @blp.response(201, ProgressEntrySchema)
    @blp.alt_response(403, description="Klient nie odbył treningu u tego instruktora lub konto nie jest klientem")
    @blp.alt_response(404, description="Klient nie istnieje")
    @blp.alt_response(422, description="Nieprawidłowy format wyceny w skali krakowskiej")
    def post(self, payload):
        """Dodanie wpisu postępu wspinaczkowego dla własnego klienta."""
        return progress_service.create_progress_entry(
            db_session,
            instructor_id=current_user().id,
            client_id=payload["client_id"],
            grade=payload["grade"],
            instructor_feedback=payload["instructor_feedback"],
            route_name=payload.get("route_name"),
        )


@blp.route("/<int:entry_id>")
class InstructorProgressItem(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(ProgressEntryUpdateSchema)
    @blp.response(200, ProgressEntrySchema)
    @blp.alt_response(403, description="Wpis należy do innego instruktora")
    @blp.alt_response(404, description="Wpis nie istnieje")
    def patch(self, payload, entry_id):
        """Edycja własnego wpisu (wycena, nazwa drogi, notatka)."""
        return progress_service.update_progress_entry(
            db_session,
            entry_id=entry_id,
            instructor_id=current_user().id,
            changes=payload,
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(204)
    @blp.alt_response(403, description="Wpis należy do innego instruktora")
    @blp.alt_response(404, description="Wpis nie istnieje")
    def delete(self, entry_id):
        """Usunięcie własnego wpisu z Dziennika postępów."""
        progress_service.delete_progress_entry(
            db_session,
            entry_id=entry_id,
            instructor_id=current_user().id,
        )
        return None


@blp.route("/client/<int:client_id>")
class InstructorClientProgress(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(200, ProgressEntrySchema(many=True))
    @blp.alt_response(403, description="Brak dostępu do obcego klienta lub innego instruktora")
    @blp.alt_response(404, description="Klient nie istnieje")
    def get(self, client_id):
        """Historia wpisów Dziennika postępów klienta, który trenował u zalogowanego instruktora."""
        return progress_service.list_client_progress_for_instructor(
            db_session,
            instructor_id=current_user().id,
            client_id=client_id,
        )
