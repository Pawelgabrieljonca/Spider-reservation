import os
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

_PARENTS = Path(__file__).resolve().parents
if len(_PARENTS) > 3:
    load_dotenv(_PARENTS[3] / ".env")

CLUB_TIMEZONE = ZoneInfo("Europe/Warsaw")
EXPERIENCE_LABELS = {
    "BEGINNER": "Początkujący",
    "INTERMEDIATE": "Średniozaawansowany",
    "ADVANCED": "Zaawansowany",
}


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    DB_USER: str = os.getenv("POSTGRES_USER", "spider_admin")
    DB_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "spider_secret_pass")
    DB_HOST: str = os.getenv("POSTGRES_HOST", "127.0.0.1")
    DB_PORT: str = os.getenv("POSTGRES_PORT", "5433")
    DB_NAME: str = os.getenv("POSTGRES_DB", "spider_db")
    SQL_ECHO: bool = _env_bool("SQL_ECHO", False)

    KEYCLOAK_URL: str = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
    KEYCLOAK_INTERNAL_URL: str = os.getenv("KEYCLOAK_INTERNAL_URL", "") or KEYCLOAK_URL
    KEYCLOAK_REALM: str = os.getenv("KEYCLOAK_REALM", "spider-climbing")
    KEYCLOAK_CLIENT_ID: str = os.getenv("KEYCLOAK_CLIENT_ID", "spider-frontend")
    KEYCLOAK_ADMIN_CLIENT_ID: str = os.getenv("KEYCLOAK_ADMIN_CLIENT_ID", "spider-backend-admin")
    KEYCLOAK_ADMIN_CLIENT_SECRET: str = os.getenv("KEYCLOAK_ADMIN_CLIENT_SECRET", "")
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

    NOTIFICATIONS_ENABLED: bool = _env_bool("NOTIFICATIONS_ENABLED", False)
    SENDGRID_API_KEY: str = os.getenv("SENDGRID_API_KEY", "")
    SENDGRID_FROM_EMAIL: str = os.getenv("SENDGRID_FROM_EMAIL", "rezerwacje@cw-spider.pl")

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def KEYCLOAK_ISSUER(self) -> str:
        return f"{self.KEYCLOAK_URL}/realms/{self.KEYCLOAK_REALM}"

    @property
    def KEYCLOAK_JWKS_URL(self) -> str:
        return f"{self.KEYCLOAK_INTERNAL_URL}/realms/{self.KEYCLOAK_REALM}/protocol/openid-connect/certs"

    @property
    def KEYCLOAK_TOKEN_URL(self) -> str:
        return f"{self.KEYCLOAK_INTERNAL_URL}/realms/{self.KEYCLOAK_REALM}/protocol/openid-connect/token"

    @property
    def KEYCLOAK_ADMIN_USERS_URL(self) -> str:
        return f"{self.KEYCLOAK_INTERNAL_URL}/admin/realms/{self.KEYCLOAK_REALM}/users"


settings = Settings()


class FlaskConfig:
    API_TITLE = "CW Spider – Reservation API"
    API_VERSION = "v1"
    OPENAPI_VERSION = "3.0.3"
    OPENAPI_URL_PREFIX = "/"
    OPENAPI_JSON_PATH = "openapi.json"
    OPENAPI_SWAGGER_UI_PATH = "/docs"
    OPENAPI_SWAGGER_UI_URL = "https://cdn.jsdelivr.net/npm/swagger-ui-dist/"
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]


engine = create_engine(settings.DATABASE_URL, echo=settings.SQL_ECHO, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine)
db_session = scoped_session(SessionLocal)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt_val: datetime) -> datetime:
    return dt_val.replace(tzinfo=timezone.utc) if dt_val.tzinfo is None else dt_val.astimezone(timezone.utc)


def full_name(user, fallback: str = "") -> str:
    if user is None:
        return fallback
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or fallback


def enum_value(val) -> str:
    return val.value if hasattr(val, "value") else str(val)
