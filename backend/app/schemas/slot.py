from datetime import timedelta

from marshmallow import Schema, ValidationError, fields, validates_schema

from app.models import SlotType

MAX_QUERY_SPAN = timedelta(days=62)


class _SlotBaseSchema(Schema):
    id = fields.Integer(dump_only=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    slot_type = fields.Enum(SlotType, by_value=True, dump_only=True)
    max_capacity = fields.Integer(dump_only=True)


class SlotSchema(_SlotBaseSchema):
    """Slot jako obiekt ORM (np. zagnieżdżony w rezerwacji)."""

    instructor_name = fields.Function(
        lambda slot: f"{slot.instructor.first_name} {slot.instructor.last_name}", dump_only=True
    )


class SlotAvailabilitySchema(_SlotBaseSchema):
    """Slot publiczny z liczbą wolnych miejsc (obiekt SlotAvailability z serwisu)."""

    instructor_name = fields.String(dump_only=True)
    free_places = fields.Integer(dump_only=True, metadata={"description": "Liczba wolnych miejsc (0 = komplet)."})


class SlotQuerySchema(Schema):
    date_from = fields.AwareDateTime(
        load_default=None, metadata={"description": "Początek zakresu (ISO 8601 ze strefą). Domyślnie: teraz."}
    )
    date_to = fields.AwareDateTime(
        load_default=None, metadata={"description": "Koniec zakresu (wyłącznie). Domyślnie: date_from + 14 dni."}
    )
    slot_type = fields.Enum(SlotType, by_value=True, load_default=None)
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


class SlotCreateSchema(Schema):
    start_time = fields.AwareDateTime(
        required=True, metadata={"description": "Początek slotu (ISO 8601 ze strefą czasową)."}
    )
    slot_type = fields.Enum(SlotType, by_value=True, required=True)
    end_time = fields.AwareDateTime(
        load_default=None,
        metadata={"description": "Koniec slotu (opcjonalny; domyślnie 60 min dla 1h, 90 min dla 1.5h)."},
    )

    @validates_schema
    def validate_slot_times(self, data, **kwargs):
        start = data.get("start_time")
        end = data.get("end_time")
        slot_type = data.get("slot_type")
        expected_duration = timedelta(hours=1) if slot_type == SlotType.INDIVIDUAL_1H else timedelta(minutes=90)

        if end is not None:
            if end <= start:
                raise ValidationError("end_time musi być późniejsze niż start_time.", "end_time")
            if end - start != expected_duration:
                raise ValidationError(
                    f"Czas trwania dla {slot_type.value} musi wynosić dokładnie {int(expected_duration.total_seconds() // 60)} minut.",
                    "end_time",
                )


class SlotUpdateSchema(Schema):
    is_blocked = fields.Boolean(
        required=True, metadata={"description": "Czy termin ma być zablokowany z widoku publicznego."}
    )


class InstructorReservationSchema(Schema):
    id = fields.Integer(dump_only=True)
    client_id = fields.Integer(dump_only=True)
    client_name = fields.Function(
        lambda r: f"{r.client.first_name} {r.client.last_name}" if r.client else None, dump_only=True
    )
    client_email = fields.Function(
        lambda r: r.client.email if r.client else None, dump_only=True
    )
    client_phone = fields.Function(
        lambda r: r.client.phone_number if r.client else None, dump_only=True
    )
    needs_equipment = fields.Boolean(dump_only=True)
    status = fields.Method("get_status_value", dump_only=True)
    created_at = fields.DateTime(dump_only=True)

    def get_status_value(self, obj):
        return obj.status.value if hasattr(obj.status, "value") else str(obj.status)


class InstructorSlotSchema(_SlotBaseSchema):
    is_blocked = fields.Boolean(dump_only=True)
    confirmed_reservations_count = fields.Integer(dump_only=True)
    free_places = fields.Integer(dump_only=True)
    reservations = fields.Nested(InstructorReservationSchema, many=True, dump_only=True)


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
