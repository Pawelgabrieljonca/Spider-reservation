from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin

class ProgressEntry(Base, TimestampMixin):
    __tablename__ = "progress_entries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    instructor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Skala francuska (np. 5c, 6a, 6a+, 6b):
    grade: Mapped[str] = mapped_column(String(10), nullable=False)
    route_name: Mapped[str] = mapped_column(String(100), nullable=True)
    # Wskazówki techniczne (np. „praca na nogach”, „skręcanie biodra”):
    instructor_feedback: Mapped[str] = mapped_column(Text, nullable=False)

    client: Mapped["User"] = relationship(foreign_keys=[client_id], back_populates="progress_records")
    instructor: Mapped["User"] = relationship(foreign_keys=[instructor_id])