"""Test weryfikacyjny modułu powiadomień (pkt 5 specyfikacji „Obsługa powiadomień”).

Uruchomienie (z katalogu backend/):
    venv\\Scripts\\python.exe scratch\\test_notifications.py

Skrypt jest samowystarczalny – nie wymaga PostgreSQL, Dockera ani klucza SendGrid.
Zamiast bazy produkcyjnej używa SQLite in-memory podstawionego w miejsce
``SessionLocal`` (izolowana sesja workera) – dokładnie tak, jak robi to kod produkcyjny.

Weryfikowane scenariusze:
  1. generate_ics: wynik binarny, składnia RFC 5545, wymagane właściwości VEVENT.
  2. Worker CONFIRMED w trybie mock: własna sesja SessionLocal(), log [NOTIFICATION MOCK].
  3. Worker CANCELLED w trybie mock.
  4. Integracja z reservation_service: create/cancel zlecają powiadomienia po commit.
  5. Odporność: wyjątek przy zlecaniu powiadomienia nie przerywa transakcji.
  6. Tryb live (SendGrid zamockowany na poziomie HTTP): załącznik .ics w base64,
     a timeout SendGrid jest logowany i nie propaguje się.

Kod wyjścia: 0 = wszystkie asercje OK, 1 = co najmniej jedna porażka.
"""

from __future__ import annotations

import base64
import datetime as dt
import logging
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import icalendar  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models import Base, Reservation, ReservationStatus, SlotType, TrainingSlot, User, UserRole  # noqa: E402
from app.services import notification_service, reservation_service  # noqa: E402
from app.services.calendar_service import generate_ics  # noqa: E402

WAIT_S = 5  # maks. czas oczekiwania na zadanie w puli wątków


# --------------------------------------------------------------------------- #
# Infrastruktura testu
# --------------------------------------------------------------------------- #
class ListHandler(logging.Handler):
    """Zbiera rekordy logów (z nazwą wątku) – bezpieczny wątkowo."""

    def __init__(self) -> None:
        super().__init__(logging.DEBUG)
        self.records: list[logging.LogRecord] = []
        self._lock_list = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:
        with self._lock_list:
            self.records.append(record)

    def clear(self) -> None:
        with self._lock_list:
            self.records.clear()

    def messages(self, level: int = logging.DEBUG) -> list[str]:
        with self._lock_list:
            return [r.getMessage() for r in self.records if r.levelno >= level]


capture = ListHandler()
for name in ("app.services.notification_service", "app.services.reservation_service"):
    lg = logging.getLogger(name)
    lg.setLevel(logging.DEBUG)
    lg.addHandler(capture)
logging.basicConfig(level=logging.INFO, format="  [log] %(threadName)s %(levelname)s %(message)s")

results: list[tuple[bool, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    results.append((bool(condition), name))
    print(f"  {'OK  ' if condition else 'FAIL'} {name}" + (f"  ({detail})" if detail and not condition else ""))


# SQLite in-memory współdzielone między wątkami (StaticPool) – podstawiane w miejsce SessionLocal.
engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Base.metadata.create_all(engine)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine)

opened_sessions: list[str] = []


def tracking_session_factory():
    """Rejestruje, w którym wątku otwarto sesję – dowód izolacji od wątku HTTP."""
    opened_sessions.append(threading.current_thread().name)
    return TestSessionLocal()


notification_service.SessionLocal = tracking_session_factory

# Wymuszenie trybu mock niezależnie od lokalnego .env
settings.NOTIFICATIONS_ENABLED = False
settings.SENDGRID_API_KEY = ""

# SQLite zwraca naiwne datetime – w teście cały czas operujemy na naiwnym UTC.
NOW = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None, microsecond=0)


def seed() -> tuple[int, int, int]:
    with TestSessionLocal() as s:
        instr = User(keycloak_id="kc-instr", email="tomasz.trener@spider.local",
                     first_name="Tomasz", last_name="Trenerski", role=UserRole.INSTRUCTOR)
        client = User(keycloak_id="kc-client", email="anna.wspinacz@spider.local",
                      first_name="Anna", last_name="Wspinacz", role=UserRole.CLIENT)
        s.add_all([instr, client])
        s.flush()
        start = NOW + dt.timedelta(days=3)
        slot = TrainingSlot(instructor_id=instr.id, start_time=start, end_time=start + dt.timedelta(hours=1, minutes=30),
                            slot_type=SlotType.GROUP_1_5H, max_capacity=3)
        slot2 = TrainingSlot(instructor_id=instr.id, start_time=start + dt.timedelta(days=1),
                             end_time=start + dt.timedelta(days=1, hours=1),
                             slot_type=SlotType.INDIVIDUAL_1H, max_capacity=1)
        s.add_all([slot, slot2])
        s.commit()
        return client.id, slot.id, slot2.id


exit_code = 1
try:
    # ----------------------------------------------------------------------- #
    print("\n=== 1. generate_ics – binarny plik .ics zgodny z RFC 5545 ===")
    start = dt.datetime(2026, 11, 3, 17, 0, tzinfo=dt.timezone(dt.timedelta(hours=1)))  # 17:00 CET
    ics = generate_ics(
        reservation_id=42,
        slot_start=start,
        slot_end=start + dt.timedelta(hours=1),
        slot_type=SlotType.INDIVIDUAL_1H,
        instructor_name="Tomasz Trenerski",
        client_name="Anna Wspinacz",
        needs_equipment=True,
    )
    text = ics.decode("utf-8")
    check("zwraca bytes", isinstance(ics, bytes))
    check("BEGIN/END:VCALENDAR", text.startswith("BEGIN:VCALENDAR\r\n") and text.rstrip().endswith("END:VCALENDAR"))
    check("BEGIN/END:VEVENT", "BEGIN:VEVENT\r\n" in text and "END:VEVENT\r\n" in text)
    check("VERSION:2.0 i PRODID", "VERSION:2.0\r\n" in text and "PRODID:" in text)
    check("linie zakończone CRLF (RFC 5545 §3.1)", "\n" not in text.replace("\r\n", ""))
    check("linie ≤ 75 oktetów (folding)", all(len(line.encode()) <= 75 for line in text.split("\r\n")))
    check("SUMMARY", "SUMMARY:Trening wspinaczkowy – CW Spider\r\n" in text)
    check("LOCATION", "LOCATION:Centrum Wspinaczkowe Spider\\, Bydgoszcz" in text)
    check("UID", "UID:reservation-42@cw-spider.pl\r\n" in text)
    check("STATUS:CONFIRMED", "STATUS:CONFIRMED\r\n" in text)
    check("DTSTART w UTC (17:00 CET -> 16:00Z)", "DTSTART:20261103T160000Z\r\n" in text)
    check("DTEND w UTC", "DTEND:20261103T170000Z\r\n" in text)

    cal = icalendar.Calendar.from_ical(ics)
    events = cal.walk("VEVENT")
    check("parsowanie icalendar: dokładnie 1 VEVENT", len(events) == 1)
    ev = events[0]
    check(
        "DESCRIPTION zgodny ze specyfikacją",
        str(ev["description"]) == "Szczegóły: Trener: Tomasz Trenerski, Typ: INDIVIDUAL_1H, Wypożyczenie sprzętu: tak.",
        str(ev.get("description")),
    )
    check("DTSTART tz=UTC po parsowaniu", ev.decoded("dtstart").utcoffset() == dt.timedelta(0))
    ics_no_eq = generate_ics(1, NOW, NOW + dt.timedelta(hours=1), "GROUP_1_5H", "X", "Y", False)
    check("needs_equipment=False -> 'nie'", "Wypożyczenie sprzętu: nie." in str(
        icalendar.Calendar.from_ical(ics_no_eq).walk("VEVENT")[0]["description"]))

    # ----------------------------------------------------------------------- #
    print("\n=== 2. Worker CONFIRMED w tle (tryb mock, izolowana sesja) ===")
    client_id, slot_id, slot2_id = seed()
    with TestSessionLocal() as s:
        r = Reservation(slot_id=slot_id, client_id=client_id, needs_equipment=True)
        s.add(r)
        s.commit()
        seeded_res_id = r.id

    capture.clear()
    opened_sessions.clear()
    main_thread = threading.current_thread().name
    fut = notification_service.notify_reservation_confirmed(seeded_res_id)
    exc = fut.exception(timeout=WAIT_S)
    check("zadanie zakończone bez wyjątku", exc is None, repr(exc))
    check("sesja otwarta w wątku roboczym (nie HTTP)",
          len(opened_sessions) == 1 and opened_sessions[0] != main_thread
          and opened_sessions[0].startswith("notification_worker"), str(opened_sessions))
    mock_logs = [m for m in capture.messages() if m.startswith("[NOTIFICATION MOCK] Typ: CONFIRMED")]
    expected = (f"[NOTIFICATION MOCK] Typ: CONFIRMED | Do: anna.wspinacz@spider.local | "
                f"Termin: {(NOW + dt.timedelta(days=3)).strftime('%d.%m.%Y %H:%M')} UTC | "
                f"Instruktor: Tomasz Trenerski | Załącznik .ics wygenerowany poprawnie")
    check("log mock w wymaganym formacie", mock_logs == [expected], str(mock_logs))
    check("brak błędów w logach", not capture.messages(logging.WARNING), str(capture.messages(logging.WARNING)))

    capture.clear()
    exc = notification_service.notify_reservation_confirmed(999_999).exception(timeout=WAIT_S)
    check("nieistniejąca rezerwacja: brak wyjątku, tylko ostrzeżenie",
          exc is None and any("999999" in m for m in capture.messages(logging.WARNING)))

    # ----------------------------------------------------------------------- #
    print("\n=== 3. Worker CANCELLED w tle (tryb mock) ===")
    capture.clear()
    fut = notification_service.notify_reservation_cancelled(
        client_email="jan@test.pl", client_name="Jan Kowalski",
        start_time=dt.datetime(2026, 11, 5, 9, 30, tzinfo=dt.timezone.utc), instructor_name="Piotr Instruktor",
    )
    check("zadanie zakończone bez wyjątku", fut.exception(timeout=WAIT_S) is None)
    check("log mock CANCELLED",
          "[NOTIFICATION MOCK] Typ: CANCELLED | Do: jan@test.pl | Termin: 05.11.2026 09:30 UTC | "
          "Instruktor: Piotr Instruktor" in capture.messages(), str(capture.messages()))

    # ----------------------------------------------------------------------- #
    print("\n=== 4. Integracja z reservation_service (zlecenie PO commit) ===")
    submitted: list[tuple] = []
    spawned: list = []
    real_confirmed = notification_service.notify_reservation_confirmed
    real_cancelled = notification_service.notify_reservation_cancelled

    def spy_confirmed(reservation_id):
        # Weryfikacja "po commit": inna sesja/połączenie musi już widzieć rezerwację.
        with TestSessionLocal() as other:
            committed = other.get(Reservation, reservation_id) is not None
        submitted.append(("CONFIRMED", reservation_id, committed))
        spawned.append(real_confirmed(reservation_id))
        return spawned[-1]

    def spy_cancelled(**kwargs):
        with TestSessionLocal() as other:
            status = other.scalar(select(Reservation.status).where(Reservation.slot_id == slot2_id))
        submitted.append(("CANCELLED", kwargs, status))
        spawned.append(real_cancelled(**kwargs))
        return spawned[-1]

    notification_service.notify_reservation_confirmed = spy_confirmed
    notification_service.notify_reservation_cancelled = spy_cancelled
    capture.clear()
    with TestSessionLocal() as http_session:  # symulacja db_session wątku HTTP
        res = reservation_service.create_reservation(http_session, slot_id=slot2_id, client_id=client_id,
                                                     needs_equipment=False, now=NOW)
        check("create_reservation zwraca rezerwację", res.id is not None)
        check("zlecono CONFIRMED po commit", submitted and submitted[0][:2] == ("CONFIRMED", res.id) and submitted[0][2])

        cancelled = reservation_service.cancel_reservation(http_session, reservation_id=res.id,
                                                           client_id=client_id, now=NOW)
        check("cancel_reservation -> CANCELLED", cancelled.status == ReservationStatus.CANCELLED)
        c = submitted[1] if len(submitted) > 1 else None
        check("zlecono CANCELLED po commit (status w bazie już CANCELLED)",
              c is not None and c[0] == "CANCELLED" and c[2] == ReservationStatus.CANCELLED, str(c))
        check("dane CANCELLED kompletne",
              c is not None and c[1]["client_email"] == "anna.wspinacz@spider.local"
              and c[1]["client_name"] == "Anna Wspinacz" and c[1]["instructor_name"] == "Tomasz Trenerski")

    for fut in spawned:
        fut.result(timeout=WAIT_S)
    msgs = capture.messages()
    check("worker zalogował CONFIRMED i CANCELLED",
          any("Typ: CONFIRMED" in m for m in msgs) and any("Typ: CANCELLED" in m for m in msgs), str(msgs))

    # ----------------------------------------------------------------------- #
    print("\n=== 5. Odporność: błąd zlecenia nie przerywa transakcji ===")

    def boom(*_a, **_kw):
        raise RuntimeError("broker niedostępny")

    notification_service.notify_reservation_confirmed = boom
    notification_service.notify_reservation_cancelled = boom
    capture.clear()
    with TestSessionLocal() as http_session:
        try:
            res = reservation_service.create_reservation(http_session, slot_id=slot2_id, client_id=client_id, now=NOW)
            ok = True
        except Exception as e:  # pragma: no cover
            ok, res = False, None
            print("   wyjątek:", e)
        check("create_reservation nie rzuca wyjątku", ok)
        with TestSessionLocal() as other:
            st = other.scalar(select(Reservation.status).where(Reservation.id == res.id)) if res else None
        check("rezerwacja zatwierdzona w bazie (CONFIRMED)", st == ReservationStatus.CONFIRMED)
        try:
            reservation_service.cancel_reservation(http_session, reservation_id=res.id, client_id=client_id, now=NOW)
            ok = True
        except Exception:
            ok = False
        check("cancel_reservation nie rzuca wyjątku", ok)
    check("błąd zalogowany (ERROR)", sum("Nie udało się zlecić" in m for m in capture.messages(logging.ERROR)) == 2)
    notification_service.notify_reservation_confirmed = real_confirmed
    notification_service.notify_reservation_cancelled = real_cancelled

    # ----------------------------------------------------------------------- #
    print("\n=== 6. Tryb live (SendGrid zamockowany): załącznik base64 + timeout ===")
    from sendgrid import SendGridAPIClient

    sent: list[dict] = []

    class FakeResponse:
        status_code = 202

    def fake_send(self, message):
        sent.append({"payload": message.get(), "timeout": self.client.timeout})
        return FakeResponse()

    real_send = SendGridAPIClient.send
    SendGridAPIClient.send = fake_send
    settings.NOTIFICATIONS_ENABLED = True
    settings.SENDGRID_API_KEY = "SG.test-key"
    try:
        capture.clear()
        check("CONFIRMED live: bez wyjątku",
              notification_service.notify_reservation_confirmed(seeded_res_id).exception(timeout=WAIT_S) is None)
        payload = sent[0]["payload"] if sent else {}
        att = (payload.get("attachments") or [{}])[0]
        decoded = base64.b64decode(att.get("content", "")) if att else b""
        check("SendGrid: nadawca z konfiguracji", payload.get("from", {}).get("email") == settings.SENDGRID_FROM_EMAIL)
        check("SendGrid: treść HTML", any(c.get("type") == "text/html" for c in payload.get("content", [])))
        check("SendGrid: załącznik .ics base64 -> poprawny VCALENDAR",
              att.get("filename") == "trening-cw-spider.ics" and decoded.startswith(b"BEGIN:VCALENDAR")
              and f"UID:reservation-{seeded_res_id}@cw-spider.pl".encode() in decoded)
        check("SendGrid: ustawiony timeout HTTP", sent and sent[0]["timeout"] == notification_service.SENDGRID_TIMEOUT_SECONDS)
        # SendGrid zwraca HTTP 400, gdy typ załącznika zawiera ';' lub CRLF.
        check("SendGrid: typ załącznika bez parametrów MIME", att.get("type") == "text/calendar", str(att.get("type")))
        check("brak logu mock w trybie live", not any("NOTIFICATION MOCK" in m for m in capture.messages()))

        def timeout_send(self, message):
            raise TimeoutError("SendGrid timeout")

        SendGridAPIClient.send = timeout_send
        capture.clear()
        f1 = notification_service.notify_reservation_confirmed(seeded_res_id)
        f2 = notification_service.notify_reservation_cancelled("a@b.pl", "A B", NOW, "T")
        check("timeout SendGrid nie propaguje się z workerów",
              f1.exception(timeout=WAIT_S) is None and f2.exception(timeout=WAIT_S) is None)
        check("timeout zalogowany jako ERROR", len(capture.messages(logging.ERROR)) == 2, str(capture.messages(logging.ERROR)))
    finally:
        SendGridAPIClient.send = real_send
        settings.NOTIFICATIONS_ENABLED = False
        settings.SENDGRID_API_KEY = ""

    failed = [n for ok, n in results if not ok]
    print("\n" + "=" * 60)
    print(f"WYNIK: {len(results) - len(failed)}/{len(results)} asercji OK")
    for n in failed:
        print(f"  FAIL: {n}")
    print("=" * 60)
    exit_code = 0 if not failed else 1
except Exception:
    logging.getLogger(__name__).exception("Nieoczekiwany wyjątek w teście")
    exit_code = 1
finally:
    notification_service._executor.shutdown(wait=True)
    engine.dispose()

sys.exit(exit_code)
