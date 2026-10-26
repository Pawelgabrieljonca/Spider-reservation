import enum
from datetime import datetime
from typing import List
from sqlalchemy import DateTime, ForeignKey, Enum, Boolean, Integer, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

class SlotType(str, enum.Enum):
    INDIVIDUAL_1H = "INDIVIDUAL_1H"
    GROUP_1_5H = "GROUP_1_5H"

class TrainingSlot(Base, TimestampMixin):
    __tablename__ = "training_slots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    instructor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
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
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="slot", cascade="all, delete-orphan")

    __table_args__ = (
        # Constraint z prawidłowymi wartościami enuma bazodanowego:
        CheckConstraint(
            "(slot_type = 'INDIVIDUAL_1H' AND max_capacity = 1) OR (slot_type = 'GROUP_1_5H' AND max_capacity = 3)",
            name="check_slot_capacity_matches_type"
        ),
        CheckConstraint("end_time > start_time", name="check_end_after_start"),
    )