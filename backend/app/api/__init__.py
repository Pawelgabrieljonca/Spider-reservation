from flask_smorest import Api

from app.api.client import blueprints as client_blueprints
from app.api.common import blueprints as common_blueprints
from app.api.instructor import blueprints as instructor_blueprints


def register_blueprints(api: Api) -> None:
    for blp in (*common_blueprints, *client_blueprints, *instructor_blueprints):
        api.register_blueprint(blp)
