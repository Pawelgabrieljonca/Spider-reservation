from marshmallow import Schema, ValidationError, fields, pre_load, validate

from app.models import ExperienceLevel
from app.schemas.progress import ProgressEntrySchema

ALLOWED_EXPERIENCE = {lvl.value for lvl in ExperienceLevel}


class InstructorVerifyExperienceSchema(Schema):
    """Zatwierdzenie lub zmiana i zatwierdzenie poziomu zaawansowania wspinacza przez instruktora."""

    experience_level = fields.String(required=True)
    verified = fields.Boolean(load_default=True)

    @pre_load
    def normalize(self, data, **kwargs):
        if not isinstance(data, dict):
            return data
        cleaned = dict(data)
        if isinstance(cleaned.get("experience_level"), str):
            cleaned["experience_level"] = cleaned["experience_level"].strip().upper()
        return cleaned

    def load(self, data, *, many=None, partial=None, unknown=None):
        loaded = super().load(data, many=many, partial=partial, unknown=unknown)
        if isinstance(loaded, dict):
            lvl = loaded.get("experience_level")
            if lvl not in ALLOWED_EXPERIENCE:
                raise ValidationError(
                    "Poziom zaawansowania musi mieć wartość BEGINNER, INTERMEDIATE lub ADVANCED.",
                    "experience_level",
                )
        return loaded


class InstructorClientNoteCreateSchema(Schema):
    """Tworzenie lub aktualizacja prywatnej notatki instruktora o kliencie."""

    content = fields.String(
        required=True,
        validate=validate.Length(
            min=2,
            max=1000,
            error="Notatka musi mieć od 2 do 1000 znaków.",
        ),
        metadata={
            "example": "Przygotować przewieszenie ok. VI+ – dobrze radzi sobie z pracą nóg, lekki lęk przy odpadaniu.",
            "description": "Treść notatki trenerskiej widocznej wyłącznie dla instruktora.",
        },
    )

    @pre_load
    def strip_content(self, data, **kwargs):
        if not isinstance(data, dict):
            return data
        cleaned = dict(data)
        if isinstance(cleaned.get("content"), str):
            cleaned["content"] = cleaned["content"].strip()
        return cleaned


class InstructorClientNoteUpdateSchema(InstructorClientNoteCreateSchema):
    pass


class InstructorClientNoteSchema(Schema):
    id = fields.Integer(dump_only=True)
    client_id = fields.Integer(dump_only=True)
    instructor_id = fields.Integer(dump_only=True)
    content = fields.String(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)


class ClientTrainingHistoryItemSchema(Schema):
    reservation_id = fields.Integer(dump_only=True)
    slot_id = fields.Integer(dump_only=True)
    availability_window_id = fields.Integer(dump_only=True, allow_none=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    slot_type = fields.String(dump_only=True)
    status = fields.String(dump_only=True)
    needs_equipment = fields.Boolean(dump_only=True)


class InstructorClientSummarySchema(Schema):
    """Podsumowanie profilu podopiecznego widoczne dla instruktora."""

    id = fields.Integer(dump_only=True)
    first_name = fields.String(dump_only=True)
    last_name = fields.String(dump_only=True)
    full_name = fields.String(dump_only=True)
    email = fields.Email(dump_only=True)
    phone_number = fields.String(dump_only=True, allow_none=True)
    shoe_size = fields.String(dump_only=True, allow_none=True)
    experience_level = fields.String(dump_only=True, allow_none=True)
    experience_verified = fields.Boolean(dump_only=True)
    experience_verified_at = fields.DateTime(dump_only=True, allow_none=True)
    experience_verified_by_id = fields.Integer(dump_only=True, allow_none=True)
    experience_verified_by_name = fields.String(dump_only=True, allow_none=True)
    completed_trainings_count = fields.Integer(dump_only=True)
    upcoming_trainings_count = fields.Integer(dump_only=True)
    last_training_at = fields.DateTime(dump_only=True, allow_none=True)
    next_training_at = fields.DateTime(dump_only=True, allow_none=True)
    notes_count = fields.Integer(dump_only=True)
    progress_entries_count = fields.Integer(dump_only=True)
    latest_note = fields.String(dump_only=True, allow_none=True)


class InstructorClientDetailSchema(InstructorClientSummarySchema):
    """Pełna karta weryfikacji wspinacza przed sesją lub po zajęciach."""

    notes = fields.Nested(InstructorClientNoteSchema, many=True, dump_only=True)
    trainings_history = fields.Nested(ClientTrainingHistoryItemSchema, many=True, dump_only=True)
    progress_entries = fields.Nested(ProgressEntrySchema, many=True, dump_only=True)

