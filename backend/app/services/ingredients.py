"""Nazwy składników: normalizacja i zapis do bazy."""

import re

from sqlalchemy.orm import Session

from ..models import Ingredient


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
