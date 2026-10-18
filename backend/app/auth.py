"""Proste logowanie jednym hasłem.

Po zalogowaniu przeglądarka dostaje podpisane ciasteczko `session`.
Skróty iOS i inne skrypty mogą zamiast tego wysłać nagłówek
`X-App-Password: <hasło>`.
"""

import hmac

from fastapi import HTTPException, Request
from itsdangerous import BadSignature, URLSafeTimedSerializer

from .config import get_settings

COOKIE_NAME = "session"
COOKIE_MAX_AGE = 365 * 24 * 3600  # rok - na telefonie nie chcemy logować się co chwilę


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().secret_key, salt="session")


def password_ok(password: str) -> bool:
    # compare_digest porównuje w stałym czasie (utrudnia zgadywanie hasła)
    return hmac.compare_digest(password.encode(), get_settings().app_password.encode())


def make_session_token() -> str:
    return _serializer().dumps("ok")


def is_authenticated(request: Request) -> bool:
    if not get_settings().app_password:
        return True  # hasło nie ustawione = wszyscy wpuszczeni
    header = request.headers.get("X-App-Password")
    if header is not None:
        return password_ok(header)
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return False
    try:
        _serializer().loads(token, max_age=COOKIE_MAX_AGE)
    except BadSignature:
        return False
    return True


def require_auth(request: Request) -> None:
    """Zależność FastAPI: wpuszcza tylko zalogowanych."""
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="Zaloguj się")
