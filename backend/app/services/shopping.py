"""Lista zakupów: dodawanie składników z przepisów (z łączeniem) i lista w Home Assistant.

Pozycje wysłane do HA pamiętają swój tekst w HA (ShoppingItem.ha_text). Dzięki temu
lista w aplikacji i w HA zgadza się w obie strony: odhaczone w HA jest odhaczone tutaj,
odhaczone tutaj - w HA, a dopisane w HA (np. głosem przez Assist) pojawia się w aplikacji.
"""

import logging
import re
from datetime import date, timedelta

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Ingredient, MealPlanEntry, Recipe, ShoppingItem
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


_FRACTIONS = {"½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8}
_NICE_FRACTIONS = [(1 / 4, "¼"), (1 / 3, "⅓"), (1 / 2, "½"), (2 / 3, "⅔"), (3 / 4, "¾")]
# Jedna ilość: "1 1/2", "1/2", "1½", "½", "1,5", "200"; zakres: "2-3".
# Ta sama logika co frontend/src/lib/scale.ts.
_QUANTITY = r"(?:\d+\s+\d+/\d+|\d+/\d+|\d*[½⅓⅔¼¾⅛]|\d+(?:[.,]\d+)?)"
_QUANTITY_RANGE = re.compile(rf"(?<![\d/.,½⅓⅔¼¾⅛])({_QUANTITY})(?:(\s*[-–]\s*)({_QUANTITY}))?")
# Po tych jednostkach ilość zostaje dziesiętna: "1,5 kg", nie "1 ½ kg"
_METRIC = re.compile(r"\s*(kg|dag|g|ml|l)(?![^\W\d_])")


def parse_quantity(text: str) -> float:
    """'1 1/2' -> 1.5, '½' -> 0.5, '1,5' -> 1.5."""
    text = text.strip()
    if mixed := re.fullmatch(r"(\d+)\s+(\d+)/(\d+)", text):
        return int(mixed[1]) + int(mixed[2]) / int(mixed[3])
    if fraction := re.fullmatch(r"(\d+)/(\d+)", text):
        return int(fraction[1]) / int(fraction[2])
    if unicode := re.fullmatch(r"(\d*)([½⅓⅔¼¾⅛])", text):
        return int(unicode[1] or 0) + _FRACTIONS[unicode[2]]
    return float(text.replace(",", "."))


def format_kitchen_amount(amount: float) -> str:
    """1.5 -> '1 ½', 0.25 -> '¼'; gdy nie pasuje żaden ładny ułamek - jak format_amount."""
    if amount >= 10:
        return format_amount(amount)
    whole = int(amount)
    rest = amount - whole
    if rest < 0.01:
        return str(whole)
    nice = next((symbol for value, symbol in _NICE_FRACTIONS if abs(rest - value) < 0.02), None)
    if nice is None:
        return format_amount(amount)
    return f"{whole} {nice}" if whole else nice


def scale_text(text: str, amount: float | None, factor: float) -> str:
    """Przelicza ilość w linijce, np. ('200 g mąki', 200, 1.5) -> '300 g mąki'.

    Zmieniamy tylko pierwszą ilość (albo zakres "2-3") i tylko gdy to ta sama ilość co `amount`
    (żeby nie zepsuć np. "jajka rozmiar L, 2 sztuki" w nietypowym zapisie). Bez `amount`
    zmieniamy ilość na początku linijki - tak samo jak frontend (scaleText).
    """
    if factor == 1:
        return text
    match = _QUANTITY_RANGE.search(text)
    if amount is None:
        # Bez ilości (przepis wpisany ręcznie) zmieniamy tylko ilość na początku linijki
        if not match or text[:match.start()].strip():
            return text
    elif not match or abs(parse_quantity(match[1]) - amount) >= 0.01:
        return f"{text} (×{format_amount(factor)})"
    after = text[match.end():]
    fmt = format_amount if _METRIC.match(after) else format_kitchen_amount
    scaled = fmt(parse_quantity(match[1]) * factor)
    if match[3]:
        scaled += match[2] + fmt(parse_quantity(match[3]) * factor)
    return text[:match.start()] + scaled + after


# Jednostki sprowadzane do wspólnej przy łączeniu pozycji: "0,5 kg" + "200 g" = "700 g"
_TO_BASE = {"kg": ("g", 1000), "dag": ("g", 10), "g": ("g", 1), "l": ("ml", 1000), "ml": ("ml", 1)}


def _base(amount: float | None, unit: str) -> tuple[float | None, str]:
    base_unit, multiplier = _TO_BASE.get(unit.strip().lower().rstrip("."), (unit, 1))
    return (amount * multiplier if amount is not None else None), base_unit


def _merged_text(item: ShoppingItem) -> str:
    amount, unit = item.amount, item.unit
    if unit in ("g", "ml") and amount is not None and amount >= 1000:
        amount, unit = amount / 1000, {"g": "kg", "ml": "l"}[unit]
    return f"{format_amount(amount)} {unit} {item.name}".replace("  ", " ")


def parse_servings(servings: str) -> int | None:
    """'4 porcje' -> 4, 'na 6 osób' -> 6, '' -> None (jak parseServings we frontendzie)."""
    match = re.search(r"\d+", servings or "")
    return int(match.group()) if match and int(match.group()) > 0 else None


def plan_factor(entry: MealPlanEntry) -> float:
    """Mnożnik ilości dla dania z planu: porcje w planie / porcje w przepisie."""
    base = parse_servings(entry.recipe.servings)
    return entry.servings / base if entry.servings and base else 1


def move_to_pantry(db: Session, items: list[ShoppingItem]) -> list[str]:
    """Kupione produkty z przepisów trafiają do spiżarni. Zwraca ich nazwy."""
    names = sorted({i.name for i in items if i.name})
    for ingredient in db.query(Ingredient).filter(Ingredient.name.in_(names)):
        ingredient.in_pantry = True
    return names


def pantry_names(db: Session) -> list[str]:
    return [i.name for i in db.query(Ingredient).filter_by(in_pantry=True).order_by(Ingredient.name)]


# Produkt, który trzeba zużyć w ciągu tylu dni, jest "do zużycia najpierw"
USE_FIRST_DAYS = 3


def expiring_names(db: Session, days: int = USE_FIRST_DAYS) -> list[str]:
    """Produkty ze spiżarni, którym kończy się termin (najpilniejsze najpierw)."""
    until = date.today() + timedelta(days=days)
    items = (db.query(Ingredient).filter(Ingredient.in_pantry.is_(True), Ingredient.pantry_expires.is_not(None),
                                         Ingredient.pantry_expires <= until)
             .order_by(Ingredient.pantry_expires, Ingredient.name))
    return [i.name for i in items]


def pantry_text(db: Session) -> str:
    """Spiżarnia dla AI, np. 'jajko, mleko (zużyć do 28.10)'."""
    items = db.query(Ingredient).filter_by(in_pantry=True).order_by(Ingredient.name)
    return ", ".join(
        i.name + (f" (zużyć do {i.pantry_expires:%d.%m})" if i.pantry_expires else "") for i in items
    ) or "nic"


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
        base_amount, base_unit = _base(amount, line.unit)
        # Pozycji wysłanych już do HA nie zmieniamy - w HA zostałby stary tekst
        same = next((i for i in open_items if i.name == name and _base(i.amount, i.unit)[1] == base_unit
                     and not i.ha_text), None)
        if same is None:
            item = ShoppingItem(name=name, text=scale_text(line.text, line.amount, factor),
                                amount=amount, unit=line.unit, recipes=recipe.title)
            db.add(item)
            open_items.append(item)
        else:
            if same.amount is not None and amount is not None:
                same.amount = _base(same.amount, same.unit)[0] + base_amount
                same.unit = base_unit
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
