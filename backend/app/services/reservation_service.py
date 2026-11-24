import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import ensure_utc, full_name, utcnow
from app.models import AvailabilityWindow, Reservation, ReservationStatus, SlotType, TrainingSlot, User
from app.services import notification_service
from app.services.exceptions import (
    AlreadyCancelledError, AlreadyReservedError, CancellationDeadlinePassedError,
    InvalidSlotDurationError, NotFoundError, SlotFullError, SlotOverlapError, SlotUnavailableError,
)
from app.services.slot_service import slot_duration_and_capacity, validate_operating_hours

logger = logging.getLogger(__name__)
CANCELLATION_DEADLINE = timedelta(hours=12)


def _reservation_options():
    return (
        joinedload(Reservation.slot).joinedload(TrainingSlot.instructor),
        joinedload(Reservation.slot).selectinload(TrainingSlot.reservations),
    )


def can_cancel(slot_start: datetime, now: datetime | None = None) -> bool:
    return ensure_utc(now or utcnow()) + CANCELLATION_DEADLINE <= ensure_utc(slot_start)


def list_client_reservations(session: Session, *, client_id: int, status: ReservationStatus | None = None) -> list[Reservation]:
    stmt = (
        select(Reservation).join(Reservation.slot).where(Reservation.client_id == client_id)
        .options(*_reservation_options())
        .order_by(TrainingSlot.start_time, Reservation.id)
    )
    if status is not None:
        stmt = stmt.where(Reservation.status == status)
    return list(session.scalars(stmt))


def _upsert_reservation(session: Session, slot_id: int, client_id: int, needs_equipment: bool, existing_all: list[Reservation]) -> Reservation:
    existing = next((r for r in existing_all if r.client_id == client_id), None)
    if existing is not None:
        existing.status = ReservationStatus.CONFIRMED
        existing.needs_equipment = needs_equipment
        return existing
    reservation = Reservation(slot_id=slot_id, client_id=client_id, needs_equipment=needs_equipment, status=ReservationStatus.CONFIRMED)
    session.add(reservation)
    return reservation


def _reload_with_slot(session: Session, reservation_id: int) -> Reservation:
    return session.scalars(
        select(Reservation).where(Reservation.id == reservation_id).options(*_reservation_options())
    ).one()


def _dispatch_confirmed(session: Session, reservation_id: int, emit_in_app: bool = True) -> None:
    try:
        notification_service.notify_reservation_confirmed(reservation_id)
    except Exception:
        logger.exception("Nie udało się zlecić powiadomienia CONFIRMED dla rezerwacji #%s", reservation_id)
    if emit_in_app:
        try:
            notification_service.emit_reservation_created_notifications(session, reservation_id=reservation_id)
        except Exception:
            session.rollback()
            logger.exception("Nie udało się zapisać powiadomienia in-app CONFIRMED dla rezerwacji #%s", reservation_id)


def create_reservation(
    session: Session, *, client_id: int, availability_window_id: int,
    start_time: datetime, slot_type: SlotType, needs_equipment: bool = False,
    phone_number: str | None = None, now: datetime | None = None,
) -> Reservation:
    now_utc = ensure_utc(now or utcnow())
    try:
        duration, max_cap = slot_duration_and_capacity(slot_type)
        req_start = ensure_utc(start_time).replace(second=0, microsecond=0)
        req_end = req_start + duration
        validate_operating_hours(req_start, req_end)

        client_obj = session.execute(select(User).where(User.id == client_id).with_for_update()).scalar_one_or_none()
        window = session.execute(select(AvailabilityWindow).where(AvailabilityWindow.id == availability_window_id).with_for_update()).scalar_one_or_none()
        if window is None:
            raise NotFoundError("Okno dyżuru instruktora nie istnieje.")
        if window.is_blocked or req_start <= now_utc:
            raise SlotUnavailableError()
        if req_start < ensure_utc(window.start_time) or req_end > ensure_utc(window.end_time):
            raise InvalidSlotDurationError("Wybrany przedział treningu nie mieści się w oknie dyżuru instruktora.")

        overlapping = list(session.scalars(
            select(TrainingSlot).where(
                TrainingSlot.instructor_id == window.instructor_id,
                TrainingSlot.start_time < req_end, TrainingSlot.end_time > req_start,
            ).options(selectinload(TrainingSlot.reservations)).with_for_update()
        ))

        active_ov, reusable = [], None
        for s in overlapping:
            s_res = list(s.reservations)
            conf = [r for r in s_res if r.status == ReservationStatus.CONFIRMED]
            if conf:
                active_ov.append((s, conf, s_res))
            elif reusable is None and not s.is_blocked and s.slot_type == slot_type and ensure_utc(s.start_time) == req_start and ensure_utc(s.end_time) == req_end:
                reusable = (s, s_res)

        target_all_res: list[Reservation] = []
        if not active_ov:
            if reusable is not None:
                target, target_all_res = reusable
                target.availability_window_id = window.id
            else:
                target = TrainingSlot(
                    availability_window_id=window.id, instructor_id=window.instructor_id,
                    start_time=req_start, end_time=req_end, slot_type=slot_type, max_capacity=max_cap, is_blocked=False,
                )
                session.add(target)
                session.flush()
        elif len(active_ov) == 1:
            s, conf, all_res = active_ov[0]
            if not (slot_type == SlotType.GROUP_1_5H and s.slot_type == SlotType.GROUP_1_5H and ensure_utc(s.start_time) == req_start and ensure_utc(s.end_time) == req_end):
                raise SlotOverlapError("Wybrany termin nakłada się na inne zarezerwowane zajęcia u tego instruktora.")
            if s.is_blocked:
                raise SlotUnavailableError()
            if any(r.client_id == client_id for r in conf):
                raise AlreadyReservedError()
            if len(conf) >= s.max_capacity:
                raise SlotFullError()
            target, target_all_res = s, all_res
        else:
            raise SlotOverlapError("Wybrany termin nakłada się na inne zarezerwowane zajęcia u tego instruktora.")

        client_conflict = session.scalar(
            select(Reservation.id).join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
            .where(Reservation.client_id == client_id, Reservation.status == ReservationStatus.CONFIRMED,
                   TrainingSlot.start_time < req_end, TrainingSlot.end_time > req_start).limit(1)
        )
        if client_conflict is not None:
            raise AlreadyReservedError("Posiadasz już aktywną rezerwację w tym przedziale godzinowym.")

        reservation = _upsert_reservation(session, target.id, client_id, needs_equipment, target_all_res)
        if phone_number and phone_number.strip() and client_obj is not None:
            client_obj.phone_number = phone_number.strip()[:20]

        session.commit()
        reservation = _reload_with_slot(session, reservation.id)
    except Exception:
        session.rollback()
        raise

    _dispatch_confirmed(session, reservation.id, emit_in_app=True)
    return reservation


def cancel_reservation(session: Session, *, reservation_id: int, client_id: int, now: datetime | None = None) -> Reservation:
    now_utc = ensure_utc(now or utcnow())
    try:
        reservation = session.execute(
            select(Reservation).where(Reservation.id == reservation_id)
            .options(joinedload(Reservation.client), *_reservation_options())
            .with_for_update(of=Reservation)
        ).scalar_one_or_none()
        if reservation is None or reservation.client_id != client_id:
            raise NotFoundError("Rezerwacja nie istnieje.")
        if reservation.status == ReservationStatus.CANCELLED:
            raise AlreadyCancelledError()
        if not can_cancel(reservation.slot.start_time, now_utc):
            raise CancellationDeadlinePassedError()
        reservation.status = ReservationStatus.CANCELLED
        session.commit()
    except Exception:
        session.rollback()
        raise

    try:
        c = reservation.client
        if c is not None and c.email:
            notification_service.notify_reservation_cancelled(
                client_email=c.email, client_name=full_name(c),
                start_time=reservation.slot.start_time,
                instructor_name=full_name(reservation.slot.instructor, "Instruktor CW Spider"),
            )
    except Exception:
        logger.exception("Nie udało się zlecić powiadomienia CANCELLED dla rezerwacji #%s", reservation_id)

    try:
        notification_service.emit_reservation_cancelled_notifications(session, reservation_id=reservation.id, now=now_utc)
    except Exception:
        session.rollback()
        logger.exception("Nie udało się zapisać powiadomienia in-app CANCELLED dla rezerwacji #%s", reservation_id)

    return reservation


def update_reservation_equipment(
    session: Session, *, reservation_id: int, client_id: int, needs_equipment: bool, now: datetime | None = None,
) -> Reservation:
    now_utc = ensure_utc(now or utcnow())
    try:
        reservation = session.execute(
            select(Reservation).where(Reservation.id == reservation_id)
            .options(*_reservation_options())
            .with_for_update(of=Reservation)
        ).scalar_one_or_none()
        if reservation is None or reservation.client_id != client_id:
            raise NotFoundError("Rezerwacja nie istnieje.")
        if reservation.status == ReservationStatus.CANCELLED:
            raise AlreadyCancelledError()
        if ensure_utc(reservation.slot.start_time) <= now_utc:
            raise SlotUnavailableError("Trening już się rozpoczął – nie można zmienić sprzętu.")
        reservation.needs_equipment = needs_equipment
        session.commit()
    except Exception:
        session.rollback()
        raise
    return reservation
