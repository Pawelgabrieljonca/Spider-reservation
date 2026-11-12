from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class InstructorClientNote(Base, TimestampMixin):
    """Prywatne notatki instruktora dotyczące podopiecznego (wskazówki do przygotowania treningu)."""

    __tablename__ = "instructor_client_notes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    instructor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)

    client: Mapped["User"] = relationship(
        foreign_keys=[client_id], back_populates="coaching_notes_about_client"
    )
    instructor: Mapped["User"] = relationship(foreign_keys=[instructor_id])

