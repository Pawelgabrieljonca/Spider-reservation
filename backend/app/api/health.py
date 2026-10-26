from flask_smorest import Blueprint, abort
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import db_session
from app.schemas.health import HealthSchema

blp = Blueprint("health", __name__, url_prefix="/health", description="Stan usługi (liveness / readiness)")


@blp.route("")
@blp.response(200, HealthSchema)
@blp.alt_response(503, description="Baza danych niedostępna")
def health():
    """Sprawdza dostępność API oraz połączenia z PostgreSQL."""
    try:
        db_session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        abort(503, message="Database unavailable")
    return {"status": "ok", "database": "ok"}
