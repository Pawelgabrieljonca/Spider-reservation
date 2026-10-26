"""Warstwa HTTP: blueprinty flask-smorest pogrupowane według aktora/roli."""

from flask_smorest import Api

from app.api.client import blueprints as client_blueprints
from app.api.health import blp as health_blp
from app.api.instructor import blueprints as instructor_blueprints


def register_blueprints(api: Api) -> None:
    api.register_blueprint(health_blp)
    for blp in client_blueprints:  # /api/v1/client/* (ROLE_CLIENT)
        api.register_blueprint(blp)
    for blp in instructor_blueprints:  # /api/v1/instructor/* (ROLE_INSTRUCTOR)
        api.register_blueprint(blp)
    # Kolejne moduły (podział według roli z Keycloak):
    # api.register_blueprint(auth_blp, url_prefix="/api/v1/auth")
    # api.register_blueprint(admin_blp, url_prefix="/api/v1/admin")

