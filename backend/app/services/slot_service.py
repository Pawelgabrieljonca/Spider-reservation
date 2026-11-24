from dataclasses import dataclass
from datetime import datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import CLUB_TIMEZONE, ensure_utc, enum_value, full_name, utcnow
from app.models import AvailabilityWindow, Reservation, ReservationStatus, SlotType, TrainingSlot, User
from app.services.exceptions import (
    ForbiddenError, InvalidSlotDurationError, NotFoundError,
    OutsideOperatingHoursError, PastSlotError, SlotHasReservationsError, SlotOverlapError,
)

DEFAULT_RANGE = timedelta(days=14)
OPENING_TIME = time(9, 0)
CLOSING_TIME = time(22, 0)
MIN_WINDOW_DURATION = timedelta(minutes=60)
CANDIDATE_STEP = timedelta(minutes=30)


def _window_eager_options():
    return (
        joinedload(AvailabilityWindow.slots)
        .joinedload(TrainingSlot.reservations)
        .joinedload(Reservation.client)
        .joinedload(User.experience_verified_by)
    )


def validate_operating_hours(start_time: datetime, end_time: datetime) -> None:
    ls = start_time.astimezone(CLUB_TIMEZONE) if start_time.tzinfo else start_time
    le = end_time.astimezone(CLUB_TIMEZONE) if end_time.tzinfo else end_time
    if ls.date() != le.date() or ls.time() < OPENING_TIME or le.time() > CLOSING_TIME:
        raise OutsideOperatingHoursError("Zajęcia i dyżury mogą odbywać się wyłącznie w godzinach 09:00 - 22:00")


def slot_duration_and_capacity(slot_type: SlotType) -> tuple[timedelta, int]:
    return (timedelta(minutes=60), 1) if slot_type == SlotType.INDIVIDUAL_1H else (timedelta(minutes=90), 3)


@dataclass(frozen=True)
class SlotAvailability:
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
    session: Session, *, date_from: datetime | None = None, date_to: datetime | None = None,
    slot_type: SlotType | None = None, instructor_id: int | None = None,
    client_id: int | None = None, only_free: bool = True, now: datetime | None = None,
) -> list[SlotAvailability]:
    now_utc = ensure_utc(now or utcnow())
    eff_start = max(ensure_utc(date_from) if date_from else now_utc, now_utc)
    eff_end = ensure_utc(date_to) if date_to else (eff_start + DEFAULT_RANGE)
    req_type = slot_type or SlotType.INDIVIDUAL_1H
    duration, default_cap = slot_duration_and_capacity(req_type)

    win_stmt = (
        select(AvailabilityWindow, User.first_name, User.last_name)
        .join(User, User.id == AvailabilityWindow.instructor_id)
        .where(AvailabilityWindow.is_blocked.is_(False), AvailabilityWindow.end_time > eff_start, AvailabilityWindow.start_time < eff_end)
        .order_by(AvailabilityWindow.start_time.asc(), AvailabilityWindow.id.asc())
    )
    if instructor_id is not None:
        win_stmt = win_stmt.where(AvailabilityWindow.instructor_id == instructor_id)

    window_rows = list(session.execute(win_stmt))
    if not window_rows:
        return []

    inst_ids = sorted({w.instructor_id for w, _, _ in window_rows})
    min_start = min(ensure_utc(w.start_time) for w, _, _ in window_rows)
    max_end = max(ensure_utc(w.end_time) for w, _, _ in window_rows)

    raw_slots = list(
        session.scalars(
            select(TrainingSlot)
            .where(TrainingSlot.instructor_id.in_(inst_ids), TrainingSlot.start_time < max_end, TrainingSlot.end_time > min_start)
            .options(joinedload(TrainingSlot.reservations))
        ).unique()
    )

    occupied_by_inst: dict[int, list[dict]] = {iid: [] for iid in inst_ids}
    for s in raw_slots:
        cids = {r.client_id for r in s.reservations if r.status == ReservationStatus.CONFIRMED}
        if not cids:
            continue
        occupied_by_inst.setdefault(s.instructor_id, []).append({
            "id": s.id, "start_time": ensure_utc(s.start_time), "end_time": ensure_utc(s.end_time),
            "slot_type": s.slot_type, "max_capacity": s.max_capacity, "is_blocked": s.is_blocked,
            "confirmed_count": len(cids), "confirmed_client_ids": cids,
        })

    client_busy: list[tuple[datetime, datetime]] = []
    if client_id is not None:
        client_busy = [
            (ensure_utc(st), ensure_utc(et))
            for st, et in session.execute(
                select(TrainingSlot.start_time, TrainingSlot.end_time)
                .join(Reservation, Reservation.slot_id == TrainingSlot.id)
                .where(
                    Reservation.client_id == client_id, Reservation.status == ReservationStatus.CONFIRMED,
                    TrainingSlot.end_time > eff_start, TrainingSlot.start_time < eff_end,
                )
            )
        ]

    results: list[SlotAvailability] = []
    for window, fn, ln in window_rows:
        win_start, win_end = ensure_utc(window.start_time), ensure_utc(window.end_time)
        if win_end - win_start < duration:
            continue
        inst_name = f"{fn} {ln}".strip()
        inst_occ = occupied_by_inst.get(window.instructor_id, [])

        cands: set[datetime] = set()
        cursor = win_start
        while cursor + duration <= win_end:
            cands.add(cursor)
            cursor += CANDIDATE_STEP
        if req_type == SlotType.GROUP_1_5H:
            for occ in inst_occ:
                if occ["slot_type"] == SlotType.GROUP_1_5H and occ["start_time"] >= win_start and occ["end_time"] <= win_end:
                    cands.add(occ["start_time"])

        for cs in sorted(cands):
            ce = cs + duration
            if cs <= now_utc or cs < eff_start or cs >= eff_end or ce > win_end:
                continue
            if client_id is not None and any(bs < ce and be > cs for bs, be in client_busy):
                continue

            overlapping = [o for o in inst_occ if o["start_time"] < ce and o["end_time"] > cs]
            if not overlapping:
                results.append(SlotAvailability(
                    f"win-{window.id}-{int(cs.timestamp())}-{req_type.value}", window.id, None,
                    window.instructor_id, inst_name, cs, ce, req_type, default_cap, default_cap, False,
                ))
            elif len(overlapping) == 1 and req_type == SlotType.GROUP_1_5H:
                o = overlapping[0]
                if o["slot_type"] == SlotType.GROUP_1_5H and o["start_time"] == cs and o["end_time"] == ce and not o["is_blocked"]:
                    if client_id is not None and client_id in o["confirmed_client_ids"]:
                        continue
                    free = max(0, o["max_capacity"] - o["confirmed_count"])
                    if only_free and free <= 0:
                        continue
                    results.append(SlotAvailability(
                        f"slot-{o['id']}-{req_type.value}", window.id, o["id"],
                        window.instructor_id, inst_name, cs, ce, req_type, o["max_capacity"], free, True,
                    ))

    results.sort(key=lambda x: (x.start_time, x.instructor_id, x.availability_window_id))
    return results


def serialize_instructor_reservation(res: Reservation, slot: TrainingSlot | None = None) -> dict:
    c = getattr(res, "client", None)
    v = getattr(c, "experience_verified_by", None) if c else None
    s_type = slot.slot_type if slot else getattr(res, "slot_type", None)
    return {
        "id": res.id,
        "client_id": res.client_id,
        "client_name": full_name(c) or None,
        "client_email": c.email if c else None,
        "client_phone": c.phone_number if c else None,
        "client_shoe_size": c.shoe_size if c else None,
        "client_experience_level": c.experience_level if c else None,
        "client_experience_verified": bool(c.experience_verified) if c else False,
        "client_experience_verified_at": c.experience_verified_at if c else None,
        "client_experience_verified_by_name": full_name(v) or None,
        "needs_equipment": bool(res.needs_equipment),
        "status": enum_value(res.status),
        "created_at": res.created_at,
        "slot_id": slot.id if slot else getattr(res, "slot_id", None),
        "slot_start": slot.start_time if slot else getattr(res, "slot_start", None),
        "slot_end": slot.end_time if slot else getattr(res, "slot_end", None),
        "slot_type": enum_value(s_type) if s_type else None,
        "max_capacity": slot.max_capacity if slot else getattr(res, "max_capacity", None),
    }


def _attach_window_details(window: AvailabilityWindow) -> AvailabilityWindow:
    booked_sessions, flat_reservations, confirmed_total = [], [], 0
    for s in sorted(window.slots or [], key=lambda s: (ensure_utc(s.start_time), s.id)):
        if not s.reservations:
            continue
        confirmed = [r for r in s.reservations if r.status == ReservationStatus.CONFIRMED]
        s.confirmed_reservations_count = len(confirmed)
        s.free_places = max(0, s.max_capacity - len(confirmed))
        confirmed_total += len(confirmed)
        if confirmed:
            booked_sessions.append(s)

        for r in sorted(s.reservations, key=lambda res: res.id):
            flat_reservations.append(serialize_instructor_reservation(r, slot=s))

    window.duration_minutes = int((ensure_utc(window.end_time) - ensure_utc(window.start_time)).total_seconds() // 60)
    window.confirmed_reservations_count = confirmed_total
    window.booked_sessions = booked_sessions
    window.reservations_list = flat_reservations
    return window


def create_availability_window(
    session: Session, *, instructor_id: int, start_time: datetime, end_time: datetime, now: datetime | None = None,
) -> AvailabilityWindow:
    now_utc, start_utc, end_utc = ensure_utc(now or utcnow()), ensure_utc(start_time), ensure_utc(end_time)
    if start_utc <= now_utc:
        raise PastSlotError("Nie można dodać dyżuru rozpoczynającego się w przeszłości.")
    if end_utc <= start_utc or (end_utc - start_utc) < MIN_WINDOW_DURATION:
        raise InvalidSlotDurationError("Okno dyżuru musi trwać co najmniej 60 minut.")
    validate_operating_hours(start_time, end_time)

    session.execute(select(User.id).where(User.id == instructor_id).with_for_update()).scalar_one_or_none()

    overlap = session.scalar(
        select(AvailabilityWindow.id).where(
            AvailabilityWindow.instructor_id == instructor_id,
            AvailabilityWindow.start_time < end_time, AvailabilityWindow.end_time > start_time,
        )
    )
    if overlap is not None:
        raise SlotOverlapError("Wybrane godziny dyżuru nakładają się na inny dyżur w Twoim grafiku.")

    window = AvailabilityWindow(instructor_id=instructor_id, start_time=start_time, end_time=end_time, is_blocked=False)
    session.add(window)
    session.commit()
    return _attach_window_details(window)


def create_availability_windows_bulk(
    session: Session, *, instructor_id: int, windows: list[dict], now: datetime | None = None,
) -> dict:
    now_utc = ensure_utc(now or utcnow())
    created, errors = [], []
    for item in windows:
        st, et = item["start_time"], item["end_time"]
        try:
            created.append(create_availability_window(session, instructor_id=instructor_id, start_time=st, end_time=et, now=now_utc))
        except Exception as exc:
            session.rollback()
            errors.append({
                "start_time": st.isoformat() if hasattr(st, "isoformat") else str(st),
                "end_time": et.isoformat() if hasattr(et, "isoformat") else str(et),
                "message": getattr(exc, "message", str(exc)),
            })
    return {"created": created, "created_count": len(created), "failed_count": len(errors), "errors": errors}


def list_instructor_slots(
    session: Session, *, instructor_id: int, date_from: datetime | None = None,
    date_to: datetime | None = None, is_blocked: bool | None = None,
) -> list[AvailabilityWindow]:
    stmt = (
        select(AvailabilityWindow)
        .where(AvailabilityWindow.instructor_id == instructor_id)
        .options(_window_eager_options())
        .order_by(AvailabilityWindow.start_time.asc(), AvailabilityWindow.id.asc())
    )
    if date_from is not None:
        stmt = stmt.where(AvailabilityWindow.end_time >= date_from)
    if date_to is not None:
        stmt = stmt.where(AvailabilityWindow.start_time < date_to)
    if is_blocked is not None:
        stmt = stmt.where(AvailabilityWindow.is_blocked.is_(is_blocked))
    return [_attach_window_details(w) for w in session.scalars(stmt).unique()]


def get_instructor_slot(session: Session, *, slot_id: int, instructor_id: int) -> AvailabilityWindow:
    window = session.scalars(
        select(AvailabilityWindow).where(AvailabilityWindow.id == slot_id).options(_window_eager_options())
    ).unique().one_or_none()
    if window is None:
        raise NotFoundError("Dyżur nie istnieje.")
    if window.instructor_id != instructor_id:
        raise ForbiddenError("Brak uprawnień do dyżuru innego instruktora.")
    return _attach_window_details(window)


def update_slot_block(session: Session, *, slot_id: int, instructor_id: int, is_blocked: bool) -> AvailabilityWindow:
    window = get_instructor_slot(session, slot_id=slot_id, instructor_id=instructor_id)
    window.is_blocked = is_blocked
    session.commit()
    return _attach_window_details(window)


def delete_slot(session: Session, *, slot_id: int, instructor_id: int) -> None:
    window = session.execute(
        select(AvailabilityWindow).where(AvailabilityWindow.id == slot_id).with_for_update()
    ).scalar_one_or_none()
    if window is None:
        raise NotFoundError("Dyżur nie istnieje.")
    if window.instructor_id != instructor_id:
        raise ForbiddenError("Brak uprawnień do usunięcia dyżuru innego instruktora.")

    has_active = session.scalar(
        select(Reservation.id).join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
        .where(TrainingSlot.availability_window_id == slot_id, Reservation.status == ReservationStatus.CONFIRMED)
        .limit(1)
    )
    if has_active is not None:
        raise SlotHasReservationsError()

    linked = list(
        session.scalars(
            select(TrainingSlot).where(TrainingSlot.availability_window_id == slot_id).options(joinedload(TrainingSlot.reservations))
        ).unique()
    )
    for s in linked:
        if not s.reservations:
            session.delete(s)
        else:
            s.availability_window_id = None
    session.delete(window)
    session.commit()
