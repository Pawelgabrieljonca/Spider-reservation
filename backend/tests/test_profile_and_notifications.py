"""Testy integracyjne dla Profilu Wspinacza (/api/v1/client/profile)
oraz Centrum Powiadomień In-App (/api/v1/notifications)."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import DateTime, create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import database as db_module
from app.core import security as sec_module
from app.main import create_app
from app.models import Base
from tests.test_flexible_availability import TZDateTime


class ProfileAndNotificationsIntegrationTests(unittest.TestCase):
    def tearDown(self):
        for table in Base.metadata.tables.values():
            for col in table.columns:
                if isinstance(col.type, TZDateTime):
                    col.type = DateTime(timezone=True)

    def test_climber_profile_and_in_app_notifications_lifecycle(self):
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
                "sub": "kc-inst-p1",
                "email": "tomasz.p@spider.test",
                "given_name": "Tomasz",
                "family_name": "Kowalski",
                "realm_access": {"roles": ["ROLE_INSTRUCTOR"]},
            },
            "client-a": {
                "sub": "kc-cli-pa",
                "email": "anna.p@spider.test",
                "given_name": "Anna",
                "family_name": "Zielińska",
                "realm_access": {"roles": ["ROLE_CLIENT"]},
            },
            "client-b": {
                "sub": "kc-cli-pb",
                "email": "jan.p@spider.test",
                "given_name": "Jan",
                "family_name": "Wiśniewski",
                "realm_access": {"roles": ["ROLE_CLIENT"]},
            },
        }

        with (
            patch.object(db_module, "db_session", test_scoped),
            patch.object(sec_module, "db_session", test_scoped),
            patch("app.api.instructor.slots.db_session", test_scoped),
            patch("app.api.instructor.progress.db_session", test_scoped),
            patch("app.api.client.slots.db_session", test_scoped),
            patch("app.api.client.reservations.db_session", test_scoped),
            patch("app.api.client.profile.db_session", test_scoped),
            patch("app.api.notifications.db_session", test_scoped),
            patch.object(sec_module, "_decode_token", side_effect=lambda tok: tokens[tok]),
            patch("app.services.notification_service.notify_reservation_confirmed"),
            patch("app.services.notification_service.notify_reservation_cancelled"),
        ):
            app = create_app()
            client = app.test_client()
            auth = lambda tok: {"Authorization": f"Bearer {tok}"}  # noqa: E731

            # Rejestracja kont klienta B w bazie (JIT provisioning)
            self.assertEqual(
                client.get("/api/v1/client/profile", headers=auth("client-b")).status_code, 200
            )

            # 1. Walidacja i zapis profilu wspinacza Klienta A
            r_bad_shoe = client.put(
                "/api/v1/client/profile",
                headers=auth("client-a"),
                json={"shoe_size": "99", "experience_level": "BEGINNER"},
            )
            self.assertEqual(r_bad_shoe.status_code, 422)

            r_prof = client.put(
                "/api/v1/client/profile",
                headers=auth("client-a"),
                json={
                    "phone_number": "+48 519 699 795",
                    "shoe_size": "39.5",
                    "experience_level": "INTERMEDIATE",
                },
            )
            self.assertEqual(r_prof.status_code, 200)
            prof_json = r_prof.get_json()
            self.assertEqual(prof_json["phone_number"], "+48 519 699 795")
            self.assertEqual(prof_json["shoe_size"], "39.5")
            self.assertEqual(prof_json["experience_level"], "INTERMEDIATE")

            # 2. Instruktor dodaje jutrzejszy dyżur 14:00–18:00 (w oknie przypomnienia < 36h!)
            tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
            d_str = tomorrow.isoformat()

            r_win = client.post(
                "/api/v1/instructor/slots",
                headers=auth("inst-1"),
                json={
                    "start_time": f"{d_str}T14:00:00+01:00",
                    "end_time": f"{d_str}T18:00:00+01:00",
                },
            )
            self.assertEqual(r_win.status_code, 201)
            win_id = r_win.get_json()["id"]

            # 3. Klient A rezerwuje grupę 1.5h z wypożyczeniem sprzętu
            r_res = client.post(
                "/api/v1/client/reservations",
                headers=auth("client-a"),
                json={
                    "availability_window_id": win_id,
                    "start_time": f"{d_str}T14:00:00+01:00",
                    "slot_type": "GROUP_1_5H",
                    "needs_equipment": True,
                },
            )
            self.assertEqual(r_res.status_code, 201)
            res_id = r_res.get_json()["id"]

            # Instruktor widzi w grafiku rozmiar buta EU 39.5 oraz poziom INTERMEDIATE klienta A
            inst_slots = client.get("/api/v1/instructor/slots", headers=auth("inst-1")).get_json()
            inst_res = inst_slots[0]["reservations"][0]
            self.assertEqual(inst_res["client_shoe_size"], "39.5")
            self.assertEqual(inst_res["client_experience_level"], "INTERMEDIATE")
            self.assertEqual(inst_res["client_phone"], "+48 519 699 795")
            client_a_id = inst_res["client_id"]

            # 4. Powiadomienia Instruktora: BOOKING_NEW (z rozmiarem buta) + REMINDER_24H
            inst_notifs = client.get("/api/v1/notifications", headers=auth("inst-1")).get_json()
            self.assertGreaterEqual(inst_notifs["unread_count"], 2)
            categories_inst = {n["category"] for n in inst_notifs["items"]}
            self.assertIn("BOOKING_NEW", categories_inst)
            self.assertIn("REMINDER_24H", categories_inst)
            booking_msg = next(
                n["body"] for n in inst_notifs["items"] if n["category"] == "BOOKING_NEW"
            )
            self.assertIn("39.5", booking_msg)

            # 5. Instruktor dodaje wpis w Dzienniku postępów -> Klient A dostaje PROGRESS_ADDED
            r_prog = client.post(
                "/api/v1/instructor/progress",
                headers=auth("inst-1"),
                json={
                    "client_id": client_a_id,
                    "grade": "VI.1+",
                    "route_name": "Zacięcie Pająka",
                    "instructor_feedback": "Świetna praca nóg na stopniach.",
                },
            )
            self.assertEqual(r_prog.status_code, 201)
            entry_id = r_prog.get_json()["id"]

            # 5b. CRUD dziennika: edycja literówki / wyceny przez autora, 403 dla innego instruktora
            r_edit = client.patch(
                f"/api/v1/instructor/progress/{entry_id}",
                headers=auth("inst-1"),
                json={"grade": "VI.2", "instructor_feedback": "Świetna praca nóg – poprawiono."},
            )
            self.assertEqual(r_edit.status_code, 200)
            self.assertEqual(r_edit.get_json()["grade"], "VI.2")
            self.assertEqual(r_edit.get_json()["route_name"], "Zacięcie Pająka")
            self.assertEqual(
                client.patch(
                    f"/api/v1/instructor/progress/{entry_id}",
                    headers=auth("inst-1"),
                    json={"grade": "9z"},
                ).status_code,
                422,
            )
            self.assertEqual(
                client.patch(
                    f"/api/v1/instructor/progress/{entry_id}", headers=auth("inst-1"), json={}
                ).status_code,
                422,
            )
            self.assertEqual(
                client.patch(
                    "/api/v1/instructor/progress/99999",
                    headers=auth("inst-1"),
                    json={"grade": "V"},
                ).status_code,
                404,
            )
            r_tmp = client.post(
                "/api/v1/instructor/progress",
                headers=auth("inst-1"),
                json={
                    "client_id": client_a_id,
                    "grade": "V",
                    "instructor_feedback": "Wpis do usunięcia.",
                },
            )
            tmp_id = r_tmp.get_json()["id"]
            self.assertEqual(
                client.delete(
                    f"/api/v1/instructor/progress/{tmp_id}", headers=auth("client-a")
                ).status_code,
                403,
            )
            self.assertEqual(
                client.delete(
                    f"/api/v1/instructor/progress/{tmp_id}", headers=auth("inst-1")
                ).status_code,
                204,
            )
            remaining = client.get("/api/v1/instructor/progress", headers=auth("inst-1")).get_json()
            self.assertEqual([e["id"] for e in remaining], [entry_id])

            cli_a_notifs = client.get("/api/v1/notifications", headers=auth("client-a")).get_json()
            categories_cli_a = {n["category"] for n in cli_a_notifs["items"]}
            self.assertIn("BOOKING_CONFIRMED", categories_cli_a)
            self.assertIn("REMINDER_24H", categories_cli_a)
            self.assertIn("PROGRESS_ADDED", categories_cli_a)

            # Izolacja bezpieczeństwa: Klient B nie może oznaczyć powiadomienia Klienta A jako przeczytane
            target_notif_id = cli_a_notifs["items"][0]["id"]
            self.assertEqual(
                client.patch(
                    f"/api/v1/notifications/{target_notif_id}/read", headers=auth("client-b")
                ).status_code,
                404,
            )

            # Oznaczenie pojedynczego oraz wszystkich powiadomień jako przeczytanych przez właściciela
            self.assertEqual(
                client.patch(
                    f"/api/v1/notifications/{target_notif_id}/read", headers=auth("client-a")
                ).status_code,
                200,
            )
            self.assertEqual(
                client.post("/api/v1/notifications/read-all", headers=auth("client-a")).status_code,
                200,
            )
            cli_a_after = client.get("/api/v1/notifications", headers=auth("client-a")).get_json()
            self.assertEqual(cli_a_after["unread_count"], 0)

            # 6. Klient A anuluje wizytę grupową (> 12h przed startem, bo dodajemy drugi dyżur za 3 dni)
            day3 = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
            win3_id = client.post(
                "/api/v1/instructor/slots",
                headers=auth("inst-1"),
                json={
                    "start_time": f"{day3}T16:00:00+01:00",
                    "end_time": f"{day3}T20:00:00+01:00",
                },
            ).get_json()["id"]
            res3_id = client.post(
                "/api/v1/client/reservations",
                headers=auth("client-a"),
                json={
                    "availability_window_id": win3_id,
                    "start_time": f"{day3}T16:00:00+01:00",
                    "slot_type": "GROUP_1_5H",
                },
            ).get_json()["id"]
            self.assertIsNotNone(res_id)

            r_cancel = client.delete(
                f"/api/v1/client/reservations/{res3_id}", headers=auth("client-a")
            )
            self.assertEqual(r_cancel.status_code, 200)

            # Klient B otrzymuje powiadomienie GROUP_SPOT_FREED („Zwolniło się miejsce w grupie”)
            cli_b_notifs = client.get("/api/v1/notifications", headers=auth("client-b")).get_json()
            categories_cli_b = {n["category"] for n in cli_b_notifs["items"]}
            self.assertIn("GROUP_SPOT_FREED", categories_cli_b)


if __name__ == "__main__":
    unittest.main()

