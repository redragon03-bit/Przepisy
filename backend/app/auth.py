"""Proste logowanie jednym hasłem.

Po zalogowaniu przeglądarka dostaje podpisane ciasteczko `session`.
Skróty iOS i inne skrypty mogą zamiast tego wysłać nagłówek
`X-App-Password: <hasło>`.
"""

import hashlib
import hmac
import time

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


def _password_tag() -> str:
    """Skrót hasła zapisany w ciasteczku: po zmianie hasła stare sesje przestają działać."""
    settings = get_settings()
    return hashlib.sha256(f"{settings.secret_key}:{settings.app_password}".encode()).hexdigest()[:16]


def make_session_token() -> str:
    return _serializer().dumps(_password_tag())


# Ochrona przed zgadywaniem hasła: po MAX_FAILURES złych próbach z jednego adresu
# kolejne są odrzucane przez LOCK_SECONDS sekund.
MAX_FAILURES = 5
LOCK_SECONDS = 60
_failures: dict[str, tuple[int, float]] = {}


def seconds_locked(client: str) -> int:
    """Ile sekund ten adres musi jeszcze poczekać z logowaniem (0 = może próbować)."""
    count, until = _failures.get(client, (0, 0.0))
    return max(0, round(until - time.monotonic())) if count >= MAX_FAILURES else 0


def record_login(client: str, success: bool) -> None:
    if success:
        _failures.pop(client, None)
        return
    count, until = _failures.get(client, (0, 0.0))
    now = time.monotonic()
    # Złe próby liczymy od nowa, gdy od poprzedniej minęło LOCK_SECONDS
    count = 1 if now > until else count + 1
    _failures[client] = (count, now + LOCK_SECONDS)


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
        tag = _serializer().loads(token, max_age=COOKIE_MAX_AGE)
    except BadSignature:
        return False
    return hmac.compare_digest(str(tag), _password_tag())


def require_auth(request: Request) -> None:
    """Zależność FastAPI: wpuszcza tylko zalogowanych."""
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="Zaloguj się")
