from flask import Flask, jsonify
from flask_cors import CORS
from flask_smorest import Api

from app.api import register_blueprints
from app.core.config import FlaskConfig, db_session
from app.services.exceptions import DomainError

def create_app(config_object: type = FlaskConfig) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    CORS(app, resources={r"/*": {"origins": app.config["CORS_ORIGINS"]}})

    api = Api(app)
    api.spec.components.security_scheme(
        "bearerAuth", {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
    )
    register_blueprints(api)

    _register_error_handlers(app)

    @app.teardown_appcontext
    def _remove_db_session(_exc: BaseException | None) -> None:
        db_session.remove()

    return app

def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(DomainError)
    def _handle_domain_error(err: DomainError):
        return (
            jsonify(code=err.http_status, status=err.code, message=err.message),
            err.http_status,
        )
