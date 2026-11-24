from flask.views import MethodView
from flask_smorest import Blueprint, abort
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas import (
    HealthSchema,
    InAppNotificationSchema,
    MarkAllReadResponseSchema,
    NotificationListResponseSchema,
    NotificationQuerySchema,
    PasswordResetRequestSchema,
    PasswordResetResponseSchema,
)
from app.services import keycloak_admin_service, notification_service

health_blp = Blueprint("health", __name__, url_prefix="/health", description="Stan usługi")
account_blp = Blueprint("account", __name__, url_prefix="/api/v1/account", description="Bezpieczeństwo konta")
notifications_blp = Blueprint("notifications", __name__, url_prefix="/api/v1/notifications", description="Powiadomienia")


@health_blp.route("")
@health_blp.response(200, HealthSchema)
@health_blp.alt_response(503, description="Baza danych niedostępna")
def health():
    try:
        db_session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        abort(503, message="Database unavailable")
    return {"status": "ok", "database": "ok"}


@account_blp.route("/password-reset-email")
class PasswordResetEmailResource(MethodView):
    @account_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT, UserRole.INSTRUCTOR)
    @account_blp.arguments(PasswordResetRequestSchema)
    @account_blp.response(200, PasswordResetResponseSchema)
    def post(self, payload):
        user = current_user()
        keycloak_admin_service.send_password_reset_email(user.keycloak_id, redirect_path=payload["redirect_path"])
        return {
            "message": f"Wysłaliśmy link do zmiany hasła na adres {user.email}. Sprawdź skrzynkę odbiorczą.",
            "email": user.email,
        }


@notifications_blp.route("")
class NotificationCollection(MethodView):
    @notifications_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT, UserRole.INSTRUCTOR)
    @notifications_blp.arguments(NotificationQuerySchema, location="query")
    @notifications_blp.response(200, NotificationListResponseSchema)
    def get(self, args):
        return notification_service.list_user_notifications(db_session, user=current_user(), limit=args["limit"])


@notifications_blp.route("/<int:notification_id>/read")
class NotificationReadResource(MethodView):
    @notifications_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT, UserRole.INSTRUCTOR)
    @notifications_blp.response(200, InAppNotificationSchema)
    def patch(self, notification_id):
        return notification_service.mark_notification_read(db_session, user_id=current_user().id, notification_id=notification_id)


@notifications_blp.route("/read-all")
class NotificationReadAllResource(MethodView):
    @notifications_blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT, UserRole.INSTRUCTOR)
    @notifications_blp.response(200, MarkAllReadResponseSchema)
    def post(self):
        return notification_service.mark_all_notifications_read(db_session, user_id=current_user().id)


blueprints = [health_blp, account_blp, notifications_blp]
