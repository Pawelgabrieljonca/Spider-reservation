import logging

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import ProgressEntry, Reservation, ReservationStatus, TrainingSlot, User, UserRole
from app.services import notification_service
from app.services.exceptions import ClientNotFoundError, ForbiddenError, NotFoundError

logger = logging.getLogger(__name__)


def _progress_load_options():
    return (
        joinedload(ProgressEntry.instructor),
        joinedload(ProgressEntry.client).joinedload(User.experience_verified_by),
    )


def ensure_valid_client_for_instructor(
    session: Session, *, instructor_id: int, client_id: int, allow_existing_authored_entry: bool = False,
) -> User:
    user = session.scalar(select(User).where(User.id == client_id).options(joinedload(User.experience_verified_by)))
    if user is None:
        raise ClientNotFoundError()
    if user.role != UserRole.CLIENT:
        raise ForbiddenError("Brak uprawnień: wskazane konto nie należy do klienta.")

    has_res = session.scalar(
        select(Reservation.id).join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
        .where(TrainingSlot.instructor_id == instructor_id, Reservation.client_id == client_id, Reservation.status == ReservationStatus.CONFIRMED)
        .limit(1)
    )
    if has_res is not None:
        return user
    if allow_existing_authored_entry and session.scalar(
        select(ProgressEntry.id).where(ProgressEntry.instructor_id == instructor_id, ProgressEntry.client_id == client_id).limit(1)
    ) is not None:
        return user
    raise ForbiddenError("Brak dostępu: klient nie odbył ani nie zarezerwował u Ciebie żadnego treningu.")


def list_client_progress(session: Session, *, client_id: int) -> list[ProgressEntry]:
    return list(session.scalars(
        select(ProgressEntry).where(ProgressEntry.client_id == client_id)
        .options(*_progress_load_options()).order_by(ProgressEntry.created_at.desc(), ProgressEntry.id.desc())
    ))


def list_client_progress_for_instructor(session: Session, *, instructor_id: int, client_id: int) -> list[ProgressEntry]:
    ensure_valid_client_for_instructor(session, instructor_id=instructor_id, client_id=client_id, allow_existing_authored_entry=True)
    return list_client_progress(session, client_id=client_id)


def create_progress_entry(
    session: Session, *, client_id: int, instructor_id: int, grade: str, instructor_feedback: str, route_name: str | None = None,
) -> ProgressEntry:
    ensure_valid_client_for_instructor(session, instructor_id=instructor_id, client_id=client_id, allow_existing_authored_entry=False)
    entry = ProgressEntry(
        client_id=client_id, instructor_id=instructor_id, grade=grade.strip(),
        route_name=route_name.strip() if route_name else None, instructor_feedback=instructor_feedback.strip(),
    )
    session.add(entry)
    session.commit()
    try:
        notification_service.emit_progress_entry_notification(session, entry_id=entry.id)
    except Exception:
        session.rollback()
        logger.exception("Nie udało się zapisać powiadomienia in-app dla wpisu postępu #%s", entry.id)
    return session.scalars(select(ProgressEntry).where(ProgressEntry.id == entry.id).options(*_progress_load_options())).one()


def _get_own_entry(session: Session, *, entry_id: int, instructor_id: int) -> ProgressEntry:
    entry = session.scalar(select(ProgressEntry).where(ProgressEntry.id == entry_id).options(*_progress_load_options()))
    if entry is None:
        raise NotFoundError("Wpis w Dzienniku postępów nie istnieje.")
    if entry.instructor_id != instructor_id:
        raise ForbiddenError("Brak uprawnień: możesz modyfikować wyłącznie własne wpisy.")
    return entry


def update_progress_entry(session: Session, *, entry_id: int, instructor_id: int, changes: dict) -> ProgressEntry:
    entry = _get_own_entry(session, entry_id=entry_id, instructor_id=instructor_id)
    if "grade" in changes:
        entry.grade = changes["grade"].strip()
    if "route_name" in changes:
        r = changes["route_name"]
        entry.route_name = r.strip() if r and r.strip() else None
    if "instructor_feedback" in changes:
        entry.instructor_feedback = changes["instructor_feedback"].strip()
    session.commit()
    return _get_own_entry(session, entry_id=entry_id, instructor_id=instructor_id)


def delete_progress_entry(session: Session, *, entry_id: int, instructor_id: int) -> None:
    entry = _get_own_entry(session, entry_id=entry_id, instructor_id=instructor_id)
    session.delete(entry)
    session.commit()


def list_instructor_progress(session: Session, *, instructor_id: int, client_id: int | None = None) -> list[ProgressEntry]:
    stmt = (
        select(ProgressEntry).where(ProgressEntry.instructor_id == instructor_id)
        .options(*_progress_load_options()).order_by(ProgressEntry.created_at.desc(), ProgressEntry.id.desc())
    )
    if client_id is not None:
        ensure_valid_client_for_instructor(session, instructor_id=instructor_id, client_id=client_id, allow_existing_authored_entry=True)
        stmt = stmt.where(ProgressEntry.client_id == client_id)
    return list(session.scalars(stmt))
