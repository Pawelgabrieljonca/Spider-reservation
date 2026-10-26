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


class SlotUnavailableError(DomainError):
    """Termin jest zablokowany lub już się rozpoczął."""
    http_status = 409
    code = "SLOT_UNAVAILABLE"


class SlotFullError(DomainError):
    """Brak wolnych miejsc w wybranym terminie."""
    http_status = 409
    code = "SLOT_FULL"


class AlreadyReservedError(DomainError):
    """Klient posiada już aktywną rezerwację tego terminu."""
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
    """Termin koliduje z innym slotem tego instruktora."""
    http_status = 409
    code = "SLOT_OVERLAP"


class SlotHasReservationsError(DomainError):
    """Nie można usunąć terminu z aktywnymi rezerwacjami. Zamiast tego zablokuj termin."""
    http_status = 409
    code = "SLOT_HAS_RESERVATIONS"


class PastSlotError(DomainError):
    """Nie można utworzyć terminu w przeszłości."""
    http_status = 422
    code = "PAST_SLOT"


class InvalidSlotDurationError(DomainError):
    """Czas trwania terminu nie zgadza się z wybranym typem (1h dla indywidualnego, 1.5h dla grupy)."""
    http_status = 422
    code = "INVALID_SLOT_DURATION"


class ClientNotFoundError(DomainError):
    """Wybrany klient nie istnieje."""
    http_status = 404
    code = "CLIENT_NOT_FOUND"
