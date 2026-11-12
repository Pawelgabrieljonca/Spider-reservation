"""Dziennik postępów – rejestracja wycen dróg (skala krakowska) i notatek instruktora.

Ścisła izolacja danych instruktora:
  - instruktor może przeglądać wyłącznie wpisy wystawione przez siebie lub należące
    do klientów, którzy mają u niego co najmniej jedną potwierdzoną rezerwację treningu,
  - próby podglądu lub dodania wpisu dla innego instruktora albo obcego klienta
    kończą się błędem 403 Forbidden (lub 404 Not Found, gdy konto nie istnieje).
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import ProgressEntry, Reservation, ReservationStatus, TrainingSlot, User, UserRole
from app.services import in_app_notification_service
from app.services.exceptions import ClientNotFoundError, ForbiddenError, NotFoundError

logger = logging.getLogger(__name__)


def _has_confirmed_training_with_instructor(
    session: Session,
    *,
    instructor_id: int,
    client_id: int,
) -> bool:
    """Sprawdza, czy klient ma co najmniej jedną potwierdzoną rezerwację u danego instruktora."""
    stmt = (
        select(Reservation.id)
        .join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
        .where(
            TrainingSlot.instructor_id == instructor_id,
            Reservation.client_id == client_id,
            Reservation.status == ReservationStatus.CONFIRMED,
        )
        .limit(1)
    )
    return session.scalar(stmt) is not None


def _progress_load_options():
    return (
        joinedload(ProgressEntry.instructor),
        joinedload(ProgressEntry.client).joinedload(User.experience_verified_by),
    )


def ensure_valid_client_for_instructor(
    session: Session,
    *,
    instructor_id: int,
    client_id: int,
    allow_existing_authored_entry: bool = False,
) -> User:
    """Weryfikuje istnienie klienta, jego rolę oraz relację treningową z instruktorem."""
    user = session.scalar(
        select(User)
        .where(User.id == client_id)
        .options(joinedload(User.experience_verified_by))
    )
    if user is None:
        raise ClientNotFoundError()

    if user.role != UserRole.CLIENT:
        raise ForbiddenError("Brak uprawnień: wskazane konto nie należy do klienta.")

    if _has_confirmed_training_with_instructor(
        session, instructor_id=instructor_id, client_id=client_id
    ):
        return user

    if allow_existing_authored_entry:
        authored = session.scalar(
            select(ProgressEntry.id)
            .where(
                ProgressEntry.instructor_id == instructor_id,
                ProgressEntry.client_id == client_id,
            )
            .limit(1)
        )
        if authored is not None:
            return user

    raise ForbiddenError(
        "Brak dostępu: klient nie odbył ani nie zarezerwował u Ciebie żadnego treningu."
    )


_ensure_valid_client_for_instructor = ensure_valid_client_for_instructor


def list_client_progress(session: Session, *, client_id: int) -> list[ProgressEntry]:
    """Pobiera wpisy postępu zalogowanego klienta (wyłącznie do własnego wglądu klienta)."""
    stmt = (
        select(ProgressEntry)
        .where(ProgressEntry.client_id == client_id)
        .options(*_progress_load_options())
        .order_by(ProgressEntry.created_at.desc(), ProgressEntry.id.desc())
    )
    return list(session.scalars(stmt))


def list_client_progress_for_instructor(
    session: Session,
    *,
    instructor_id: int,
    client_id: int,
) -> list[ProgressEntry]:
    """Pobiera historię postępów klienta dla instruktora (po weryfikacji relacji treningowej)."""
    ensure_valid_client_for_instructor(
        session,
        instructor_id=instructor_id,
        client_id=client_id,
        allow_existing_authored_entry=True,
    )
    return list_client_progress(session, client_id=client_id)


def create_progress_entry(
    session: Session,
    *,
    client_id: int,
    instructor_id: int,
    grade: str,
    instructor_feedback: str,
    route_name: str | None = None,
) -> ProgressEntry:
    """Tworzy nowy wpis w Dzienniku postępów wyłącznie dla klienta trenującego u instruktora."""
    ensure_valid_client_for_instructor(
        session,
        instructor_id=instructor_id,
        client_id=client_id,
        allow_existing_authored_entry=False,
    )

    entry = ProgressEntry(
        client_id=client_id,
        instructor_id=instructor_id,
        grade=grade.strip(),
        route_name=route_name.strip() if route_name else None,
        instructor_feedback=instructor_feedback.strip(),
    )
    session.add(entry)
    session.commit()

    try:
        in_app_notification_service.emit_progress_entry_notification(session, entry_id=entry.id)
    except Exception:
        session.rollback()
        logger.exception("Nie udało się zapisać powiadomienia in-app dla wpisu postępu #%s", entry.id)

    return session.scalars(
        select(ProgressEntry)
        .where(ProgressEntry.id == entry.id)
        .options(*_progress_load_options())
    ).one()


def _get_own_entry(session: Session, *, entry_id: int, instructor_id: int) -> ProgressEntry:
    """Zwraca wpis wyłącznie, jeśli został wystawiony przez wskazanego instruktora."""
    entry = session.scalar(
        select(ProgressEntry)
        .where(ProgressEntry.id == entry_id)
        .options(*_progress_load_options())
    )
    if entry is None:
        raise NotFoundError("Wpis w Dzienniku postępów nie istnieje.")
    if entry.instructor_id != instructor_id:
        raise ForbiddenError("Brak uprawnień: możesz modyfikować wyłącznie własne wpisy.")
    return entry


def update_progress_entry(
    session: Session,
    *,
    entry_id: int,
    instructor_id: int,
    changes: dict,
) -> ProgressEntry:
    """Edytuje wycenę, nazwę drogi lub notatkę własnego wpisu (np. poprawa literówki)."""
    entry = _get_own_entry(session, entry_id=entry_id, instructor_id=instructor_id)

    if "grade" in changes:
        entry.grade = changes["grade"].strip()
    if "route_name" in changes:
        route = changes["route_name"]
        entry.route_name = route.strip() if route and route.strip() else None
    if "instructor_feedback" in changes:
        entry.instructor_feedback = changes["instructor_feedback"].strip()

    session.commit()
    return _get_own_entry(session, entry_id=entry_id, instructor_id=instructor_id)


def delete_progress_entry(session: Session, *, entry_id: int, instructor_id: int) -> None:
    """Usuwa własny wpis z Dziennika postępów."""
    entry = _get_own_entry(session, entry_id=entry_id, instructor_id=instructor_id)
    session.delete(entry)
    session.commit()


def list_instructor_progress(
    session: Session,
    *,
    instructor_id: int,
    client_id: int | None = None,
) -> list[ProgressEntry]:
    """Pobiera wpisy wystawione przez zalogowanego instruktora."""
    stmt = (
        select(ProgressEntry)
        .where(ProgressEntry.instructor_id == instructor_id)
        .options(*_progress_load_options())
        .order_by(ProgressEntry.created_at.desc(), ProgressEntry.id.desc())
    )
    if client_id is not None:
        _ensure_valid_client_for_instructor(
            session,
            instructor_id=instructor_id,
            client_id=client_id,
            allow_existing_authored_entry=True,
        )
        stmt = stmt.where(ProgressEntry.client_id == client_id)
    return list(session.scalars(stmt))
