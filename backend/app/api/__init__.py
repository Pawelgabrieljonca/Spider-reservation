"""Warstwa HTTP: blueprinty flask-smorest pogrupowane według aktora/roli."""

from flask_smorest import Api

from app.api.admin import blp as admin_blp
from app.api.client import blueprints as client_blueprints
from app.api.health import blp as health_blp
from app.api.instructor import blueprints as instructor_blueprints
from app.api.notifications import blp as notifications_blp


def register_blueprints(api: Api) -> None:
    api.register_blueprint(health_blp)
    api.register_blueprint(notifications_blp)  # /api/v1/notifications/* (wszystkie zalogowane role)
    for blp in client_blueprints:  # /api/v1/client/* (ROLE_CLIENT)
        api.register_blueprint(blp)
    for blp in instructor_blueprints:  # /api/v1/instructor/* (ROLE_INSTRUCTOR)
        api.register_blueprint(blp)
    api.register_blueprint(admin_blp)  # /api/v1/admin/* (ROLE_ADMIN)
