import functools

import jwt
from flask import g, request
from flask_smorest import abort
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.config import db_session, settings
from app.models import User, UserRole

SECURITY_DOC = {"security": [{"bearerAuth": []}]}

_jwks_client = PyJWKClient(settings.KEYCLOAK_JWKS_URL, cache_keys=True, lifespan=3600)

_ROLE_PRIORITY = (UserRole.INSTRUCTOR, UserRole.CLIENT)

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
    return {role for role in _ROLE_PRIORITY if role.value in names}

def _provision_user(claims: dict, roles: set[UserRole]) -> User:
    role = next(r for r in _ROLE_PRIORITY if r in roles)
    sub = claims["sub"]
    email = (claims.get("email") or "").strip()
    email_verified = bool(claims.get("email_verified"))
    first_name = (claims.get("given_name") or "").strip() or "-"
    last_name = (claims.get("family_name") or "").strip() or "-"

    user = db_session.scalar(select(User).where(User.keycloak_id == sub))

    if user is None and email and email_verified:
        user = db_session.scalar(select(User).where(func.lower(User.email) == email.lower()))
        if user is not None:
            user.keycloak_id = sub
            user.email = email
            user.first_name = first_name
            user.last_name = last_name
            user.role = role
            db_session.commit()
            return user

    if user is None:
        if not email:
            abort(403, message="Konto w Keycloak nie ma adresu e-mail.")
        user = User(
            keycloak_id=sub,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
        )
        db_session.add(user)
        try:
            db_session.commit()
        except IntegrityError:
            db_session.rollback()
            user = db_session.scalar(select(User).where(User.keycloak_id == sub))
            if user is None:
                abort(409, message="Konflikt danych konta (adres e-mail jest już używany).")
        return user

    changed = False
    if user.role != role:
        user.role = role
        changed = True
    if first_name != "-" and user.first_name != first_name:
        user.first_name = first_name
        changed = True
    if last_name != "-" and user.last_name != last_name:
        user.last_name = last_name
        changed = True
    if email and email_verified and user.email.lower() != email.lower():
        user.email = email
        changed = True
    if changed:
        try:
            db_session.commit()
        except IntegrityError:
            db_session.rollback()
            abort(409, message="Konflikt danych konta (adres e-mail jest już używany).")
    return user

def current_user() -> User | None:
    return getattr(g, "current_user", None)

def require_roles(*allowed: UserRole):

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
