from flask.views import MethodView
from flask_smorest import Blueprint

from app.core.database import db_session
from app.core.security import SECURITY_DOC, current_user, require_roles
from app.models import UserRole
from app.schemas.profile import ClientProfileSchema, ClientProfileUpdateSchema
from app.services import profile_service

blp = Blueprint(
    "client_profile",
    __name__,
    url_prefix="/api/v1/client/profile",
    description="Klient: profil wspinacza (telefon kontaktowy, rozmiar buta EU, poziom zaawansowania)",
)


@blp.route("")
class ClientProfileResource(MethodView):
    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @blp.response(200, ClientProfileSchema)
    def get(self):
        """Pobiera aktualne dane profilu zalogowanego wspinacza."""
        return profile_service.get_client_profile(db_session, user_id=current_user().id)

    @blp.doc(**SECURITY_DOC)
    @require_roles(UserRole.CLIENT)
    @blp.arguments(ClientProfileUpdateSchema)
    @blp.response(200, ClientProfileSchema)
    def put(self, payload):
        """Zapisuje numer telefonu, rozmiar buta wspinaczkowego oraz poziom zaawansowania."""
        return profile_service.update_client_profile(
            db_session,
            user_id=current_user().id,
            phone_number=payload.get("phone_number"),
            shoe_size=payload.get("shoe_size"),
            experience_level=payload.get("experience_level"),
        )

