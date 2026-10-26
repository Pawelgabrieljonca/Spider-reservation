from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.progress import ProgressEntryCreateSchema, ProgressEntrySchema
from app.services import progress_service

blp = Blueprint(
    "instructor_progress",
    __name__,
    url_prefix="/api/v1/instructor/progress",
    description="Instruktor: moduł „Moja Cyfra” (dodawanie wycen i notatek dla klientów)",
)


@blp.route("")
class InstructorProgressCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(200, ProgressEntrySchema(many=True))
    def get(self):
        """Lista wpisów „Moja Cyfra” wystawionych przez zalogowanego instruktora."""
        return progress_service.list_instructor_progress(
            db_session,
            instructor_id=current_user().id,
        )

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.arguments(ProgressEntryCreateSchema)
    @blp.response(201, ProgressEntrySchema)
    @blp.alt_response(404, description="Klient nie istnieje")
    @blp.alt_response(422, description="Nieprawidłowy format wyceny w skali francuskiej")
    def post(self, payload):
        """Dodanie wpisu postępu wspinaczkowego („Moja Cyfra”) dla klienta."""
        return progress_service.create_progress_entry(
            db_session,
            instructor_id=current_user().id,
            client_id=payload["client_id"],
            grade=payload["grade"],
            instructor_feedback=payload["instructor_feedback"],
            route_name=payload.get("route_name"),
        )


@blp.route("/client/<int:client_id>")
class InstructorClientProgress(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.INSTRUCTOR)
    @blp.response(200, ProgressEntrySchema(many=True))
    @blp.alt_response(404, description="Klient nie istnieje")
    def get(self, client_id):
        """Historia wpisów „Moja Cyfra” danego klienta."""
        return progress_service.list_client_progress(
            db_session,
            client_id=client_id,
        )
