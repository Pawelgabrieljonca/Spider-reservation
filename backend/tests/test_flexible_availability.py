import threading
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import delete

from app.core import config as db_module
from app.models import AvailabilityWindow, SlotType, User, UserRole
from app.services import reservation_service
from app.services.exceptions import SlotFullError, SlotOverlapError
from tests.test_helpers import auth_header, make_token, sqlite_test_client


class FlexibleAvailabilityIntegrationTests(unittest.TestCase):
    def test_flexible_shifts_dynamic_slots_and_group_joining(self):
        tokens = {
            "inst-1": make_token("kc-inst-1", "tomasz@spider.test", "Tomasz", "Kowalski", "ROLE_INSTRUCTOR"),
            "client-a": make_token("kc-client-a", "anna@spider.test", "Anna", "Zielińska", "ROLE_CLIENT"),
            "client-b": make_token("kc-client-b", "jan@spider.test", "Jan", "Wiśniewski", "ROLE_CLIENT"),
            "client-c": make_token("kc-client-c", "ewa@spider.test", "Ewa", "Kaczmarek", "ROLE_CLIENT"),
            "client-d": make_token("kc-client-d", "piotr@spider.test", "Piotr", "Mazur", "ROLE_CLIENT"),
        }

        with sqlite_test_client(tokens) as client:
            target_day = (datetime.now(timezone.utc) + timedelta(days=3)).date()
            d_str = target_day.isoformat()
            q_range = {"date_from": f"{d_str}T00:00:00+01:00", "date_to": f"{d_str}T23:59:59+01:00"}

            self.assertEqual(client.post("/api/v1/instructor/slots", headers=auth_header("inst-1"), json={"start_time": f"{d_str}T14:00:00+01:00", "end_time": f"{d_str}T14:30:00+01:00"}).status_code, 422)
            self.assertEqual(client.post("/api/v1/instructor/slots", headers=auth_header("inst-1"), json={"start_time": f"{d_str}T08:30:00+01:00", "end_time": f"{d_str}T12:00:00+01:00"}).status_code, 422)

            r_win = client.post("/api/v1/instructor/slots", headers=auth_header("inst-1"), json={"start_time": f"{d_str}T14:00:00+01:00", "end_time": f"{d_str}T20:00:00+01:00"})
            self.assertEqual(r_win.status_code, 201)
            win_id = r_win.get_json()["id"]
            self.assertEqual(r_win.get_json()["duration_minutes"], 360)

            self.assertEqual(client.post("/api/v1/instructor/slots", headers=auth_header("inst-1"), json={"start_time": f"{d_str}T18:00:00+01:00", "end_time": f"{d_str}T21:00:00+01:00"}).status_code, 409)

            next_day = (target_day + timedelta(days=1)).isoformat()
            r_bulk = client.post("/api/v1/instructor/slots/bulk", headers=auth_header("inst-1"), json={"windows": [{"start_time": f"{next_day}T10:00:00+01:00", "end_time": f"{next_day}T14:00:00+01:00"}]})
            self.assertEqual(r_bulk.status_code, 201)
            self.assertEqual(r_bulk.get_json()["created_count"], 1)

            self.assertEqual(len(client.get("/api/v1/client/slots", headers=auth_header("client-a"), query_string={**q_range, "slot_type": "INDIVIDUAL_1H"}).get_json()), 11)
            self.assertEqual(len(client.get("/api/v1/client/slots", headers=auth_header("client-a"), query_string={**q_range, "slot_type": "GROUP_1_5H"}).get_json()), 10)

            self.assertEqual(client.post("/api/v1/client/reservations", headers=auth_header("client-a"), json={"availability_window_id": win_id, "start_time": f"{d_str}T14:00:00+01:00", "slot_type": "GROUP_1_5H", "needs_equipment": True}).status_code, 201)

            slots_b_grp = client.get("/api/v1/client/slots", headers=auth_header("client-b"), query_string={**q_range, "slot_type": "GROUP_1_5H"}).get_json()
            self.assertEqual(len(slots_b_grp), 8)
            self.assertTrue(slots_b_grp[0]["is_joining_group"])
            self.assertEqual(slots_b_grp[0]["free_places"], 2)
            self.assertEqual(len(client.get("/api/v1/client/slots", headers=auth_header("client-b"), query_string={**q_range, "slot_type": "INDIVIDUAL_1H"}).get_json()), 8)

            self.assertEqual(client.post("/api/v1/client/reservations", headers=auth_header("client-b"), json={"availability_window_id": win_id, "start_time": f"{d_str}T14:00:00+01:00", "slot_type": "INDIVIDUAL_1H"}).status_code, 409)
            for tok in ("client-b", "client-c"):
                self.assertEqual(client.post("/api/v1/client/reservations", headers=auth_header(tok), json={"availability_window_id": win_id, "start_time": f"{d_str}T14:00:00+01:00", "slot_type": "GROUP_1_5H"}).status_code, 201)

            r_full = client.post("/api/v1/client/reservations", headers=auth_header("client-d"), json={"availability_window_id": win_id, "start_time": f"{d_str}T14:00:00+01:00", "slot_type": "GROUP_1_5H"})
            self.assertEqual(r_full.status_code, 409)
            self.assertEqual(r_full.get_json()["status"], "SLOT_FULL")

            r_ind_d = client.post("/api/v1/client/reservations", headers=auth_header("client-d"), json={"availability_window_id": win_id, "start_time": f"{d_str}T17:00:00+01:00", "slot_type": "INDIVIDUAL_1H"})
            self.assertEqual(r_ind_d.status_code, 201)
            self.assertEqual(client.delete(f"/api/v1/client/reservations/{r_ind_d.get_json()['id']}", headers=auth_header("client-d")).status_code, 200)

            self.assertEqual(len(client.get("/api/v1/client/slots", headers=auth_header("client-b"), query_string={**q_range, "slot_type": "INDIVIDUAL_1H"}).get_json()), 8)
            self.assertEqual(len(client.get("/api/v1/instructor/slots", headers=auth_header("inst-1")).get_json()), 2)


class PostgresConcurrencyLockingTests(unittest.TestCase):
    def test_concurrent_overlapping_intervals_and_group_capacity(self):
        SessionLocal = db_module.SessionLocal
        tag = uuid.uuid4().hex[:8]
        created_user_ids, created_window_id = [], None
        setup_session = SessionLocal()
        try:
            inst = User(keycloak_id=f"conc-inst-{tag}", email=f"conc-inst-{tag}@spider.test", first_name="Trener", last_name="Wspolbiezny", role=UserRole.INSTRUCTOR)
            clients = [User(keycloak_id=f"conc-cli-{i}-{tag}", email=f"conc-cli-{i}-{tag}@spider.test", first_name=f"Klient{i}", last_name="Testowy", role=UserRole.CLIENT) for i in range(6)]
            setup_session.add(inst)
            setup_session.add_all(clients)
            setup_session.commit()
            created_user_ids = [inst.id] + [c.id for c in clients]
            client_ids = [c.id for c in clients]

            future_day = (datetime.now(timezone.utc) + timedelta(days=5)).date()
            win_start = datetime(future_day.year, future_day.month, future_day.day, 13, 0, tzinfo=timezone.utc)
            win = AvailabilityWindow(instructor_id=inst.id, start_time=win_start, end_time=win_start + timedelta(hours=6), is_blocked=False)
            setup_session.add(win)
            setup_session.commit()
            created_window_id = win.id

            attempts = [
                (client_ids[0], win_start, SlotType.INDIVIDUAL_1H),
                (client_ids[1], win_start + timedelta(minutes=30), SlotType.GROUP_1_5H),
                (client_ids[2], win_start + timedelta(minutes=30), SlotType.INDIVIDUAL_1H),
                (client_ids[3], win_start, SlotType.GROUP_1_5H),
            ]
            barrier_1, outcomes_1, lock_1 = threading.Barrier(len(attempts)), [], threading.Lock()

            def worker_overlap(cid, st, stype):
                s = SessionLocal()
                try:
                    barrier_1.wait()
                    with patch("app.services.notification_service.notify_reservation_confirmed"):
                        res = reservation_service.create_reservation(s, client_id=cid, availability_window_id=created_window_id, start_time=st, slot_type=stype)
                    with lock_1:
                        outcomes_1.append(("OK", res.slot.start_time, res.slot.end_time, stype))
                except SlotOverlapError:
                    with lock_1:
                        outcomes_1.append(("OVERLAP", st, None, stype))
                finally:
                    s.close()

            threads_1 = [threading.Thread(target=worker_overlap, args=a) for a in attempts]
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
                    if not (t1 == SlotType.GROUP_1_5H and t2 == SlotType.GROUP_1_5H and s1 == s2 and e1 == e2):
                        self.assertFalse(s1 < e2 and e1 > s2)

            grp_start = win_start + timedelta(hours=4, minutes=30)
            barrier_2, outcomes_2, lock_2 = threading.Barrier(6), [], threading.Lock()

            def worker_group(cid):
                s = SessionLocal()
                try:
                    barrier_2.wait()
                    with patch("app.services.notification_service.notify_reservation_confirmed"):
                        reservation_service.create_reservation(s, client_id=cid, availability_window_id=created_window_id, start_time=grp_start, slot_type=SlotType.GROUP_1_5H)
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
                    cleanup.execute(delete(AvailabilityWindow).where(AvailabilityWindow.id == created_window_id))
                if created_user_ids:
                    cleanup.execute(delete(User).where(User.id.in_(created_user_ids)))
                cleanup.commit()
            finally:
                cleanup.close()
            setup_session.close()


if __name__ == "__main__":
    unittest.main()
