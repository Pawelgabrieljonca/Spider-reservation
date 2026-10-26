import enum
from sqlalchemy import ForeignKey, Enum, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

class ReservationStatus(str, enum.Enum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"

class Reservation(Base, TimestampMixin):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("training_slots.id", ondelete="CASCADE"), nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    status: Mapped[ReservationStatus] = mapped_column(
        Enum(ReservationStatus), default=ReservationStatus.CONFIRMED, nullable=False
    )
    # Flaga dla recepcji/instruktora: klient potrzebuje wypożyczyć buty/uprząż:
    needs_equipment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    slot: Mapped["TrainingSlot"] = relationship(back_populates="reservations")
    client: Mapped["User"] = relationship(back_populates="reservations")

    __table_args__ = (
        # Uniemożliwia temu samemu klientowi podwójny zapis na ten sam termin:
        UniqueConstraint("slot_id", "client_id", name="uq_client_slot_reservation"),
    )