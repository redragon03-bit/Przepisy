"""Lista zakupów: dodawanie składników z przepisów (z łączeniem) i lista w Home Assistant.

Pozycje wysłane do HA pamiętają swój tekst w HA (ShoppingItem.ha_text). Dzięki temu
lista w aplikacji i w HA zgadza się w obie strony: odhaczone w HA jest odhaczone tutaj,
odhaczone tutaj - w HA, a dopisane w HA (np. głosem przez Assist) pojawia się w aplikacji.
"""

import logging
import re

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Ingredient, Recipe, ShoppingItem
from .matching import covers

log = logging.getLogger(__name__)


class ShoppingError(Exception):
    """Komunikat pokazywany użytkownikowi."""


def format_amount(amount: float) -> str:
    """1.5 -> '1,5', 200.0 -> '200', 0.333 -> '0,33'."""
    if amount >= 10:
        amount = round(amount)
    text = f"{amount:.2f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")


def scale_text(text: str, amount: float | None, factor: float) -> str:
    """Przelicza ilość w linijce, np. ('200 g mąki', 200, 1.5) -> '300 g mąki'.

    Zmieniamy tylko pierwszą liczbę i tylko gdy to ta sama ilość co `amount`
    (żeby nie zepsuć np. "jajka rozmiar L, 2 sztuki" w nietypowym zapisie).
    """
    if factor == 1 or amount is None:
        return text
    match = _NUMBER.search(text)
    if match and abs(float(match.group().replace(",", ".")) - amount) < 0.01:
        return text[:match.start()] + format_amount(amount * factor) + text[match.end():]
    return f"{text} (×{format_amount(factor)})"


def _merged_text(item: ShoppingItem) -> str:
    return f"{format_amount(item.amount)} {item.unit} {item.name}".replace("  ", " ")


def pantry_names(db: Session) -> list[str]:
    return [i.name for i in db.query(Ingredient).filter_by(in_pantry=True).order_by(Ingredient.name)]


def add_recipe(db: Session, recipe: Recipe, factor: float = 1, skip_staples: bool = True,
               skipped: list[str] | None = None) -> int:
    """Dopisuje składniki przepisu do listy. Zwraca liczbę dodanych/zmienionych pozycji.

    Ten sam składnik w tej samej jednostce (np. "mąka pszenna" w gramach) z kilku
    przepisów łączymy w jedną pozycję i sumujemy ilości.
    Składniki ze spiżarni pomijamy i dopisujemy do listy `skipped` (jeśli podana).
    """
    open_items = db.query(ShoppingItem).filter_by(checked=False).all()
    pantry = pantry_names(db)
    changed = 0
    for line in recipe.ingredients:
        name = line.ingredient.name
        if skip_staples and line.ingredient.is_staple:
            continue
        # "ser" w spiżarni pokrywa "ser żółty" w przepisie
        if any(covers(have, name) for have in pantry):
            if skipped is not None and name not in skipped:
                skipped.append(name)
            continue
        amount = line.amount * factor if line.amount is not None else None
        # Pozycji wysłanych już do HA nie zmieniamy - w HA zostałby stary tekst
        same = next((i for i in open_items if i.name == name and i.unit == line.unit and not i.ha_text), None)
        if same is None:
            item = ShoppingItem(name=name, text=scale_text(line.text, line.amount, factor),
                                amount=amount, unit=line.unit, recipes=recipe.title)
            db.add(item)
            open_items.append(item)
        else:
            if same.amount is not None and amount is not None:
                same.amount += amount
                same.text = _merged_text(same)
            if recipe.title not in same.recipes.split(", "):
                same.recipes = f"{same.recipes}, {recipe.title}" if same.recipes else recipe.title
        changed += 1
    return changed


def _post(client: httpx.Client, url: str, service: str, data: dict, response: bool = False) -> httpx.Response:
    settings = get_settings()
    result = client.post(f"{url}/api/services/todo/{service}" + ("?return_response" if response else ""),
                         json={"entity_id": settings.ha_todo_entity, **data})
    if result.status_code in (401, 403):
        raise ShoppingError("Home Assistant odrzucił token.")
    if result.status_code >= 400:
        raise ShoppingError(
            f"Home Assistant odpowiedział błędem {result.status_code}. "
            f"Sprawdź, czy istnieje lista {settings.ha_todo_entity}."
        )
    return result


def _ha_client() -> tuple[httpx.Client, str]:
    connection = get_settings().home_assistant
    if connection is None:
        raise ShoppingError("Wysyłka do Home Assistant nie jest skonfigurowana.")
    url, token = connection
    return httpx.Client(timeout=10, headers={"Authorization": f"Bearer {token}"}), url


def send_to_home_assistant(items: list[ShoppingItem]) -> None:
    """Dodaje pozycje do listy "Do zrobienia" w Home Assistant (usługa todo.add_item)."""
    client, url = _ha_client()
    try:
        with client:
            for item in items:
                _post(client, url, "add_item", {
                    "item": item.text,
                    "description": f"Do: {item.recipes}" if item.recipes else "",
                })
                item.ha_text = item.text
    except httpx.HTTPError as exc:
        raise ShoppingError("Nie udało się połączyć z Home Assistant.") from exc


def sync_with_home_assistant(db: Session) -> None:
    """Przenosi zmiany z listy w HA do aplikacji: odhaczenia i nowe pozycje. Nie zapisuje sesji."""
    client, url = _ha_client()
    entity = get_settings().ha_todo_entity
    try:
        with client:
            data = _post(client, url, "get_items", {}, response=True).json()
    except httpx.HTTPError as exc:
        raise ShoppingError("Nie udało się połączyć z Home Assistant.") from exc
    ha_items = data.get("service_response", {}).get(entity, {}).get("items", [])
    status = {}
    for ha_item in ha_items:
        # Ta sama nazwa dwa razy: liczy się nieodhaczona
        if status.get(ha_item["summary"]) != "needs_action":
            status[ha_item["summary"]] = ha_item["status"]
    items = db.query(ShoppingItem).all()
    for item in items:
        if item.ha_text and item.ha_text in status:
            item.checked = status[item.ha_text] == "completed"
    known = {item.ha_text for item in items if item.ha_text}
    for summary, state in status.items():
        if state == "needs_action" and summary not in known:
            db.add(ShoppingItem(text=summary, ha_text=summary))


def update_in_home_assistant(changes: list[tuple[str, str]]) -> None:
    """Zmiany z aplikacji w HA: [(tekst w HA, "completed" | "needs_action" | "remove")].

    Dodatek, nie podstawa: gdy HA nie odpowiada, lista w aplikacji i tak jest zmieniona.
    """
    if not changes or get_settings().home_assistant is None:
        return
    client, url = _ha_client()
    with client:
        for text, change in changes:
            # Po jednej pozycji: brak jednej w HA (np. usunięta tam ręcznie) nie blokuje reszty
            try:
                if change == "remove":
                    _post(client, url, "remove_item", {"item": text})
                else:
                    _post(client, url, "update_item", {"item": text, "status": change})
            except (httpx.HTTPError, ShoppingError) as exc:
                log.warning("Nie udało się zmienić %r na liście w Home Assistant: %s", text, exc)
