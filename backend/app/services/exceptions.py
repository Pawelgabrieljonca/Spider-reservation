class DomainError(Exception):
    http_status: int = 400
    code: str = "DOMAIN_ERROR"
    default_message: str = "DOMAIN_ERROR"

    def __init__(self, message: str | None = None):
        msg = (message or self.default_message or self.code).strip()
        super().__init__(msg)
        self.message = msg

class NotFoundError(DomainError):
    http_status = 404
    code = "NOT_FOUND"
    default_message = "Zasób nie istnieje."

class ForbiddenError(DomainError):
    http_status = 403
    code = "FORBIDDEN"
    default_message = "Brak uprawnień do zasobu należącego do innego instruktora lub klienta."

class SlotUnavailableError(DomainError):
    http_status = 409
    code = "SLOT_UNAVAILABLE"
    default_message = "Termin lub dyżur jest zablokowany albo już się rozpoczął."

class SlotFullError(DomainError):
    http_status = 409
    code = "SLOT_FULL"
    default_message = "Brak wolnych miejsc w wybranym terminie."

class AlreadyReservedError(DomainError):
    http_status = 409
    code = "ALREADY_RESERVED"
    default_message = "Klient posiada już aktywną rezerwację w tym terminie."

class AlreadyCancelledError(DomainError):
    http_status = 409
    code = "ALREADY_CANCELLED"
    default_message = "Rezerwacja została już anulowana."

class CancellationDeadlinePassedError(DomainError):
    http_status = 422
    code = "CANCELLATION_DEADLINE_PASSED"
    default_message = "Rezerwację można anulować najpóźniej 12 godzin przed rozpoczęciem zajęć."

class SlotOverlapError(DomainError):
    http_status = 409
    code = "SLOT_OVERLAP"
    default_message = "Wybrany przedział czasowy nakłada się na inny dyżur lub zarezerwowane zajęcia."

class SlotHasReservationsError(DomainError):
    http_status = 409
    code = "SLOT_HAS_RESERVATIONS"
    default_message = "Nie można usunąć dyżuru z aktywnymi rezerwacjami. Zamiast tego zablokuj dyżur."

class PastSlotError(DomainError):
    http_status = 422
    code = "PAST_SLOT"
    default_message = "Nie można utworzyć dyżuru ani terminu w przeszłości."

class InvalidSlotDurationError(DomainError):
    http_status = 422
    code = "INVALID_SLOT_DURATION"
    default_message = "Nieprawidłowy czas trwania dyżuru lub rezerwacji (minimum 60 minut w granicach dyżuru)."

class OutsideOperatingHoursError(DomainError):
    http_status = 422
    code = "OUTSIDE_OPERATING_HOURS"
    default_message = "Zajęcia i dyżury mogą odbywać się wyłącznie w godzinach 09:00 - 22:00"

class ClientNotFoundError(DomainError):
    http_status = 404
    code = "CLIENT_NOT_FOUND"
    default_message = "Wybrany klient nie istnieje."
