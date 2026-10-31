from marshmallow import Schema, ValidationError, fields, validate, validates_schema

from app.models import ReservationStatus, SlotType
from app.schemas.slot import SlotSchema
from app.services.reservation_service import can_cancel


class ReservationCreateSchema(Schema):
    """Zapis na trening w elastycznym oknie dyżuru (availability_window_id + start_time + slot_type)
    lub opcjonalnie po istniejącym slot_id."""

    availability_window_id = fields.Integer(
        load_default=None,
        validate=validate.Range(min=1),
        metadata={"description": "ID okna dyżuru instruktora."},
    )
    start_time = fields.AwareDateTime(
        load_default=None,
        metadata={"description": "Wybrana godzina rozpoczęcia treningu (ISO 8601 ze strefą)."},
    )
    slot_type = fields.Enum(
        SlotType,
        by_value=True,
        load_default=None,
        metadata={"description": "Typ wybranej usługi: INDIVIDUAL_1H (60 min) lub GROUP_1_5H (90 min)."},
    )
    slot_id = fields.Integer(
        load_default=None,
        validate=validate.Range(min=1),
        metadata={"description": "Opcjonalny ID istniejącego slotu (np. dołączenie do grupy)."},
    )
    needs_equipment = fields.Boolean(
        load_default=False, metadata={"description": "Czy klient potrzebuje wypożyczyć sprzęt."}
    )
    phone_number = fields.String(
        load_default=None,
        allow_none=True,
        validate=validate.Length(max=20),
        metadata={"description": "Opcjonalny numer telefonu kontaktowego zapisywany w profilu klienta."},
    )

    @validates_schema
    def validate_booking_target(self, data, **kwargs):
        has_dynamic = (
            data.get("availability_window_id") is not None
            and data.get("start_time") is not None
            and data.get("slot_type") is not None
        )
        has_slot_id = data.get("slot_id") is not None
        if not has_dynamic and not has_slot_id:
            raise ValidationError(
                "Podaj availability_window_id, start_time oraz slot_type (lub slot_id)."
            )


class ReservationQuerySchema(Schema):
    status = fields.Enum(ReservationStatus, by_value=True, load_default=None)


class ReservationSchema(Schema):
    id = fields.Integer(dump_only=True)
    status = fields.Enum(ReservationStatus, by_value=True, dump_only=True)
    needs_equipment = fields.Boolean(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    slot = fields.Nested(SlotSchema, dump_only=True)
    can_cancel = fields.Function(
        lambda r: r.status == ReservationStatus.CONFIRMED and can_cancel(r.slot.start_time),
        dump_only=True,
        metadata={"description": "true, jeśli do startu zostało więcej niż 12 h i rezerwacja jest aktywna."},
    )
