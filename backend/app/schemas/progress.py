from marshmallow import Schema, ValidationError, fields, validate, validates_schema

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


class ProgressEntryUpdateSchema(Schema):
    """Edycja własnego wpisu Dziennika postępów (wszystkie pola opcjonalne, min. jedno wymagane)."""

    grade = fields.String(
        validate=[
            validate.Length(min=1, max=10),
            validate.Regexp(
                KURTYKA_GRADE_REGEX,
                error="Wycena musi być poprawną wartością w skali krakowskiej (np. IV+, V, VI+, VI.1+, VI.3).",
            ),
        ],
        metadata={"example": "VI.2", "description": "Nowa wycena w skali krakowskiej."},
    )
    route_name = fields.String(
        allow_none=True,
        validate=validate.Length(max=100),
        metadata={"description": "Nazwa drogi / balda (null lub pusty tekst = usunięcie nazwy)."},
    )
    instructor_feedback = fields.String(
        validate=validate.Length(min=2, max=500),
        metadata={"description": "Poprawiona treść wskazówek instruktora (maks. 500 znaków)."},
    )

    @validates_schema
    def validate_not_empty(self, data, **kwargs):
        if not data:
            raise ValidationError("Podaj co najmniej jedno pole do zmiany.")


class ProgressEntrySchema(Schema):
    """Wpis w Dzienniku postępów."""

    id = fields.Integer(dump_only=True)
    client_id = fields.Integer(dump_only=True)
    client_name = fields.Function(
        lambda e: f"{e.client.first_name} {e.client.last_name}" if e.client else None,
        dump_only=True,
    )
    client_experience_level = fields.Function(
        lambda e: e.client.experience_level if e.client else None,
        dump_only=True,
    )
    client_experience_verified = fields.Function(
        lambda e: bool(e.client.experience_verified) if e.client else False,
        dump_only=True,
    )
    client_experience_verified_at = fields.Function(
        lambda e: e.client.experience_verified_at if e.client else None,
        dump_only=True,
    )
    client_experience_verified_by_name = fields.Function(
        lambda e: (
            f"{e.client.experience_verified_by.first_name} {e.client.experience_verified_by.last_name}".strip()
            if e.client and getattr(e.client, "experience_verified_by", None)
            else None
        ),
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
