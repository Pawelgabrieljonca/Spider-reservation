import json
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from app.core.config import settings
from app.services.exceptions import DomainError, NotFoundError

logger = logging.getLogger(__name__)

PASSWORD_RESET_COOLDOWN_SECONDS = 60
PASSWORD_RESET_LINK_LIFESPAN_SECONDS = 900

_token_lock = threading.Lock()
_cached_token: str | None = None
_cached_token_expires_at: float = 0.0

_rate_limit_lock = threading.Lock()
_last_reset_request_by_user: dict[str, float] = {}

class KeycloakAdminNotConfiguredError(DomainError):
    http_status = 503
    code = "KEYCLOAK_ADMIN_NOT_CONFIGURED"
    default_message = "Usługa zmiany hasła nie jest jeszcze skonfigurowana po stronie serwera."

class KeycloakAdminUnavailableError(DomainError):
    http_status = 503
    code = "KEYCLOAK_ADMIN_UNAVAILABLE"
    default_message = "Nie udało się zlecić wysyłki e-maila w serwerze tożsamości (Keycloak)."

class PasswordResetRateLimitedError(DomainError):
    http_status = 429
    code = "PASSWORD_RESET_RATE_LIMITED"
    default_message = "Link do zmiany hasła został już niedawno wysłany. Spróbuj ponownie za minutę."

def _clear_internal_caches() -> None:
    global _cached_token, _cached_token_expires_at
    with _token_lock:
        _cached_token = None
        _cached_token_expires_at = 0.0
    with _rate_limit_lock:
        _last_reset_request_by_user.clear()

def _get_service_account_token(now: float | None = None) -> str:
    global _cached_token, _cached_token_expires_at

    if not settings.KEYCLOAK_ADMIN_CLIENT_SECRET:
        raise KeycloakAdminNotConfiguredError()

    current_time = time.monotonic() if now is None else now
    with _token_lock:
        if _cached_token and current_time < _cached_token_expires_at:
            return _cached_token

        form_data = urllib.parse.urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": settings.KEYCLOAK_ADMIN_CLIENT_ID,
                "client_secret": settings.KEYCLOAK_ADMIN_CLIENT_SECRET,
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            settings.KEYCLOAK_TOKEN_URL,
            data=form_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
            logger.error("Nie udało się pobrać tokenu service account z Keycloaka: %s", exc)
            raise KeycloakAdminUnavailableError(
                "Serwer tożsamości (Keycloak) jest chwilowo niedostępny."
            ) from exc

        access_token = payload.get("access_token")
        if not access_token:
            raise KeycloakAdminUnavailableError(
                "Nieprawidłowa odpowiedź serwera tożsamości (brak access_token)."
            )

        expires_in = int(payload.get("expires_in", 60))
        _cached_token = access_token
        _cached_token_expires_at = current_time + max(expires_in - 30, 5)
        return access_token

def send_password_reset_email(
    keycloak_id: str,
    *,
    redirect_path: str = "/",
    lifespan: int = PASSWORD_RESET_LINK_LIFESPAN_SECONDS,
    now: float | None = None,
) -> None:
    if not settings.KEYCLOAK_ADMIN_CLIENT_SECRET:
        raise KeycloakAdminNotConfiguredError()

    current_time = time.monotonic() if now is None else now
    with _rate_limit_lock:
        last_sent = _last_reset_request_by_user.get(keycloak_id)
        if last_sent is not None and (current_time - last_sent) < PASSWORD_RESET_COOLDOWN_SECONDS:
            remaining = int(PASSWORD_RESET_COOLDOWN_SECONDS - (current_time - last_sent)) + 1
            raise PasswordResetRateLimitedError(
                f"Link do zmiany hasła został już wysłany. Kolejną prośbę wyślesz za {remaining} s."
            )

    service_token = _get_service_account_token(now=current_time)

    safe_path = redirect_path if redirect_path.startswith("/") else f"/{redirect_path}"
    query = urllib.parse.urlencode(
        {
            "client_id": settings.KEYCLOAK_CLIENT_ID,
            "redirect_uri": f"{settings.FRONTEND_URL}{safe_path}",
            "lifespan": lifespan,
        }
    )
    url = f"{settings.KEYCLOAK_ADMIN_USERS_URL}/{urllib.parse.quote(keycloak_id, safe='')}/execute-actions-email?{query}"

    req = urllib.request.Request(
        url,
        data=json.dumps(["UPDATE_PASSWORD"]).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {service_token}",
            "Content-Type": "application/json",
        },
        method="PUT",
    )

    try:
        with urllib.request.urlopen(req, timeout=15):
            pass
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        logger.error(
            "Keycloak execute-actions-email zwrócił HTTP %s dla user=%s: %s",
            exc.code,
            keycloak_id,
            body,
        )
        if exc.code == 404:
            raise NotFoundError("Konto użytkownika nie zostało odnalezione w Keycloak.") from exc
        if exc.code == 401:
            with _token_lock:
                global _cached_token, _cached_token_expires_at
                _cached_token = None
                _cached_token_expires_at = 0.0
        raise KeycloakAdminUnavailableError(
            "Nie udało się wysłać wiadomości e-mail ze zmianą hasła. Sprawdź konfigurację SMTP w Keycloak."
        ) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        logger.error("Błąd połączenia z Keycloak Admin API: %s", exc)
        raise KeycloakAdminUnavailableError(
            "Brak połączenia z serwerem tożsamości (Keycloak)."
        ) from exc

    with _rate_limit_lock:
        _last_reset_request_by_user[keycloak_id] = current_time
