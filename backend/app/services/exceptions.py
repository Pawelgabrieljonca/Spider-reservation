"""Wyjątki domenowe – niezależne od warstwy HTTP.

Każdy wyjątek niesie kod HTTP, na który mapuje go globalny error handler
zarejestrowany w app/main.py. Serwisy nie importują niczego z Flaska.
"""


class DomainError(Exception):
    http_status: int = 400
    code: str = "DOMAIN_ERROR"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.__class__.__doc__ or self.code)
        self.message = message or (self.__class__.__doc__ or self.code).strip()


class NotFoundError(DomainError):
    """Zasób nie istnieje."""
    http_status = 404
    code = "NOT_FOUND"


class ForbiddenError(DomainError):
    """Brak uprawnień do zasobu należącego do innego instruktora lub klienta."""
    http_status = 403
    code = "FORBIDDEN"


class SlotUnavailableError(DomainError):
    """Termin lub dyżur jest zablokowany albo już się rozpoczął."""
    http_status = 409
    code = "SLOT_UNAVAILABLE"


class SlotFullError(DomainError):
    """Brak wolnych miejsc w wybranym terminie."""
    http_status = 409
    code = "SLOT_FULL"


class AlreadyReservedError(DomainError):
    """Klient posiada już aktywną rezerwację w tym terminie."""
    http_status = 409
    code = "ALREADY_RESERVED"


class AlreadyCancelledError(DomainError):
    """Rezerwacja została już anulowana."""
    http_status = 409
    code = "ALREADY_CANCELLED"


class CancellationDeadlinePassedError(DomainError):
    """Rezerwację można anulować najpóźniej 12 godzin przed rozpoczęciem zajęć."""
    http_status = 422
    code = "CANCELLATION_DEADLINE_PASSED"


class SlotOverlapError(DomainError):
    """Wybrany przedział czasowy nakłada się na inny dyżur lub zarezerwowane zajęcia."""
    http_status = 409
    code = "SLOT_OVERLAP"


class SlotHasReservationsError(DomainError):
    """Nie można usunąć dyżuru z aktywnymi rezerwacjami. Zamiast tego zablokuj dyżur."""
    http_status = 409
    code = "SLOT_HAS_RESERVATIONS"


class PastSlotError(DomainError):
    """Nie można utworzyć dyżuru ani terminu w przeszłości."""
    http_status = 422
    code = "PAST_SLOT"


class InvalidSlotDurationError(DomainError):
    """Nieprawidłowy czas trwania dyżuru lub rezerwacji (minimum 60 minut w granicach dyżuru)."""
    http_status = 422
    code = "INVALID_SLOT_DURATION"


class OutsideOperatingHoursError(DomainError):
    """Zajęcia i dyżury mogą odbywać się wyłącznie w godzinach 09:00 - 22:00"""
    http_status = 422
    code = "OUTSIDE_OPERATING_HOURS"


class ClientNotFoundError(DomainError):
    """Wybrany klient nie istnieje."""
    http_status = 404
    code = "CLIENT_NOT_FOUND"
