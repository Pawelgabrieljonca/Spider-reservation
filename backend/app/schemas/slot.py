from datetime import time, timedelta
from zoneinfo import ZoneInfo

from marshmallow import Schema, ValidationError, fields, validate, validates_schema

from app.models import SlotType

MAX_QUERY_SPAN = timedelta(days=62)
MIN_WINDOW_DURATION = timedelta(minutes=60)
CLUB_TIMEZONE = ZoneInfo("Europe/Warsaw")
OPENING_TIME = time(9, 0)
CLOSING_TIME = time(22, 0)
OPERATING_HOURS_MSG = "Zajęcia i dyżury mogą odbywać się wyłącznie w godzinach 09:00 - 22:00"


class _SlotBaseSchema(Schema):
    id = fields.Integer(dump_only=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    slot_type = fields.Enum(SlotType, by_value=True, dump_only=True)
    max_capacity = fields.Integer(dump_only=True)


class SlotSchema(_SlotBaseSchema):
    """Sesja treningowa jako obiekt ORM (np. zagnieżdżony w rezerwacji klienta)."""

    availability_window_id = fields.Integer(dump_only=True, allow_none=True)
    instructor_name = fields.Function(
        lambda slot: f"{slot.instructor.first_name} {slot.instructor.last_name}", dump_only=True
    )


class SlotAvailabilitySchema(Schema):
    """Dynamicznie wyliczony dostępny termin startu treningu w oknie dyżuru instruktora."""

    id = fields.String(dump_only=True)
    availability_window_id = fields.Integer(dump_only=True)
    slot_id = fields.Integer(dump_only=True, allow_none=True)
    instructor_id = fields.Integer(dump_only=True)
    instructor_name = fields.String(dump_only=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    slot_type = fields.Enum(SlotType, by_value=True, dump_only=True)
    max_capacity = fields.Integer(dump_only=True)
    free_places = fields.Integer(
        dump_only=True, metadata={"description": "Liczba wolnych miejsc (0 = komplet)."}
    )
    is_joining_group = fields.Boolean(
        dump_only=True,
        metadata={"description": "true, gdy w tym przedziale istnieje już otwarta grupa 1.5h z wolnymi miejscami."},
    )


class SlotQuerySchema(Schema):
    date_from = fields.AwareDateTime(
        load_default=None,
        metadata={"description": "Początek zakresu (ISO 8601 ze strefą). Domyślnie: teraz."},
    )
    date_to = fields.AwareDateTime(
        load_default=None,
        metadata={"description": "Koniec zakresu (wyłącznie). Domyślnie: date_from + 14 dni."},
    )
    slot_type = fields.Enum(
        SlotType,
        by_value=True,
        load_default=None,
        metadata={"description": "Wybrana usługa: INDIVIDUAL_1H (60 min) lub GROUP_1_5H (90 min)."},
    )
    instructor_id = fields.Integer(
        load_default=None,
        validate=validate.Range(min=1),
        metadata={"description": "Opcjonalny filtr ID instruktora."},
    )
    only_free = fields.Boolean(
        load_default=True, metadata={"description": "true = pomiń terminy bez wolnych miejsc."}
    )

    @validates_schema
    def validate_range(self, data, **kwargs):
        start, end = data.get("date_from"), data.get("date_to")
        if start and end:
            if end <= start:
                raise ValidationError("date_to musi być późniejsze niż date_from.", "date_to")
            if end - start > MAX_QUERY_SPAN:
                raise ValidationError("Maksymalny zakres wyszukiwania to 62 dni.", "date_to")


def _validate_window_bounds(start, end) -> None:
    if start is None or end is None:
        return
    if end <= start:
        raise ValidationError("Godzina końca dyżuru musi być późniejsza niż godzina startu.", "end_time")
    if end - start < MIN_WINDOW_DURATION:
        raise ValidationError("Okno dyżuru musi trwać co najmniej 60 minut.", "end_time")

    local_start = start.astimezone(CLUB_TIMEZONE) if start.tzinfo else start
    local_end = end.astimezone(CLUB_TIMEZONE) if end.tzinfo else end
    if (
        local_start.date() != local_end.date()
        or local_start.time() < OPENING_TIME
        or local_end.time() > CLOSING_TIME
    ):
        raise ValidationError(OPERATING_HOURS_MSG, "start_time")


class SlotCreateSchema(Schema):
    """Deklaracja okna dyspozycyjności (dyżuru) instruktora – wyłącznie przedział Od–Do."""

    start_time = fields.AwareDateTime(
        required=True, metadata={"description": "Początek dyżuru (ISO 8601 ze strefą czasową)."}
    )
    end_time = fields.AwareDateTime(
        required=True, metadata={"description": "Koniec dyżuru (ISO 8601 ze strefą czasową)."}
    )

    @validates_schema
    def validate_window_times(self, data, **kwargs):
        _validate_window_bounds(data.get("start_time"), data.get("end_time"))


class BulkSlotsCreateSchema(Schema):
    """Seryjne dodanie dyżurów dla zakresu dni."""

    windows = fields.List(
        fields.Nested(SlotCreateSchema),
        required=True,
        validate=validate.Length(min=1, max=62),
    )


class SlotUpdateSchema(Schema):
    is_blocked = fields.Boolean(
        required=True, metadata={"description": "Czy dyżur ma być zablokowany dla nowych zapisów."}
    )


class InstructorReservationSchema(Schema):
    id = fields.Integer(dump_only=True)
    client_id = fields.Integer(dump_only=True)
    client_name = fields.Method("get_client_name", dump_only=True)
    client_email = fields.Method("get_client_email", dump_only=True)
    client_phone = fields.Method("get_client_phone", dump_only=True)
    client_shoe_size = fields.Method("get_client_shoe_size", dump_only=True)
    client_experience_level = fields.Method("get_client_experience_level", dump_only=True)
    client_experience_verified = fields.Method("get_client_experience_verified", dump_only=True)
    client_experience_verified_at = fields.Method("get_client_experience_verified_at", dump_only=True)
    client_experience_verified_by_name = fields.Method(
        "get_client_experience_verified_by_name", dump_only=True
    )
    needs_equipment = fields.Method("get_needs_equipment", dump_only=True)
    status = fields.Method("get_status_value", dump_only=True)
    created_at = fields.Method("get_created_at", dump_only=True)
    slot_id = fields.Method("get_slot_id", dump_only=True)
    slot_start = fields.Method("get_slot_start", dump_only=True)
    slot_end = fields.Method("get_slot_end", dump_only=True)
    slot_type = fields.Method("get_slot_type", dump_only=True)
    max_capacity = fields.Method("get_max_capacity", dump_only=True)

    def _val(self, obj, key):
        return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)

    def get_client_name(self, obj):
        if isinstance(obj, dict):
            return obj.get("client_name")
        return f"{obj.client.first_name} {obj.client.last_name}" if getattr(obj, "client", None) else None

    def get_client_email(self, obj):
        if isinstance(obj, dict):
            return obj.get("client_email")
        return obj.client.email if getattr(obj, "client", None) else None

    def get_client_phone(self, obj):
        if isinstance(obj, dict):
            return obj.get("client_phone")
        return obj.client.phone_number if getattr(obj, "client", None) else None

    def get_client_shoe_size(self, obj):
        if isinstance(obj, dict):
            return obj.get("client_shoe_size")
        return obj.client.shoe_size if getattr(obj, "client", None) else None

    def get_client_experience_level(self, obj):
        if isinstance(obj, dict):
            return obj.get("client_experience_level")
        return obj.client.experience_level if getattr(obj, "client", None) else None

    def get_client_experience_verified(self, obj):
        if isinstance(obj, dict):
            return bool(obj.get("client_experience_verified"))
        return bool(obj.client.experience_verified) if getattr(obj, "client", None) else False

    def get_client_experience_verified_at(self, obj):
        if isinstance(obj, dict):
            val = obj.get("client_experience_verified_at")
            return val.isoformat() if hasattr(val, "isoformat") else val
        val = obj.client.experience_verified_at if getattr(obj, "client", None) else None
        return val.isoformat() if hasattr(val, "isoformat") else val

    def get_client_experience_verified_by_name(self, obj):
        if isinstance(obj, dict):
            return obj.get("client_experience_verified_by_name")
        client = getattr(obj, "client", None)
        verifier = getattr(client, "experience_verified_by", None) if client else None
        return f"{verifier.first_name} {verifier.last_name}".strip() if verifier else None

    def get_needs_equipment(self, obj):
        return bool(self._val(obj, "needs_equipment"))

    def get_status_value(self, obj):
        st = self._val(obj, "status")
        return st.value if hasattr(st, "value") else str(st)

    def get_created_at(self, obj):
        val = self._val(obj, "created_at")
        return val.isoformat() if hasattr(val, "isoformat") else val

    def get_slot_id(self, obj):
        return self._val(obj, "slot_id")

    def get_slot_start(self, obj):
        val = self._val(obj, "slot_start")
        return val.isoformat() if hasattr(val, "isoformat") else val

    def get_slot_end(self, obj):
        val = self._val(obj, "slot_end")
        return val.isoformat() if hasattr(val, "isoformat") else val

    def get_slot_type(self, obj):
        st = self._val(obj, "slot_type")
        return st.value if hasattr(st, "value") else st

    def get_max_capacity(self, obj):
        return self._val(obj, "max_capacity")


class BookedSessionSummarySchema(_SlotBaseSchema):
    confirmed_reservations_count = fields.Integer(dump_only=True)
    free_places = fields.Integer(dump_only=True)
    reservations = fields.Nested(InstructorReservationSchema, many=True, dump_only=True)


class InstructorSlotSchema(Schema):
    """Okno dyżuru instruktora wraz z osadzonymi sesjami treningowymi i rezerwacjami klientów."""

    id = fields.Integer(dump_only=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    duration_minutes = fields.Integer(dump_only=True)
    is_blocked = fields.Boolean(dump_only=True)
    confirmed_reservations_count = fields.Integer(dump_only=True)
    booked_sessions = fields.Nested(BookedSessionSummarySchema, many=True, dump_only=True)
    reservations = fields.Nested(
        InstructorReservationSchema,
        attribute="reservations_list",
        many=True,
        dump_only=True,
    )


class BulkSlotsResponseSchema(Schema):
    created = fields.Nested(InstructorSlotSchema, many=True, dump_only=True)
    created_count = fields.Integer(dump_only=True)
    failed_count = fields.Integer(dump_only=True)
    errors = fields.List(fields.Dict(), dump_only=True)


class InstructorSlotQuerySchema(Schema):
    date_from = fields.AwareDateTime(load_default=None)
    date_to = fields.AwareDateTime(load_default=None)
    is_blocked = fields.Boolean(load_default=None)

    @validates_schema
    def validate_range(self, data, **kwargs):
        start, end = data.get("date_from"), data.get("date_to")
        if start and end:
            if end <= start:
                raise ValidationError("date_to musi być późniejsze niż date_from.", "date_to")
            if end - start > MAX_QUERY_SPAN:
                raise ValidationError("Maksymalny zakres wyszukiwania to 62 dni.", "date_to")
