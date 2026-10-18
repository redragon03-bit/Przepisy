"""Lista zakupów: dodawanie składników z przepisów (z łączeniem) i wysyłka do Home Assistant."""

import re

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Recipe, ShoppingItem


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


def add_recipe(db: Session, recipe: Recipe, factor: float = 1, skip_staples: bool = True) -> int:
    """Dopisuje składniki przepisu do listy. Zwraca liczbę dodanych/zmienionych pozycji.

    Ten sam składnik w tej samej jednostce (np. "mąka pszenna" w gramach) z kilku
    przepisów łączymy w jedną pozycję i sumujemy ilości.
    """
    open_items = db.query(ShoppingItem).filter_by(checked=False).all()
    changed = 0
    for line in recipe.ingredients:
        name = line.ingredient.name
        if skip_staples and line.ingredient.is_staple:
            continue
        amount = line.amount * factor if line.amount is not None else None
        same = next((i for i in open_items if i.name == name and i.unit == line.unit), None)
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


def send_to_home_assistant(items: list[ShoppingItem]) -> None:
    """Dodaje pozycje do listy "Do zrobienia" w Home Assistant (usługa todo.add_item)."""
    settings = get_settings()
    connection = settings.home_assistant
    if connection is None:
        raise ShoppingError("Wysyłka do Home Assistant nie jest skonfigurowana.")
    url, token = connection
    try:
        with httpx.Client(timeout=10, headers={"Authorization": f"Bearer {token}"}) as client:
            for item in items:
                response = client.post(f"{url}/api/services/todo/add_item", json={
                    "entity_id": settings.ha_todo_entity,
                    "item": item.text,
                    "description": f"Do: {item.recipes}" if item.recipes else "",
                })
                if response.status_code in (401, 403):
                    raise ShoppingError("Home Assistant odrzucił token.")
                if response.status_code >= 400:
                    raise ShoppingError(
                        f"Home Assistant odpowiedział błędem {response.status_code}. "
                        f"Sprawdź, czy istnieje lista {settings.ha_todo_entity}."
                    )
    except httpx.HTTPError as exc:
        raise ShoppingError("Nie udało się połączyć z Home Assistant.") from exc
