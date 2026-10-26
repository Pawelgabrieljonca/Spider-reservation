"""Przypadki użycia związane z rezerwacjami (warstwa logiki biznesowej).

Reguły domenowe CW Spider realizowane w tym module:
  R1. Limit miejsc: INDIVIDUAL_1H = 1 osoba, GROUP_1_5H = max 3 osoby
      (wartość max_capacity jest dodatkowo wymuszana przez CHECK w bazie).
  R2. Spójność współbieżna: zapis na termin blokuje wiersz training_slots
      (SELECT ... FOR UPDATE), co serializuje równoległe zapisy na ten sam slot
      i eliminuje double-booking przy izolacji READ COMMITTED.
  R3. Anulowanie: dozwolone wyłącznie gdy now() + 12h <= start_time.

Każda publiczna funkcja stanowi granicę jednej transakcji (commit/rollback).
Parametr `now` umożliwia deterministyczne testy jednostkowe reguły 12h.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Reservation, ReservationStatus, TrainingSlot
from app.services.exceptions import (
    AlreadyCancelledError,
    AlreadyReservedError,
    CancellationDeadlinePassedError,
    NotFoundError,
    SlotFullError,
    SlotUnavailableError,
)

CANCELLATION_DEADLINE = timedelta(hours=12)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def can_cancel(slot_start: datetime, now: datetime | None = None) -> bool:
    """R3: now() + 12h <= start_time."""
    return (now or _utcnow()) + CANCELLATION_DEADLINE <= slot_start


def list_client_reservations(
    session: Session,
    *,
    client_id: int,
    status: ReservationStatus | None = None,
) -> list[Reservation]:
    """Rezerwacje klienta, od najbliższego terminu do najdalszego."""
    stmt = (
        select(Reservation)
        .join(Reservation.slot)
        .where(Reservation.client_id == client_id)
        .options(joinedload(Reservation.slot).joinedload(TrainingSlot.instructor))
        .order_by(TrainingSlot.start_time, Reservation.id)
    )
    if status is not None:
        stmt = stmt.where(Reservation.status == status)
    return list(session.scalars(stmt))


def create_reservation(
    session: Session,
    *,
    slot_id: int,
    client_id: int,
    needs_equipment: bool = False,
    now: datetime | None = None,
) -> Reservation:
    now = now or _utcnow()
    try:
        # R2: blokada pesymistyczna wiersza slotu. Druga transakcja zapisująca się
        # na ten sam slot czeka tutaj do COMMIT/ROLLBACK pierwszej, a następnie
        # liczy rezerwacje już z uwzględnieniem zatwierdzonych zmian.
        slot = session.execute(
            select(TrainingSlot).where(TrainingSlot.id == slot_id).with_for_update()
        ).scalar_one_or_none()

        if slot is None:
            raise NotFoundError("Termin nie istnieje.")
        if slot.is_blocked or slot.start_time <= now:
            raise SlotUnavailableError()

        existing = session.execute(
            select(Reservation).where(
                Reservation.slot_id == slot_id,
                Reservation.client_id == client_id,
            )
        ).scalar_one_or_none()
        if existing is not None and existing.status == ReservationStatus.CONFIRMED:
            raise AlreadyReservedError()

        # R1: liczymy wyłącznie aktywne rezerwacje.
        taken = session.scalar(
            select(func.count())
            .select_from(Reservation)
            .where(
                Reservation.slot_id == slot_id,
                Reservation.status == ReservationStatus.CONFIRMED,
            )
        )
        if taken >= slot.max_capacity:
            raise SlotFullError()

        if existing is not None:
            # Ponowny zapis po wcześniejszym anulowaniu – reaktywacja wiersza,
            # zgodnie z ograniczeniem UNIQUE(slot_id, client_id).
            existing.status = ReservationStatus.CONFIRMED
            existing.needs_equipment = needs_equipment
            reservation = existing
        else:
            reservation = Reservation(
                slot_id=slot_id,
                client_id=client_id,
                needs_equipment=needs_equipment,
                status=ReservationStatus.CONFIRMED,
            )
            session.add(reservation)

        session.commit()
        return reservation
    except Exception:
        session.rollback()
        raise


def cancel_reservation(
    session: Session,
    *,
    reservation_id: int,
    client_id: int,
    now: datetime | None = None,
) -> Reservation:
    now = now or _utcnow()
    try:
        reservation = session.execute(
            select(Reservation)
            .where(Reservation.id == reservation_id)
            .with_for_update(of=Reservation)
        ).scalar_one_or_none()

        # Cudza rezerwacja traktowana jak nieistniejąca (brak wycieku informacji).
        if reservation is None or reservation.client_id != client_id:
            raise NotFoundError("Rezerwacja nie istnieje.")
        if reservation.status == ReservationStatus.CANCELLED:
            raise AlreadyCancelledError()
        if not can_cancel(reservation.slot.start_time, now):
            raise CancellationDeadlinePassedError()

        reservation.status = ReservationStatus.CANCELLED
        session.commit()
        return reservation
    except Exception:
        session.rollback()
        raise
