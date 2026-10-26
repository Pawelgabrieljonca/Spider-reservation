"""Zarządzanie terminami treningów (przeglądanie przez klienta, grafik instruktora)."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Reservation, ReservationStatus, SlotType, TrainingSlot, User
from app.services.exceptions import (
    InvalidSlotDurationError,
    NotFoundError,
    PastSlotError,
    SlotHasReservationsError,
    SlotOverlapError,
)

DEFAULT_RANGE = timedelta(days=14)


@dataclass(frozen=True)
class SlotAvailability:
    id: int
    start_time: datetime
    end_time: datetime
    slot_type: SlotType
    max_capacity: int
    free_places: int
    instructor_name: str


def list_available_slots(
    session: Session,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    slot_type: SlotType | None = None,
    only_free: bool = True,
    now: datetime | None = None,
) -> list[SlotAvailability]:
    """Zwraca przyszłe, niezablokowane sloty wraz z liczbą wolnych miejsc (jedno zapytanie SQL).

    Wynik jest informacyjny – ostateczną kontrolę limitu wykonuje `create_reservation`
    pod blokadą wiersza slotu.
    """
    now = now or datetime.now(timezone.utc)
    start = max(date_from, now) if date_from else now
    end = date_to or (start + DEFAULT_RANGE)

    taken = (
        select(Reservation.slot_id, func.count().label("taken"))
        .where(Reservation.status == ReservationStatus.CONFIRMED)
        .group_by(Reservation.slot_id)
        .subquery()
    )
    taken_count = func.coalesce(taken.c.taken, 0)

    stmt = (
        select(TrainingSlot, User.first_name, User.last_name, taken_count)
        .join(User, User.id == TrainingSlot.instructor_id)
        .outerjoin(taken, taken.c.slot_id == TrainingSlot.id)
        .where(
            TrainingSlot.is_blocked.is_(False),
            TrainingSlot.start_time >= start,
            TrainingSlot.start_time < end,
        )
        .order_by(TrainingSlot.start_time, TrainingSlot.id)
    )
    if slot_type is not None:
        stmt = stmt.where(TrainingSlot.slot_type == slot_type)
    if only_free:
        stmt = stmt.where(taken_count < TrainingSlot.max_capacity)

    return [
        SlotAvailability(
            id=slot.id,
            start_time=slot.start_time,
            end_time=slot.end_time,
            slot_type=slot.slot_type,
            max_capacity=slot.max_capacity,
            free_places=slot.max_capacity - taken_n,
            instructor_name=f"{first_name} {last_name}",
        )
        for slot, first_name, last_name, taken_n in session.execute(stmt)
    ]


def _attach_slot_counts(slot: TrainingSlot) -> TrainingSlot:
    """Dołącza dynamiczne atrybuty liczby potwierdzonych rezerwacji i wolnych miejsc."""
    confirmed = [r for r in slot.reservations if r.status == ReservationStatus.CONFIRMED]
    slot.confirmed_reservations_count = len(confirmed)
    slot.free_places = max(0, slot.max_capacity - len(confirmed))
    return slot


def create_slot(
    session: Session,
    *,
    instructor_id: int,
    start_time: datetime,
    slot_type: SlotType,
    end_time: datetime | None = None,
    now: datetime | None = None,
) -> TrainingSlot:
    """Tworzy nowy termin dla instruktora z automatycznym wyliczeniem czasu i limitu osób.

    Wymusza reguły biznesowe:
      - slot nie może być w przeszłości,
      - czas trwania musi odpowiadać typowi (1h dla INDIVIDUAL_1H, 1.5h dla GROUP_1_5H),
      - limit miejsc (max_capacity): 1 dla 1h, 3 dla 1.5h,
      - instruktor nie może mieć nakładających się terminów w grafiku.
    """
    now = now or datetime.now(timezone.utc)
    if start_time <= now:
        raise PastSlotError()

    duration = timedelta(hours=1) if slot_type == SlotType.INDIVIDUAL_1H else timedelta(minutes=90)
    capacity = 1 if slot_type == SlotType.INDIVIDUAL_1H else 3

    calculated_end = start_time + duration
    if end_time is not None:
        if end_time != calculated_end:
            raise InvalidSlotDurationError()
    else:
        end_time = calculated_end

    # Sprawdzenie kolizji terminów w grafiku danego instruktora:
    # Warunek nakładania się dwóch przedziałów [A, B) i [C, D): A < D AND B > C
    overlap = session.scalar(
        select(TrainingSlot.id).where(
            TrainingSlot.instructor_id == instructor_id,
            TrainingSlot.start_time < end_time,
            TrainingSlot.end_time > start_time,
        )
    )
    if overlap is not None:
        raise SlotOverlapError()

    slot = TrainingSlot(
        instructor_id=instructor_id,
        start_time=start_time,
        end_time=end_time,
        slot_type=slot_type,
        max_capacity=capacity,
        is_blocked=False,
    )
    session.add(slot)
    session.commit()
    return _attach_slot_counts(slot)


def list_instructor_slots(
    session: Session,
    *,
    instructor_id: int,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    is_blocked: bool | None = None,
) -> list[TrainingSlot]:
    """Pobiera sloty zalogowanego instruktora wraz z relacjami rezerwacji i klientów."""
    from sqlalchemy.orm import joinedload

    stmt = (
        select(TrainingSlot)
        .where(TrainingSlot.instructor_id == instructor_id)
        .options(joinedload(TrainingSlot.reservations).joinedload(Reservation.client))
        .order_by(TrainingSlot.start_time, TrainingSlot.id)
    )

    if date_from is not None:
        stmt = stmt.where(TrainingSlot.start_time >= date_from)
    if date_to is not None:
        stmt = stmt.where(TrainingSlot.start_time < date_to)
    if is_blocked is not None:
        stmt = stmt.where(TrainingSlot.is_blocked.is_(is_blocked))

    slots = list(session.scalars(stmt).unique())
    return [_attach_slot_counts(s) for s in slots]


def get_instructor_slot(
    session: Session,
    *,
    slot_id: int,
    instructor_id: int,
) -> TrainingSlot:
    """Pobiera pojedynczy termin instruktora z pełną listą uczestników."""
    from sqlalchemy.orm import joinedload

    stmt = (
        select(TrainingSlot)
        .where(TrainingSlot.id == slot_id, TrainingSlot.instructor_id == instructor_id)
        .options(joinedload(TrainingSlot.reservations).joinedload(Reservation.client))
    )
    slot = session.scalars(stmt).unique().one_or_none()
    if slot is None:
        from app.services.exceptions import NotFoundError

        raise NotFoundError("Termin nie istnieje lub nie należy do Twojego konta.")
    return _attach_slot_counts(slot)


def update_slot_block(
    session: Session,
    *,
    slot_id: int,
    instructor_id: int,
    is_blocked: bool,
) -> TrainingSlot:
    """Blokuje lub odblokowuje termin w widoku publicznym."""
    slot = get_instructor_slot(session, slot_id=slot_id, instructor_id=instructor_id)
    slot.is_blocked = is_blocked
    session.commit()
    return _attach_slot_counts(slot)


def delete_slot(
    session: Session,
    *,
    slot_id: int,
    instructor_id: int,
) -> None:
    """Usuwa termin z grafiku, pod warunkiem braku aktywnych rezerwacji."""
    from app.services.exceptions import NotFoundError, SlotHasReservationsError

    slot = session.execute(
        select(TrainingSlot)
        .where(TrainingSlot.id == slot_id, TrainingSlot.instructor_id == instructor_id)
        .with_for_update()
    ).scalar_one_or_none()

    if slot is None:
        raise NotFoundError("Termin nie istnieje lub nie należy do Twojego konta.")

    has_active = session.scalar(
        select(Reservation.id).where(
            Reservation.slot_id == slot_id,
            Reservation.status == ReservationStatus.CONFIRMED,
        )
    )
    if has_active is not None:
        raise SlotHasReservationsError()

    session.delete(slot)
    session.commit()
