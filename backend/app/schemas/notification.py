from marshmallow import Schema, fields, validate


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

