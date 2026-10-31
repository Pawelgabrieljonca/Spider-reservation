"""Zarządzanie elastycznymi oknami dyspozycyjności instruktora (dyżurami) oraz dynamiczne
wyliczanie dostępnych godzin rozpoczęcia treningów (model Booksy / Calendly)."""

from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import AvailabilityWindow, Reservation, ReservationStatus, SlotType, TrainingSlot, User
from app.services.exceptions import (
    ForbiddenError,
    InvalidSlotDurationError,
    NotFoundError,
    OutsideOperatingHoursError,
    PastSlotError,
    SlotHasReservationsError,
    SlotOverlapError,
)

DEFAULT_RANGE = timedelta(days=14)
CLUB_TIMEZONE = ZoneInfo("Europe/Warsaw")
OPENING_TIME = time(9, 0)
CLOSING_TIME = time(22, 0)
MIN_WINDOW_DURATION = timedelta(minutes=60)
CANDIDATE_STEP = timedelta(minutes=30)


def _ensure_utc(dt_val: datetime) -> datetime:
    if dt_val.tzinfo is None:
        return dt_val.replace(tzinfo=timezone.utc)
    return dt_val.astimezone(timezone.utc)


def validate_operating_hours(start_time: datetime, end_time: datetime) -> None:
    """Wymusza godziny pracy CW Spider (09:00 – 22:00 czasu lokalnego Europe/Warsaw, ten sam dzień)."""
    local_start = start_time.astimezone(CLUB_TIMEZONE) if start_time.tzinfo else start_time
    local_end = end_time.astimezone(CLUB_TIMEZONE) if end_time.tzinfo else end_time
    if (
        local_start.date() != local_end.date()
        or local_start.time() < OPENING_TIME
        or local_end.time() > CLOSING_TIME
    ):
        raise OutsideOperatingHoursError(
            "Zajęcia i dyżury mogą odbywać się wyłącznie w godzinach 09:00 - 22:00"
        )


def slot_duration_and_capacity(slot_type: SlotType) -> tuple[timedelta, int]:
    """Zwraca (czas trwania, limit osób) dla wskazanego typu usługi."""
    if slot_type == SlotType.INDIVIDUAL_1H:
        return timedelta(minutes=60), 1
    return timedelta(minutes=90), 3


@dataclass(frozen=True)
class SlotAvailability:
    """Dynamicznie wyliczona propozycja godziny rozpoczęcia treningu w oknie dyżuru trenera."""

    id: str
    availability_window_id: int
    slot_id: int | None
    instructor_id: int
    instructor_name: str
    start_time: datetime
    end_time: datetime
    slot_type: SlotType
    max_capacity: int
    free_places: int
    is_joining_group: bool


def list_available_slots(
    session: Session,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    slot_type: SlotType | None = None,
    instructor_id: int | None = None,
    client_id: int | None = None,
    only_free: bool = True,
    now: datetime | None = None,
) -> list[SlotAvailability]:
    """Dynamicznie wylicza dostępne godziny rozpoczęcia dla wybranej usługi (60 min lub 90 min).

    Algorytm:
      1. Pobiera niezablokowane okna dyżurów instruktorów (AvailabilityWindow) w zadanym przedziale.
      2. Pobiera potwierdzone rezerwacje (aktywne TrainingSlot z >= 1 CONFIRMED) tych instruktorów.
      3. Generuje kandydatów startu co 30 min mieszczących pełny czas usługi [start, start + duration]
         wewnątrz okna dyżuru:
         - brak kolizji z aktywnymi zajęciami -> termin wolny (1/1 dla 1h, 3/3 dla 1.5h),
         - dla usługi GROUP_1_5H: dokładne pokrycie z istniejącą grupą 1.5h mającą wolne miejsca (< 3)
           -> termin dostępny do dołączenia (is_joining_group=True),
         - dla usługi INDIVIDUAL_1H lub częściowego nakładania -> termin niedostępny.
    """
    now_utc = _ensure_utc(now or datetime.now(timezone.utc))
    req_from = _ensure_utc(date_from) if date_from else now_utc
    effective_start = max(req_from, now_utc)
    effective_end = _ensure_utc(date_to) if date_to else (effective_start + DEFAULT_RANGE)

    requested_type = slot_type or SlotType.INDIVIDUAL_1H
    duration, default_capacity = slot_duration_and_capacity(requested_type)

    win_stmt = (
        select(AvailabilityWindow, User.first_name, User.last_name)
        .join(User, User.id == AvailabilityWindow.instructor_id)
        .where(
            AvailabilityWindow.is_blocked.is_(False),
            AvailabilityWindow.end_time > effective_start,
            AvailabilityWindow.start_time < effective_end,
        )
        .order_by(AvailabilityWindow.start_time.asc(), AvailabilityWindow.id.asc())
    )
    if instructor_id is not None:
        win_stmt = win_stmt.where(AvailabilityWindow.instructor_id == instructor_id)

    window_rows = list(session.execute(win_stmt))
    if not window_rows:
        return []

    instructor_ids = sorted({w.instructor_id for w, _, _ in window_rows})
    min_win_start = min(_ensure_utc(w.start_time) for w, _, _ in window_rows)
    max_win_end = max(_ensure_utc(w.end_time) for w, _, _ in window_rows)

    # Pobieramy wszystkie sesje treningowe tych instruktorów w zakresie ich dyżurów wraz z rezerwacjami
    booked_slots_stmt = (
        select(TrainingSlot)
        .where(
            TrainingSlot.instructor_id.in_(instructor_ids),
            TrainingSlot.start_time < max_win_end,
            TrainingSlot.end_time > min_win_start,
        )
        .options(joinedload(TrainingSlot.reservations))
    )
    raw_slots = list(session.scalars(booked_slots_stmt).unique())

    # Grupujemy wyłącznie aktywne (mające >= 1 potwierdzoną rezerwację) sesje per instruktor
    occupied_by_instructor: dict[int, list[dict]] = {iid: [] for iid in instructor_ids}
    client_busy_ranges: list[tuple[datetime, datetime]] = []

    for s in raw_slots:
        confirmed_client_ids = {
            r.client_id for r in s.reservations if r.status == ReservationStatus.CONFIRMED
        }
        if not confirmed_client_ids:
            continue
        s_start = _ensure_utc(s.start_time)
        s_end = _ensure_utc(s.end_time)
        occupied_by_instructor.setdefault(s.instructor_id, []).append(
            {
                "id": s.id,
                "start_time": s_start,
                "end_time": s_end,
                "slot_type": s.slot_type,
                "max_capacity": s.max_capacity,
                "is_blocked": s.is_blocked,
                "confirmed_count": len(confirmed_client_ids),
                "confirmed_client_ids": confirmed_client_ids,
            }
        )

    if client_id is not None:
        client_res_stmt = (
            select(TrainingSlot.start_time, TrainingSlot.end_time)
            .join(Reservation, Reservation.slot_id == TrainingSlot.id)
            .where(
                Reservation.client_id == client_id,
                Reservation.status == ReservationStatus.CONFIRMED,
                TrainingSlot.end_time > effective_start,
                TrainingSlot.start_time < effective_end,
            )
        )
        client_busy_ranges = [
            (_ensure_utc(st), _ensure_utc(et)) for st, et in session.execute(client_res_stmt)
        ]

    results: list[SlotAvailability] = []

    for window, first_name, last_name in window_rows:
        win_start = _ensure_utc(window.start_time)
        win_end = _ensure_utc(window.end_time)
        if win_end - win_start < duration:
            continue

        inst_name = f"{first_name} {last_name}".strip()
        inst_occupied = occupied_by_instructor.get(window.instructor_id, [])

        # Kandydaci startu co 30 min od początku dyżuru + ewentualne otwarte grupy 1.5h na niestandardowych minutach
        candidate_starts: set[datetime] = set()
        cursor = win_start
        while cursor + duration <= win_end:
            candidate_starts.add(cursor)
            cursor += CANDIDATE_STEP

        if requested_type == SlotType.GROUP_1_5H:
            for occ in inst_occupied:
                if (
                    occ["slot_type"] == SlotType.GROUP_1_5H
                    and occ["start_time"] >= win_start
                    and occ["end_time"] <= win_end
                ):
                    candidate_starts.add(occ["start_time"])

        for cand_start in sorted(candidate_starts):
            if cand_start <= now_utc:
                continue
            if cand_start < effective_start or cand_start >= effective_end:
                continue

            cand_end = cand_start + duration
            if cand_end > win_end:
                continue

            # Wykluczamy godziny, w których zalogowany klient ma już inny potwierdzony trening
            if client_id is not None and any(
                b_start < cand_end and b_end > cand_start for b_start, b_end in client_busy_ranges
            ):
                continue

            overlapping = [
                occ
                for occ in inst_occupied
                if occ["start_time"] < cand_end and occ["end_time"] > cand_start
            ]

            if len(overlapping) == 0:
                results.append(
                    SlotAvailability(
                        id=f"win-{window.id}-{int(cand_start.timestamp())}-{requested_type.value}",
                        availability_window_id=window.id,
                        slot_id=None,
                        instructor_id=window.instructor_id,
                        instructor_name=inst_name,
                        start_time=cand_start,
                        end_time=cand_end,
                        slot_type=requested_type,
                        max_capacity=default_capacity,
                        free_places=default_capacity,
                        is_joining_group=False,
                    )
                )
            elif len(overlapping) == 1 and requested_type == SlotType.GROUP_1_5H:
                occ = overlapping[0]
                if (
                    occ["slot_type"] == SlotType.GROUP_1_5H
                    and occ["start_time"] == cand_start
                    and occ["end_time"] == cand_end
                    and not occ["is_blocked"]
                ):
                    if client_id is not None and client_id in occ["confirmed_client_ids"]:
                        continue
                    free = max(0, occ["max_capacity"] - occ["confirmed_count"])
                    if only_free and free <= 0:
                        continue
                    results.append(
                        SlotAvailability(
                            id=f"slot-{occ['id']}-{requested_type.value}",
                            availability_window_id=window.id,
                            slot_id=occ["id"],
                            instructor_id=window.instructor_id,
                            instructor_name=inst_name,
                            start_time=cand_start,
                            end_time=cand_end,
                            slot_type=requested_type,
                            max_capacity=occ["max_capacity"],
                            free_places=free,
                            is_joining_group=True,
                        )
                    )

    results.sort(key=lambda item: (item.start_time, item.instructor_id, item.availability_window_id))
    return results


def _attach_window_details(window: AvailabilityWindow) -> AvailabilityWindow:
    """Dołącza do obiektu dyżuru listę zarezerwowanych sesji treningowych oraz płaską listę rezerwacji."""
    booked_sessions = []
    flat_reservations = []
    confirmed_total = 0

    sorted_slots = sorted(
        window.slots or [],
        key=lambda s: (_ensure_utc(s.start_time), s.id),
    )

    for s in sorted_slots:
        if not s.reservations:
            continue
        confirmed = [r for r in s.reservations if r.status == ReservationStatus.CONFIRMED]
        s.confirmed_reservations_count = len(confirmed)
        s.free_places = max(0, s.max_capacity - len(confirmed))
        confirmed_total += len(confirmed)

        # Do listy booked_sessions pokazujemy sesje posiadające aktywne rezerwacje
        if len(confirmed) > 0:
            booked_sessions.append(s)

        for r in sorted(s.reservations, key=lambda res: res.id):
            flat_reservations.append(
                {
                    "id": r.id,
                    "client_id": r.client_id,
                    "client_name": (
                        f"{r.client.first_name} {r.client.last_name}".strip()
                        if r.client
                        else None
                    ),
                    "client_email": r.client.email if r.client else None,
                    "client_phone": r.client.phone_number if r.client else None,
                    "client_shoe_size": r.client.shoe_size if r.client else None,
                    "client_experience_level": r.client.experience_level if r.client else None,
                    "needs_equipment": r.needs_equipment,
                    "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                    "created_at": r.created_at,
                    "slot_id": s.id,
                    "slot_start": s.start_time,
                    "slot_end": s.end_time,
                    "slot_type": s.slot_type.value if hasattr(s.slot_type, "value") else str(s.slot_type),
                    "max_capacity": s.max_capacity,
                }
            )

    duration_minutes = int(
        (_ensure_utc(window.end_time) - _ensure_utc(window.start_time)).total_seconds() // 60
    )
    window.duration_minutes = duration_minutes
    window.confirmed_reservations_count = confirmed_total
    window.booked_sessions = booked_sessions
    window.reservations_list = flat_reservations
    return window


def create_availability_window(
    session: Session,
    *,
    instructor_id: int,
    start_time: datetime,
    end_time: datetime,
    now: datetime | None = None,
) -> AvailabilityWindow:
    """Tworzy nowe okno dyspozycyjności (dyżur) instruktora (np. 14:00–20:00) bez sztywnego typu slotu."""
    now_utc = _ensure_utc(now or datetime.now(timezone.utc))
    start_utc = _ensure_utc(start_time)
    end_utc = _ensure_utc(end_time)

    if start_utc <= now_utc:
        raise PastSlotError("Nie można dodać dyżuru rozpoczynającego się w przeszłości.")

    if end_utc <= start_utc or (end_utc - start_utc) < MIN_WINDOW_DURATION:
        raise InvalidSlotDurationError("Okno dyżuru musi trwać co najmniej 60 minut.")

    validate_operating_hours(start_time, end_time)

    # Sprawdzenie kolizji z innymi dyżurami tego samego instruktora: [A, B) i [C, D) -> A < D AND B > C
    overlap_win = session.scalar(
        select(AvailabilityWindow.id).where(
            AvailabilityWindow.instructor_id == instructor_id,
            AvailabilityWindow.start_time < end_time,
            AvailabilityWindow.end_time > start_time,
        )
    )
    if overlap_win is not None:
        raise SlotOverlapError("Wybrane godziny dyżuru nakładają się na inny dyżur w Twoim grafiku.")

    window = AvailabilityWindow(
        instructor_id=instructor_id,
        start_time=start_time,
        end_time=end_time,
        is_blocked=False,
    )
    session.add(window)
    session.commit()
    return _attach_window_details(window)


def create_availability_windows_bulk(
    session: Session,
    *,
    instructor_id: int,
    windows: list[dict],
    now: datetime | None = None,
) -> dict:
    """Zapisuje serię dyżurów (np. dla zakresu dat), pomijając ewentualne dni z kolizją i zwracając raport."""
    now_utc = _ensure_utc(now or datetime.now(timezone.utc))
    created: list[AvailabilityWindow] = []
    errors: list[dict] = []

    for item in windows:
        st = item["start_time"]
        et = item["end_time"]
        try:
            win = create_availability_window(
                session,
                instructor_id=instructor_id,
                start_time=st,
                end_time=et,
                now=now_utc,
            )
            created.append(win)
        except Exception as exc:
            session.rollback()
            errors.append(
                {
                    "start_time": st.isoformat() if hasattr(st, "isoformat") else str(st),
                    "end_time": et.isoformat() if hasattr(et, "isoformat") else str(et),
                    "message": getattr(exc, "message", str(exc)),
                }
            )

    return {
        "created": created,
        "created_count": len(created),
        "failed_count": len(errors),
        "errors": errors,
    }


# Alias kompatybilności wstecznej nazewnictwa w warstwie routingu
create_slot = create_availability_window


def list_instructor_slots(
    session: Session,
    *,
    instructor_id: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    is_blocked: bool | None = None,
) -> list[AvailabilityWindow]:
    """Pobiera dyżury zalogowanego instruktora wraz z osadzonymi w nich rezerwacjami klientów."""
    stmt = (
        select(AvailabilityWindow)
        .where(AvailabilityWindow.instructor_id == instructor_id)
        .options(
            joinedload(AvailabilityWindow.slots)
            .joinedload(TrainingSlot.reservations)
            .joinedload(Reservation.client)
        )
        .order_by(AvailabilityWindow.start_time.asc(), AvailabilityWindow.id.asc())
    )

    if date_from is not None:
        stmt = stmt.where(AvailabilityWindow.end_time >= date_from)
    if date_to is not None:
        stmt = stmt.where(AvailabilityWindow.start_time < date_to)
    if is_blocked is not None:
        stmt = stmt.where(AvailabilityWindow.is_blocked.is_(is_blocked))

    windows = list(session.scalars(stmt).unique())
    return [_attach_window_details(w) for w in windows]


def get_instructor_slot(
    session: Session,
    *,
    slot_id: int,
    instructor_id: int,
) -> AvailabilityWindow:
    """Pobiera pojedynczy dyżur instruktora wraz z rezerwacjami (ścisła izolacja właściciela)."""
    stmt = (
        select(AvailabilityWindow)
        .where(AvailabilityWindow.id == slot_id)
        .options(
            joinedload(AvailabilityWindow.slots)
            .joinedload(TrainingSlot.reservations)
            .joinedload(Reservation.client)
        )
    )
    window = session.scalars(stmt).unique().one_or_none()
    if window is None:
        raise NotFoundError("Dyżur nie istnieje.")
    if window.instructor_id != instructor_id:
        raise ForbiddenError("Brak uprawnień do dyżuru innego instruktora.")
    return _attach_window_details(window)


def update_slot_block(
    session: Session,
    *,
    slot_id: int,
    instructor_id: int,
    is_blocked: bool,
) -> AvailabilityWindow:
    """Blokuje lub odblokowuje dyżur instruktora dla nowych rezerwacji w widoku klienta."""
    window = get_instructor_slot(session, slot_id=slot_id, instructor_id=instructor_id)
    window.is_blocked = is_blocked
    session.commit()
    return _attach_window_details(window)


def delete_slot(
    session: Session,
    *,
    slot_id: int,
    instructor_id: int,
) -> None:
    """Usuwa okno dyżuru z grafiku pod warunkiem braku aktywnych rezerwacji."""
    window = session.execute(
        select(AvailabilityWindow)
        .where(AvailabilityWindow.id == slot_id)
        .with_for_update()
    ).scalar_one_or_none()

    if window is None:
        raise NotFoundError("Dyżur nie istnieje.")
    if window.instructor_id != instructor_id:
        raise ForbiddenError("Brak uprawnień do usunięcia dyżuru innego instruktora.")

    has_active = session.scalar(
        select(Reservation.id)
        .join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
        .where(
            TrainingSlot.availability_window_id == slot_id,
            Reservation.status == ReservationStatus.CONFIRMED,
        )
        .limit(1)
    )
    if has_active is not None:
        raise SlotHasReservationsError()

    # Odpinamy ewentualne historyczne (anulowane) sesje i czyścimy puste rekordy bez rezerwacji
    linked_slots = list(
        session.scalars(
            select(TrainingSlot)
            .where(TrainingSlot.availability_window_id == slot_id)
            .options(joinedload(TrainingSlot.reservations))
        ).unique()
    )
    for s in linked_slots:
        if len(s.reservations) == 0:
            session.delete(s)
        else:
            s.availability_window_id = None

    session.delete(window)
    session.commit()
