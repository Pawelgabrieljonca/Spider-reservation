"""Serwis administracyjny: diagnostyka systemu, baza użytkowników oraz zestawienie dyżurów i godzin instruktorów."""

import time
from datetime import datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.models import (
    AvailabilityWindow,
    Reservation,
    ReservationStatus,
    SlotType,
    TrainingSlot,
    User,
    UserRole,
)


def _ensure_aware_utc(dt_val: datetime) -> datetime:
    if dt_val.tzinfo is None:
        return dt_val.replace(tzinfo=timezone.utc)
    return dt_val.astimezone(timezone.utc)


def get_system_diagnostics(session: Session) -> dict:
    """Diagnostyka stanu API oraz bazy PostgreSQL wyłącznie dla roli ROLE_ADMIN."""
    checked_at = datetime.now(timezone.utc)
    t0 = time.perf_counter()
    try:
        session.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        users_count = session.scalar(select(func.count(User.id))) or 0
        windows_count = session.scalar(select(func.count(AvailabilityWindow.id))) or 0
        reservations_count = session.scalar(select(func.count(Reservation.id))) or 0
        return {
            "status": "ok",
            "database": "ok",
            "db_latency_ms": latency_ms,
            "checked_at": checked_at,
            "users_count": int(users_count),
            "slots_count": int(windows_count),
            "reservations_count": int(reservations_count),
        }
    except SQLAlchemyError:
        return {
            "status": "degraded",
            "database": "unreachable",
            "db_latency_ms": None,
            "checked_at": checked_at,
            "users_count": 0,
            "slots_count": 0,
            "reservations_count": 0,
        }


def list_users_grouped(session: Session) -> dict:
    """Pobiera bazę użytkowników z podziałem na klientów, instruktorów oraz administratorów."""
    stmt = select(User).order_by(User.last_name.asc(), User.first_name.asc(), User.id.asc())
    users = list(session.scalars(stmt))

    clients = [u for u in users if u.role == UserRole.CLIENT]
    instructors = [u for u in users if u.role == UserRole.INSTRUCTOR]
    admins = [u for u in users if u.role == UserRole.ADMIN]

    return {
        "clients": clients,
        "instructors": instructors,
        "admins": admins,
        "total_count": len(users),
    }


def get_instructors_availability_report(
    session: Session,
    *,
    now: datetime | None = None,
) -> dict:
    """Zestawienie dyżurów instruktorów, zarezerwowanych treningów 1h i 1.5h oraz łącznego czasu dyspozycyjności."""
    now_utc = _ensure_aware_utc(now or datetime.now(timezone.utc))

    stmt = (
        select(User)
        .where(User.role == UserRole.INSTRUCTOR)
        .options(
            joinedload(User.availability_windows)
            .joinedload(AvailabilityWindow.slots)
            .joinedload(TrainingSlot.reservations),
            joinedload(User.instructor_slots).joinedload(TrainingSlot.reservations),
        )
        .order_by(User.last_name.asc(), User.first_name.asc(), User.id.asc())
    )
    instructors = list(session.scalars(stmt).unique())

    instructor_rows: list[dict] = []

    tot_planned_1h = 0
    tot_completed_1h = 0
    tot_planned_1_5h = 0
    tot_completed_1_5h = 0
    tot_blocked = 0
    tot_planned_min = 0
    tot_completed_min = 0

    for inst in instructors:
        sorted_windows = sorted(
            inst.availability_windows,
            key=lambda w: (_ensure_aware_utc(w.start_time), w.id),
            reverse=True,
        )

        planned_1h = 0
        completed_1h = 0
        planned_1_5h = 0
        completed_1_5h = 0
        confirmed_res_total = 0

        for slot in inst.instructor_slots:
            confirmed_count = sum(
                1 for r in slot.reservations if r.status == ReservationStatus.CONFIRMED
            )
            if confirmed_count <= 0:
                continue
            confirmed_res_total += confirmed_count
            end_utc = _ensure_aware_utc(slot.end_time)
            if end_utc < now_utc:
                if slot.slot_type == SlotType.INDIVIDUAL_1H:
                    completed_1h += 1
                else:
                    completed_1_5h += 1
            else:
                if slot.slot_type == SlotType.INDIVIDUAL_1H:
                    planned_1h += 1
                else:
                    planned_1_5h += 1

        planned_minutes = 0
        completed_minutes = 0
        blocked_count = 0
        window_items: list[dict] = []

        for win in sorted_windows:
            w_start = _ensure_aware_utc(win.start_time)
            w_end = _ensure_aware_utc(win.end_time)
            dur_min = max(0, int((w_end - w_start).total_seconds() // 60))

            win_confirmed_res = sum(
                1
                for s in (win.slots or [])
                for r in (s.reservations or [])
                if r.status == ReservationStatus.CONFIRMED
            )
            win_booked_sessions = sum(
                1
                for s in (win.slots or [])
                if any(r.status == ReservationStatus.CONFIRMED for r in (s.reservations or []))
            )

            if win.is_blocked:
                blocked_count += 1
                state = "BLOCKED"
            elif w_end < now_utc:
                state = "COMPLETED"
                completed_minutes += dur_min
            else:
                state = "PLANNED"
                planned_minutes += dur_min

            window_items.append(
                {
                    "id": win.id,
                    "start_time": win.start_time,
                    "end_time": win.end_time,
                    "slot_type": "AVAILABILITY_WINDOW",
                    "max_capacity": win_booked_sessions,
                    "is_blocked": win.is_blocked,
                    "confirmed_reservations_count": win_confirmed_res,
                    "free_places": dur_min,
                    "state": state,
                }
            )

        total_minutes = planned_minutes + completed_minutes

        tot_planned_1h += planned_1h
        tot_completed_1h += completed_1h
        tot_planned_1_5h += planned_1_5h
        tot_completed_1_5h += completed_1_5h
        tot_blocked += blocked_count
        tot_planned_min += planned_minutes
        tot_completed_min += completed_minutes

        instructor_rows.append(
            {
                "instructor_id": inst.id,
                "first_name": inst.first_name,
                "last_name": inst.last_name,
                "email": inst.email,
                "planned_1h_count": planned_1h,
                "completed_1h_count": completed_1h,
                "planned_1_5h_count": planned_1_5h,
                "completed_1_5h_count": completed_1_5h,
                "blocked_slots_count": blocked_count,
                "confirmed_reservations_count": confirmed_res_total,
                "planned_minutes": planned_minutes,
                "completed_minutes": completed_minutes,
                "total_minutes": total_minutes,
                "planned_hours": round(planned_minutes / 60.0, 2),
                "completed_hours": round(completed_minutes / 60.0, 2),
                "total_hours": round(total_minutes / 60.0, 2),
                "slots": window_items,
            }
        )

    tot_all_min = tot_planned_min + tot_completed_min

    return {
        "totals": {
            "instructors_count": len(instructors),
            "planned_1h_count": tot_planned_1h,
            "completed_1h_count": tot_completed_1h,
            "planned_1_5h_count": tot_planned_1_5h,
            "completed_1_5h_count": tot_completed_1_5h,
            "blocked_slots_count": tot_blocked,
            "planned_minutes": tot_planned_min,
            "completed_minutes": tot_completed_min,
            "total_minutes": tot_all_min,
            "planned_hours": round(tot_planned_min / 60.0, 2),
            "completed_hours": round(tot_completed_min / 60.0, 2),
            "total_hours": round(tot_all_min / 60.0, 2),
        },
        "instructors": instructor_rows,
    }
