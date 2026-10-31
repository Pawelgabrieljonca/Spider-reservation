import re
from marshmallow import Schema, ValidationError, fields, pre_load

from app.models import ExperienceLevel

PHONE_REGEX = re.compile(r"^[0-9+\-\s()]{7,20}$")
ALLOWED_EXPERIENCE = {lvl.value for lvl in ExperienceLevel}


class ClientProfileSchema(Schema):
    """Dane profilu wspinacza zalogowanego klienta."""

    id = fields.Integer(dump_only=True)
    email = fields.Email(dump_only=True)
    first_name = fields.String(dump_only=True)
    last_name = fields.String(dump_only=True)
    phone_number = fields.String(dump_only=True, allow_none=True)
    shoe_size = fields.String(dump_only=True, allow_none=True)
    experience_level = fields.String(dump_only=True, allow_none=True)
    updated_at = fields.DateTime(dump_only=True)


class ClientProfileUpdateSchema(Schema):
    """Aktualizacja preferencji i danych kontaktowych wspinacza."""

    phone_number = fields.String(allow_none=True, load_default=None)
    shoe_size = fields.String(allow_none=True, load_default=None)
    experience_level = fields.String(allow_none=True, load_default=None)

    @pre_load
    def normalize_empty_strings(self, data, **kwargs):
        if not isinstance(data, dict):
            return data
        cleaned = dict(data)
        for key in ("phone_number", "shoe_size", "experience_level"):
            if key in cleaned and isinstance(cleaned[key], str):
                stripped = cleaned[key].strip()
                cleaned[key] = stripped if stripped else None
        return cleaned

    def validate_phone(self, value: str | None) -> None:
        if value is None:
            return
        if len(value) > 20 or not PHONE_REGEX.match(value):
            raise ValidationError(
                "Podaj prawidłowy numer telefonu (7–20 znaków, cyfry, spacje lub prefiks +48).",
                "phone_number",
            )

    def validate_shoe_size(self, value: str | None) -> None:
        if value is None:
            return
        normalized = value.replace(",", ".")
        try:
            num = float(normalized)
        except ValueError as exc:
            raise ValidationError(
                "Rozmiar buta musi być liczbą w skali EU (np. 39, 41.5, 43).", "shoe_size"
            ) from exc
        if num < 26.0 or num > 52.0 or (num * 2) % 1 != 0:
            raise ValidationError(
                "Rozmiar buta musi mieścić się w przedziale 26–52 EU (z krokiem co 0.5).",
                "shoe_size",
            )

    def validate_experience(self, value: str | None) -> None:
        if value is None:
            return
        if value not in ALLOWED_EXPERIENCE:
            raise ValidationError(
                "Poziom zaawansowania musi mieć wartość BEGINNER, INTERMEDIATE lub ADVANCED.",
                "experience_level",
            )

    def load(self, data, *, many=None, partial=None, unknown=None):
        loaded = super().load(data, many=many, partial=partial, unknown=unknown)
        if isinstance(loaded, dict):
            self.validate_phone(loaded.get("phone_number"))
            self.validate_shoe_size(loaded.get("shoe_size"))
            if loaded.get("shoe_size"):
                num = float(loaded["shoe_size"].replace(",", "."))
                loaded["shoe_size"] = f"{int(num)}" if num.is_integer() else f"{num:.1f}"
            self.validate_experience(loaded.get("experience_level"))
        return loaded

