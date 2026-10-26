"""Moduł „Moja Cyfra” – rejestracja wycen dróg i notatek instruktora powiązanych z klientem."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import ProgressEntry, User
from app.services.exceptions import ClientNotFoundError


def list_client_progress(session: Session, *, client_id: int) -> list[ProgressEntry]:
    """Pobiera wpisy postępu danego klienta."""
    stmt = (
        select(ProgressEntry)
        .where(ProgressEntry.client_id == client_id)
        .options(joinedload(ProgressEntry.instructor), joinedload(ProgressEntry.client))
        .order_by(ProgressEntry.created_at.desc(), ProgressEntry.id.desc())
    )
    return list(session.scalars(stmt))


def create_progress_entry(
    session: Session,
    *,
    client_id: int,
    instructor_id: int,
    grade: str,
    instructor_feedback: str,
    route_name: str | None = None,
) -> ProgressEntry:
    """Tworzy nowy wpis postępu dla klienta w module „Moja Cyfra”."""
    client = session.scalar(select(User).where(User.id == client_id))
    if client is None:
        raise ClientNotFoundError()

    entry = ProgressEntry(
        client_id=client_id,
        instructor_id=instructor_id,
        grade=grade.strip(),
        route_name=route_name.strip() if route_name else None,
        instructor_feedback=instructor_feedback.strip(),
    )
    session.add(entry)
    session.commit()

    # Ponowne załadowanie z relacjami do serializacji w API
    return session.scalars(
        select(ProgressEntry)
        .where(ProgressEntry.id == entry.id)
        .options(joinedload(ProgressEntry.instructor), joinedload(ProgressEntry.client))
    ).one()


def list_instructor_progress(
    session: Session,
    *,
    instructor_id: int,
    client_id: int | None = None,
) -> list[ProgressEntry]:
    """Pobiera wpisy wystawione przez danego instruktora, opcjonalnie przefiltrowane po kliencie."""
    stmt = (
        select(ProgressEntry)
        .where(ProgressEntry.instructor_id == instructor_id)
        .options(joinedload(ProgressEntry.instructor), joinedload(ProgressEntry.client))
        .order_by(ProgressEntry.created_at.desc(), ProgressEntry.id.desc())
    )
    if client_id is not None:
        stmt = stmt.where(ProgressEntry.client_id == client_id)
    return list(session.scalars(stmt))
