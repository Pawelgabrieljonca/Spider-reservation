import re
from datetime import timedelta

from marshmallow import Schema, ValidationError, fields, post_load, pre_dump, pre_load, validate, validates, validates_schema

from app.core.config import full_name
from app.models import ExperienceLevel, ReservationStatus, SlotType
from app.services.exceptions import OutsideOperatingHoursError
from app.services.reservation_service import can_cancel
from app.services.slot_service import MIN_WINDOW_DURATION, serialize_instructor_reservation, validate_operating_hours

MAX_QUERY_SPAN = timedelta(days=62)
PHONE_REGEX = re.compile(r"^[0-9+\-\s()]{7,20}$")
ALLOWED_EXPERIENCE = [lvl.value for lvl in ExperienceLevel]
_EXPERIENCE_VALIDATOR = validate.OneOf(
    ALLOWED_EXPERIENCE, error="Poziom zaawansowania musi mieć wartość BEGINNER, INTERMEDIATE lub ADVANCED."
)
_GRADE_VALIDATOR = validate.Length(min=1, max=10, error="Podaj trudność drogi (1–10 znaków).")


class HealthSchema(Schema):
    status = fields.String(required=True)
    database = fields.String(required=True)


class PasswordResetRequestSchema(Schema):
    redirect_path = fields.String(load_default="/")

    @validates("redirect_path")
    def validate_redirect_path(self, value: str, **kwargs) -> None:
        if not value.startswith("/") or value.startswith("//") or "://" in value:
            raise ValidationError("redirect_path musi być bezpieczną ścieżką względną zaczynającą się od '/'.")


class PasswordResetResponseSchema(Schema):
    message = fields.String(required=True)
    email = fields.String(required=True)


class InAppNotificationSchema(Schema):
    id = fields.Integer(dump_only=True)
    category = fields.String(dump_only=True)
    title = fields.String(dump_only=True)
    body = fields.String(dump_only=True)
    link_url = fields.String(dump_only=True, allow_none=True)
    is_read = fields.Boolean(dump_only=True)
    created_at = fields.DateTime(dump_only=True)


class NotificationListResponseSchema(Schema):
    unread_count = fields.Integer(dump_only=True)
    items = fields.Nested(InAppNotificationSchema, many=True, dump_only=True)


class NotificationQuerySchema(Schema):
    limit = fields.Integer(load_default=25, validate=validate.Range(min=1, max=100))


class MarkAllReadResponseSchema(Schema):
    updated_count = fields.Integer(dump_only=True)


class _DateRangeQuerySchema(Schema):
    date_from = fields.AwareDateTime(load_default=None)
    date_to = fields.AwareDateTime(load_default=None)

    @validates_schema
    def validate_range(self, data, **kwargs):
        start, end = data.get("date_from"), data.get("date_to")
        if start and end:
            if end <= start:
                raise ValidationError("date_to musi być późniejsze niż date_from.", "date_to")
            if end - start > MAX_QUERY_SPAN:
                raise ValidationError("Maksymalny zakres wyszukiwania to 62 dni.", "date_to")


class _SlotBaseSchema(Schema):
    id = fields.Integer(dump_only=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    slot_type = fields.Enum(SlotType, by_value=True, dump_only=True)
    max_capacity = fields.Integer(dump_only=True)


class SlotSchema(_SlotBaseSchema):
    availability_window_id = fields.Integer(dump_only=True, allow_none=True)
    instructor_name = fields.Function(lambda s: full_name(s.instructor), dump_only=True)


class SlotAvailabilitySchema(Schema):
    id = fields.String(dump_only=True)
    availability_window_id = fields.Integer(dump_only=True)
    slot_id = fields.Integer(dump_only=True, allow_none=True)
    instructor_id = fields.Integer(dump_only=True)
    instructor_name = fields.String(dump_only=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    slot_type = fields.Enum(SlotType, by_value=True, dump_only=True)
    max_capacity = fields.Integer(dump_only=True)
    free_places = fields.Integer(dump_only=True)
    is_joining_group = fields.Boolean(dump_only=True)


class SlotQuerySchema(_DateRangeQuerySchema):
    slot_type = fields.Enum(SlotType, by_value=True, load_default=None)
    instructor_id = fields.Integer(load_default=None, validate=validate.Range(min=1))
    only_free = fields.Boolean(load_default=True)


class SlotCreateSchema(Schema):
    start_time = fields.AwareDateTime(required=True)
    end_time = fields.AwareDateTime(required=True)

    @validates_schema
    def validate_window_times(self, data, **kwargs):
        start, end = data.get("start_time"), data.get("end_time")
        if not start or not end:
            return
        if end <= start:
            raise ValidationError("Godzina końca dyżuru musi być późniejsza niż godzina startu.", "end_time")
        if end - start < MIN_WINDOW_DURATION:
            raise ValidationError("Okno dyżuru musi trwać co najmniej 60 minut.", "end_time")
        try:
            validate_operating_hours(start, end)
        except OutsideOperatingHoursError as exc:
            raise ValidationError(exc.message, "start_time") from exc


class BulkSlotsCreateSchema(Schema):
    windows = fields.List(fields.Nested(SlotCreateSchema), required=True, validate=validate.Length(min=1, max=62))


class SlotUpdateSchema(Schema):
    is_blocked = fields.Boolean(required=True)


class InstructorReservationSchema(Schema):
    id = fields.Integer(dump_only=True)
    client_id = fields.Integer(dump_only=True)
    client_name = fields.String(dump_only=True, allow_none=True)
    client_email = fields.String(dump_only=True, allow_none=True)
    client_phone = fields.String(dump_only=True, allow_none=True)
    client_shoe_size = fields.String(dump_only=True, allow_none=True)
    client_experience_level = fields.String(dump_only=True, allow_none=True)
    client_experience_verified = fields.Boolean(dump_only=True)
    client_experience_verified_at = fields.DateTime(dump_only=True, allow_none=True)
    client_experience_verified_by_name = fields.String(dump_only=True, allow_none=True)
    needs_equipment = fields.Boolean(dump_only=True)
    status = fields.String(dump_only=True)
    created_at = fields.DateTime(dump_only=True, allow_none=True)
    slot_id = fields.Integer(dump_only=True, allow_none=True)
    slot_start = fields.DateTime(dump_only=True, allow_none=True)
    slot_end = fields.DateTime(dump_only=True, allow_none=True)
    slot_type = fields.String(dump_only=True, allow_none=True)
    max_capacity = fields.Integer(dump_only=True, allow_none=True)

    @pre_dump
    def normalize(self, obj, **kwargs):
        return obj if isinstance(obj, dict) else serialize_instructor_reservation(obj)


class BookedSessionSummarySchema(_SlotBaseSchema):
    confirmed_reservations_count = fields.Integer(dump_only=True)
    free_places = fields.Integer(dump_only=True)
    reservations = fields.Nested(InstructorReservationSchema, many=True, dump_only=True)


class InstructorSlotSchema(Schema):
    id = fields.Integer(dump_only=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    duration_minutes = fields.Integer(dump_only=True)
    is_blocked = fields.Boolean(dump_only=True)
    confirmed_reservations_count = fields.Integer(dump_only=True)
    booked_sessions = fields.Nested(BookedSessionSummarySchema, many=True, dump_only=True)
    reservations = fields.Nested(InstructorReservationSchema, attribute="reservations_list", many=True, dump_only=True)


class BulkSlotsResponseSchema(Schema):
    created = fields.Nested(InstructorSlotSchema, many=True, dump_only=True)
    created_count = fields.Integer(dump_only=True)
    failed_count = fields.Integer(dump_only=True)
    errors = fields.List(fields.Dict(), dump_only=True)


class InstructorSlotQuerySchema(_DateRangeQuerySchema):
    is_blocked = fields.Boolean(load_default=None)


class ReservationCreateSchema(Schema):
    availability_window_id = fields.Integer(required=True, validate=validate.Range(min=1))
    start_time = fields.AwareDateTime(required=True)
    slot_type = fields.Enum(SlotType, by_value=True, required=True)
    needs_equipment = fields.Boolean(load_default=False)
    phone_number = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=20))


class ReservationUpdateSchema(Schema):
    needs_equipment = fields.Boolean(required=True)


class ReservationQuerySchema(Schema):
    status = fields.Enum(ReservationStatus, by_value=True, load_default=None)


class ReservationSchema(Schema):
    id = fields.Integer(dump_only=True)
    status = fields.Enum(ReservationStatus, by_value=True, dump_only=True)
    needs_equipment = fields.Boolean(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    slot = fields.Nested(SlotSchema, dump_only=True)
    can_cancel = fields.Function(lambda r: r.status == ReservationStatus.CONFIRMED and can_cancel(r.slot.start_time), dump_only=True)
    slot_occupancy = fields.Function(lambda r: sum(1 for x in r.slot.reservations if x.status == ReservationStatus.CONFIRMED), dump_only=True)


class _GradeStripMixin:
    @pre_load
    def strip_grade(self, data, **kwargs):
        if isinstance(data, dict) and isinstance(data.get("grade"), str):
            data = {**data, "grade": data["grade"].strip()}
        return data


class ProgressEntryCreateSchema(_GradeStripMixin, Schema):
    client_id = fields.Integer(required=True, validate=validate.Range(min=1))
    grade = fields.String(required=True, validate=_GRADE_VALIDATOR)
    route_name = fields.String(load_default=None, allow_none=True, validate=validate.Length(max=100))
    instructor_feedback = fields.String(required=True, validate=validate.Length(min=2, max=500))


class ProgressEntryUpdateSchema(_GradeStripMixin, Schema):
    grade = fields.String(validate=_GRADE_VALIDATOR)
    route_name = fields.String(allow_none=True, validate=validate.Length(max=100))
    instructor_feedback = fields.String(validate=validate.Length(min=2, max=500))

    @validates_schema
    def validate_not_empty(self, data, **kwargs):
        if not data:
            raise ValidationError("Podaj co najmniej jedno pole do zmiany.")


def _verifier_name(user) -> str | None:
    return full_name(user.experience_verified_by) or None if user and getattr(user, "experience_verified_by", None) else None


class ProgressEntrySchema(Schema):
    id = fields.Integer(dump_only=True)
    client_id = fields.Integer(dump_only=True)
    client_name = fields.Function(lambda e: full_name(e.client) if e.client else None, dump_only=True)
    client_experience_level = fields.Function(lambda e: e.client.experience_level if e.client else None, dump_only=True)
    client_experience_verified = fields.Function(lambda e: bool(e.client.experience_verified) if e.client else False, dump_only=True)
    client_experience_verified_at = fields.Function(lambda e: e.client.experience_verified_at if e.client else None, dump_only=True)
    client_experience_verified_by_name = fields.Function(lambda e: _verifier_name(e.client), dump_only=True)
    grade = fields.String(dump_only=True)
    route_name = fields.String(dump_only=True, allow_none=True)
    instructor_feedback = fields.String(dump_only=True)
    instructor_name = fields.Function(lambda e: full_name(e.instructor) if e.instructor else None, dump_only=True)
    created_at = fields.DateTime(dump_only=True)


class ClientProfileSchema(Schema):
    id = fields.Integer(dump_only=True)
    email = fields.Email(dump_only=True)
    first_name = fields.String(dump_only=True)
    last_name = fields.String(dump_only=True)
    phone_number = fields.String(dump_only=True, allow_none=True)
    shoe_size = fields.String(dump_only=True, allow_none=True)
    experience_level = fields.String(dump_only=True, allow_none=True)
    experience_verified = fields.Boolean(dump_only=True)
    experience_verified_at = fields.DateTime(dump_only=True, allow_none=True)
    experience_verified_by_name = fields.Function(_verifier_name, dump_only=True)
    updated_at = fields.DateTime(dump_only=True)


class ClientProfileUpdateSchema(Schema):
    phone_number = fields.String(allow_none=True, load_default=None)
    shoe_size = fields.String(allow_none=True, load_default=None)
    experience_level = fields.String(allow_none=True, load_default=None, validate=_EXPERIENCE_VALIDATOR)

    @pre_load
    def normalize_empty_strings(self, data, **kwargs):
        if not isinstance(data, dict):
            return data
        cleaned = dict(data)
        for key in ("phone_number", "shoe_size", "experience_level"):
            if key in cleaned and isinstance(cleaned[key], str):
                cleaned[key] = cleaned[key].strip() or None
        return cleaned

    @validates("phone_number")
    def validate_phone_number(self, value: str | None, **kwargs) -> None:
        if value is not None and (len(value) > 20 or not PHONE_REGEX.match(value)):
            raise ValidationError("Podaj prawidłowy numer telefonu (7–20 znaków, cyfry, spacje lub prefiks +48).")

    @validates("shoe_size")
    def validate_shoe_size(self, value: str | None, **kwargs) -> None:
        if value is None:
            return
        try:
            num = float(value.replace(",", "."))
        except ValueError as exc:
            raise ValidationError("Rozmiar buta musi być liczbą w skali EU (np. 39, 41.5, 43).") from exc
        if num < 26.0 or num > 52.0 or (num * 2) % 1 != 0:
            raise ValidationError("Rozmiar buta musi mieścić się w przedziale 26–52 EU (z krokiem co 0.5).")

    @post_load
    def format_shoe_size(self, data, **kwargs):
        shoe = data.get("shoe_size")
        if shoe is not None:
            num = float(shoe.replace(",", "."))
            data["shoe_size"] = f"{int(num)}" if num.is_integer() else f"{num:.1f}"
        return data


class InstructorVerifyExperienceSchema(Schema):
    experience_level = fields.String(required=True, validate=_EXPERIENCE_VALIDATOR)
    verified = fields.Boolean(load_default=True)

    @pre_load
    def normalize(self, data, **kwargs):
        if isinstance(data, dict) and isinstance(data.get("experience_level"), str):
            data = {**data, "experience_level": data["experience_level"].strip().upper()}
        return data


class InstructorClientNoteInputSchema(Schema):
    content = fields.String(required=True, validate=validate.Length(min=2, max=1000, error="Notatka musi mieć od 2 do 1000 znaków."))

    @pre_load
    def strip_content(self, data, **kwargs):
        if isinstance(data, dict) and isinstance(data.get("content"), str):
            data = {**data, "content": data["content"].strip()}
        return data


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
    notes = fields.Nested(InstructorClientNoteSchema, many=True, dump_only=True)
    trainings_history = fields.Nested(ClientTrainingHistoryItemSchema, many=True, dump_only=True)
    progress_entries = fields.Nested(ProgressEntrySchema, many=True, dump_only=True)
