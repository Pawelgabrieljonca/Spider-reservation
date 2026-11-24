import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import ensure_utc, enum_value, full_name, utcnow
from app.models import InstructorClientNote, ProgressEntry, Reservation, ReservationStatus, TrainingSlot, User, UserRole
from app.services import notification_service, progress_service
from app.services.exceptions import ForbiddenError, NotFoundError

logger = logging.getLogger(__name__)


def get_client_profile(session: Session, *, user_id: int) -> User:
    user = session.scalar(select(User).where(User.id == user_id).options(joinedload(User.experience_verified_by)))
    if user is None:
        raise NotFoundError("Konto użytkownika nie istnieje.")
    return user


def update_client_profile(
    session: Session, *, user_id: int, phone_number: str | None = None, shoe_size: str | None = None, experience_level: str | None = None
) -> User:
    user = get_client_profile(session, user_id=user_id)
    user.phone_number = phone_number
    user.shoe_size = shoe_size
    if user.experience_level != experience_level:
        user.experience_level = experience_level
        user.experience_verified = False
        user.experience_verified_at = None
        user.experience_verified_by_id = None
    session.commit()
    session.expire(user)
    return get_client_profile(session, user_id=user_id)


def _user_base_dict(user: User) -> dict:
    verifier = getattr(user, "experience_verified_by", None)
    return {
        "id": user.id, "first_name": user.first_name, "last_name": user.last_name,
        "full_name": full_name(user), "email": user.email, "phone_number": user.phone_number,
        "shoe_size": user.shoe_size, "experience_level": user.experience_level,
        "experience_verified": bool(user.experience_verified),
        "experience_verified_at": user.experience_verified_at,
        "experience_verified_by_id": user.experience_verified_by_id,
        "experience_verified_by_name": full_name(verifier) or None,
    }


def _client_summary_dict(
    user: User, st: dict, *, notes_count: int, progress_count: int, latest_note: str | None
) -> dict:
    return {
        **_user_base_dict(user),
        "completed_trainings_count": st["completed"],
        "upcoming_trainings_count": st["upcoming"],
        "last_training_at": st["last_past"],
        "next_training_at": st["next_up"],
        "notes_count": notes_count,
        "progress_entries_count": progress_count,
        "latest_note": latest_note,
    }


def _update_stats(st: dict, start_utc: datetime, end_utc: datetime, now_utc: datetime) -> None:
    if end_utc <= now_utc:
        st["completed"] += 1
        if st["last_past"] is None or start_utc > st["last_past"]:
            st["last_past"] = start_utc
    else:
        st["upcoming"] += 1
        if st["next_up"] is None or start_utc < st["next_up"]:
            st["next_up"] = start_utc


def list_instructor_clients(session: Session, *, instructor_id: int, now: datetime | None = None) -> list[dict]:
    now_utc = ensure_utc(now or utcnow())
    res_rows = list(session.execute(
        select(Reservation, TrainingSlot).join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
        .where(TrainingSlot.instructor_id == instructor_id, Reservation.status == ReservationStatus.CONFIRMED)
    ))

    stats: dict[int, dict] = {}
    for res, slot in res_rows:
        entry = stats.setdefault(res.client_id, {"completed": 0, "upcoming": 0, "last_past": None, "next_up": None})
        _update_stats(entry, ensure_utc(slot.start_time), ensure_utc(slot.end_time), now_utc)

    authored_ids = set(session.scalars(select(ProgressEntry.client_id).where(ProgressEntry.instructor_id == instructor_id)))
    all_ids = sorted(set(stats.keys()) | authored_ids)
    if not all_ids:
        return []

    clients = list(session.scalars(
        select(User).where(User.id.in_(all_ids), User.role == UserRole.CLIENT).options(joinedload(User.experience_verified_by))
    ))
    notes = list(session.scalars(
        select(InstructorClientNote)
        .where(InstructorClientNote.instructor_id == instructor_id, InstructorClientNote.client_id.in_(all_ids))
        .order_by(InstructorClientNote.created_at.desc(), InstructorClientNote.id.desc())
    ))
    notes_count, latest_note = {}, {}
    for n in notes:
        notes_count[n.client_id] = notes_count.get(n.client_id, 0) + 1
        latest_note.setdefault(n.client_id, n.content)

    prog_counts = dict(session.execute(
        select(ProgressEntry.client_id, func.count(ProgressEntry.id))
        .where(ProgressEntry.client_id.in_(all_ids)).group_by(ProgressEntry.client_id)
    ).all())

    items = []
    for u in clients:
        st = stats.get(u.id, {"completed": 0, "upcoming": 0, "last_past": None, "next_up": None})
        items.append(_client_summary_dict(
            u, st,
            notes_count=notes_count.get(u.id, 0),
            progress_count=int(prog_counts.get(u.id, 0)),
            latest_note=latest_note.get(u.id),
        ))

    items.sort(key=lambda c: (
        (0, -c["last_training_at"].timestamp(), c["full_name"].lower()) if c["last_training_at"]
        else (1, c["next_training_at"].timestamp(), c["full_name"].lower()) if c["next_training_at"]
        else (2, 0, c["full_name"].lower())
    ))
    return items


def get_instructor_client_detail(session: Session, *, instructor_id: int, client_id: int, now: datetime | None = None) -> dict:
    user = progress_service.ensure_valid_client_for_instructor(
        session, instructor_id=instructor_id, client_id=client_id, allow_existing_authored_entry=True,
    )
    now_utc = ensure_utc(now or utcnow())
    res_rows = list(session.execute(
        select(Reservation, TrainingSlot).join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
        .where(TrainingSlot.instructor_id == instructor_id, Reservation.client_id == client_id)
        .order_by(TrainingSlot.start_time.desc(), Reservation.id.desc())
    ))

    st = {"completed": 0, "upcoming": 0, "last_past": None, "next_up": None}
    history = []
    for res, slot in res_rows:
        if res.status == ReservationStatus.CONFIRMED:
            _update_stats(st, ensure_utc(slot.start_time), ensure_utc(slot.end_time), now_utc)
        history.append({
            "reservation_id": res.id, "slot_id": slot.id, "availability_window_id": slot.availability_window_id,
            "start_time": slot.start_time, "end_time": slot.end_time,
            "slot_type": enum_value(slot.slot_type), "status": enum_value(res.status),
            "needs_equipment": bool(res.needs_equipment),
        })

    notes = list(session.scalars(
        select(InstructorClientNote)
        .where(InstructorClientNote.instructor_id == instructor_id, InstructorClientNote.client_id == client_id)
        .order_by(InstructorClientNote.created_at.desc(), InstructorClientNote.id.desc())
    ))
    progress_entries = progress_service.list_client_progress(session, client_id=client_id)

    return {
        **_client_summary_dict(
            user, st,
            notes_count=len(notes),
            progress_count=len(progress_entries),
            latest_note=notes[0].content if notes else None,
        ),
        "notes": notes, "trainings_history": history, "progress_entries": progress_entries,
    }


def verify_client_experience(
    session: Session, *, instructor_id: int, client_id: int, experience_level: str, verified: bool = True,
) -> dict:
    user = progress_service.ensure_valid_client_for_instructor(
        session, instructor_id=instructor_id, client_id=client_id, allow_existing_authored_entry=True,
    )
    user.experience_level = experience_level
    user.experience_verified = bool(verified)
    user.experience_verified_at = utcnow() if verified else None
    user.experience_verified_by_id = instructor_id if verified else None
    session.commit()
    session.expire(user)

    if verified:
        try:
            notification_service.emit_experience_verified_notification(
                session, client_id=client_id, instructor_id=instructor_id, experience_level=experience_level,
            )
        except Exception:
            session.rollback()
            logger.exception("Nie udało się zapisać powiadomienia in-app o zatwierdzeniu poziomu klienta #%s", client_id)

    return get_instructor_client_detail(session, instructor_id=instructor_id, client_id=client_id)


def create_client_note(session: Session, *, instructor_id: int, client_id: int, content: str) -> InstructorClientNote:
    progress_service.ensure_valid_client_for_instructor(
        session, instructor_id=instructor_id, client_id=client_id, allow_existing_authored_entry=True,
    )
    note = InstructorClientNote(client_id=client_id, instructor_id=instructor_id, content=content.strip())
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


def _get_own_note(session: Session, *, note_id: int, instructor_id: int, client_id: int) -> InstructorClientNote:
    note = session.scalar(select(InstructorClientNote).where(InstructorClientNote.id == note_id))
    if note is None:
        raise NotFoundError("Notatka nie istnieje.")
    if note.instructor_id != instructor_id or note.client_id != client_id:
        raise ForbiddenError("Brak uprawnień: możesz zarządzać wyłącznie własnymi notatkami klienta.")
    return note


def update_client_note(session: Session, *, note_id: int, instructor_id: int, client_id: int, content: str) -> InstructorClientNote:
    note = _get_own_note(session, note_id=note_id, instructor_id=instructor_id, client_id=client_id)
    note.content = content.strip()
    session.commit()
    session.refresh(note)
    return note


def delete_client_note(session: Session, *, note_id: int, instructor_id: int, client_id: int) -> None:
    note = _get_own_note(session, note_id=note_id, instructor_id=instructor_id, client_id=client_id)
    session.delete(note)
    session.commit()
