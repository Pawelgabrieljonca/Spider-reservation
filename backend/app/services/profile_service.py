"""Obsługa profilu wspinacza (numer telefonu, rozmiar buta EU, poziom zaawansowania)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.services.exceptions import NotFoundError


def get_client_profile(session: Session, *, user_id: int) -> User:
    user = session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise NotFoundError("Konto użytkownika nie istnieje.")
    return user


def update_client_profile(
    session: Session,
    *,
    user_id: int,
    phone_number: str | None = None,
    shoe_size: str | None = None,
    experience_level: str | None = None,
) -> User:
    user = get_client_profile(session, user_id=user_id)
    user.phone_number = phone_number
    user.shoe_size = shoe_size
    user.experience_level = experience_level
    session.commit()
    session.refresh(user)
    return user

