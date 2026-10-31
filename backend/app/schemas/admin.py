from marshmallow import Schema, fields

from app.models import UserRole


class AdminHealthSchema(Schema):
    status = fields.String(required=True, metadata={"example": "ok"})
    database = fields.String(required=True, metadata={"example": "ok"})
    db_latency_ms = fields.Float(allow_none=True, metadata={"example": 1.42})
    checked_at = fields.DateTime(required=True)
    users_count = fields.Integer(required=True)
    slots_count = fields.Integer(required=True)
    reservations_count = fields.Integer(required=True)


class AdminUserItemSchema(Schema):
    id = fields.Integer(dump_only=True)
    first_name = fields.String(dump_only=True)
    last_name = fields.String(dump_only=True)
    email = fields.String(dump_only=True)
    phone_number = fields.String(dump_only=True, allow_none=True)
    role = fields.Enum(UserRole, by_value=True, dump_only=True)
    created_at = fields.DateTime(dump_only=True)


class AdminUsersResponseSchema(Schema):
    clients = fields.Nested(AdminUserItemSchema, many=True, dump_only=True)
    instructors = fields.Nested(AdminUserItemSchema, many=True, dump_only=True)
    admins = fields.Nested(AdminUserItemSchema, many=True, dump_only=True)
    total_count = fields.Integer(dump_only=True)


class AdminInstructorSlotItemSchema(Schema):
    id = fields.Integer(dump_only=True)
    start_time = fields.DateTime(dump_only=True)
    end_time = fields.DateTime(dump_only=True)
    slot_type = fields.String(dump_only=True)
    max_capacity = fields.Integer(dump_only=True)
    is_blocked = fields.Boolean(dump_only=True)
    confirmed_reservations_count = fields.Integer(dump_only=True)
    free_places = fields.Integer(dump_only=True)
    state = fields.String(dump_only=True, metadata={"example": "PLANNED"})


class AdminInstructorAvailabilityItemSchema(Schema):
    instructor_id = fields.Integer(dump_only=True)
    first_name = fields.String(dump_only=True)
    last_name = fields.String(dump_only=True)
    email = fields.String(dump_only=True)
    planned_1h_count = fields.Integer(dump_only=True)
    completed_1h_count = fields.Integer(dump_only=True)
    planned_1_5h_count = fields.Integer(dump_only=True)
    completed_1_5h_count = fields.Integer(dump_only=True)
    blocked_slots_count = fields.Integer(dump_only=True)
    confirmed_reservations_count = fields.Integer(dump_only=True)
    planned_minutes = fields.Integer(dump_only=True)
    completed_minutes = fields.Integer(dump_only=True)
    total_minutes = fields.Integer(dump_only=True)
    planned_hours = fields.Float(dump_only=True)
    completed_hours = fields.Float(dump_only=True)
    total_hours = fields.Float(dump_only=True)
    slots = fields.Nested(AdminInstructorSlotItemSchema, many=True, dump_only=True)


class AdminAvailabilityTotalsSchema(Schema):
    instructors_count = fields.Integer(dump_only=True)
    planned_1h_count = fields.Integer(dump_only=True)
    completed_1h_count = fields.Integer(dump_only=True)
    planned_1_5h_count = fields.Integer(dump_only=True)
    completed_1_5h_count = fields.Integer(dump_only=True)
    blocked_slots_count = fields.Integer(dump_only=True)
    planned_minutes = fields.Integer(dump_only=True)
    completed_minutes = fields.Integer(dump_only=True)
    total_minutes = fields.Integer(dump_only=True)
    planned_hours = fields.Float(dump_only=True)
    completed_hours = fields.Float(dump_only=True)
    total_hours = fields.Float(dump_only=True)


class AdminInstructorsAvailabilityResponseSchema(Schema):
    totals = fields.Nested(AdminAvailabilityTotalsSchema, dump_only=True)
    instructors = fields.Nested(AdminInstructorAvailabilityItemSchema, many=True, dump_only=True)
