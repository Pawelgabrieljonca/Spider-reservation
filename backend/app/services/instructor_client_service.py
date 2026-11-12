"""Weryfikacja profilu wspinacza, zatwierdzanie poziomu oraz notatki trenerskie w module instruktora."""

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    InstructorClientNote,
    ProgressEntry,
    Reservation,
    ReservationStatus,
    TrainingSlot,
    User,
    UserRole,
)
from app.services import in_app_notification_service, progress_service
from app.services.exceptions import ForbiddenError, NotFoundError

logger = logging.getLogger(__name__)


def _ensure_utc(dt_val: datetime) -> datetime:
    if dt_val.tzinfo is None:
        return dt_val.replace(tzinfo=timezone.utc)
    return dt_val.astimezone(timezone.utc)


def _user_base_dict(user: User) -> dict:
    verifier = getattr(user, "experience_verified_by", None)
    return {
        "id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": f"{user.first_name} {user.last_name}".strip(),
        "email": user.email,
        "phone_number": user.phone_number,
        "shoe_size": user.shoe_size,
        "experience_level": user.experience_level,
        "experience_verified": bool(user.experience_verified),
        "experience_verified_at": user.experience_verified_at,
        "experience_verified_by_id": user.experience_verified_by_id,
        "experience_verified_by_name": (
            f"{verifier.first_name} {verifier.last_name}".strip() if verifier else None
        ),
    }


def list_instructor_clients(
    session: Session,
    *,
    instructor_id: int,
    now: datetime | None = None,
) -> list[dict]:
    """Zwraca listę podopiecznych zalogowanego instruktora wraz ze statusem poziomu i podsumowaniem."""
    now_utc = _ensure_utc(now or datetime.now(timezone.utc))

    res_rows = list(
        session.execute(
            select(Reservation, TrainingSlot)
            .join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
            .where(
                TrainingSlot.instructor_id == instructor_id,
                Reservation.status == ReservationStatus.CONFIRMED,
            )
        )
    )

    stats_by_client: dict[int, dict] = {}
    for res, slot in res_rows:
        st_utc = _ensure_utc(slot.start_time)
        en_utc = _ensure_utc(slot.end_time)
        entry = stats_by_client.setdefault(
            res.client_id,
            {
                "completed": 0,
                "upcoming": 0,
                "last_past": None,
                "next_up": None,
            },
        )
        if en_utc <= now_utc:
            entry["completed"] += 1
            if entry["last_past"] is None or st_utc > entry["last_past"]:
                entry["last_past"] = st_utc
        else:
            entry["upcoming"] += 1
            if entry["next_up"] is None or st_utc < entry["next_up"]:
                entry["next_up"] = st_utc

    authored_client_ids = set(
        session.scalars(
            select(ProgressEntry.client_id).where(ProgressEntry.instructor_id == instructor_id)
        )
    )

    all_client_ids = sorted(set(stats_by_client.keys()) | authored_client_ids)
    if not all_client_ids:
        return []

    clients = list(
        session.scalars(
            select(User)
            .where(User.id.in_(all_client_ids), User.role == UserRole.CLIENT)
            .options(joinedload(User.experience_verified_by))
        )
    )

    notes = list(
        session.scalars(
            select(InstructorClientNote)
            .where(
                InstructorClientNote.instructor_id == instructor_id,
                InstructorClientNote.client_id.in_(all_client_ids),
            )
            .order_by(InstructorClientNote.created_at.desc(), InstructorClientNote.id.desc())
        )
    )
    notes_count_map: dict[int, int] = {}
    latest_note_map: dict[int, str] = {}
    for n in notes:
        notes_count_map[n.client_id] = notes_count_map.get(n.client_id, 0) + 1
        if n.client_id not in latest_note_map:
            latest_note_map[n.client_id] = n.content

    progress_counts = dict(
        session.execute(
            select(ProgressEntry.client_id, func.count(ProgressEntry.id))
            .where(ProgressEntry.client_id.in_(all_client_ids))
            .group_by(ProgressEntry.client_id)
        ).all()
    )

    items = []
    for u in clients:
        st = stats_by_client.get(
            u.id,
            {"completed": 0, "upcoming": 0, "last_past": None, "next_up": None},
        )
        data = _user_base_dict(u)
        data.update(
            {
                "completed_trainings_count": st["completed"],
                "upcoming_trainings_count": st["upcoming"],
                "last_training_at": st["last_past"],
                "next_training_at": st["next_up"],
                "notes_count": notes_count_map.get(u.id, 0),
                "progress_entries_count": int(progress_counts.get(u.id, 0)),
                "latest_note": latest_note_map.get(u.id),
            }
        )
        items.append(data)

    # Sortowanie: najpierw klienci po najświeższym odbytym treningu, następnie nadchodzący
    def _sort_key(c: dict):
        if c["last_training_at"] is not None:
            return (0, -c["last_training_at"].timestamp(), c["full_name"].lower())
        if c["next_training_at"] is not None:
            return (1, c["next_training_at"].timestamp(), c["full_name"].lower())
        return (2, 0, c["full_name"].lower())

    items.sort(key=_sort_key)
    return items


def get_instructor_client_detail(
    session: Session,
    *,
    instructor_id: int,
    client_id: int,
    now: datetime | None = None,
) -> dict:
    """Pełna karta weryfikacji wspinacza: poziom, kontakt, prywatne notatki, historia sesji i postępów."""
    user = progress_service.ensure_valid_client_for_instructor(
        session,
        instructor_id=instructor_id,
        client_id=client_id,
        allow_existing_authored_entry=True,
    )
    now_utc = _ensure_utc(now or datetime.now(timezone.utc))

    res_rows = list(
        session.execute(
            select(Reservation, TrainingSlot)
            .join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
            .where(
                TrainingSlot.instructor_id == instructor_id,
                Reservation.client_id == client_id,
            )
            .order_by(TrainingSlot.start_time.desc(), Reservation.id.desc())
        )
    )

    completed_count = 0
    upcoming_count = 0
    last_training_at = None
    next_training_at = None
    history = []

    for res, slot in res_rows:
        st_utc = _ensure_utc(slot.start_time)
        en_utc = _ensure_utc(slot.end_time)
        status_val = res.status.value if hasattr(res.status, "value") else str(res.status)
        if res.status == ReservationStatus.CONFIRMED:
            if en_utc <= now_utc:
                completed_count += 1
                if last_training_at is None or st_utc > last_training_at:
                    last_training_at = st_utc
            else:
                upcoming_count += 1
                if next_training_at is None or st_utc < next_training_at:
                    next_training_at = st_utc

        history.append(
            {
                "reservation_id": res.id,
                "slot_id": slot.id,
                "availability_window_id": slot.availability_window_id,
                "start_time": slot.start_time,
                "end_time": slot.end_time,
                "slot_type": (
                    slot.slot_type.value if hasattr(slot.slot_type, "value") else str(slot.slot_type)
                ),
                "status": status_val,
                "needs_equipment": bool(res.needs_equipment),
            }
        )

    notes = list(
        session.scalars(
            select(InstructorClientNote)
            .where(
                InstructorClientNote.instructor_id == instructor_id,
                InstructorClientNote.client_id == client_id,
            )
            .order_by(InstructorClientNote.created_at.desc(), InstructorClientNote.id.desc())
        )
    )
    progress_entries = progress_service.list_client_progress(session, client_id=client_id)

    data = _user_base_dict(user)
    data.update(
        {
            "completed_trainings_count": completed_count,
            "upcoming_trainings_count": upcoming_count,
            "last_training_at": last_training_at,
            "next_training_at": next_training_at,
            "notes_count": len(notes),
            "progress_entries_count": len(progress_entries),
            "latest_note": notes[0].content if notes else None,
            "notes": notes,
            "trainings_history": history,
            "progress_entries": progress_entries,
        }
    )
    return data


def verify_client_experience(
    session: Session,
    *,
    instructor_id: int,
    client_id: int,
    experience_level: str,
    verified: bool = True,
) -> dict:
    """Zatwierdza (lub aktualizuje i zatwierdza) poziom zaawansowania wspinacza przez instruktora."""
    user = progress_service.ensure_valid_client_for_instructor(
        session,
        instructor_id=instructor_id,
        client_id=client_id,
        allow_existing_authored_entry=True,
    )

    user.experience_level = experience_level
    user.experience_verified = bool(verified)
    if verified:
        user.experience_verified_at = datetime.now(timezone.utc)
        user.experience_verified_by_id = instructor_id
    else:
        user.experience_verified_at = None
        user.experience_verified_by_id = None

    session.commit()
    session.expire(user)

    if verified:
        try:
            in_app_notification_service.emit_experience_verified_notification(
                session,
                client_id=client_id,
                instructor_id=instructor_id,
                experience_level=experience_level,
            )
        except Exception:
            session.rollback()
            logger.exception(
                "Nie udało się zapisać powiadomienia in-app o zatwierdzeniu poziomu klienta #%s",
                client_id,
            )

    return get_instructor_client_detail(
        session, instructor_id=instructor_id, client_id=client_id
    )


def create_client_note(
    session: Session,
    *,
    instructor_id: int,
    client_id: int,
    content: str,
) -> InstructorClientNote:
    """Tworzy prywatną notatkę instruktora dla podopiecznego."""
    progress_service.ensure_valid_client_for_instructor(
        session,
        instructor_id=instructor_id,
        client_id=client_id,
        allow_existing_authored_entry=True,
    )
    note = InstructorClientNote(
        client_id=client_id,
        instructor_id=instructor_id,
        content=content.strip(),
    )
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


def _get_own_note(
    session: Session,
    *,
    note_id: int,
    instructor_id: int,
    client_id: int,
) -> InstructorClientNote:
    note = session.scalar(
        select(InstructorClientNote).where(InstructorClientNote.id == note_id)
    )
    if note is None:
        raise NotFoundError("Notatka nie istnieje.")
    if note.instructor_id != instructor_id or note.client_id != client_id:
        raise ForbiddenError("Brak uprawnień: możesz zarządzać wyłącznie własnymi notatkami klienta.")
    return note


def update_client_note(
    session: Session,
    *,
    note_id: int,
    instructor_id: int,
    client_id: int,
    content: str,
) -> InstructorClientNote:
    note = _get_own_note(
        session, note_id=note_id, instructor_id=instructor_id, client_id=client_id
    )
    note.content = content.strip()
    session.commit()
    session.refresh(note)
    return note


def delete_client_note(
    session: Session,
    *,
    note_id: int,
    instructor_id: int,
    client_id: int,
) -> None:
    note = _get_own_note(
        session, note_id=note_id, instructor_id=instructor_id, client_id=client_id
    )
    session.delete(note)
    session.commit()
