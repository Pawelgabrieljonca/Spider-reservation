from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.notification import (
    InAppNotificationSchema,
    MarkAllReadResponseSchema,
    NotificationListResponseSchema,
    NotificationQuerySchema,
)
from app.services import in_app_notification_service

blp = Blueprint(
    "notifications",
    __name__,
    url_prefix="/api/v1/notifications",
    description="Centrum powiadomień wewnątrz aplikacji (dzwonek powiadomień dla wszystkich ról)",
)


@blp.route("")
class NotificationCollection(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT, UserRole.INSTRUCTOR, UserRole.ADMIN)
    @blp.arguments(NotificationQuerySchema, location="query")
    @blp.response(200, NotificationListResponseSchema)
    def get(self, args):
        """Pobiera powiadomienia zalogowanego użytkownika wraz z licznikiem nieprzeczytanych."""
        return in_app_notification_service.list_user_notifications(
            db_session,
            user=current_user(),
            limit=args["limit"],
        )


@blp.route("/<int:notification_id>/read")
class NotificationReadResource(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT, UserRole.INSTRUCTOR, UserRole.ADMIN)
    @blp.response(200, InAppNotificationSchema)
    @blp.alt_response(404, description="Powiadomienie nie istnieje")
    def patch(self, notification_id):
        """Oznacza pojedyncze powiadomienie jako przeczytane."""
        return in_app_notification_service.mark_notification_read(
            db_session,
            user_id=current_user().id,
            notification_id=notification_id,
        )


@blp.route("/read-all")
class NotificationReadAllResource(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT, UserRole.INSTRUCTOR, UserRole.ADMIN)
    @blp.response(200, MarkAllReadResponseSchema)
    def post(self):
        """Oznacza wszystkie powiadomienia zalogowanego użytkownika jako przeczytane."""
        return in_app_notification_service.mark_all_notifications_read(
            db_session,
            user_id=current_user().id,
        )

