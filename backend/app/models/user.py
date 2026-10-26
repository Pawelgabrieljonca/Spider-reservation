import enum
from typing import List
from sqlalchemy import String, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

class UserRole(str, enum.Enum):
    CLIENT = "ROLE_CLIENT"
    INSTRUCTOR = "ROLE_INSTRUCTOR"
    ADMIN = "ROLE_ADMIN"

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Unikalny identyfikator UUID z Keycloaka:
    keycloak_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CLIENT, nullable=False)

    # Relacje SQLAlchemy:
    instructor_slots: Mapped[List["TrainingSlot"]] = relationship(back_populates="instructor", cascade="all, delete-orphan")
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="client")
    progress_records: Mapped[List["ProgressEntry"]] = relationship(
        foreign_keys="[ProgressEntry.client_id]", back_populates="client"
    )