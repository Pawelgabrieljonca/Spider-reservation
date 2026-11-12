"""Testy integracyjne weryfikacji profilu wspinacza, zatwierdzania poziomu
oraz notatek trenerskich i historii treningów w module instruktora."""

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


class InstructorClientVerificationIntegrationTests(unittest.TestCase):
    def tearDown(self):
        for table in Base.metadata.tables.values():
            for col in table.columns:
                if isinstance(col.type, TZDateTime):
                    col.type = DateTime(timezone=True)

    def test_experience_verification_progress_visibility_and_notes_isolation(self):
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
                "sub": "kc-inst-v1",
                "email": "tomasz.v@spider.test",
                "given_name": "Tomasz",
                "family_name": "Kowalski",
                "realm_access": {"roles": ["ROLE_INSTRUCTOR"]},
            },
            "inst-2": {
                "sub": "kc-inst-v2",
                "email": "marek.v@spider.test",
                "given_name": "Marek",
                "family_name": "Nowak",
                "realm_access": {"roles": ["ROLE_INSTRUCTOR"]},
            },
            "client-a": {
                "sub": "kc-cli-va",
                "email": "anna.v@spider.test",
                "given_name": "Anna",
                "family_name": "Zielińska",
                "realm_access": {"roles": ["ROLE_CLIENT"]},
            },
            "client-b": {
                "sub": "kc-cli-vb",
                "email": "jan.v@spider.test",
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
            patch("app.api.instructor.clients.db_session", test_scoped),
            patch("app.api.client.slots.db_session", test_scoped),
            patch("app.api.client.reservations.db_session", test_scoped),
            patch("app.api.client.profile.db_session", test_scoped),
            patch("app.api.client.progress.db_session", test_scoped),
            patch("app.api.notifications.db_session", test_scoped),
            patch.object(sec_module, "_decode_token", side_effect=lambda tok: tokens[tok]),
            patch("app.services.notification_service.notify_reservation_confirmed"),
            patch("app.services.notification_service.notify_reservation_cancelled"),
        ):
            app = create_app()
            client = app.test_client()
            auth = lambda tok: {"Authorization": f"Bearer {tok}"}  # noqa: E731

            # Provisioning użytkowników
            cli_a_prof = client.get("/api/v1/client/profile", headers=auth("client-a")).get_json()
            cli_b_prof = client.get("/api/v1/client/profile", headers=auth("client-b")).get_json()
            cli_a_id = cli_a_prof["id"]
            cli_b_id = cli_b_prof["id"]

            # 1. Klient A deklaruje poziom BEGINNER (niezatwierdzony)
            r_put = client.put(
                "/api/v1/client/profile",
                headers=auth("client-a"),
                json={
                    "phone_number": "+48 500 100 200",
                    "shoe_size": "38",
                    "experience_level": "BEGINNER",
                },
            )
            self.assertEqual(r_put.status_code, 200)
            self.assertEqual(r_put.get_json()["experience_level"], "BEGINNER")
            self.assertFalse(r_put.get_json()["experience_verified"])

            # 2. Izolacja: Instruktor 1 nie może podejrzeć ani zweryfikować Klienta B przed rezerwacją
            self.assertEqual(
                client.get(f"/api/v1/instructor/clients/{cli_b_id}", headers=auth("inst-1")).status_code,
                403,
            )
            self.assertEqual(
                client.patch(
                    f"/api/v1/instructor/clients/{cli_b_id}/experience",
                    headers=auth("inst-1"),
                    json={"experience_level": "INTERMEDIATE"},
                ).status_code,
                403,
            )

            # 3. Instruktor 1 dodaje dyżur, a Klient A rezerwuje zajęcia
            day2 = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()
            r_win = client.post(
                "/api/v1/instructor/slots",
                headers=auth("inst-1"),
                json={
                    "start_time": f"{day2}T15:00:00+01:00",
                    "end_time": f"{day2}T18:00:00+01:00",
                },
            )
            self.assertEqual(r_win.status_code, 201)
            win_id = r_win.get_json()["id"]

            r_res = client.post(
                "/api/v1/client/reservations",
                headers=auth("client-a"),
                json={
                    "availability_window_id": win_id,
                    "start_time": f"{day2}T15:00:00+01:00",
                    "slot_type": "INDIVIDUAL_1H",
                    "needs_equipment": True,
                },
            )
            self.assertEqual(r_res.status_code, 201)

            # Instruktor 2 nadal nie ma dostępu do Klienta A
            self.assertEqual(
                client.get(f"/api/v1/instructor/clients/{cli_a_id}", headers=auth("inst-2")).status_code,
                403,
            )

            # 4. Instruktor 1 widzi Klienta A na liście podopiecznych oraz jego kartę przed sesją
            cli_list = client.get("/api/v1/instructor/clients", headers=auth("inst-1")).get_json()
            self.assertEqual(len(cli_list), 1)
            self.assertEqual(cli_list[0]["id"], cli_a_id)
            self.assertEqual(cli_list[0]["experience_level"], "BEGINNER")
            self.assertFalse(cli_list[0]["experience_verified"])
            self.assertEqual(cli_list[0]["upcoming_trainings_count"], 1)

            # Dodanie wpisu postępu -> przed weryfikacją ma BEGINNER / verified=False
            r_prog = client.post(
                "/api/v1/instructor/progress",
                headers=auth("inst-1"),
                json={
                    "client_id": cli_a_id,
                    "grade": "V+",
                    "route_name": "Płyta wejściowa",
                    "instructor_feedback": "Pewna praca stóp na tarcie.",
                },
            )
            self.assertEqual(r_prog.status_code, 201)
            self.assertEqual(r_prog.get_json()["client_experience_level"], "BEGINNER")
            self.assertFalse(r_prog.get_json()["client_experience_verified"])

            # 5. Instruktor 1 zatwierdza i podnosi poziom Klienta A do INTERMEDIATE (po/poza zajęciami)
            r_bad_exp = client.patch(
                f"/api/v1/instructor/clients/{cli_a_id}/experience",
                headers=auth("inst-1"),
                json={"experience_level": "EXPERT_INVALID"},
            )
            self.assertEqual(r_bad_exp.status_code, 422)

            r_verify = client.patch(
                f"/api/v1/instructor/clients/{cli_a_id}/experience",
                headers=auth("inst-1"),
                json={"experience_level": "INTERMEDIATE"},
            )
            self.assertEqual(r_verify.status_code, 200)
            verified_detail = r_verify.get_json()
            self.assertEqual(verified_detail["experience_level"], "INTERMEDIATE")
            self.assertTrue(verified_detail["experience_verified"])
            self.assertEqual(verified_detail["experience_verified_by_name"], "Tomasz Kowalski")
            self.assertIsNotNone(verified_detail["experience_verified_at"])
            self.assertEqual(len(verified_detail["trainings_history"]), 1)
            self.assertEqual(len(verified_detail["progress_entries"]), 1)

            # Poziom jest widoczny w Dzienniku postępów (zarówno u instruktora, jak i u klienta) oraz w grafiku
            inst_prog = client.get("/api/v1/instructor/progress", headers=auth("inst-1")).get_json()
            self.assertEqual(inst_prog[0]["client_experience_level"], "INTERMEDIATE")
            self.assertTrue(inst_prog[0]["client_experience_verified"])

            cli_prog = client.get("/api/v1/client/progress", headers=auth("client-a")).get_json()
            self.assertEqual(cli_prog[0]["client_experience_level"], "INTERMEDIATE")
            self.assertTrue(cli_prog[0]["client_experience_verified"])

            inst_slots = client.get("/api/v1/instructor/slots", headers=auth("inst-1")).get_json()
            res_card = inst_slots[0]["reservations"][0]
            self.assertEqual(res_card["client_experience_level"], "INTERMEDIATE")
            self.assertTrue(res_card["client_experience_verified"])

            # Klient otrzymał powiadomienie EXPERIENCE_VERIFIED
            cli_notifs = client.get("/api/v1/notifications", headers=auth("client-a")).get_json()
            self.assertIn(
                "EXPERIENCE_VERIFIED",
                {n["category"] for n in cli_notifs["items"]},
            )

            # 6. Klient zmienia wyłącznie rozmiar buta (poziom ten sam) -> weryfikacja zostaje zachowana
            r_keep = client.put(
                "/api/v1/client/profile",
                headers=auth("client-a"),
                json={
                    "phone_number": "+48 500 100 200",
                    "shoe_size": "38.5",
                    "experience_level": "INTERMEDIATE",
                },
            )
            self.assertEqual(r_keep.status_code, 200)
            self.assertTrue(r_keep.get_json()["experience_verified"])
            self.assertEqual(r_keep.get_json()["experience_verified_by_name"], "Tomasz Kowalski")

            # Gdy klient samodzielnie zmieni poziom na inny -> status zatwierdzenia zostaje zresetowany
            r_reset = client.put(
                "/api/v1/client/profile",
                headers=auth("client-a"),
                json={
                    "phone_number": "+48 500 100 200",
                    "shoe_size": "38.5",
                    "experience_level": "ADVANCED",
                },
            )
            self.assertEqual(r_reset.status_code, 200)
            self.assertEqual(r_reset.get_json()["experience_level"], "ADVANCED")
            self.assertFalse(r_reset.get_json()["experience_verified"])

            # 7. Prywatne notatki instruktora o kliencie (CRUD + izolacja)
            r_note = client.post(
                f"/api/v1/instructor/clients/{cli_a_id}/notes",
                headers=auth("inst-1"),
                json={"content": "Przygotować drogi w lekkim przewieszeniu VI–VI+."},
            )
            self.assertEqual(r_note.status_code, 201)
            note_id = r_note.get_json()["id"]

            r_note_upd = client.patch(
                f"/api/v1/instructor/clients/{cli_a_id}/notes/{note_id}",
                headers=auth("inst-1"),
                json={"content": "Przygotować drogi VI+ oraz ćwiczenia z odpadania."},
            )
            self.assertEqual(r_note_upd.status_code, 200)
            self.assertIn("odpadania", r_note_upd.get_json()["content"])

            # Inny instruktor i klient nie mogą edytować/usunąć notatki
            self.assertEqual(
                client.delete(
                    f"/api/v1/instructor/clients/{cli_a_id}/notes/{note_id}",
                    headers=auth("inst-2"),
                ).status_code,
                403,
            )
            self.assertEqual(
                client.delete(
                    f"/api/v1/instructor/clients/{cli_a_id}/notes/{note_id}",
                    headers=auth("client-a"),
                ).status_code,
                403,
            )

            detail_with_note = client.get(
                f"/api/v1/instructor/clients/{cli_a_id}", headers=auth("inst-1")
            ).get_json()
            self.assertEqual(detail_with_note["notes_count"], 1)
            self.assertEqual(len(detail_with_note["notes"]), 1)

            self.assertEqual(
                client.delete(
                    f"/api/v1/instructor/clients/{cli_a_id}/notes/{note_id}",
                    headers=auth("inst-1"),
                ).status_code,
                204,
            )
            detail_after_del = client.get(
                f"/api/v1/instructor/clients/{cli_a_id}", headers=auth("inst-1")
            ).get_json()
            self.assertEqual(detail_after_del["notes_count"], 0)


if __name__ == "__main__":
    unittest.main()

