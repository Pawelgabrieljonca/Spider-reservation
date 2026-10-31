"""Asynchroniczny serwis powiadomień e-mail (SendGrid API) z załącznikiem iCalendar (.ics).

Realizacja punktu 5 specyfikacji inżynierskiej („Obsługa powiadomień”):
  * CONFIRMED – e-mail z potwierdzeniem rezerwacji i plikiem .ics,
  * CANCELLED – e-mail z informacją o anulowaniu wizyty.

Założenia architektoniczne:
  * Broker w pamięci: ``ThreadPoolExecutor(max_workers=2)`` – wywołania sieciowe
    (SendGrid) nie blokują wątku obsługującego żądanie HTTP we Flasku.
  * Izolacja bazy: zadanie w tle otwiera własną, krótką sesję ``SessionLocal()``
    (nigdy nie współdzieli ``db_session`` powiązanego z wątkiem HTTP). Sesja jest
    zamykana PRZED wywołaniem sieciowym, aby nie trzymać połączenia z puli.
  * Fire-and-forget: każde zadanie łapie i loguje własne wyjątki – błąd wysyłki
    nigdy nie propaguje się do logiki domenowej ani do klienta HTTP.
  * Tryb mock: gdy ``NOTIFICATIONS_ENABLED=False`` lub brak ``SENDGRID_API_KEY``,
    treść powiadomienia trafia do logów serwera jako ``[NOTIFICATION MOCK]``.
"""

from __future__ import annotations

import base64
import html
import logging
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Reservation, TrainingSlot
from app.services.calendar_service import LOCATION, generate_ics

logger = logging.getLogger(__name__)

# Broker zadań w pamięci procesu – 2 wątki robocze wystarczają dla ruchu CW Spider,
# a jednocześnie ograniczają liczbę równoległych połączeń do SendGrid.
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="notification_worker")

# Twardy limit czasu żądania HTTP do SendGrid (sekundy) – zawieszony worker
# nie może na stałe zająć jednego z dwóch wątków puli.
SENDGRID_TIMEOUT_SECONDS = 10

ICS_FILENAME = "trening-cw-spider.ics"


@dataclass(frozen=True)
class _ConfirmationData:
    """Migawka danych rezerwacji – odczepiona od sesji ORM."""

    reservation_id: int
    client_email: str
    client_first_name: str
    client_name: str
    instructor_name: str
    slot_start: datetime
    slot_end: datetime
    slot_type: str
    needs_equipment: bool


# --------------------------------------------------------------------------- #
# Funkcje pomocnicze
# --------------------------------------------------------------------------- #
def _is_live_mode() -> bool:
    """Prawdziwa wysyłka wyłącznie przy włączonej fladze i ustawionym kluczu API."""
    return bool(settings.NOTIFICATIONS_ENABLED and settings.SENDGRID_API_KEY)


def _format_dt(value: datetime) -> str:
    """Czytelny zapis terminu w UTC (naiwny datetime traktowany jako UTC)."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")


def _full_name(user, fallback: str) -> str:
    if user is None:
        return fallback
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or fallback


def _send_via_sendgrid(
    to_email: str,
    subject: str,
    html_content: str,
    ics_bytes: bytes | None = None,
) -> int:
    """Wysyła wiadomość przez SendGrid API. Zwraca kod HTTP odpowiedzi."""
    # Import leniwy: brak pakietu/klucza nie wpływa na tryb mock ani testy.
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Attachment, Disposition, FileContent, FileName, FileType, Mail

    message = Mail(
        from_email=settings.SENDGRID_FROM_EMAIL,
        to_emails=to_email,
        subject=subject,
        html_content=html_content,
    )
    if ics_bytes is not None:
        message.attachment = Attachment(
            FileContent(base64.b64encode(ics_bytes).decode("ascii")),
            FileName(ICS_FILENAME),
            # SendGrid odrzuca (HTTP 400) typ MIME z parametrami – dozwolony tylko czysty typ.
            FileType("text/calendar"),
            Disposition("attachment"),
        )

    client = SendGridAPIClient(settings.SENDGRID_API_KEY)
    client.client.timeout = SENDGRID_TIMEOUT_SECONDS
    try:
        response = client.send(message)
    except Exception as exc:
        # python_http_client.HTTPError niesie w .body szczegóły walidacji SendGrid
        # (pole + komunikat) – bez nich w logu widać jedynie "HTTP Error 400".
        body = getattr(exc, "body", None)
        if body:
            if isinstance(body, bytes):
                body = body.decode("utf-8", errors="replace")
            logger.error("SendGrid odrzucił żądanie (%s): %s", getattr(exc, "status_code", "?"), body)
        raise
    return response.status_code


def _html_layout(title: str, body: str) -> str:
    return f"""\
<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; line-height: 1.6;">
  <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">{title}</h2>
  {body}
  <p style="font-size: 12px; color: #94a3b8; margin-top: 30px;">
    Wiadomość wygenerowana automatycznie przez system rezerwacji CW Spider.
  </p>
</div>"""


# --------------------------------------------------------------------------- #
# CONFIRMED
# --------------------------------------------------------------------------- #
def _load_confirmation_data(reservation_id: int) -> _ConfirmationData | None:
    """Krótka, izolowana sesja: odczyt rezerwacji z relacjami i natychmiastowe zamknięcie."""
    session = SessionLocal()
    try:
        reservation = session.scalar(
            select(Reservation)
            .where(Reservation.id == reservation_id)
            .options(
                joinedload(Reservation.client),
                joinedload(Reservation.slot).joinedload(TrainingSlot.instructor),
            )
        )
        if reservation is None or reservation.slot is None:
            logger.warning("Powiadomienie CONFIRMED: brak rezerwacji/slotu id=%s", reservation_id)
            return None
        client, slot = reservation.client, reservation.slot
        if client is None or not client.email:
            logger.warning("Powiadomienie CONFIRMED: rezerwacja id=%s bez e-maila klienta", reservation_id)
            return None

        return _ConfirmationData(
            reservation_id=reservation.id,
            client_email=client.email,
            client_first_name=client.first_name or "",
            client_name=_full_name(client, "Klient CW Spider"),
            instructor_name=_full_name(slot.instructor, "Instruktor CW Spider"),
            slot_start=slot.start_time,
            slot_end=slot.end_time,
            slot_type=str(getattr(slot.slot_type, "value", slot.slot_type)),
            needs_equipment=bool(reservation.needs_equipment),
        )
    finally:
        session.close()


def _confirmed_job(reservation_id: int) -> None:
    """Zadanie w tle: dane z bazy -> plik .ics -> SendGrid (lub log mock)."""
    try:
        data = _load_confirmation_data(reservation_id)
        if data is None:
            return

        ics_bytes = generate_ics(
            reservation_id=data.reservation_id,
            slot_start=data.slot_start,
            slot_end=data.slot_end,
            slot_type=data.slot_type,
            instructor_name=data.instructor_name,
            client_name=data.client_name,
            needs_equipment=data.needs_equipment,
        )
        start_txt = _format_dt(data.slot_start)

        if not _is_live_mode():
            logger.info(
                "[NOTIFICATION MOCK] Typ: CONFIRMED | Do: %s | Termin: %s | Instruktor: %s"
                " | Załącznik .ics wygenerowany poprawnie",
                data.client_email,
                start_txt,
                data.instructor_name,
            )
            return

        esc = html.escape
        body = f"""\
  <p>Cześć <strong>{esc(data.client_first_name)}</strong>,</p>
  <p>Twój trening wspinaczkowy został potwierdzony. Szczegóły:</p>
  <ul>
    <li><strong>Termin:</strong> {esc(start_txt)}</li>
    <li><strong>Typ treningu:</strong> {esc(data.slot_type)}</li>
    <li><strong>Instruktor:</strong> {esc(data.instructor_name)}</li>
    <li><strong>Wypożyczenie sprzętu:</strong> {"tak" if data.needs_equipment else "nie"}</li>
    <li><strong>Miejsce:</strong> {esc(LOCATION)}</li>
  </ul>
  <p>W załączniku znajdziesz plik kalendarza (.ics) – otwórz go, aby dodać trening
  do Google Calendar, Apple Calendar lub Outlooka.</p>
  <p>Bezpłatne odwołanie wizyty jest możliwe do <strong>12 godzin</strong> przed rozpoczęciem zajęć.</p>"""

        status = _send_via_sendgrid(
            to_email=data.client_email,
            subject=f"Potwierdzenie rezerwacji treningu ({start_txt}) – CW Spider",
            html_content=_html_layout("CW Spider – potwierdzenie rezerwacji", body),
            ics_bytes=ics_bytes,
        )
        logger.info(
            "SendGrid: wysłano CONFIRMED dla rezerwacji #%s do %s (HTTP %s)",
            data.reservation_id,
            data.client_email,
            status,
        )
    except Exception:
        # Fire-and-forget: wyjątek kończy się w logu, nigdy w wątku HTTP.
        logger.exception("Błąd wysyłki powiadomienia CONFIRMED dla rezerwacji #%s", reservation_id)


# --------------------------------------------------------------------------- #
# CANCELLED
# --------------------------------------------------------------------------- #
def _cancelled_job(client_email: str, client_name: str, start_time: datetime, instructor_name: str) -> None:
    """Zadanie w tle: e-mail o anulowaniu (dane przekazane wprost – bez dostępu do bazy)."""
    try:
        start_txt = _format_dt(start_time)

        if not _is_live_mode():
            logger.info(
                "[NOTIFICATION MOCK] Typ: CANCELLED | Do: %s | Termin: %s | Instruktor: %s",
                client_email,
                start_txt,
                instructor_name,
            )
            return

        esc = html.escape
        body = f"""\
  <p>Dzień dobry <strong>{esc(client_name)}</strong>,</p>
  <p>Potwierdzamy anulowanie Twojej rezerwacji treningu wspinaczkowego:</p>
  <ul>
    <li><strong>Termin:</strong> {esc(start_txt)}</li>
    <li><strong>Instruktor:</strong> {esc(instructor_name)}</li>
  </ul>
  <p>Termin został zwolniony w grafiku. Zapraszamy do wybrania innego terminu w systemie rezerwacji CW Spider.</p>"""

        status = _send_via_sendgrid(
            to_email=client_email,
            subject=f"Anulowanie rezerwacji treningu ({start_txt}) – CW Spider",
            html_content=_html_layout("CW Spider – anulowanie rezerwacji", body),
        )
        logger.info("SendGrid: wysłano CANCELLED do %s (HTTP %s)", client_email, status)
    except Exception:
        logger.exception("Błąd wysyłki powiadomienia CANCELLED do %s", client_email)


# --------------------------------------------------------------------------- #
# Publiczne API (wywoływane z reservation_service PO commit)
# --------------------------------------------------------------------------- #
def notify_reservation_confirmed(reservation_id: int) -> Future:
    """Zleca w tle wysyłkę potwierdzenia rezerwacji z załącznikiem .ics.

    Zwraca ``Future`` (przydatne w testach); wynik zadania zawsze wynosi ``None``,
    bo wyjątki są obsługiwane i logowane wewnątrz workera.
    """
    return _executor.submit(_confirmed_job, reservation_id)


def notify_reservation_cancelled(
    client_email: str,
    client_name: str,
    start_time: datetime,
    instructor_name: str,
) -> Future:
    """Zleca w tle wysyłkę informacji o anulowaniu wizyty."""
    return _executor.submit(_cancelled_job, client_email, client_name, start_time, instructor_name)
