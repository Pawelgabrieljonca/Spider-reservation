"""Uwierzytelnianie i autoryzacja: weryfikacja tokenów JWT wydawanych przez Keycloak.

Przepływ:
  1. Token Bearer jest weryfikowany kluczem publicznym z JWKS realmu (RS256, `iss`, `exp`).
  2. `azp` musi wskazywać klienta frontendowego (token wydany dla naszej aplikacji).
  3. Role pochodzą z `realm_access.roles` (ROLE_CLIENT / ROLE_INSTRUCTOR / ROLE_ADMIN).
  4. Lokalny rekord `users` jest tworzony przy pierwszym żądaniu (JIT provisioning)
     i synchronizowany z najwyższą rolą z tokenu.
"""

import functools

import jwt
from flask import g, request
from flask_smorest import abort
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import db_session
from app.models import User, UserRole

# Fragment do @blp.doc(**SECURITY_DOC) – przycisk "Authorize" w Swagger UI.
SECURITY_DOC = {"security": [{"bearerAuth": []}]}

# Klucze JWKS są pobierane leniwie i cache'owane (brak ruchu sieciowego przy imporcie).
_jwks_client = PyJWKClient(settings.KEYCLOAK_JWKS_URL, cache_keys=True, lifespan=3600)

# Od najwyższej do najniższej – rola zapisywana w tabeli users.
_ROLE_PRIORITY = (UserRole.ADMIN, UserRole.INSTRUCTOR, UserRole.CLIENT)


def _extract_token() -> str:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        abort(401, message="Brak nagłówka Authorization: Bearer <token>.")
    return token.strip()


def _decode_token(token: str) -> dict:
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.KEYCLOAK_ISSUER,
            # Keycloak dla klienta publicznego wystawia aud=account, więc weryfikujemy `azp`.
            options={"require": ["exp", "iss", "sub"], "verify_aud": False},
        )
    except PyJWKClientConnectionError:
        abort(503, message="Serwer tożsamości (Keycloak) jest niedostępny.")
    except jwt.PyJWTError:
        abort(401, message="Token jest nieprawidłowy lub wygasł.")

    if claims.get("azp") != settings.KEYCLOAK_CLIENT_ID:
        abort(401, message="Token wystawiony dla innej aplikacji.")
    return claims


def _token_roles(claims: dict) -> set[UserRole]:
    names = set(claims.get("realm_access", {}).get("roles", []))
    return {role for role in UserRole if role.value in names}


def _provision_user(claims: dict, roles: set[UserRole]) -> User:
    role = next(r for r in _ROLE_PRIORITY if r in roles)
    user = db_session.scalar(select(User).where(User.keycloak_id == claims["sub"]))

    if user is None:
        if not claims.get("email"):
            abort(403, message="Konto w Keycloak nie ma adresu e-mail.")
        user = User(
            keycloak_id=claims["sub"],
            email=claims["email"],
            first_name=claims.get("given_name") or "-",
            last_name=claims.get("family_name") or "-",
            role=role,
        )
        db_session.add(user)
        try:
            db_session.commit()
        except IntegrityError:
            # Równoległe pierwsze żądania tego samego użytkownika – wygrywa pierwszy INSERT.
            db_session.rollback()
            user = db_session.scalar(select(User).where(User.keycloak_id == claims["sub"]))
            if user is None:
                abort(409, message="Konflikt danych konta (adres e-mail jest już używany).")
    elif user.role != role:
        user.role = role
        db_session.commit()
    return user


def current_user() -> User | None:
    """Zalogowany użytkownik (dostępny wewnątrz endpointu chronionego `require_roles` lub `optional_roles`)."""
    return getattr(g, "current_user", None)


def require_roles(*allowed: UserRole):
    """Dekorator endpointu: wymaga ważnego tokenu z co najmniej jedną z podanych ról.

    Umieszczaj go NAD @blp.arguments, aby autoryzacja wykonywała się przed walidacją danych.
    """

    def decorator(view):
        @functools.wraps(view)
        def wrapper(*args, **kwargs):
            claims = _decode_token(_extract_token())
            roles = _token_roles(claims)
            if not roles:
                abort(403, message="Konto nie posiada żadnej roli w systemie CW Spider.")
            if not roles.intersection(allowed):
                abort(403, message="Brak uprawnień do tego zasobu.")
            g.current_user = _provision_user(claims, roles)
            return view(*args, **kwargs)

        return wrapper

    return decorator


def optional_roles(*allowed: UserRole):
    """Dekorator endpointu: jeśli podano Bearer token, weryfikuje go i ustawia `g.current_user`.
    Jeśli żądanie jest anonimowe (brak nagłówka Authorization), przechodzi dalej z `g.current_user = None`.
    """

    def decorator(view):
        @functools.wraps(view)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "").strip()
            g.current_user = None
            if auth_header:
                scheme, _, token = auth_header.partition(" ")
                if scheme.lower() == "bearer" and token.strip():
                    try:
                        claims = _decode_token(token.strip())
                        roles = _token_roles(claims)
                        if roles and (not allowed or roles.intersection(allowed)):
                            g.current_user = _provision_user(claims, roles)
                    except Exception:
                        g.current_user = None
            return view(*args, **kwargs)

        return wrapper

    return decorator
