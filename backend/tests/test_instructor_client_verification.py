import unittest
from datetime import datetime, timedelta, timezone

from tests.test_helpers import auth_header, make_token, sqlite_test_client


class InstructorClientVerificationIntegrationTests(unittest.TestCase):
    def test_experience_verification_progress_visibility_and_notes_isolation(self):
        tokens = {
            "inst-1": make_token("kc-inst-v1", "tomasz.v@spider.test", "Tomasz", "Kowalski", "ROLE_INSTRUCTOR"),
            "inst-2": make_token("kc-inst-v2", "marek.v@spider.test", "Marek", "Nowak", "ROLE_INSTRUCTOR"),
            "client-a": make_token("kc-cli-va", "anna.v@spider.test", "Anna", "Zielińska", "ROLE_CLIENT"),
            "client-b": make_token("kc-cli-vb", "jan.v@spider.test", "Jan", "Wiśniewski", "ROLE_CLIENT"),
        }

        with sqlite_test_client(tokens) as client:
            cli_a_id = client.get("/api/v1/client/profile", headers=auth_header("client-a")).get_json()["id"]
            cli_b_id = client.get("/api/v1/client/profile", headers=auth_header("client-b")).get_json()["id"]

            r_put = client.put("/api/v1/client/profile", headers=auth_header("client-a"), json={"phone_number": "+48 500 100 200", "shoe_size": "38", "experience_level": "BEGINNER"})
            self.assertEqual(r_put.status_code, 200)
            self.assertEqual(r_put.get_json()["experience_level"], "BEGINNER")
            self.assertFalse(r_put.get_json()["experience_verified"])

            self.assertEqual(client.get(f"/api/v1/instructor/clients/{cli_b_id}", headers=auth_header("inst-1")).status_code, 403)
            self.assertEqual(client.patch(f"/api/v1/instructor/clients/{cli_b_id}/experience", headers=auth_header("inst-1"), json={"experience_level": "INTERMEDIATE"}).status_code, 403)

            day2 = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()
            r_win = client.post("/api/v1/instructor/slots", headers=auth_header("inst-1"), json={"start_time": f"{day2}T15:00:00+01:00", "end_time": f"{day2}T18:00:00+01:00"})
            self.assertEqual(r_win.status_code, 201)
            win_id = r_win.get_json()["id"]

            self.assertEqual(client.post("/api/v1/client/reservations", headers=auth_header("client-a"), json={"availability_window_id": win_id, "start_time": f"{day2}T15:00:00+01:00", "slot_type": "INDIVIDUAL_1H", "needs_equipment": True}).status_code, 201)
            self.assertEqual(client.get(f"/api/v1/instructor/clients/{cli_a_id}", headers=auth_header("inst-2")).status_code, 403)

            cli_list = client.get("/api/v1/instructor/clients", headers=auth_header("inst-1")).get_json()
            self.assertEqual(len(cli_list), 1)
            self.assertEqual((cli_list[0]["id"], cli_list[0]["experience_level"], cli_list[0]["experience_verified"], cli_list[0]["upcoming_trainings_count"]), (cli_a_id, "BEGINNER", False, 1))

            r_prog = client.post("/api/v1/instructor/progress", headers=auth_header("inst-1"), json={"client_id": cli_a_id, "grade": "V+", "route_name": "Płyta wejściowa", "instructor_feedback": "Pewna praca stóp na tarcie."})
            self.assertEqual(r_prog.status_code, 201)
            self.assertEqual((r_prog.get_json()["client_experience_level"], r_prog.get_json()["client_experience_verified"]), ("BEGINNER", False))

            self.assertEqual(client.patch(f"/api/v1/instructor/clients/{cli_a_id}/experience", headers=auth_header("inst-1"), json={"experience_level": "EXPERT_INVALID"}).status_code, 422)

            r_verify = client.patch(f"/api/v1/instructor/clients/{cli_a_id}/experience", headers=auth_header("inst-1"), json={"experience_level": "INTERMEDIATE"})
            self.assertEqual(r_verify.status_code, 200)
            vd = r_verify.get_json()
            self.assertEqual((vd["experience_level"], vd["experience_verified"], vd["experience_verified_by_name"]), ("INTERMEDIATE", True, "Tomasz Kowalski"))
            self.assertIsNotNone(vd["experience_verified_at"])
            self.assertEqual((len(vd["trainings_history"]), len(vd["progress_entries"])), (1, 1))

            for url, tok in (("/api/v1/instructor/progress", "inst-1"), ("/api/v1/client/progress", "client-a")):
                data = client.get(url, headers=auth_header(tok)).get_json()
                self.assertEqual((data[0]["client_experience_level"], data[0]["client_experience_verified"]), ("INTERMEDIATE", True))

            res_card = client.get("/api/v1/instructor/slots", headers=auth_header("inst-1")).get_json()[0]["reservations"][0]
            self.assertEqual((res_card["client_experience_level"], res_card["client_experience_verified"]), ("INTERMEDIATE", True))

            cli_notifs = client.get("/api/v1/notifications", headers=auth_header("client-a")).get_json()
            self.assertIn("EXPERIENCE_VERIFIED", {n["category"] for n in cli_notifs["items"]})

            r_keep = client.put("/api/v1/client/profile", headers=auth_header("client-a"), json={"phone_number": "+48 500 100 200", "shoe_size": "38.5", "experience_level": "INTERMEDIATE"})
            self.assertEqual(r_keep.status_code, 200)
            self.assertEqual((r_keep.get_json()["experience_verified"], r_keep.get_json()["experience_verified_by_name"]), (True, "Tomasz Kowalski"))

            r_reset = client.put("/api/v1/client/profile", headers=auth_header("client-a"), json={"phone_number": "+48 500 100 200", "shoe_size": "38.5", "experience_level": "ADVANCED"})
            self.assertEqual(r_reset.status_code, 200)
            self.assertEqual((r_reset.get_json()["experience_level"], r_reset.get_json()["experience_verified"]), ("ADVANCED", False))

            r_note = client.post(f"/api/v1/instructor/clients/{cli_a_id}/notes", headers=auth_header("inst-1"), json={"content": "Przygotować drogi w lekkim przewieszeniu VI–VI+."})
            self.assertEqual(r_note.status_code, 201)
            note_id = r_note.get_json()["id"]

            r_upd = client.patch(f"/api/v1/instructor/clients/{cli_a_id}/notes/{note_id}", headers=auth_header("inst-1"), json={"content": "Przygotować drogi VI+ oraz ćwiczenia z odpadania."})
            self.assertEqual(r_upd.status_code, 200)
            self.assertIn("odpadania", r_upd.get_json()["content"])

            for tok in ("inst-2", "client-a"):
                self.assertEqual(client.delete(f"/api/v1/instructor/clients/{cli_a_id}/notes/{note_id}", headers=auth_header(tok)).status_code, 403)

            detail = client.get(f"/api/v1/instructor/clients/{cli_a_id}", headers=auth_header("inst-1")).get_json()
            self.assertEqual((detail["notes_count"], len(detail["notes"])), (1, 1))

            self.assertEqual(client.delete(f"/api/v1/instructor/clients/{cli_a_id}/notes/{note_id}", headers=auth_header("inst-1")).status_code, 204)
            self.assertEqual(client.get(f"/api/v1/instructor/clients/{cli_a_id}", headers=auth_header("inst-1")).get_json()["notes_count"], 0)


if __name__ == "__main__":
    unittest.main()
