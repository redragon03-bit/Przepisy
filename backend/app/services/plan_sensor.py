"""Plan na dziś w Home Assistant: czujnik sensor.przepisy_dzis ("Dziś na obiad: Gulasz").

Aplikacja sama ustawia stan czujnika przez API Home Assistant (POST /api/states/...),
więc w HA nie trzeba niczego konfigurować. Taki stan HA zapomina przy restarcie,
dlatego odświeżamy go co kwadrans (i od razu po każdej zmianie planu). Dzięki temu
czujnik zmienia się też sam o północy.

Przykłady użycia w HA: karta na dashboardzie w kuchni albo automatyzacja o 16:00
"Dziś na obiad: {{ states('sensor.przepisy_dzis') }}" z listą składników z atrybutu.
"""

import logging
import threading
import time
from datetime import date, timedelta

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal
from ..models import MealPlanEntry

log = logging.getLogger(__name__)

SENSOR = "sensor.przepisy_dzis"
REFRESH_EVERY_SECONDS = 15 * 60
# Stan czujnika w HA może mieć najwyżej 255 znaków
MAX_STATE = 255


def _titles(db: Session, day: date) -> list[MealPlanEntry]:
    return db.query(MealPlanEntry).filter_by(day=day).order_by(MealPlanEntry.id).all()


def sensor_state(db: Session, today: date | None = None) -> dict:
    """Stan i atrybuty czujnika (bez wysyłania) - osobno, żeby dało się to przetestować."""
    today = today or date.today()
    entries = _titles(db, today)
    tomorrow = _titles(db, today + timedelta(days=1))
    state = ", ".join(e.recipe.title for e in entries) or "nic nie zaplanowano"
    return {
        "state": state[:MAX_STATE],
        "attributes": {
            "friendly_name": "Dziś na obiad",
            "icon": "mdi:silverware-fork-knife",
            "recipes": [
                {
                    "title": e.recipe.title,
                    "minutes": e.recipe.total_minutes,
                    "ingredients": [ri.text for ri in e.recipe.ingredients],
                    "path": f"/przepis/{e.recipe.id}",
                }
                for e in entries
            ],
            "tomorrow": ", ".join(e.recipe.title for e in tomorrow) or "nic nie zaplanowano",
        },
    }


def publish() -> None:
    """Wysyła plan na dziś do Home Assistant. Błąd tylko zapisujemy w logu - to dodatek."""
    connection = get_settings().home_assistant
    if connection is None:
        return
    url, token = connection
    with SessionLocal() as db:
        body = sensor_state(db)
    try:
        response = httpx.post(f"{url}/api/states/{SENSOR}", json=body, timeout=10,
                              headers={"Authorization": f"Bearer {token}"})
        if response.status_code >= 400:
            log.warning("Home Assistant nie przyjął planu na dziś: %s", response.status_code)
    except httpx.HTTPError as exc:
        log.warning("Nie udało się wysłać planu na dziś do Home Assistant: %s", exc)


def publish_in_background() -> None:
    """Po zmianie planu - bez czekania na HA w zapytaniu użytkownika."""
    threading.Thread(target=publish, name="plan-sensor", daemon=True).start()


def _loop() -> None:
    while True:
        try:
            publish()
        except Exception:
            log.exception("Plan na dziś dla Home Assistant")
        time.sleep(REFRESH_EVERY_SECONDS)


def start_scheduler() -> None:
    if get_settings().home_assistant is not None:
        threading.Thread(target=_loop, name="plan-sensor-loop", daemon=True).start()
