"""Logowanie: właściciel hasłem z opcji dodatku, domownicy - nazwą i własnym hasłem.

Po zalogowaniu przeglądarka dostaje podpisane ciasteczko `session`.
Skróty iOS i inne skrypty mogą zamiast tego wysłać nagłówek
`X-App-Password: <hasło właściciela>`.

Właściciel (id None) widzi wszystko i zarządza kontami. Domownik (np. brat) ma wspólne
przepisy, ale własny plan, listę zakupów, spiżarnię, ulubione i oceny (services/kitchen.py),
zmienia tylko przepisy, które sam dodał, i nie ma dostępu do kopii zapasowych ani Home Assistant.
"""

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from itsdangerous import BadSignature, URLSafeTimedSerializer

from .config import get_settings
from .database import SessionLocal

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


@dataclass(frozen=True)
class CurrentUser:
    """Zalogowana osoba. id None = właściciel aplikacji."""

    id: int | None
    name: str

    @property
    def is_owner(self) -> bool:
        return self.id is None


OWNER_NAME_KEY = "owner_name"
DEFAULT_OWNER_NAME = "Właściciel"
PBKDF2_ROUNDS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ROUNDS).hex()
    return f"{salt}${digest}"


def check_password(password: str, stored: str) -> bool:
    salt, _, digest = stored.partition("$")
    test = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ROUNDS).hex()
    return hmac.compare_digest(test, digest)


_owner_name: list[str] = []  # pamięć podręczna - nazwa jest potrzebna przy każdym zapytaniu


def owner_name() -> str:
    from .models import AppSetting

    if not _owner_name:
        with SessionLocal() as db:
            row = db.get(AppSetting, OWNER_NAME_KEY)
            _owner_name.append(row.value if row and row.value else DEFAULT_OWNER_NAME)
    return _owner_name[0]


def forget_owner_name() -> None:
    """Po zmianie nazwy w Ustawieniach (i w testach)."""
    _owner_name.clear()


def _member_tag(user_id: int, password_hash: str) -> str:
    """Jak _password_tag, ale dla domownika: zmiana jego hasła albo usunięcie konta kończy sesje."""
    secret = get_settings().secret_key
    return hashlib.sha256(f"{secret}:{user_id}:{password_hash}".encode()).hexdigest()[:16]


def make_session_token(user_id: int | None = None, password_hash: str = "") -> str:
    # Właściciel ma w ciasteczku sam skrót hasła - tak jak przed kontami, więc stare sesje działają
    if user_id is None:
        return _serializer().dumps(_password_tag())
    return _serializer().dumps({"u": user_id, "t": _member_tag(user_id, password_hash)})


def find_member(name: str):
    """Konto domownika o tej nazwie (bez względu na wielkość liter) albo None."""
    from .models import User

    wanted = name.strip().casefold()
    if not wanted:
        return None
    with SessionLocal() as db:
        return next((u for u in db.query(User) if u.name.casefold() == wanted), None)


# Ochrona przed zgadywaniem hasła: po MAX_FAILURES złych próbach z jednego adresu
# kolejne są odrzucane przez LOCK_SECONDS sekund.
MAX_FAILURES = 5
LOCK_SECONDS = 60
_failures: dict[str, tuple[int, float]] = {}


def seconds_locked(client: str) -> int:
    """Ile sekund ten adres musi jeszcze poczekać z logowaniem (0 = może próbować)."""
    count, until = _failures.get(client, (0, 0.0))
    return max(0, round(until - time.monotonic())) if count >= MAX_FAILURES else 0


def client_address(request: Request) -> str:
    return request.client.host if request.client else "?"


def record_login(client: str, success: bool) -> None:
    if success:
        _failures.pop(client, None)
        return
    count, until = _failures.get(client, (0, 0.0))
    now = time.monotonic()
    if len(_failures) > 1000:  # nie trzymamy w pamięci starych adresów bez końca
        for old in [c for c, (_n, u) in _failures.items() if u < now]:
            del _failures[old]
    # Złe próby liczymy od nowa, gdy od poprzedniej minęło LOCK_SECONDS
    count = 1 if now > until else count + 1
    _failures[client] = (count, now + LOCK_SECONDS)


def user_from_request(request: Request) -> CurrentUser | None:
    """Kto jest zalogowany (None = nikt)."""
    if not get_settings().app_password:
        return CurrentUser(None, owner_name())  # hasło nie ustawione = wszyscy wpuszczeni jako właściciel
    header = request.headers.get("X-App-Password")
    if header is not None:
        # Hasło w nagłówku (Skróty iOS) ma ten sam limit złych prób co ekran logowania
        client = client_address(request)
        if seconds_locked(client):
            return None
        ok = password_ok(header)
        record_login(client, ok)
        return CurrentUser(None, owner_name()) if ok else None
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        data = _serializer().loads(token, max_age=COOKIE_MAX_AGE)
    except BadSignature:
        return None
    if isinstance(data, dict):
        from .models import User

        with SessionLocal() as db:
            user = db.get(User, data.get("u"))
        if user is None or not hmac.compare_digest(str(data.get("t")), _member_tag(user.id, user.password_hash)):
            return None
        return CurrentUser(user.id, user.name)
    if hmac.compare_digest(str(data), _password_tag()):
        return CurrentUser(None, owner_name())
    return None


def is_authenticated(request: Request) -> bool:
    return user_from_request(request) is not None


def current_user(request: Request) -> CurrentUser:
    """Zależność FastAPI: zalogowana osoba (401, gdy nikt)."""
    user = user_from_request(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Zaloguj się")
    return user


def require_auth(user: CurrentUser = Depends(current_user)) -> None:
    """Zależność FastAPI: wpuszcza tylko zalogowanych."""


def require_owner(user: CurrentUser = Depends(current_user)) -> None:
    """Zależność FastAPI: tylko właściciel (kopie, Home Assistant, konta, ustawienia składników)."""
    if not user.is_owner:
        raise HTTPException(status_code=403, detail="To może zmienić tylko właściciel aplikacji")


def owned(column, user: CurrentUser):
    """Warunek SQL "należy do tej osoby" dla kolumny user_id (None = właściciel)."""
    return column.is_(None) if user.id is None else column == user.id
