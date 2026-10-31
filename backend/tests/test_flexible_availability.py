"""Testy integracyjne i współbieżnościowe dla elastycznych okien dyżurów (Booksy/Calendly)."""

import threading
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import DateTime, TypeDecorator, create_engine, delete
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import database as db_module
from app.core import security as sec_module
from app.main import create_app
from app.models import (
    AvailabilityWindow,
    Base,
    SlotType,
    User,
    UserRole,
)
from app.services import reservation_service
from app.services.exceptions import SlotFullError, SlotOverlapError


class TZDateTime(TypeDecorator):
    """Adapter zachowujący strefę UTC w pamięciowym silniku SQLite podczas testów HTTP."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            else:
                value = value.astimezone(timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class FlexibleAvailabilityIntegrationTests(unittest.TestCase):
    """Weryfikacja pełnego przepływu HTTP dla dyżurów instruktora i dynamicznych rezerwacji."""

    def tearDown(self):
        # Przywracamy natywny typ DateTime(timezone=True) w metadanych SQLAlchemy po teście SQLite
        for table in Base.metadata.tables.values():
            for col in table.columns:
                if isinstance(col.type, TZDateTime):
                    col.type = DateTime(timezone=True)

    def test_flexible_shifts_dynamic_slots_and_group_joining(self):
        test_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        for table in Base.metadata.tables.values():
            for col in table.columns:
                if isinstance(col.type, DateTime):
                    col.type = TZDateTime()

        Base.metadata.create_all(bind=test_engine)
        TestSessionLocal = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
        test_scoped = scoped_session(TestSessionLocal)

        tokens = {
            "inst-1": {
                "sub": "kc-inst-1",
                "email": "tomasz@spider.test",
                "given_name": "Tomasz",
                "family_name": "Kowalski",
                "realm_access": {"roles": ["ROLE_INSTRUCTOR"]},
            },
            "client-a": {
                "sub": "kc-client-a",
                "email": "anna@spider.test",
                "given_name": "Anna",
                "family_name": "Zielińska",
                "realm_access": {"roles": ["ROLE_CLIENT"]},
            },
            "client-b": {
                "sub": "kc-client-b",
                "email": "jan@spider.test",
                "given_name": "Jan",
                "family_name": "Wiśniewski",
                "realm_access": {"roles": ["ROLE_CLIENT"]},
            },
            "client-c": {
                "sub": "kc-client-c",
                "email": "ewa@spider.test",
                "given_name": "Ewa",
                "family_name": "Kaczmarek",
                "realm_access": {"roles": ["ROLE_CLIENT"]},
            },
            "client-d": {
                "sub": "kc-client-d",
                "email": "piotr@spider.test",
                "given_name": "Piotr",
                "family_name": "Mazur",
                "realm_access": {"roles": ["ROLE_CLIENT"]},
            },
            "admin": {
                "sub": "kc-admin-1",
                "email": "admin@spider.test",
                "given_name": "Adam",
                "family_name": "Admin",
                "realm_access": {"roles": ["ROLE_ADMIN"]},
            },
        }

        with (
            patch.object(db_module, "db_session", test_scoped),
            patch.object(sec_module, "db_session", test_scoped),
            patch("app.api.instructor.slots.db_session", test_scoped),
            patch("app.api.client.slots.db_session", test_scoped),
            patch("app.api.client.reservations.db_session", test_scoped),
            patch("app.api.admin.db_session", test_scoped),
            patch.object(sec_module, "_decode_token", side_effect=lambda tok: tokens[tok]),
            patch("app.services.notification_service.notify_reservation_confirmed"),
            patch("app.services.notification_service.notify_reservation_cancelled"),
        ):
            app = create_app()
            client = app.test_client()
            auth = lambda tok: {"Authorization": f"Bearer {tok}"}  # noqa: E731

            target_day = (datetime.now(timezone.utc) + timedelta(days=3)).date()
            d_str = target_day.isoformat()

            # 1. Walidacja okna dyżuru: < 60 min (422), poza 09:00-22:00 (422), poprawny 14:00-20:00 (201)
            r_short = client.post(
                "/api/v1/instructor/slots",
                headers=auth("inst-1"),
                json={
                    "start_time": f"{d_str}T14:00:00+01:00",
                    "end_time": f"{d_str}T14:30:00+01:00",
                },
            )
            self.assertEqual(r_short.status_code, 422)

            r_outside = client.post(
                "/api/v1/instructor/slots",
                headers=auth("inst-1"),
                json={
                    "start_time": f"{d_str}T08:30:00+01:00",
                    "end_time": f"{d_str}T12:00:00+01:00",
                },
            )
            self.assertEqual(r_outside.status_code, 422)

            r_win = client.post(
                "/api/v1/instructor/slots",
                headers=auth("inst-1"),
                json={
                    "start_time": f"{d_str}T14:00:00+01:00",
                    "end_time": f"{d_str}T20:00:00+01:00",
                },
            )
            self.assertEqual(r_win.status_code, 201)
            win_id = r_win.get_json()["id"]
            self.assertEqual(r_win.get_json()["duration_minutes"], 360)

            # Kolizja nakładającego się dyżuru (409) oraz seryjne dodawanie na kolejne dni (201)
            r_overlap = client.post(
                "/api/v1/instructor/slots",
                headers=auth("inst-1"),
                json={
                    "start_time": f"{d_str}T18:00:00+01:00",
                    "end_time": f"{d_str}T21:00:00+01:00",
                },
            )
            self.assertEqual(r_overlap.status_code, 409)

            next_day = target_day + timedelta(days=1)
            r_bulk = client.post(
                "/api/v1/instructor/slots/bulk",
                headers=auth("inst-1"),
                json={
                    "windows": [
                        {
                            "start_time": f"{next_day.isoformat()}T10:00:00+01:00",
                            "end_time": f"{next_day.isoformat()}T14:00:00+01:00",
                        }
                    ]
                },
            )
            self.assertEqual(r_bulk.status_code, 201)
            self.assertEqual(r_bulk.get_json()["created_count"], 1)

            # 2. Dynamiczne wyliczanie godzin startu (1h -> 11 opcji 14:00..19:00, 1.5h -> 10 opcji 14:00..18:30)
            q_from = f"{d_str}T00:00:00+01:00"
            q_to = f"{d_str}T23:59:59+01:00"

            slots_1h = client.get(
                "/api/v1/client/slots",
                headers=auth("client-a"),
                query_string={"date_from": q_from, "date_to": q_to, "slot_type": "INDIVIDUAL_1H"},
            ).get_json()
            self.assertEqual(len(slots_1h), 11)

            slots_15h = client.get(
                "/api/v1/client/slots",
                headers=auth("client-a"),
                query_string={"date_from": q_from, "date_to": q_to, "slot_type": "GROUP_1_5H"},
            ).get_json()
            self.assertEqual(len(slots_15h), 10)

            # 3. Rezerwacja grupy 1.5h (14:00–15:30) przez Klienta A i dołączanie Klientów B, C (limit 3 os.)
            r_grp_a = client.post(
                "/api/v1/client/reservations",
                headers=auth("client-a"),
                json={
                    "availability_window_id": win_id,
                    "start_time": f"{d_str}T14:00:00+01:00",
                    "slot_type": "GROUP_1_5H",
                    "needs_equipment": True,
                },
            )
            self.assertEqual(r_grp_a.status_code, 201)

            slots_b_grp = client.get(
                "/api/v1/client/slots",
                headers=auth("client-b"),
                query_string={"date_from": q_from, "date_to": q_to, "slot_type": "GROUP_1_5H"},
            ).get_json()
            self.assertEqual(len(slots_b_grp), 8)
            self.assertTrue(slots_b_grp[0]["is_joining_group"])
            self.assertEqual(slots_b_grp[0]["free_places"], 2)

            # Dla klienta szukającego 1h przedział 14:00–15:30 jest całkowicie zajęty (starty od 15:30)
            slots_b_ind = client.get(
                "/api/v1/client/slots",
                headers=auth("client-b"),
                query_string={"date_from": q_from, "date_to": q_to, "slot_type": "INDIVIDUAL_1H"},
            ).get_json()
            self.assertEqual(len(slots_b_ind), 8)

            r_force_1h = client.post(
                "/api/v1/client/reservations",
                headers=auth("client-b"),
                json={
                    "availability_window_id": win_id,
                    "start_time": f"{d_str}T14:00:00+01:00",
                    "slot_type": "INDIVIDUAL_1H",
                },
            )
            self.assertEqual(r_force_1h.status_code, 409)

            self.assertEqual(
                client.post(
                    "/api/v1/client/reservations",
                    headers=auth("client-b"),
                    json={
                        "availability_window_id": win_id,
                        "start_time": f"{d_str}T14:00:00+01:00",
                        "slot_type": "GROUP_1_5H",
                    },
                ).status_code,
                201,
            )
            self.assertEqual(
                client.post(
                    "/api/v1/client/reservations",
                    headers=auth("client-c"),
                    json={
                        "availability_window_id": win_id,
                        "start_time": f"{d_str}T14:00:00+01:00",
                        "slot_type": "GROUP_1_5H",
                    },
                ).status_code,
                201,
            )

            # Czwarty uczestnik w tej samej grupie 1.5h otrzymuje 409 SLOT_FULL
            r_full = client.post(
                "/api/v1/client/reservations",
                headers=auth("client-d"),
                json={
                    "availability_window_id": win_id,
                    "start_time": f"{d_str}T14:00:00+01:00",
                    "slot_type": "GROUP_1_5H",
                },
            )
            self.assertEqual(r_full.status_code, 409)
            self.assertEqual(r_full.get_json()["status"], "SLOT_FULL")

            # 4. Rezerwacja indywidualna 1h (17:00–18:00) i przywrócenie puli po anulowaniu
            r_ind_d = client.post(
                "/api/v1/client/reservations",
                headers=auth("client-d"),
                json={
                    "availability_window_id": win_id,
                    "start_time": f"{d_str}T17:00:00+01:00",
                    "slot_type": "INDIVIDUAL_1H",
                },
            )
            self.assertEqual(r_ind_d.status_code, 201)
            res_d_id = r_ind_d.get_json()["id"]

            r_cancel_d = client.delete(
                f"/api/v1/client/reservations/{res_d_id}",
                headers=auth("client-d"),
            )
            self.assertEqual(r_cancel_d.status_code, 200)

            slots_restored = client.get(
                "/api/v1/client/slots",
                headers=auth("client-b"),
                query_string={"date_from": q_from, "date_to": q_to, "slot_type": "INDIVIDUAL_1H"},
            ).get_json()
            self.assertEqual(len(slots_restored), 8)

            # 5. Grafik instruktora i zestawienie godzin w panelu admina
            inst_windows = client.get("/api/v1/instructor/slots", headers=auth("inst-1")).get_json()
            self.assertEqual(len(inst_windows), 2)

            admin_avail = client.get(
                "/api/v1/admin/instructors-availability", headers=auth("admin")
            ).get_json()
            self.assertEqual(admin_avail["totals"]["planned_1_5h_count"], 1)
            self.assertEqual(admin_avail["totals"]["planned_minutes"], 600)


class PostgresConcurrencyLockingTests(unittest.TestCase):
    """Wielowątkowe testy blokad wierszowych SELECT ... FOR UPDATE na PostgreSQL."""

    def test_concurrent_overlapping_intervals_and_group_capacity(self):
        SessionLocal = db_module.SessionLocal
        tag = uuid.uuid4().hex[:8]
        created_user_ids: list[int] = []
        created_window_id: int | None = None

        setup_session = SessionLocal()
        try:
            inst = User(
                keycloak_id=f"conc-inst-{tag}",
                email=f"conc-inst-{tag}@spider.test",
                first_name="Trener",
                last_name="Wspolbiezny",
                role=UserRole.INSTRUCTOR,
            )
            clients = [
                User(
                    keycloak_id=f"conc-cli-{i}-{tag}",
                    email=f"conc-cli-{i}-{tag}@spider.test",
                    first_name=f"Klient{i}",
                    last_name="Testowy",
                    role=UserRole.CLIENT,
                )
                for i in range(6)
            ]
            setup_session.add(inst)
            setup_session.add_all(clients)
            setup_session.commit()

            created_user_ids = [inst.id] + [c.id for c in clients]
            client_ids = [c.id for c in clients]

            future_day = (datetime.now(timezone.utc) + timedelta(days=5)).date()
            win_start = datetime(
                future_day.year, future_day.month, future_day.day, 13, 0, tzinfo=timezone.utc
            )
            win_end = datetime(
                future_day.year, future_day.month, future_day.day, 19, 0, tzinfo=timezone.utc
            )

            win = AvailabilityWindow(
                instructor_id=inst.id,
                start_time=win_start,
                end_time=win_end,
                is_blocked=False,
            )
            setup_session.add(win)
            setup_session.commit()
            created_window_id = win.id

            # Scenariusz 1: równoczesny wyścig o nakładające się przedziały wewnątrz tego samego dyżuru
            attempts_overlap = [
                (client_ids[0], win_start, SlotType.INDIVIDUAL_1H),
                (client_ids[1], win_start + timedelta(minutes=30), SlotType.GROUP_1_5H),
                (client_ids[2], win_start + timedelta(minutes=30), SlotType.INDIVIDUAL_1H),
                (client_ids[3], win_start, SlotType.GROUP_1_5H),
            ]
            barrier_1 = threading.Barrier(len(attempts_overlap))
            outcomes_1 = []
            lock_1 = threading.Lock()

            def worker_overlap(cid, st, stype):
                s = SessionLocal()
                try:
                    barrier_1.wait()
                    with patch("app.services.notification_service.notify_reservation_confirmed"):
                        res = reservation_service.create_reservation(
                            s,
                            client_id=cid,
                            availability_window_id=created_window_id,
                            start_time=st,
                            slot_type=stype,
                        )
                    with lock_1:
                        outcomes_1.append(("OK", res.slot.start_time, res.slot.end_time, stype))
                except SlotOverlapError:
                    with lock_1:
                        outcomes_1.append(("OVERLAP", st, None, stype))
                finally:
                    s.close()

            threads_1 = [threading.Thread(target=worker_overlap, args=a) for a in attempts_overlap]
            for t in threads_1:
                t.start()
            for t in threads_1:
                t.join()

            ok_1 = [o for o in outcomes_1 if o[0] == "OK"]
            self.assertGreaterEqual(len(ok_1), 1)
            for i in range(len(ok_1)):
                for j in range(i + 1, len(ok_1)):
                    _, s1, e1, t1 = ok_1[i]
                    _, s2, e2, t2 = ok_1[j]
                    same_group = (
                        t1 == SlotType.GROUP_1_5H
                        and t2 == SlotType.GROUP_1_5H
                        and s1 == s2
                        and e1 == e2
                    )
                    if not same_group:
                        self.assertFalse(s1 < e2 and e1 > s2)

            # Scenariusz 2: 6 wątków uderza jednocześnie w tę samą grupę 1.5h (limit 3 os.)
            grp_start = win_start + timedelta(hours=4, minutes=30)
            barrier_2 = threading.Barrier(6)
            outcomes_2 = []
            lock_2 = threading.Lock()

            def worker_group(cid):
                s = SessionLocal()
                try:
                    barrier_2.wait()
                    with patch("app.services.notification_service.notify_reservation_confirmed"):
                        reservation_service.create_reservation(
                            s,
                            client_id=cid,
                            availability_window_id=created_window_id,
                            start_time=grp_start,
                            slot_type=SlotType.GROUP_1_5H,
                        )
                    with lock_2:
                        outcomes_2.append("OK")
                except SlotFullError:
                    with lock_2:
                        outcomes_2.append("FULL")
                finally:
                    s.close()

            threads_2 = [threading.Thread(target=worker_group, args=(cid,)) for cid in client_ids]
            for t in threads_2:
                t.start()
            for t in threads_2:
                t.join()

            self.assertEqual(outcomes_2.count("OK"), 3)
            self.assertEqual(outcomes_2.count("FULL"), 3)
        finally:
            cleanup = SessionLocal()
            try:
                if created_window_id is not None:
                    cleanup.execute(
                        delete(AvailabilityWindow).where(
                            AvailabilityWindow.id == created_window_id
                        )
                    )
                if created_user_ids:
                    cleanup.execute(delete(User).where(User.id.in_(created_user_ids)))
                cleanup.commit()
            finally:
                cleanup.close()
            setup_session.close()


if __name__ == "__main__":
    unittest.main()

