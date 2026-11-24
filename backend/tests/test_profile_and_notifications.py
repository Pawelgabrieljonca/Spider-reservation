import unittest
from datetime import datetime, timedelta, timezone

from tests.test_helpers import auth_header, make_token, sqlite_test_client


class ProfileAndNotificationsIntegrationTests(unittest.TestCase):
    def test_climber_profile_and_in_app_notifications_lifecycle(self):
        tokens = {
            "inst-1": make_token("kc-inst-p1", "tomasz.p@spider.test", "Tomasz", "Kowalski", "ROLE_INSTRUCTOR"),
            "client-a": make_token("kc-cli-pa", "anna.p@spider.test", "Anna", "Zielińska", "ROLE_CLIENT"),
            "client-b": make_token("kc-cli-pb", "jan.p@spider.test", "Jan", "Wiśniewski", "ROLE_CLIENT"),
        }

        with sqlite_test_client(tokens) as client:
            self.assertEqual(client.get("/api/v1/client/profile", headers=auth_header("client-b")).status_code, 200)
            self.assertEqual(client.put("/api/v1/client/profile", headers=auth_header("client-a"), json={"shoe_size": "99", "experience_level": "BEGINNER"}).status_code, 422)

            r_prof = client.put("/api/v1/client/profile", headers=auth_header("client-a"), json={"phone_number": "+48 519 699 795", "shoe_size": "39.5", "experience_level": "INTERMEDIATE"})
            self.assertEqual(r_prof.status_code, 200)
            pj = r_prof.get_json()
            self.assertEqual((pj["phone_number"], pj["shoe_size"], pj["experience_level"]), ("+48 519 699 795", "39.5", "INTERMEDIATE"))

            d_str = (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat()
            r_win = client.post("/api/v1/instructor/slots", headers=auth_header("inst-1"), json={"start_time": f"{d_str}T14:00:00+01:00", "end_time": f"{d_str}T18:00:00+01:00"})
            self.assertEqual(r_win.status_code, 201)
            win_id = r_win.get_json()["id"]

            r_res = client.post("/api/v1/client/reservations", headers=auth_header("client-a"), json={"availability_window_id": win_id, "start_time": f"{d_str}T14:00:00+01:00", "slot_type": "GROUP_1_5H", "needs_equipment": True})
            self.assertEqual(r_res.status_code, 201)
            self.assertIsNotNone(r_res.get_json()["id"])

            inst_res = client.get("/api/v1/instructor/slots", headers=auth_header("inst-1")).get_json()[0]["reservations"][0]
            self.assertEqual((inst_res["client_shoe_size"], inst_res["client_experience_level"], inst_res["client_phone"]), ("39.5", "INTERMEDIATE", "+48 519 699 795"))
            client_a_id = inst_res["client_id"]

            inst_notifs = client.get("/api/v1/notifications", headers=auth_header("inst-1")).get_json()
            self.assertGreaterEqual(inst_notifs["unread_count"], 2)
            self.assertTrue({"BOOKING_NEW", "REMINDER_24H"}.issubset({n["category"] for n in inst_notifs["items"]}))
            self.assertIn("39.5", next(n["body"] for n in inst_notifs["items"] if n["category"] == "BOOKING_NEW"))

            r_prog = client.post("/api/v1/instructor/progress", headers=auth_header("inst-1"), json={"client_id": client_a_id, "grade": "VI.1+", "route_name": "Zacięcie Pająka", "instructor_feedback": "Świetna praca nóg na stopniach."})
            self.assertEqual(r_prog.status_code, 201)
            entry_id = r_prog.get_json()["id"]

            r_edit = client.patch(f"/api/v1/instructor/progress/{entry_id}", headers=auth_header("inst-1"), json={"grade": "VI.2", "instructor_feedback": "Świetna praca nóg – poprawiono."})
            self.assertEqual(r_edit.status_code, 200)
            self.assertEqual((r_edit.get_json()["grade"], r_edit.get_json()["route_name"]), ("VI.2", "Zacięcie Pająka"))
            self.assertEqual(client.patch(f"/api/v1/instructor/progress/{entry_id}", headers=auth_header("inst-1"), json={"grade": "X" * 11}).status_code, 422)
            self.assertEqual(client.patch(f"/api/v1/instructor/progress/{entry_id}", headers=auth_header("inst-1"), json={}).status_code, 422)
            self.assertEqual(client.patch("/api/v1/instructor/progress/99999", headers=auth_header("inst-1"), json={"grade": "V"}).status_code, 404)

            tmp_id = client.post("/api/v1/instructor/progress", headers=auth_header("inst-1"), json={"client_id": client_a_id, "grade": "V", "instructor_feedback": "Wpis do usunięcia."}).get_json()["id"]
            self.assertEqual(client.delete(f"/api/v1/instructor/progress/{tmp_id}", headers=auth_header("client-a")).status_code, 403)
            self.assertEqual(client.delete(f"/api/v1/instructor/progress/{tmp_id}", headers=auth_header("inst-1")).status_code, 204)
            self.assertEqual([e["id"] for e in client.get("/api/v1/instructor/progress", headers=auth_header("inst-1")).get_json()], [entry_id])

            cli_a_notifs = client.get("/api/v1/notifications", headers=auth_header("client-a")).get_json()
            self.assertTrue({"BOOKING_CONFIRMED", "REMINDER_24H", "PROGRESS_ADDED"}.issubset({n["category"] for n in cli_a_notifs["items"]}))

            nid = cli_a_notifs["items"][0]["id"]
            self.assertEqual(client.patch(f"/api/v1/notifications/{nid}/read", headers=auth_header("client-b")).status_code, 404)
            self.assertEqual(client.patch(f"/api/v1/notifications/{nid}/read", headers=auth_header("client-a")).status_code, 200)
            self.assertEqual(client.post("/api/v1/notifications/read-all", headers=auth_header("client-a")).status_code, 200)
            self.assertEqual(client.get("/api/v1/notifications", headers=auth_header("client-a")).get_json()["unread_count"], 0)

            day3 = (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat()
            win3_id = client.post("/api/v1/instructor/slots", headers=auth_header("inst-1"), json={"start_time": f"{day3}T16:00:00+01:00", "end_time": f"{day3}T20:00:00+01:00"}).get_json()["id"]
            res3_id = client.post("/api/v1/client/reservations", headers=auth_header("client-a"), json={"availability_window_id": win3_id, "start_time": f"{day3}T16:00:00+01:00", "slot_type": "GROUP_1_5H"}).get_json()["id"]
            self.assertEqual(client.delete(f"/api/v1/client/reservations/{res3_id}", headers=auth_header("client-a")).status_code, 200)

            cli_b_notifs = client.get("/api/v1/notifications", headers=auth_header("client-b")).get_json()
            self.assertIn("GROUP_SPOT_FREED", {n["category"] for n in cli_b_notifs["items"]})


if __name__ == "__main__":
    unittest.main()
