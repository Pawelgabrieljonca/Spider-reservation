"""Serwis powiadomień wewnątrz aplikacji (In-App Notification Center).

Obsługiwane scenariusze:
  - BOOKING_NEW: powiadomienie instruktora, gdy klient zapisze się na dyżur,
  - BOOKING_CONFIRMED: potwierdzenie w aplikacji dla klienta po rezerwacji,
  - BOOKING_CANCELLED: powiadomienie instruktora o odwołaniu wizyty przez klienta,
  - GROUP_SPOT_FREED: powiadomienie klientów, gdy zwolni się miejsce w grupie 1.5h,
  - REMINDER_24H: automatyczne przypomnienie o treningu w ciągu najbliższych 36h (idempotentne po dedupe_key),
  - PROGRESS_ADDED: powiadomienie klienta o nowym wpisie w Dzienniku postępów.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models import (
    InAppNotification,
    NotificationCategory,
    ProgressEntry,
    Reservation,
    ReservationStatus,
    SlotType,
    TrainingSlot,
    User,
    UserRole,
)
from app.services.exceptions import NotFoundError

CLUB_TIMEZONE = ZoneInfo("Europe/Warsaw")
REMINDER_WINDOW = timedelta(hours=36)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt_val: datetime) -> datetime:
    if dt_val.tzinfo is None:
        return dt_val.replace(tzinfo=timezone.utc)
    return dt_val.astimezone(timezone.utc)


def _format_local_slot(start_time: datetime, end_time: datetime) -> tuple[str, str, str]:
    local_start = _ensure_utc(start_time).astimezone(CLUB_TIMEZONE)
    local_end = _ensure_utc(end_time).astimezone(CLUB_TIMEZONE)
    date_str = local_start.strftime("%d.%m.%Y")
    start_hm = local_start.strftime("%H:%M")
    time_range = f"{start_hm}–{local_end.strftime('%H:%M')}"
    return date_str, start_hm, time_range


def _when_relative_label(start_time: datetime, now_utc: datetime) -> str:
    local_start = _ensure_utc(start_time).astimezone(CLUB_TIMEZONE)
    local_now = _ensure_utc(now_utc).astimezone(CLUB_TIMEZONE)
    hm = local_start.strftime("%H:%M")
    if local_start.date() == local_now.date():
        return f"dziś o {hm}"
    if local_start.date() == (local_now.date() + timedelta(days=1)):
        return f"jutro o {hm}"
    return f"{local_start.strftime('%d.%m')} o {hm}"


def _service_short_name(slot_type: SlotType) -> str:
    if slot_type == SlotType.GROUP_1_5H:
        return "trening w małej grupie (1.5h)"
    return "trening indywidualny (1h)"


def create_notification(
    session: Session,
    *,
    user_id: int,
    category: NotificationCategory | str,
    title: str,
    body: str,
    link_url: str | None = None,
    dedupe_key: str | None = None,
) -> InAppNotification | None:
    cat_val = category.value if isinstance(category, NotificationCategory) else str(category)
    if dedupe_key:
        existing = session.scalar(
            select(InAppNotification.id).where(InAppNotification.dedupe_key == dedupe_key)
        )
        if existing is not None:
            return None

    notif = InAppNotification(
        user_id=user_id,
        category=cat_val,
        title=title[:180],
        body=body[:600],
        link_url=link_url,
        is_read=False,
        dedupe_key=dedupe_key,
    )
    session.add(notif)
    return notif


def emit_reservation_created_notifications(session: Session, *, reservation_id: int) -> None:
    res = session.scalars(
        select(Reservation)
        .where(Reservation.id == reservation_id)
        .options(
            joinedload(Reservation.client),
            joinedload(Reservation.slot).joinedload(TrainingSlot.instructor),
        )
    ).one_or_none()
    if res is None or res.slot is None:
        return

    slot = res.slot
    client = res.client
    instructor = slot.instructor

    client_name = (
        f"{client.first_name} {client.last_name}".strip()
        if client is not None
        else f"Klient #{res.client_id}"
    )
    instructor_name = (
        f"{instructor.first_name} {instructor.last_name}".strip()
        if instructor is not None
        else "Instruktor CW Spider"
    )
    date_str, _, time_range = _format_local_slot(slot.start_time, slot.end_time)
    svc_label = _service_short_name(slot.slot_type)

    equip_info = ""
    if res.needs_equipment:
        if client is not None and client.shoe_size:
            equip_info = f" • Sprzęt (but EU {client.shoe_size})"
        else:
            equip_info = " • Wypożyczenie sprzętu"

    create_notification(
        session,
        user_id=slot.instructor_id,
        category=NotificationCategory.BOOKING_NEW,
        title="Nowy zapis na Twój dyżur",
        body=f"Klient {client_name} zapisał się na Twój dyżur ({date_str}, {time_range}, {svc_label}){equip_info}.",
        link_url="/app/instructor",
    )

    create_notification(
        session,
        user_id=res.client_id,
        category=NotificationCategory.BOOKING_CONFIRMED,
        title="Potwierdzono rezerwację treningu",
        body=f"Zarezerwowano {svc_label} z instruktorem {instructor_name} ({date_str}, {time_range}).",
        link_url="/app/client/reservations",
    )
    session.commit()


def emit_reservation_cancelled_notifications(
    session: Session,
    *,
    reservation_id: int,
    now: datetime | None = None,
) -> None:
    now_utc = _ensure_utc(now or _utcnow())
    res = session.scalars(
        select(Reservation)
        .where(Reservation.id == reservation_id)
        .options(
            joinedload(Reservation.client),
            joinedload(Reservation.slot)
            .joinedload(TrainingSlot.instructor),
            joinedload(Reservation.slot).joinedload(TrainingSlot.reservations),
        )
    ).unique().one_or_none()
    if res is None or res.slot is None:
        return

    slot = res.slot
    client = res.client
    instructor = slot.instructor

    client_name = (
        f"{client.first_name} {client.last_name}".strip()
        if client is not None
        else f"Klient #{res.client_id}"
    )
    instructor_name = (
        f"{instructor.first_name} {instructor.last_name}".strip()
        if instructor is not None
        else "Instruktor CW Spider"
    )
    date_str, start_hm, time_range = _format_local_slot(slot.start_time, slot.end_time)

    create_notification(
        session,
        user_id=slot.instructor_id,
        category=NotificationCategory.BOOKING_CANCELLED,
        title="Odwołana rezerwacja na dyżurze",
        body=f"Klient {client_name} odwołał wizytę w dniu {date_str} ({time_range}).",
        link_url="/app/instructor",
    )

    # Gdy zwalnia się miejsce w przyszłej grupie 1.5h, informujemy innych wspinaczy
    if slot.slot_type == SlotType.GROUP_1_5H and _ensure_utc(slot.start_time) > now_utc:
        already_in_group = {
            r.client_id
            for r in (slot.reservations or [])
            if r.status == ReservationStatus.CONFIRMED
        }
        excluded_ids = already_in_group | {res.client_id}

        recipient_ids = list(
            session.scalars(
                select(User.id)
                .where(
                    User.role == UserRole.CLIENT,
                    User.id.notin_(excluded_ids),
                )
                .order_by(User.id.desc())
                .limit(50)
            )
        )
        for uid in recipient_ids:
            create_notification(
                session,
                user_id=uid,
                category=NotificationCategory.GROUP_SPOT_FREED,
                title="Zwolniło się miejsce w grupie",
                body=f"Zwolniło się miejsce w grupie 1.5h u instruktora {instructor_name} ({date_str}, godz. {start_hm}).",
                link_url="/app/client",
            )

    session.commit()


def emit_progress_entry_notification(session: Session, *, entry_id: int) -> None:
    entry = session.scalars(
        select(ProgressEntry)
        .where(ProgressEntry.id == entry_id)
        .options(joinedload(ProgressEntry.instructor))
    ).one_or_none()
    if entry is None:
        return

    inst_name = (
        f"{entry.instructor.first_name} {entry.instructor.last_name}".strip()
        if entry.instructor is not None
        else "Instruktor"
    )
    route_part = f" ({entry.route_name})" if entry.route_name else ""
    create_notification(
        session,
        user_id=entry.client_id,
        category=NotificationCategory.PROGRESS_ADDED,
        title="Nowy wpis w Dzienniku postępów",
        body=f"Instruktor {inst_name} dodał wycenę {entry.grade}{route_part} do Twojego Dziennika postępów.",
        link_url="/app/client/progress",
    )
    session.commit()


def _experience_level_pl(level: str | None) -> str:
    if level == "BEGINNER":
        return "Początkujący"
    if level == "INTERMEDIATE":
        return "Średniozaawansowany"
    if level == "ADVANCED":
        return "Zaawansowany"
    return level or "—"


def emit_experience_verified_notification(
    session: Session,
    *,
    client_id: int,
    instructor_id: int,
    experience_level: str,
) -> None:
    instructor = session.scalar(select(User).where(User.id == instructor_id))
    inst_name = (
        f"{instructor.first_name} {instructor.last_name}".strip()
        if instructor is not None
        else "Instruktor CW Spider"
    )
    level_pl = _experience_level_pl(experience_level)
    create_notification(
        session,
        user_id=client_id,
        category=NotificationCategory.EXPERIENCE_VERIFIED,
        title="Zatwierdzono poziom wspinaczkowy",
        body=f"Instruktor {inst_name} zatwierdził Twój poziom zaawansowania: {level_pl}.",
        link_url="/app/client/profile",
    )
    session.commit()


def ensure_upcoming_reminders(
    session: Session,
    *,
    user: User,
    now: datetime | None = None,
) -> None:
    """Generuje idempotentne przypomnienia o zajęciach rozpoczynających się w ciągu najbliższych 36h."""
    now_utc = _ensure_utc(now or _utcnow())
    horizon_utc = now_utc + REMINDER_WINDOW
    added_any = False

    if user.role == UserRole.CLIENT:
        upcoming_res = list(
            session.scalars(
                select(Reservation)
                .join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
                .where(
                    Reservation.client_id == user.id,
                    Reservation.status == ReservationStatus.CONFIRMED,
                    TrainingSlot.start_time > now_utc,
                    TrainingSlot.start_time <= horizon_utc,
                )
                .options(joinedload(Reservation.slot).joinedload(TrainingSlot.instructor))
            )
        )
        for res in upcoming_res:
            slot = res.slot
            inst = slot.instructor
            inst_name = (
                f"{inst.first_name} {inst.last_name}".strip()
                if inst is not None
                else "Instruktor CW Spider"
            )
            when_str = _when_relative_label(slot.start_time, now_utc)
            created = create_notification(
                session,
                user_id=user.id,
                category=NotificationCategory.REMINDER_24H,
                title="Przypomnienie o nadchodzącym treningu",
                body=f"Przypomnienie: trening {when_str} z instruktorem {inst_name}.",
                link_url="/app/client/reservations",
                dedupe_key=f"rem24h:client:{user.id}:res:{res.id}",
            )
            if created is not None:
                added_any = True

    elif user.role == UserRole.INSTRUCTOR:
        upcoming_slots = list(
            session.scalars(
                select(TrainingSlot)
                .where(
                    TrainingSlot.instructor_id == user.id,
                    TrainingSlot.start_time > now_utc,
                    TrainingSlot.start_time <= horizon_utc,
                )
                .options(joinedload(TrainingSlot.reservations))
            ).unique()
        )
        for slot in upcoming_slots:
            confirmed = [
                r for r in (slot.reservations or []) if r.status == ReservationStatus.CONFIRMED
            ]
            if not confirmed:
                continue
            when_str = _when_relative_label(slot.start_time, now_utc)
            _, _, time_range = _format_local_slot(slot.start_time, slot.end_time)
            created = create_notification(
                session,
                user_id=user.id,
                category=NotificationCategory.REMINDER_24H,
                title="Przypomnienie o zajęciach na dyżurze",
                body=f"Przypomnienie: trening {when_str} ({time_range}, zapisani uczestnicy: {len(confirmed)}).",
                link_url="/app/instructor",
                dedupe_key=f"rem24h:inst:{user.id}:slot:{slot.id}",
            )
            if created is not None:
                added_any = True

    if added_any:
        try:
            session.commit()
        except IntegrityError:
            session.rollback()


def list_user_notifications(
    session: Session,
    *,
    user: User,
    limit: int = 25,
    now: datetime | None = None,
) -> dict:
    ensure_upcoming_reminders(session, user=user, now=now)

    unread_count = (
        session.scalar(
            select(func.count(InAppNotification.id)).where(
                InAppNotification.user_id == user.id,
                InAppNotification.is_read.is_(False),
            )
        )
        or 0
    )

    items = list(
        session.scalars(
            select(InAppNotification)
            .where(InAppNotification.user_id == user.id)
            .order_by(InAppNotification.created_at.desc(), InAppNotification.id.desc())
            .limit(limit)
        )
    )
    return {
        "unread_count": int(unread_count),
        "items": items,
    }


def mark_notification_read(
    session: Session,
    *,
    user_id: int,
    notification_id: int,
) -> InAppNotification:
    notif = session.scalar(
        select(InAppNotification).where(
            InAppNotification.id == notification_id,
            InAppNotification.user_id == user_id,
        )
    )
    if notif is None:
        raise NotFoundError("Powiadomienie nie istnieje.")
    if not notif.is_read:
        notif.is_read = True
        session.commit()
        session.refresh(notif)
    return notif


def mark_all_notifications_read(session: Session, *, user_id: int) -> dict:
    result = session.execute(
        update(InAppNotification)
        .where(
            InAppNotification.user_id == user_id,
            InAppNotification.is_read.is_(False),
        )
        .values(is_read=True)
    )
    session.commit()
    return {"updated_count": int(result.rowcount or 0)}

