from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.progress import ProgressEntrySchema
from app.services import progress_service

blp = Blueprint(
    "client_progress",
    __name__,
    url_prefix="/api/v1/client/progress",
    description="Klient: moduł „Moja Cyfra” (wyceny dróg i notatki instruktora)",
)


@blp.route("")
@blp.doc(**SECURITY_DOC)
@require_roles(UserRole.CLIENT)
@blp.response(200, ProgressEntrySchema(many=True))
def list_progress():
    """Moje wpisy: wycena drogi (np. 6a, 6b+) i uwagi instruktora, od najnowszych."""
    return progress_service.list_client_progress(db_session, client_id=current_user().id)
