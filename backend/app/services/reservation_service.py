"""Przypadki użycia związane z rezerwacjami w modelu elastycznych okien dyspozycyjności.

Reguły domenowe CW Spider realizowane w tym module:
  R1. Elastyczny czas i limit miejsc wg wybranej usługi:
      - INDIVIDUAL_1H = 60 min, limit 1 osoba,
      - GROUP_1_5H = 90 min, limit max 3 osoby (kolejny klient wybierający 1.5h może dołączyć
        do istniejącej grupy w dokładnie tym samym przedziale, o ile ma < 3 uczestników).
  R2. Spójność współbieżna (transakcyjność i brak nakładania rezerwacji):
      Zapis na termin zakłada blokadę pesymistyczną SELECT ... FOR UPDATE na wierszu
      availability_windows instruktora (oraz powiązanych sesjach training_slots).
      Serializuje to zarówno równoległe zapisy do tej samej grupy 1.5h, jak i próby
      równoczesnej rezerwacji nakładających się przedziałów (np. 14:00–15:00 vs 14:30–16:00).
  R3. Anulowanie: dozwolone wyłącznie gdy now() + 12h <= start_time. Po anulowaniu jedynej
      rezerwacji w przedziale całe okno czasowe automatycznie wraca do puli wolnych godzin dyżuru.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import AvailabilityWindow, Reservation, ReservationStatus, SlotType, TrainingSlot, User
from app.services import in_app_notification_service, notification_service
from app.services.exceptions import (
    AlreadyCancelledError,
    AlreadyReservedError,
    CancellationDeadlinePassedError,
    InvalidSlotDurationError,
    NotFoundError,
    SlotFullError,
    SlotOverlapError,
    SlotUnavailableError,
)
from app.services.slot_service import slot_duration_and_capacity, validate_operating_hours

logger = logging.getLogger(__name__)

CANCELLATION_DEADLINE = timedelta(hours=12)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt_val: datetime) -> datetime:
    if dt_val.tzinfo is None:
        return dt_val.replace(tzinfo=timezone.utc)
    return dt_val.astimezone(timezone.utc)


def can_cancel(slot_start: datetime, now: datetime | None = None) -> bool:
    """R3: now() + 12h <= start_time."""
    return _ensure_utc(now or _utcnow()) + CANCELLATION_DEADLINE <= _ensure_utc(slot_start)


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
    client_id: int,
    availability_window_id: int | None = None,
    start_time: datetime | None = None,
    slot_type: SlotType | None = None,
    slot_id: int | None = None,
    needs_equipment: bool = False,
    phone_number: str | None = None,
    now: datetime | None = None,
) -> Reservation:
    """Tworzy rezerwację treningu w oknie dyżuru instruktora z pełną ochroną transakcyjną."""
    now_utc = _ensure_utc(now or _utcnow())

    try:
        # Kompatybilność pomocnicza, jeśli wywołujący przekazał istniejący slot_id
        if availability_window_id is None and slot_id is not None:
            existing_slot_lookup = session.scalar(
                select(TrainingSlot).where(TrainingSlot.id == slot_id)
            )
            if existing_slot_lookup is None:
                raise NotFoundError("Termin nie istnieje.")
            if existing_slot_lookup.availability_window_id is not None:
                availability_window_id = existing_slot_lookup.availability_window_id
                start_time = existing_slot_lookup.start_time
                slot_type = existing_slot_lookup.slot_type
            else:
                # Ścieżka awaryjna dla historycznego slotu bez przypiętego okna dyżuru
                locked_slot = session.execute(
                    select(TrainingSlot).where(TrainingSlot.id == slot_id).with_for_update()
                ).scalar_one_or_none()
                if locked_slot is None:
                    raise NotFoundError("Termin nie istnieje.")
                if locked_slot.is_blocked or _ensure_utc(locked_slot.start_time) <= now_utc:
                    raise SlotUnavailableError()

                slot_res = list(
                    session.scalars(
                        select(Reservation).where(Reservation.slot_id == locked_slot.id)
                    )
                )
                confirmed = [r for r in slot_res if r.status == ReservationStatus.CONFIRMED]
                existing_own = next((r for r in slot_res if r.client_id == client_id), None)

                if existing_own is not None and existing_own.status == ReservationStatus.CONFIRMED:
                    raise AlreadyReservedError()
                if len(confirmed) >= locked_slot.max_capacity:
                    raise SlotFullError()

                if existing_own is not None:
                    existing_own.status = ReservationStatus.CONFIRMED
                    existing_own.needs_equipment = needs_equipment
                    reservation = existing_own
                else:
                    reservation = Reservation(
                        slot_id=locked_slot.id,
                        client_id=client_id,
                        needs_equipment=needs_equipment,
                        status=ReservationStatus.CONFIRMED,
                    )
                    session.add(reservation)
                session.commit()
                reservation = session.scalars(
                    select(Reservation)
                    .where(Reservation.id == reservation.id)
                    .options(joinedload(Reservation.slot).joinedload(TrainingSlot.instructor))
                ).one()
                try:
                    notification_service.notify_reservation_confirmed(reservation.id)
                except Exception:
                    logger.exception(
                        "Nie udało się zlecić powiadomienia CONFIRMED dla rezerwacji #%s",
                        reservation.id,
                    )
                return reservation

        if availability_window_id is None or start_time is None or slot_type is None:
            raise InvalidSlotDurationError(
                "Wymagane jest wskazanie okna dyżuru (availability_window_id), godziny startu oraz typu usługi."
            )

        duration, max_capacity = slot_duration_and_capacity(slot_type)
        req_start_utc = _ensure_utc(start_time).replace(second=0, microsecond=0)
        req_end_utc = req_start_utc + duration

        # Walidacja godzin otwarcia klubu 09:00 – 22:00 w strefie Europe/Warsaw
        validate_operating_hours(req_start_utc, req_end_utc)

        # R2: Blokada pesymistyczna wiersza okna dyżuru instruktora!
        # Serializuje WSZYSTKIE równoległe próby zapisu w ramach tego dyżuru (zarówno te same
        # godziny grupowe, jak i nakładające się przedziały np. 14:00–15:00 vs 14:30–16:00).
        window = session.execute(
            select(AvailabilityWindow)
            .where(AvailabilityWindow.id == availability_window_id)
            .with_for_update()
        ).scalar_one_or_none()

        if window is None:
            raise NotFoundError("Okno dyżuru instruktora nie istnieje.")
        if window.is_blocked or req_start_utc <= now_utc:
            raise SlotUnavailableError()

        win_start_utc = _ensure_utc(window.start_time)
        win_end_utc = _ensure_utc(window.end_time)

        if req_start_utc < win_start_utc or req_end_utc > win_end_utc:
            raise InvalidSlotDurationError(
                "Wybrany przedział treningu nie mieści się w oknie dyżuru instruktora."
            )

        # Pobieramy i blokujemy wszystkie sesje treningowe tego instruktora nachodzące na [req_start, req_end)
        overlapping_slots = list(
            session.scalars(
                select(TrainingSlot)
                .where(
                    TrainingSlot.instructor_id == window.instructor_id,
                    TrainingSlot.start_time < req_end_utc,
                    TrainingSlot.end_time > req_start_utc,
                )
                .with_for_update()
            )
        )

        # Dla każdej nachodzącej sesji odczytujemy aktualne rezerwacje w bieżącej transakcji
        active_overlapping: list[tuple[TrainingSlot, list[Reservation], list[Reservation]]] = []
        reusable_empty_slot: TrainingSlot | None = None

        for s in overlapping_slots:
            s_reservations = list(
                session.scalars(select(Reservation).where(Reservation.slot_id == s.id))
            )
            confirmed_res = [r for r in s_reservations if r.status == ReservationStatus.CONFIRMED]
            if len(confirmed_res) > 0:
                active_overlapping.append((s, confirmed_res, s_reservations))
            elif (
                reusable_empty_slot is None
                and not s.is_blocked
                and s.slot_type == slot_type
                and _ensure_utc(s.start_time) == req_start_utc
                and _ensure_utc(s.end_time) == req_end_utc
            ):
                reusable_empty_slot = s

        target_slot: TrainingSlot
        target_slot_all_res: list[Reservation] = []

        if len(active_overlapping) == 0:
            # Cały przedział [req_start_utc, req_end_utc) jest wolny u tego instruktora
            if reusable_empty_slot is not None:
                reusable_empty_slot.availability_window_id = window.id
                target_slot = reusable_empty_slot
                target_slot_all_res = list(
                    session.scalars(
                        select(Reservation).where(Reservation.slot_id == target_slot.id)
                    )
                )
            else:
                target_slot = TrainingSlot(
                    availability_window_id=window.id,
                    instructor_id=window.instructor_id,
                    start_time=req_start_utc,
                    end_time=req_end_utc,
                    slot_type=slot_type,
                    max_capacity=max_capacity,
                    is_blocked=False,
                )
                session.add(target_slot)
                session.flush()
        elif len(active_overlapping) == 1:
            s, confirmed_res, all_res = active_overlapping[0]
            # Dołączenie do istniejącego terminu jest dozwolone WYŁĄCZNIE dla grupy 1.5h
            # o identycznych godzinach rozpoczęcia i zakończenia oraz wolnych miejscach (< 3).
            is_exact_group_match = (
                slot_type == SlotType.GROUP_1_5H
                and s.slot_type == SlotType.GROUP_1_5H
                and _ensure_utc(s.start_time) == req_start_utc
                and _ensure_utc(s.end_time) == req_end_utc
            )
            if not is_exact_group_match:
                raise SlotOverlapError(
                    "Wybrany termin nakłada się na inne zarezerwowane zajęcia u tego instruktora."
                )
            if s.is_blocked:
                raise SlotUnavailableError()
            if any(r.client_id == client_id for r in confirmed_res):
                raise AlreadyReservedError()
            if len(confirmed_res) >= s.max_capacity:
                raise SlotFullError()

            target_slot = s
            target_slot_all_res = all_res
        else:
            raise SlotOverlapError(
                "Wybrany termin nakłada się na inne zarezerwowane zajęcia u tego instruktora."
            )

        # Weryfikacja, czy sam klient nie ma już innej aktywnej rezerwacji w nakładającym się czasie
        client_conflict = session.scalar(
            select(Reservation.id)
            .join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
            .where(
                Reservation.client_id == client_id,
                Reservation.status == ReservationStatus.CONFIRMED,
                TrainingSlot.start_time < req_end_utc,
                TrainingSlot.end_time > req_start_utc,
            )
            .limit(1)
        )
        if client_conflict is not None:
            raise AlreadyReservedError(
                "Posiadasz już aktywną rezerwację w tym przedziale godzinowym."
            )

        existing_own = next((r for r in target_slot_all_res if r.client_id == client_id), None)
        if existing_own is not None:
            existing_own.status = ReservationStatus.CONFIRMED
            existing_own.needs_equipment = needs_equipment
            reservation = existing_own
        else:
            reservation = Reservation(
                slot_id=target_slot.id,
                client_id=client_id,
                needs_equipment=needs_equipment,
                status=ReservationStatus.CONFIRMED,
            )
            session.add(reservation)

        if phone_number and phone_number.strip():
            client_obj = session.scalar(select(User).where(User.id == client_id))
            if client_obj is not None:
                client_obj.phone_number = phone_number.strip()[:20]

        session.commit()

        # Dociągnięcie relacji do poprawnej serializacji odpowiedzi HTTP 201
        reservation = session.scalars(
            select(Reservation)
            .where(Reservation.id == reservation.id)
            .options(joinedload(Reservation.slot).joinedload(TrainingSlot.instructor))
        ).one()
    except Exception:
        session.rollback()
        raise

    # Pkt 5 specyfikacji: powiadomienie zlecane ŚCIŚLE PO udanym commit.
    try:
        notification_service.notify_reservation_confirmed(reservation.id)
    except Exception:
        logger.exception(
            "Nie udało się zlecić powiadomienia CONFIRMED dla rezerwacji #%s", reservation.id
        )

    try:
        in_app_notification_service.emit_reservation_created_notifications(
            session, reservation_id=reservation.id
        )
    except Exception:
        session.rollback()
        logger.exception(
            "Nie udało się zapisać powiadomienia in-app CONFIRMED dla rezerwacji #%s",
            reservation.id,
        )

    return reservation


def cancel_reservation(
    session: Session,
    *,
    reservation_id: int,
    client_id: int,
    now: datetime | None = None,
) -> Reservation:
    now_utc = _ensure_utc(now or _utcnow())
    try:
        reservation = session.execute(
            select(Reservation)
            .where(Reservation.id == reservation_id)
            .options(
                joinedload(Reservation.client),
                joinedload(Reservation.slot).joinedload(TrainingSlot.instructor),
            )
            .with_for_update(of=Reservation)
        ).scalar_one_or_none()

        # Cudza rezerwacja traktowana jak nieistniejąca (brak wycieku informacji).
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
        client = reservation.client
        instructor = reservation.slot.instructor
        if client is not None and client.email:
            notification_service.notify_reservation_cancelled(
                client_email=client.email,
                client_name=f"{client.first_name} {client.last_name}".strip(),
                start_time=reservation.slot.start_time,
                instructor_name=(
                    f"{instructor.first_name} {instructor.last_name}".strip()
                    if instructor is not None
                    else "Instruktor CW Spider"
                ),
            )
    except Exception:
        logger.exception(
            "Nie udało się zlecić powiadomienia CANCELLED dla rezerwacji #%s", reservation_id
        )

    try:
        in_app_notification_service.emit_reservation_cancelled_notifications(
            session, reservation_id=reservation.id, now=now_utc
        )
    except Exception:
        session.rollback()
        logger.exception(
            "Nie udało się zapisać powiadomienia in-app CANCELLED dla rezerwacji #%s", reservation_id
        )

    return reservation

def update_reservation_equipment(
    session: Session,
    *,
    reservation_id: int,
    client_id: int,
    needs_equipment: bool,
    now: datetime | None = None,
) -> Reservation:
    """Zmiana zapotrzebowania na sprzęt (buty + uprząż) bez anulowania rezerwacji.

    Dozwolona tylko dla własnej, aktywnej rezerwacji, której termin jeszcze się nie rozpoczął.
    """
    now_utc = _ensure_utc(now or _utcnow())
    try:
        reservation = session.execute(
            select(Reservation)
            .where(Reservation.id == reservation_id)
            .options(joinedload(Reservation.slot).joinedload(TrainingSlot.instructor))
            .with_for_update(of=Reservation)
        ).scalar_one_or_none()

        if reservation is None or reservation.client_id != client_id:
            raise NotFoundError("Rezerwacja nie istnieje.")
        if reservation.status == ReservationStatus.CANCELLED:
            raise AlreadyCancelledError()
        if _ensure_utc(reservation.slot.start_time) <= now_utc:
            raise SlotUnavailableError("Trening już się rozpoczął – nie można zmienić sprzętu.")

        reservation.needs_equipment = needs_equipment
        session.commit()
    except Exception:
        session.rollback()
        raise
    return reservation
