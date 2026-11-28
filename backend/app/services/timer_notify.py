"""Powiadomienie na telefon, gdy minutnik się skończy.

iPhone usypia aplikację w tle i zgaszony ekran nie zapiszczy. Dlatego przy starcie
minutnika telefon mówi serwerowi "za 10 minut", a serwer o czasie prosi Home Assistant
o powiadomienie (usługa notify, np. aplikacja Home Assistant na iPhonie - za darmo,
bez Web Push i bez HTTPS). Minutniki zapisujemy też w bazie (ActiveTimer): po restarcie
albo aktualizacji dodatku restore() planuje je od nowa, a te, które skończyły się w trakcie
restartu, od razu wysyłają spóźnione powiadomienie.
"""

import logging
import threading
from datetime import datetime, timedelta

import httpx

from ..config import get_settings
from ..database import SessionLocal
from ..models import ActiveTimer

log = logging.getLogger(__name__)

_timers: dict[int, threading.Timer] = {}
_lock = threading.Lock()
# Minutnik, który skończył się dawniej niż tyle przed startem serwera, nie wysyła już powiadomienia
LATE_LIMIT = timedelta(minutes=30)


def services() -> list[str]:
    """Usługi notify z ustawień, np. ['mobile_app_iphone']; 'notify.' z przodu jest zbędne."""
    names = [s.strip().removeprefix("notify.") for s in get_settings().ha_notify.split(",")]
    return [n for n in names if n]


def enabled() -> bool:
    return bool(services()) and get_settings().home_assistant is not None


def notify(label: str) -> None:
    connection = get_settings().home_assistant
    if connection is None:
        return
    url, token = connection
    body = {
        "title": "⏱ Minutnik",
        "message": f"Czas minął: {label}",
        # iPhone: dźwięk i pokazanie mimo trybu skupienia
        "data": {"push": {"sound": "default", "interruption-level": "time-sensitive"}},
    }
    with httpx.Client(timeout=10, headers={"Authorization": f"Bearer {token}"}) as client:
        for service in services():
            try:
                response = client.post(f"{url}/api/services/notify/{service}", json=body)
                if response.status_code >= 400:
                    log.warning("Powiadomienie %s: HA odpowiedział %s", service, response.status_code)
            except httpx.HTTPError as exc:
                log.warning("Powiadomienie %s się nie udało: %s", service, exc)


def _forget(timer_id: int) -> None:
    try:
        with SessionLocal() as db:
            db.query(ActiveTimer).filter_by(id=timer_id).delete()
            db.commit()
    except Exception:
        log.exception("Nie udało się usunąć minutnika z bazy")


def _fire(timer_id: int, label: str) -> None:
    with _lock:
        _timers.pop(timer_id, None)
    _forget(timer_id)
    notify(label)


def _schedule(timer_id: int, label: str, seconds: float) -> None:
    timer = threading.Timer(max(seconds, 0), _fire, (timer_id, label))
    timer.daemon = True
    with _lock:
        old = _timers.pop(timer_id, None)
        if old:
            old.cancel()
        _timers[timer_id] = timer
    timer.start()


def start(timer_id: int, label: str, seconds: int) -> bool:
    """Planuje powiadomienie. Zwraca False, gdy powiadomienia są wyłączone."""
    if not enabled():
        return False
    with SessionLocal() as db:
        db.merge(ActiveTimer(id=timer_id, label=label, ends_at=datetime.now() + timedelta(seconds=seconds)))
        db.commit()
    _schedule(timer_id, label, seconds)
    return True


def cancel(timer_id: int) -> None:
    with _lock:
        timer = _timers.pop(timer_id, None)
    if timer:
        timer.cancel()
    _forget(timer_id)


def restore() -> int:
    """Po starcie serwera: planuje minutniki zapisane w bazie. Zwraca, ile zaplanowano."""
    now = datetime.now()
    with SessionLocal() as db:
        saved = db.query(ActiveTimer).all()
        if not enabled():
            db.query(ActiveTimer).delete()
            db.commit()
            return 0
        stale = [t for t in saved if t.ends_at < now - LATE_LIMIT]
        for t in stale:
            db.delete(t)
        db.commit()
        alive = [(t.id, t.label, t.ends_at) for t in saved if t not in stale]
    for timer_id, label, ends_at in alive:
        late = ends_at <= now
        _schedule(timer_id, f"{label} (spóźnione - serwer się restartował)" if late else label,
                  (ends_at - now).total_seconds())
    if alive:
        log.info("Przywrócono minutniki po restarcie: %d", len(alive))
    return len(alive)
