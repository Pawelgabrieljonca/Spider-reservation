from __future__ import annotations

import base64
import html
import logging
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta

from icalendar import Calendar, Event
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.config import CLUB_TIMEZONE, EXPERIENCE_LABELS, SessionLocal, ensure_utc, enum_value, full_name, settings, utcnow
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

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="notification_worker")
SENDGRID_TIMEOUT_SECONDS = 10
ICS_FILENAME = "trening-cw-spider.ics"
LOCATION = "Centrum Wspinaczkowe Spider, Bydgoszcz"
REMINDER_WINDOW = timedelta(hours=36)


@dataclass(frozen=True)
class _ConfirmationData:
    reservation_id: int
    client_email: str
    client_first_name: str
    client_name: str
    instructor_name: str
    slot_start: datetime
    slot_end: datetime
    slot_type: str
    needs_equipment: bool


def _format_local_slot(start_time: datetime, end_time: datetime) -> tuple[str, str, str]:
    ls, le = ensure_utc(start_time).astimezone(CLUB_TIMEZONE), ensure_utc(end_time).astimezone(CLUB_TIMEZONE)
    start_hm = ls.strftime("%H:%M")
    return ls.strftime("%d.%m.%Y"), start_hm, f"{start_hm}–{le.strftime('%H:%M')}"


def _when_relative_label(start_time: datetime, now_utc: datetime) -> str:
    ls, ln = ensure_utc(start_time).astimezone(CLUB_TIMEZONE), ensure_utc(now_utc).astimezone(CLUB_TIMEZONE)
    hm = ls.strftime("%H:%M")
    if ls.date() == ln.date():
        return f"dziś o {hm}"
    if ls.date() == ln.date() + timedelta(days=1):
        return f"jutro o {hm}"
    return f"{ls.strftime('%d.%m')} o {hm}"


def _service_short_name(slot_type: SlotType) -> str:
    return "trening w małej grupie (1.5h)" if slot_type == SlotType.GROUP_1_5H else "trening indywidualny (1h)"


def create_notification(
    session: Session, *, user_id: int, category: NotificationCategory | str,
    title: str, body: str, link_url: str | None = None, dedupe_key: str | None = None,
) -> InAppNotification | None:
    cat_val = category.value if isinstance(category, NotificationCategory) else str(category)
    if dedupe_key and session.scalar(select(InAppNotification.id).where(InAppNotification.dedupe_key == dedupe_key)) is not None:
        return None
    notif = InAppNotification(
        user_id=user_id, category=cat_val, title=title[:180], body=body[:600],
        link_url=link_url, is_read=False, dedupe_key=dedupe_key,
    )
    session.add(notif)
    return notif


def _load_reservation(session: Session, reservation_id: int, with_slot_reservations: bool = False) -> Reservation | None:
    opts = [joinedload(Reservation.client), joinedload(Reservation.slot).joinedload(TrainingSlot.instructor)]
    if with_slot_reservations:
        opts.append(joinedload(Reservation.slot).joinedload(TrainingSlot.reservations))
        opts.append(joinedload(Reservation.slot).joinedload(TrainingSlot.availability_window))
    stmt = select(Reservation).where(Reservation.id == reservation_id).options(*opts)
    return session.scalars(stmt).unique().one_or_none() if with_slot_reservations else session.scalars(stmt).one_or_none()


def emit_reservation_created_notifications(session: Session, *, reservation_id: int) -> None:
    res = _load_reservation(session, reservation_id)
    if res is None or res.slot is None:
        return
    slot, client = res.slot, res.client
    date_str, _, time_range = _format_local_slot(slot.start_time, slot.end_time)
    svc = _service_short_name(slot.slot_type)
    equip = f" • Sprzęt (but EU {client.shoe_size})" if (res.needs_equipment and client and client.shoe_size) else (" • Wypożyczenie sprzętu" if res.needs_equipment else "")

    create_notification(
        session, user_id=slot.instructor_id, category=NotificationCategory.BOOKING_NEW,
        title="Nowy zapis na Twój dyżur",
        body=f"Klient {full_name(client, f'Klient #{res.client_id}')} zapisał się na Twój dyżur ({date_str}, {time_range}, {svc}){equip}.",
        link_url="/app/instructor",
    )
    create_notification(
        session, user_id=res.client_id, category=NotificationCategory.BOOKING_CONFIRMED,
        title="Potwierdzono rezerwację treningu",
        body=f"Zarezerwowano {svc} z instruktorem {full_name(slot.instructor, 'Instruktor CW Spider')} ({date_str}, {time_range}).",
        link_url="/app/client/reservations",
    )
    session.commit()


def emit_reservation_cancelled_notifications(session: Session, *, reservation_id: int, now: datetime | None = None) -> None:
    now_utc = ensure_utc(now or utcnow())
    res = _load_reservation(session, reservation_id, with_slot_reservations=True)
    if res is None or res.slot is None:
        return
    slot = res.slot
    date_str, start_hm, time_range = _format_local_slot(slot.start_time, slot.end_time)

    create_notification(
        session, user_id=slot.instructor_id, category=NotificationCategory.BOOKING_CANCELLED,
        title="Odwołana rezerwacja na dyżurze",
        body=f"Klient {full_name(res.client, f'Klient #{res.client_id}')} odwołał wizytę w dniu {date_str} ({time_range}).",
        link_url="/app/instructor",
    )

    window_blocked = bool(slot.availability_window and slot.availability_window.is_blocked)
    if (
        slot.slot_type == SlotType.GROUP_1_5H
        and ensure_utc(slot.start_time) > now_utc
        and not slot.is_blocked
        and not window_blocked
    ):
        excluded = {r.client_id for r in (slot.reservations or []) if r.status == ReservationStatus.CONFIRMED} | {res.client_id}
        recipients = list(
            session.scalars(select(User.id).where(User.role == UserRole.CLIENT, User.id.notin_(excluded)).order_by(User.id.desc()).limit(50))
        )
        inst_name = full_name(slot.instructor, "Instruktor CW Spider")
        for uid in recipients:
            create_notification(
                session, user_id=uid, category=NotificationCategory.GROUP_SPOT_FREED,
                title="Zwolniło się miejsce w grupie",
                body=f"Zwolniło się miejsce w grupie 1.5h u instruktora {inst_name} ({date_str}, godz. {start_hm}).",
                link_url="/app/client",
            )
    session.commit()


def emit_progress_entry_notification(session: Session, *, entry_id: int) -> None:
    entry = session.scalars(
        select(ProgressEntry).where(ProgressEntry.id == entry_id).options(joinedload(ProgressEntry.instructor))
    ).one_or_none()
    if entry is None:
        return
    route_part = f" ({entry.route_name})" if entry.route_name else ""
    create_notification(
        session, user_id=entry.client_id, category=NotificationCategory.PROGRESS_ADDED,
        title="Nowy wpis w Dzienniku postępów",
        body=f"Instruktor {full_name(entry.instructor, 'Instruktor')} dodał wycenę {entry.grade}{route_part} do Twojego Dziennika postępów.",
        link_url="/app/client/progress",
    )
    session.commit()


def emit_experience_verified_notification(session: Session, *, client_id: int, instructor_id: int, experience_level: str) -> None:
    instructor = session.scalar(select(User).where(User.id == instructor_id))
    level_pl = EXPERIENCE_LABELS.get(experience_level, experience_level or "—")
    create_notification(
        session, user_id=client_id, category=NotificationCategory.EXPERIENCE_VERIFIED,
        title="Zatwierdzono poziom wspinaczkowy",
        body=f"Instruktor {full_name(instructor, 'Instruktor CW Spider')} zatwierdził Twój poziom zaawansowania: {level_pl}.",
        link_url="/app/client/profile",
    )
    session.commit()


def ensure_upcoming_reminders(session: Session, *, user: User, now: datetime | None = None) -> None:
    now_utc = ensure_utc(now or utcnow())
    horizon = now_utc + REMINDER_WINDOW
    added = False

    if user.role == UserRole.CLIENT:
        upcoming = list(session.scalars(
            select(Reservation).join(TrainingSlot, TrainingSlot.id == Reservation.slot_id)
            .where(Reservation.client_id == user.id, Reservation.status == ReservationStatus.CONFIRMED,
                   TrainingSlot.start_time > now_utc, TrainingSlot.start_time <= horizon)
            .options(joinedload(Reservation.slot).joinedload(TrainingSlot.instructor))
        ))
        for res in upcoming:
            if create_notification(
                session, user_id=user.id, category=NotificationCategory.REMINDER_24H,
                title="Przypomnienie o nadchodzącym treningu",
                body=f"Przypomnienie: trening {_when_relative_label(res.slot.start_time, now_utc)} z instruktorem {full_name(res.slot.instructor, 'Instruktor CW Spider')}.",
                link_url="/app/client/reservations", dedupe_key=f"rem24h:client:{user.id}:res:{res.id}",
            ):
                added = True
    elif user.role == UserRole.INSTRUCTOR:
        upcoming = list(session.scalars(
            select(TrainingSlot)
            .where(TrainingSlot.instructor_id == user.id, TrainingSlot.start_time > now_utc, TrainingSlot.start_time <= horizon)
            .options(joinedload(TrainingSlot.reservations))
        ).unique())
        for slot in upcoming:
            confirmed = [r for r in (slot.reservations or []) if r.status == ReservationStatus.CONFIRMED]
            if not confirmed:
                continue
            _, _, time_range = _format_local_slot(slot.start_time, slot.end_time)
            if create_notification(
                session, user_id=user.id, category=NotificationCategory.REMINDER_24H,
                title="Przypomnienie o zajęciach na dyżurze",
                body=f"Przypomnienie: trening {_when_relative_label(slot.start_time, now_utc)} ({time_range}, zapisani uczestnicy: {len(confirmed)}).",
                link_url="/app/instructor", dedupe_key=f"rem24h:inst:{user.id}:slot:{slot.id}",
            ):
                added = True

    if added:
        try:
            session.commit()
        except IntegrityError:
            session.rollback()


def list_user_notifications(session: Session, *, user: User, limit: int = 25, now: datetime | None = None) -> dict:
    ensure_upcoming_reminders(session, user=user, now=now)
    unread = session.scalar(
        select(func.count(InAppNotification.id)).where(InAppNotification.user_id == user.id, InAppNotification.is_read.is_(False))
    ) or 0
    items = list(session.scalars(
        select(InAppNotification).where(InAppNotification.user_id == user.id)
        .order_by(InAppNotification.created_at.desc(), InAppNotification.id.desc()).limit(limit)
    ))
    return {"unread_count": int(unread), "items": items}


def mark_notification_read(session: Session, *, user_id: int, notification_id: int) -> InAppNotification:
    notif = session.scalar(select(InAppNotification).where(InAppNotification.id == notification_id, InAppNotification.user_id == user_id))
    if notif is None:
        raise NotFoundError("Powiadomienie nie istnieje.")
    if not notif.is_read:
        notif.is_read = True
        session.commit()
        session.refresh(notif)
    return notif


def mark_all_notifications_read(session: Session, *, user_id: int) -> dict:
    res = session.execute(
        update(InAppNotification).where(InAppNotification.user_id == user_id, InAppNotification.is_read.is_(False)).values(is_read=True)
    )
    session.commit()
    return {"updated_count": int(res.rowcount or 0)}


def generate_ics(d: _ConfirmationData) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//CW Spider Bydgoszcz//Spider Reservation System//PL")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    event = Event()
    event.add("uid", f"reservation-{d.reservation_id}@cw-spider.pl")
    event.add("dtstamp", utcnow())
    event.add("dtstart", ensure_utc(d.slot_start))
    event.add("dtend", ensure_utc(d.slot_end))
    event.add("summary", "Trening wspinaczkowy – CW Spider")
    event.add("description", f"Szczegóły: Trener: {d.instructor_name}, Typ: {d.slot_type}, Wypożyczenie sprzętu: {'tak' if d.needs_equipment else 'nie'}.")
    event.add("location", LOCATION)
    event.add("status", "CONFIRMED")
    event.add("comment", f"Rezerwacja dla: {d.client_name}")
    cal.add_component(event)
    return cal.to_ical()


def _is_live_mode() -> bool:
    return bool(settings.NOTIFICATIONS_ENABLED and settings.SENDGRID_API_KEY)


def _format_dt(value: datetime) -> str:
    return ensure_utc(value).astimezone(CLUB_TIMEZONE).strftime("%d.%m.%Y %H:%M")


def _send_via_sendgrid(to_email: str, subject: str, html_content: str, ics_bytes: bytes | None = None) -> int:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Attachment, Disposition, FileContent, FileName, FileType, Mail

    message = Mail(from_email=settings.SENDGRID_FROM_EMAIL, to_emails=to_email, subject=subject, html_content=html_content)
    if ics_bytes is not None:
        message.attachment = Attachment(
            FileContent(base64.b64encode(ics_bytes).decode("ascii")),
            FileName(ICS_FILENAME), FileType("text/calendar"), Disposition("attachment"),
        )
    client = SendGridAPIClient(settings.SENDGRID_API_KEY)
    client.client.timeout = SENDGRID_TIMEOUT_SECONDS
    try:
        return client.send(message).status_code
    except Exception as exc:
        body = getattr(exc, "body", None)
        if body:
            logger.error("SendGrid odrzucił żądanie (%s): %s", getattr(exc, "status_code", "?"), body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body)
        raise


def _html_layout(title: str, body: str) -> str:
    return (
        f'<div style="font-family:Arial,sans-serif;max-width:600px;color:#1e293b;line-height:1.6;">'
        f'<h2 style="color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">{title}</h2>'
        f'{body}<p style="font-size:12px;color:#94a3b8;margin-top:30px;">Wiadomość wygenerowana automatycznie przez system rezerwacji CW Spider.</p></div>'
    )


def _load_confirmation_data(reservation_id: int) -> _ConfirmationData | None:
    with SessionLocal() as session:
        res = _load_reservation(session, reservation_id)
        if res is None or res.slot is None or res.client is None or not res.client.email:
            logger.warning("Powiadomienie CONFIRMED: brak danych rezerwacji/klienta id=%s", reservation_id)
            return None
        c, s = res.client, res.slot
        return _ConfirmationData(
            res.id, c.email, c.first_name or "", full_name(c, "Klient CW Spider"),
            full_name(s.instructor, "Instruktor CW Spider"), s.start_time, s.end_time,
            enum_value(s.slot_type), bool(res.needs_equipment),
        )


def _confirmed_job(reservation_id: int) -> None:
    try:
        d = _load_confirmation_data(reservation_id)
        if d is None:
            return
        ics = generate_ics(d)
        start_txt = _format_dt(d.slot_start)
        if not _is_live_mode():
            logger.info("[NOTIFICATION MOCK] Typ: CONFIRMED | Do: %s | Termin: %s | Instruktor: %s | Załącznik .ics wygenerowany poprawnie", d.client_email, start_txt, d.instructor_name)
            return
        e = html.escape
        body = (
            f"<p>Cześć <strong>{e(d.client_first_name)}</strong>,</p><p>Twój trening wspinaczkowy został potwierdzony:</p>"
            f"<ul><li><strong>Termin:</strong> {e(start_txt)}</li><li><strong>Typ:</strong> {e(d.slot_type)}</li>"
            f"<li><strong>Instruktor:</strong> {e(d.instructor_name)}</li><li><strong>Sprzęt:</strong> {'tak' if d.needs_equipment else 'nie'}</li>"
            f"<li><strong>Miejsce:</strong> {e(LOCATION)}</li></ul>"
            f"<p>W załączniku znajdziesz plik .ics do kalendarza. Bezpłatne odwołanie możliwe do <strong>12 godzin</strong> przed zajęciami.</p>"
        )
        status = _send_via_sendgrid(d.client_email, f"Potwierdzenie rezerwacji treningu ({start_txt}) – CW Spider", _html_layout("CW Spider – potwierdzenie rezerwacji", body), ics)
        logger.info("SendGrid: wysłano CONFIRMED #%s do %s (HTTP %s)", d.reservation_id, d.client_email, status)
    except Exception:
        logger.exception("Błąd wysyłki powiadomienia CONFIRMED dla rezerwacji #%s", reservation_id)


def _cancelled_job(client_email: str, client_name: str, start_time: datetime, instructor_name: str) -> None:
    try:
        start_txt = _format_dt(start_time)
        if not _is_live_mode():
            logger.info("[NOTIFICATION MOCK] Typ: CANCELLED | Do: %s | Termin: %s | Instruktor: %s", client_email, start_txt, instructor_name)
            return
        e = html.escape
        body = (
            f"<p>Dzień dobry <strong>{e(client_name)}</strong>,</p><p>Potwierdzamy anulowanie rezerwacji:</p>"
            f"<ul><li><strong>Termin:</strong> {e(start_txt)}</li><li><strong>Instruktor:</strong> {e(instructor_name)}</li></ul>"
            f"<p>Termin został zwolniony w grafiku.</p>"
        )
        status = _send_via_sendgrid(client_email, f"Anulowanie rezerwacji treningu ({start_txt}) – CW Spider", _html_layout("CW Spider – anulowanie rezerwacji", body))
        logger.info("SendGrid: wysłano CANCELLED do %s (HTTP %s)", client_email, status)
    except Exception:
        logger.exception("Błąd wysyłki powiadomienia CANCELLED do %s", client_email)


def notify_reservation_confirmed(reservation_id: int) -> Future:
    return _executor.submit(_confirmed_job, reservation_id)


def notify_reservation_cancelled(client_email: str, client_name: str, start_time: datetime, instructor_name: str) -> Future:
    return _executor.submit(_cancelled_job, client_email, client_name, start_time, instructor_name)
