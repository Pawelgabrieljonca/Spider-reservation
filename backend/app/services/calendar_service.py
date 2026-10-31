"""Serwis generowania plików iCalendar (.ics) dla potwierdzonych rezerwacji treningów.

Realizuje część punktu 5 specyfikacji („Obsługa powiadomień”): każde potwierdzenie
rezerwacji wysyłane e-mailem zawiera załącznik .ics zgodny z RFC 5545.

Funkcja przyjmuje wyłącznie wartości proste (bez obiektów ORM), dzięki czemu
jest czysta, deterministyczna i niezależna od sesji bazy danych.
"""

from datetime import datetime, timezone

from icalendar import Calendar, Event

SUMMARY = "Trening wspinaczkowy – CW Spider"
LOCATION = "Centrum Wspinaczkowe Spider, Bydgoszcz"
UID_DOMAIN = "cw-spider.pl"
PRODID = "-//CW Spider Bydgoszcz//Spider Reservation System//PL"


def _to_utc(value: datetime) -> datetime:
    """Normalizuje datetime do UTC (naiwny datetime traktowany jako UTC)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _slot_type_label(slot_type) -> str:
    """Zwraca wartość tekstową typu slotu (obsługuje enum SlotType oraz str)."""
    return str(getattr(slot_type, "value", slot_type))


def generate_ics(
    reservation_id: int,
    slot_start: datetime,
    slot_end: datetime,
    slot_type,
    instructor_name: str,
    client_name: str,
    needs_equipment: bool,
) -> bytes:
    """Generuje plik kalendarza iCalendar (.ics) z jednym zdarzeniem VEVENT.

    :param reservation_id: identyfikator rezerwacji (składnik stabilnego UID)
    :param slot_start: początek treningu (dowolna strefa – zapisywany w UTC)
    :param slot_end: koniec treningu (dowolna strefa – zapisywany w UTC)
    :param slot_type: typ slotu (SlotType lub str, np. "INDIVIDUAL_1H")
    :param instructor_name: imię i nazwisko instruktora
    :param client_name: imię i nazwisko klienta (właściwość COMMENT)
    :param needs_equipment: czy klient wypożycza sprzęt
    :return: zawartość pliku .ics jako bytes (CRLF, UTF-8)
    """
    cal = Calendar()
    cal.add("prodid", PRODID)
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")

    equipment = "tak" if needs_equipment else "nie"
    description = (
        f"Szczegóły: Trener: {instructor_name}, "
        f"Typ: {_slot_type_label(slot_type)}, "
        f"Wypożyczenie sprzętu: {equipment}."
    )

    event = Event()
    event.add("uid", f"reservation-{reservation_id}@{UID_DOMAIN}")
    event.add("dtstamp", datetime.now(timezone.utc))
    event.add("dtstart", _to_utc(slot_start))
    event.add("dtend", _to_utc(slot_end))
    event.add("summary", SUMMARY)
    event.add("description", description)
    event.add("location", LOCATION)
    event.add("status", "CONFIRMED")
    # COMMENT (RFC 5545 §3.8.1.4) – identyfikacja uczestnika bez ujawniania e-maila
    event.add("comment", f"Rezerwacja dla: {client_name}")

    cal.add_component(event)
    return cal.to_ical()
