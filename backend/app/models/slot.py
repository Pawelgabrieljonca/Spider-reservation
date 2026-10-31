import enum
from datetime import datetime
from typing import List
from sqlalchemy import DateTime, ForeignKey, Enum, Boolean, Integer, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class SlotType(str, enum.Enum):
    INDIVIDUAL_1H = "INDIVIDUAL_1H"
    GROUP_1_5H = "GROUP_1_5H"


class AvailabilityWindow(Base, TimestampMixin):
    """Elastyczne okno dyspozycyjności (dyżur) instruktora, np. 14:00–20:00."""

    __tablename__ = "availability_windows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    instructor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Instruktor może tymczasowo wyłączyć dyżur z nowych zapisów klientów:
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    instructor: Mapped["User"] = relationship(back_populates="availability_windows")
    slots: Mapped[List["TrainingSlot"]] = relationship(back_populates="availability_window")

    __table_args__ = (
        CheckConstraint("end_time > start_time", name="check_window_end_after_start"),
    )


class TrainingSlot(Base, TimestampMixin):
    """Konkretna sesja treningowa (1h lub 1.5h) wydzielona w ramach dyżuru instruktora."""

    __tablename__ = "training_slots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    instructor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    availability_window_id: Mapped[int | None] = mapped_column(
        ForeignKey("availability_windows.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    slot_type: Mapped[SlotType] = mapped_column(
        Enum(SlotType, name="slot_type_enum", native_enum=True),
        nullable=False
    )
    # Maksymalna liczba uczestników:
    max_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Instruktor może natychmiast wyłączyć slot z widoku publicznego:
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    instructor: Mapped["User"] = relationship(back_populates="instructor_slots")
    availability_window: Mapped["AvailabilityWindow | None"] = relationship(back_populates="slots")
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="slot", cascade="all, delete-orphan")

    __table_args__ = (
        # Constraint z prawidłowymi wartościami enuma bazodanowego:
        CheckConstraint(
            "(slot_type = 'INDIVIDUAL_1H' AND max_capacity = 1) OR (slot_type = 'GROUP_1_5H' AND max_capacity = 3)",
            name="check_slot_capacity_matches_type"
        ),
        CheckConstraint("end_time > start_time", name="check_end_after_start"),
    )
