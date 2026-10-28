"""Nazwy składników: normalizacja i zapis do bazy."""

import re

from sqlalchemy.orm import Session

from ..database import fold
from ..models import Ingredient, RecipeIngredient, ShoppingItem


def normalize_name(name: str) -> str:
    """'  Mąka  Pszenna ' -> 'mąka pszenna'."""
    return re.sub(r"\s+", " ", name).strip().lower()


def get_or_create_ingredient(db: Session, name: str, is_staple: bool = False) -> Ingredient:
    """Zwraca składnik o tej nazwie; tworzy go, jeśli jeszcze nie istnieje.

    `is_staple` jest brane pod uwagę tylko przy tworzeniu nowego składnika.
    """
    name = normalize_name(name) or "inne"
    ingredient = db.query(Ingredient).filter_by(name=name).one_or_none()
    if ingredient is None:
        ingredient = Ingredient(name=name, is_staple=is_staple)
        db.add(ingredient)
        db.flush()  # nadaje id, żeby kolejne zapytania widziały nowy składnik
    return ingredient


# Używane, gdy nie ma AI: próbujemy wyciąć ilość i jednostkę z linijki,
# np. "2 cups flour, sifted" -> "flour". To tylko przybliżenie.
_QUANTITY = r"[\d\s/.,½¼¾⅓⅔⅛-]+"
_UNITS = (
    r"(g|kg|dag|ml|l|szt\.?|sztuki?|łyżki?|łyżeczki?|łyżek|łyżeczek|szklanki?|szklanek|"
    r"szczypt[aey]?|garść|ząbki?|ząbków|plaster(?:ki|ków)?|opakowani[ae]|"
    r"cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|pinch|cloves?|grams?)\b\.?"
)


def guess_ingredient_name(line: str) -> str:
    text = line.lower()
    text = re.sub(r"\(.*?\)", " ", text)  # usuń nawiasy
    text = text.split(",")[0]  # "mąka, przesiana" -> "mąka"
    text = re.sub(rf"^\s*{_QUANTITY}", " ", text)
    text = re.sub(rf"^\s*{_UNITS}", " ", text)
    text = re.sub(r"^\s*(of|z)\s+", " ", text)
    return normalize_name(text) or normalize_name(line)


def _similar_word(a: str, b: str) -> bool:
    """Ten sam wyraz w innej formie: 'pomidor' i 'pomidory', 'jajko' i 'jajka' (bez ogonków)."""
    if a == b:
        return True
    common = 0
    while common < min(len(a), len(b)) and a[common] == b[common]:
        common += 1
    return common >= 4 and common >= min(len(a), len(b)) - 1 and max(len(a), len(b)) - common <= 3


def similar(a: str, b: str) -> bool:
    """Czy dwie nazwy składników to prawdopodobnie ten sam produkt (do potwierdzenia przez użytkownika)."""
    words_a, words_b = fold(a).split(), fold(b).split()
    return len(words_a) == len(words_b) and all(_similar_word(x, y) for x, y in zip(words_a, words_b, strict=True))


def group_similar(names: list[str]) -> list[list[str]]:
    """Grupy podobnych nazw, np. [['pomidor', 'pomidory']]. Grupy jednoelementowe pomijamy."""
    groups: list[list[str]] = []
    for name in names:
        group = next((g for g in groups if any(similar(name, other) for other in g)), None)
        if group is None:
            groups.append([name])
        else:
            group.append(name)
    return [g for g in groups if len(g) > 1]


def merge_ingredients(db: Session, keep: Ingredient, others: list[Ingredient]) -> None:
    """Łączy składniki: przepisy, lista zakupów i spiżarnia używają odtąd tylko `keep`."""
    for other in others:
        if other.id == keep.id:
            continue
        db.query(RecipeIngredient).filter_by(ingredient_id=other.id).update({"ingredient_id": keep.id})
        db.query(ShoppingItem).filter_by(name=other.name).update({"name": keep.name})
        keep.is_staple = keep.is_staple or other.is_staple
        if other.in_pantry:
            keep.in_pantry = True
            if other.pantry_expires and (keep.pantry_expires is None or other.pantry_expires < keep.pantry_expires):
                keep.pantry_expires = other.pantry_expires
        db.delete(other)
    db.flush()
