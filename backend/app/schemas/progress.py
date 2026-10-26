import re
from marshmallow import Schema, fields, validate


class ProgressEntryCreateSchema(Schema):
    """Tworzenie wpisu w module „Moja Cyfra” przez instruktora."""

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
                r"^[1-9][a-c]?\+?$",
                re.IGNORECASE,
                error="Wycena musi być poprawną wartością w skali francuskiej (np. 5c, 6a, 6b+).",
            ),
        ],
        metadata={"example": "6a+", "description": "Wycena w skali francuskiej (np. 5c, 6a, 6b+)."},
    )
    route_name = fields.String(
        load_default=None,
        allow_none=True,
        validate=validate.Length(max=100),
        metadata={"example": "Rysa na lewo", "description": "Opcjonalna nazwa drogi / balda."},
    )
    instructor_feedback = fields.String(
        required=True,
        validate=validate.Length(min=2),
        metadata={"example": "Praca na nogach, skręcanie biodra.", "description": "Wskazówki instruktora."},
    )


class ProgressEntrySchema(Schema):
    """Wpis w module „Moja Cyfra”."""

    id = fields.Integer(dump_only=True)
    client_id = fields.Integer(dump_only=True)
    client_name = fields.Function(
        lambda e: f"{e.client.first_name} {e.client.last_name}" if e.client else None,
        dump_only=True,
    )
    grade = fields.String(dump_only=True, metadata={"example": "6a+"})
    route_name = fields.String(dump_only=True, allow_none=True)
    instructor_feedback = fields.String(dump_only=True)
    instructor_name = fields.Function(
        lambda e: f"{e.instructor.first_name} {e.instructor.last_name}" if e.instructor else None,
        dump_only=True,
    )
    created_at = fields.DateTime(dump_only=True)
