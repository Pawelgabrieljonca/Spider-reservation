import enum
from datetime import datetime
from typing import List

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UserRole(str, enum.Enum):
    CLIENT = "ROLE_CLIENT"
    INSTRUCTOR = "ROLE_INSTRUCTOR"
    ADMIN = "ROLE_ADMIN"


class ExperienceLevel(str, enum.Enum):
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"


class SlotType(str, enum.Enum):
    INDIVIDUAL_1H = "INDIVIDUAL_1H"
    GROUP_1_5H = "GROUP_1_5H"


class ReservationStatus(str, enum.Enum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class NotificationCategory(str, enum.Enum):
    BOOKING_NEW = "BOOKING_NEW"
    BOOKING_CONFIRMED = "BOOKING_CONFIRMED"
    BOOKING_CANCELLED = "BOOKING_CANCELLED"
    GROUP_SPOT_FREED = "GROUP_SPOT_FREED"
    REMINDER_24H = "REMINDER_24H"
    PROGRESS_ADDED = "PROGRESS_ADDED"
    EXPERIENCE_VERIFIED = "EXPERIENCE_VERIFIED"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    keycloak_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    shoe_size: Mapped[str | None] = mapped_column(String(16), nullable=True)
    experience_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    experience_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    experience_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    experience_verified_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CLIENT, nullable=False)

    experience_verified_by: Mapped["User | None"] = relationship("User", foreign_keys=[experience_verified_by_id], remote_side="User.id")
    availability_windows: Mapped[List["AvailabilityWindow"]] = relationship(back_populates="instructor", cascade="all, delete-orphan")
    instructor_slots: Mapped[List["TrainingSlot"]] = relationship(back_populates="instructor", cascade="all, delete-orphan")
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="client")
    progress_records: Mapped[List["ProgressEntry"]] = relationship(foreign_keys="[ProgressEntry.client_id]", back_populates="client")
    coaching_notes_about_client: Mapped[List["InstructorClientNote"]] = relationship(
        foreign_keys="[InstructorClientNote.client_id]", back_populates="client", cascade="all, delete-orphan"
    )
    notifications: Mapped[List["InAppNotification"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AvailabilityWindow(Base, TimestampMixin):
    __tablename__ = "availability_windows"
    __table_args__ = (CheckConstraint("end_time > start_time", name="check_window_end_after_start"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    instructor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    instructor: Mapped["User"] = relationship(back_populates="availability_windows")
    slots: Mapped[List["TrainingSlot"]] = relationship(back_populates="availability_window")


class TrainingSlot(Base, TimestampMixin):
    __tablename__ = "training_slots"
    __table_args__ = (
        CheckConstraint(
            "(slot_type = 'INDIVIDUAL_1H' AND max_capacity = 1) OR (slot_type = 'GROUP_1_5H' AND max_capacity = 3)",
            name="check_slot_capacity_matches_type",
        ),
        CheckConstraint("end_time > start_time", name="check_end_after_start"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    instructor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    availability_window_id: Mapped[int | None] = mapped_column(ForeignKey("availability_windows.id", ondelete="SET NULL"), nullable=True, index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    slot_type: Mapped[SlotType] = mapped_column(Enum(SlotType, name="slot_type_enum", native_enum=True), nullable=False)
    max_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    instructor: Mapped["User"] = relationship(back_populates="instructor_slots")
    availability_window: Mapped["AvailabilityWindow | None"] = relationship(back_populates="slots")
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="slot", cascade="all, delete-orphan")


class Reservation(Base, TimestampMixin):
    __tablename__ = "reservations"
    __table_args__ = (UniqueConstraint("slot_id", "client_id", name="uq_client_slot_reservation"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("training_slots.id", ondelete="CASCADE"), nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[ReservationStatus] = mapped_column(Enum(ReservationStatus), default=ReservationStatus.CONFIRMED, nullable=False)
    needs_equipment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    slot: Mapped["TrainingSlot"] = relationship(back_populates="reservations")
    client: Mapped["User"] = relationship(back_populates="reservations")


class ProgressEntry(Base, TimestampMixin):
    __tablename__ = "progress_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    instructor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    grade: Mapped[str] = mapped_column(String(10), nullable=False)
    route_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    instructor_feedback: Mapped[str] = mapped_column(Text, nullable=False)

    client: Mapped["User"] = relationship(foreign_keys=[client_id], back_populates="progress_records")
    instructor: Mapped["User | None"] = relationship(foreign_keys=[instructor_id])


class InstructorClientNote(Base, TimestampMixin):
    __tablename__ = "instructor_client_notes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    instructor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    client: Mapped["User"] = relationship(foreign_keys=[client_id], back_populates="coaching_notes_about_client")
    instructor: Mapped["User"] = relationship(foreign_keys=[instructor_id])


class InAppNotification(Base, TimestampMixin):
    __tablename__ = "in_app_notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    body: Mapped[str] = mapped_column(String(600), nullable=False)
    link_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    dedupe_key: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)

    user: Mapped["User"] = relationship(back_populates="notifications")
