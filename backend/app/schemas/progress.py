from marshmallow import Schema, fields, validate

KURTYKA_GRADE_REGEX = r"^(I|II|III|IV|IV\+|V-|V|V\+|VI|VI\+|VI\.[1-8]\+?)$"


class ProgressEntryCreateSchema(Schema):
    """Tworzenie wpisu w Dzienniku postępów przez instruktora (skala krakowska Kurtyki)."""

    client_id = fields.Integer(
        required=True,
        validate=validate.Range(min=1),
        metadata={"description": "Identyfikator klienta w systemie."},
    )
    grade = fields.String(
        required=True,
        validate=[
            validate.Length(min=1, max=10),
            validate.Regexp(
                KURTYKA_GRADE_REGEX,
                error="Wycena musi być poprawną wartością w skali krakowskiej (np. IV+, V, VI+, VI.1+, VI.3).",
            ),
        ],
        metadata={
            "example": "VI.1+",
            "description": "Wycena w skali krakowskiej Kurtyki (np. IV+, V, VI+, VI.1+, VI.3).",
        },
    )
    route_name = fields.String(
        load_default=None,
        allow_none=True,
        validate=validate.Length(max=100),
        metadata={"example": "Rysa na lewo", "description": "Opcjonalna nazwa drogi / balda."},
    )
    instructor_feedback = fields.String(
        required=True,
        validate=validate.Length(min=2, max=500),
        metadata={
            "example": "Praca na nogach, skręcanie biodra.",
            "description": "Wskazówki instruktora (maks. 500 znaków).",
        },
    )


class ProgressEntrySchema(Schema):
    """Wpis w Dzienniku postępów."""

    id = fields.Integer(dump_only=True)
    client_id = fields.Integer(dump_only=True)
    client_name = fields.Function(
        lambda e: f"{e.client.first_name} {e.client.last_name}" if e.client else None,
        dump_only=True,
    )
    grade = fields.String(dump_only=True, metadata={"example": "VI.1+"})
    route_name = fields.String(dump_only=True, allow_none=True)
    instructor_feedback = fields.String(dump_only=True)
    instructor_name = fields.Function(
        lambda e: f"{e.instructor.first_name} {e.instructor.last_name}" if e.instructor else None,
        dump_only=True,
    )
    created_at = fields.DateTime(dump_only=True)
