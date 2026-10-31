import os
from pathlib import Path

from dotenv import load_dotenv

# Jawna ścieżka do .env w katalogu głównym repozytorium (backend/app/core -> root),
# niezależna od bieżącego katalogu roboczego (flask CLI, alembic, pytest).
_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(_ROOT_ENV)


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """Ustawienia infrastrukturalne (baza danych, Keycloak) – źródło: zmienne środowiskowe."""

    DB_USER: str = os.getenv("POSTGRES_USER", "spider_admin")
    DB_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "spider_secret_pass")
    DB_HOST: str = os.getenv("POSTGRES_HOST", "127.0.0.1")
    # Port hosta mapowany na kontener PostgreSQL (docker-compose: 5433:5432)
    DB_PORT: str = os.getenv("POSTGRES_PORT", "5433")
    DB_NAME: str = os.getenv("POSTGRES_DB", "spider_db")
    SQL_ECHO: bool = _env_bool("SQL_ECHO", False)

    KEYCLOAK_URL: str = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
    KEYCLOAK_REALM: str = os.getenv("KEYCLOAK_REALM", "spider-climbing")
    KEYCLOAK_CLIENT_ID: str = os.getenv("KEYCLOAK_CLIENT_ID", "spider-frontend")

    # SendGrid API & moduł powiadomień (specyfikacja pkt 5 „Obsługa powiadomień”).
    # Domyślnie wyłączone: brak klucza API nie blokuje testów ani pracy offline –
    # powiadomienia są wtedy logowane jako [NOTIFICATION MOCK].
    NOTIFICATIONS_ENABLED: bool = _env_bool("NOTIFICATIONS_ENABLED", False)
    SENDGRID_API_KEY: str = os.getenv("SENDGRID_API_KEY", "")
    SENDGRID_FROM_EMAIL: str = os.getenv("SENDGRID_FROM_EMAIL", "rezerwacje@cw-spider.pl")

    @property
    def DATABASE_URL(self) -> str:
        # Jawny sterownik: SQLAlchemy 2.1 dla samego "postgresql://" domyślnie wybiera psycopg (v3)
        return f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def KEYCLOAK_ISSUER(self) -> str:
        return f"{self.KEYCLOAK_URL}/realms/{self.KEYCLOAK_REALM}"

    @property
    def KEYCLOAK_JWKS_URL(self) -> str:
        return f"{self.KEYCLOAK_ISSUER}/protocol/openid-connect/certs"


settings = Settings()


class FlaskConfig:
    """Konfiguracja aplikacji Flask oraz flask-smorest (OpenAPI / Swagger UI)."""

    API_TITLE = "CW Spider – Reservation API"
    API_VERSION = "v1"
    OPENAPI_VERSION = "3.0.3"
    OPENAPI_URL_PREFIX = "/"
    OPENAPI_JSON_PATH = "openapi.json"
    OPENAPI_SWAGGER_UI_PATH = "/docs"
    OPENAPI_SWAGGER_UI_URL = "https://cdn.jsdelivr.net/npm/swagger-ui-dist/"

    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]