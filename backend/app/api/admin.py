from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, require_roles
from app.models import UserRole
from app.schemas.admin import (
    AdminHealthSchema,
    AdminInstructorsAvailabilityResponseSchema,
    AdminUsersResponseSchema,
)
from app.services import admin_service

blp = Blueprint(
    "admin",
    __name__,
    url_prefix="/api/v1/admin",
    description="Administrator: diagnostyka infrastruktury, baza użytkowników i zestawienie godzin instruktorów",
)


@blp.route("/health")
class AdminHealthResource(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.ADMIN)
    @blp.response(200, AdminHealthSchema)
    def get(self):
        """Diagnostyka stanu API oraz połączenia z bazą danych PostgreSQL (wyłącznie ROLE_ADMIN)."""
        return admin_service.get_system_diagnostics(db_session)


@blp.route("/users")
class AdminUsersResource(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.ADMIN)
    @blp.response(200, AdminUsersResponseSchema)
    def get(self):
        """Baza zarejestrowanych użytkowników z podziałem na klientów, instruktorów i administratorów."""
        return admin_service.list_users_grouped(db_session)


@blp.route("/instructors-availability")
class AdminInstructorsAvailabilityResource(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.ADMIN)
    @blp.response(200, AdminInstructorsAvailabilityResponseSchema)
    def get(self):
        """Zestawienie grafików, liczby zaplanowanych/zrealizowanych slotów 1h i 1.5h oraz łącznego czasu."""
        return admin_service.get_instructors_availability_report(db_session)

