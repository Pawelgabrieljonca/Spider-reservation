"""Punkt wejścia aplikacji – fabryka Flask (Application Factory Pattern).

Uruchomienie deweloperskie (z katalogu backend/, aktywny venv):
    flask --app app.main run --debug --port 5000

Swagger UI:   http://127.0.0.1:5000/docs
OpenAPI JSON: http://127.0.0.1:5000/openapi.json
"""

from flask import Flask, jsonify
from flask_cors import CORS
from flask_smorest import Api

from app.api import register_blueprints
from app.core.config import FlaskConfig
from app.core.database import db_session
from app.services.exceptions import DomainError


def create_app(config_object: type = FlaskConfig) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    CORS(app, resources={r"/*": {"origins": app.config["CORS_ORIGINS"]}})

    api = Api(app)
    # Schemat bezpieczeństwa dla tokenów JWT z Keycloak (przycisk "Authorize" w Swagger UI)
    api.spec.components.security_scheme(
        "bearerAuth", {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
    )
    register_blueprints(api)

    _register_error_handlers(app)

    @app.teardown_appcontext
    def _remove_db_session(_exc: BaseException | None) -> None:
        # Zwraca połączenie do puli i wycofuje niezatwierdzoną transakcję.
        db_session.remove()

    return app


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(DomainError)
    def _handle_domain_error(err: DomainError):
        # Format zgodny z odpowiedziami błędów flask-smorest: {code, status, message}
        return (
            jsonify(code=err.http_status, status=err.code, message=err.message),
            err.http_status,
        )
