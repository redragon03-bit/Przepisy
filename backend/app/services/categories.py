"""Kategorie przepisów (np. "Deser", "Zupa"): normalizacja i zapis do bazy."""

import re

from sqlalchemy.orm import Session

from ..models import Category, Recipe

# Kategorie dodawane przy pierwszym starcie. AI wybiera najpierw spośród
# istniejących kategorii, więc ta lista porządkuje bazę od początku.
DEFAULT_CATEGORIES = [
    "Śniadanie", "Zupa", "Danie główne", "Sałatka", "Przekąska", "Deser", "Ciasto",
    "Pieczywo", "Napój", "Sos", "Przetwory", "Wegetariańskie",
]

MAX_PER_RECIPE = 4


def normalize_category(name: str) -> str:
    """'  danie  GŁÓWNE ' -> 'Danie główne'."""
    name = re.sub(r"\s+", " ", name).strip().lower()
    return name[:1].upper() + name[1:100]


def get_or_create_category(db: Session, name: str) -> Category | None:
    name = normalize_category(name)
    if not name:
        return None
    category = db.query(Category).filter_by(name=name).one_or_none()
    if category is None:
        category = Category(name=name)
        db.add(category)
        db.flush()
    return category


def set_categories(db: Session, recipe: Recipe, names: list[str]) -> None:
    """Ustawia kategorie przepisu (bez powtórzeń, najwyżej MAX_PER_RECIPE)."""
    categories: list[Category] = []
    for name in names:
        category = get_or_create_category(db, name)
        if category is not None and category not in categories:
            categories.append(category)
    recipe.categories = categories[:MAX_PER_RECIPE]


def category_names(db: Session) -> list[str]:
    return [c.name for c in db.query(Category).order_by(Category.name)]
