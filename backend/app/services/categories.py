"""Kategorie przepisów (np. "Deser", "Zupa"): normalizacja i zapis do bazy."""

import re

from sqlalchemy.orm import Session

from ..models import Category, Recipe

# Kategorie dodawane przy pierwszym starcie. AI wybiera najpierw spośród
# istniejących kategorii, więc ta lista porządkuje bazę od początku.
DEFAULT_CATEGORIES = [
    "Śniadanie", "Zupa", "Danie główne", "Sałatka", "Przekąska", "Deser", "Ciasto",
    "Pieczywo", "Napój", "Sos", "Przetwory", "Wegetariańskie", "Air fryer",
]

# Kategorie dopisane w nowszych wersjach: przy starcie tworzymy te, których brakuje,
# i od razu dodajemy je przepisom, w których tytule lub krokach są te słowa.
# Działa tylko raz (gdy kategorii jeszcze nie ma), więc usunięta ręcznie nie wraca.
ADDED_CATEGORIES = {
    "Air fryer": ["air fryer", "airfryer", "air-fryer", "frytkownic"],
}

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


def add_new_categories(db: Session) -> None:
    """Tworzy brakujące kategorie z ADDED_CATEGORIES i przypisuje je pasującym przepisom."""
    for name, keywords in ADDED_CATEGORIES.items():
        if db.query(Category).filter_by(name=normalize_category(name)).count():
            continue
        category = get_or_create_category(db, name)
        for recipe in db.query(Recipe):
            text = " ".join([recipe.title, *(s.text for s in recipe.steps)]).lower()
            if any(word in text for word in keywords) and len(recipe.categories) < MAX_PER_RECIPE:
                recipe.categories.append(category)


def category_names(db: Session) -> list[str]:
    return [c.name for c in db.query(Category).order_by(Category.name)]
