from contextlib import ExitStack, contextmanager
from datetime import timezone
from unittest.mock import patch

from sqlalchemy import DateTime, TypeDecorator, create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import config as db_module
from app.core import security as sec_module
from app.main import create_app
from app.models import Base

SESSION_PATCH_TARGETS = (
    "app.api.instructor.db_session",
    "app.api.client.db_session",
    "app.api.common.db_session",
)


class TZDateTime(TypeDecorator):
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


def make_token(sub, email, first_name, last_name, role):
    return {
        "sub": sub,
        "email": email,
        "given_name": first_name,
        "family_name": last_name,
        "realm_access": {"roles": [role]},
    }


def auth_header(tok):
    return {"Authorization": f"Bearer {tok}"}


@contextmanager
def sqlite_test_client(tokens):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, DateTime):
                col.type = TZDateTime()
    Base.metadata.create_all(bind=engine)
    scoped = scoped_session(sessionmaker(bind=engine, autoflush=False, expire_on_commit=False))
    try:
        with ExitStack() as stack:
            stack.enter_context(patch.object(db_module, "db_session", scoped))
            stack.enter_context(patch.object(sec_module, "db_session", scoped))
            for target in SESSION_PATCH_TARGETS:
                stack.enter_context(patch(target, scoped))
            stack.enter_context(patch.object(sec_module, "_decode_token", side_effect=lambda t: tokens[t]))
            stack.enter_context(patch("app.services.notification_service.notify_reservation_confirmed"))
            stack.enter_context(patch("app.services.notification_service.notify_reservation_cancelled"))
            yield create_app().test_client()
    finally:
        scoped.remove()
        for table in Base.metadata.tables.values():
            for col in table.columns:
                if isinstance(col.type, TZDateTime):
                    col.type = DateTime(timezone=True)
