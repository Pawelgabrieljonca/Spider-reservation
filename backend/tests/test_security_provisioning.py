import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from werkzeug.exceptions import Conflict

from app.core import security
from app.models import Base, User, UserRole

class TestSecurityProvisioning(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.session = scoped_session(sessionmaker(bind=self.engine, expire_on_commit=False))
        self._patcher = patch.object(security, "db_session", self.session)
        self._patcher.start()

    def tearDown(self) -> None:
        self._patcher.stop()
        self.session.remove()
        self.engine.dispose()

    def test_relinks_existing_user_when_email_is_verified(self) -> None:
        old_user = User(
            keycloak_id="old-uuid-111",
            email="vimle@wp.pl",
            first_name="Kasia",
            last_name="Nowak",
            role=UserRole.CLIENT,
        )
        self.session.add(old_user)
        self.session.commit()
        old_id = old_user.id

        claims = {
            "sub": "new-uuid-222",
            "email": "vimle@wp.pl",
            "email_verified": True,
            "given_name": "Kasia",
            "family_name": "Kruk",
        }
        linked = security._provision_user(claims, {UserRole.CLIENT})

        self.assertEqual(linked.id, old_id)
        self.assertEqual(linked.keycloak_id, "new-uuid-222")
        self.assertEqual(linked.last_name, "Kruk")

    def test_rejects_relink_when_email_is_not_verified(self) -> None:
        old_user = User(
            keycloak_id="old-uuid-111",
            email="vimle@wp.pl",
            first_name="Kasia",
            last_name="Nowak",
            role=UserRole.CLIENT,
        )
        self.session.add(old_user)
        self.session.commit()

        claims = {
            "sub": "attacker-uuid-999",
            "email": "vimle@wp.pl",
            "email_verified": False,
            "given_name": "Fake",
            "family_name": "User",
        }
        with self.assertRaises(Conflict):
            security._provision_user(claims, {UserRole.CLIENT})

if __name__ == "__main__":
    unittest.main()
