from marshmallow import Schema, fields, validate

from app.models import ReservationStatus
from app.schemas.slot import SlotSchema
from app.services.reservation_service import can_cancel


class ReservationCreateSchema(Schema):
    slot_id = fields.Integer(required=True, validate=validate.Range(min=1))
    needs_equipment = fields.Boolean(
        load_default=False, metadata={"description": "Czy klient potrzebuje wypożyczyć sprzęt."}
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
