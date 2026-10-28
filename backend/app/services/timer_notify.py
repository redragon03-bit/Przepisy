"""Powiadomienie na telefon, gdy minutnik się skończy.

iPhone usypia aplikację w tle i zgaszony ekran nie zapiszczy. Dlatego przy starcie
minutnika telefon mówi serwerowi "za 10 minut", a serwer o czasie prosi Home Assistant
o powiadomienie (usługa notify, np. aplikacja Home Assistant na iPhonie - za darmo,
bez Web Push i bez HTTPS). Minutniki trzymamy tylko w pamięci: restart serwera je kasuje.
"""

import logging
import threading

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)

_timers: dict[int, threading.Timer] = {}
_lock = threading.Lock()


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


def _fire(timer_id: int, label: str) -> None:
    with _lock:
        _timers.pop(timer_id, None)
    notify(label)


def start(timer_id: int, label: str, seconds: int) -> bool:
    """Planuje powiadomienie. Zwraca False, gdy powiadomienia są wyłączone."""
    if not enabled():
        return False
    timer = threading.Timer(seconds, _fire, (timer_id, label))
    timer.daemon = True
    with _lock:
        old = _timers.pop(timer_id, None)
        if old:
            old.cancel()
        _timers[timer_id] = timer
    timer.start()
    return True


def cancel(timer_id: int) -> None:
    with _lock:
        timer = _timers.pop(timer_id, None)
    if timer:
        timer.cancel()
