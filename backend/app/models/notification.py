import enum
from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, TimestampMixin


class NotificationCategory(str, enum.Enum):
    BOOKING_NEW = "BOOKING_NEW"
    BOOKING_CONFIRMED = "BOOKING_CONFIRMED"
    BOOKING_CANCELLED = "BOOKING_CANCELLED"
    GROUP_SPOT_FREED = "GROUP_SPOT_FREED"
    REMINDER_24H = "REMINDER_24H"
    PROGRESS_ADDED = "PROGRESS_ADDED"


class InAppNotification(Base, TimestampMixin):
    """Powiadomienie wewnątrz aplikacji wyświetlane w centrum powiadomień (dzwonek w Navbarze)."""

    __tablename__ = "in_app_notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    body: Mapped[str] = mapped_column(String(600), nullable=False)
    link_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    dedupe_key: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)

    user: Mapped["User"] = relationship(back_populates="notifications")

