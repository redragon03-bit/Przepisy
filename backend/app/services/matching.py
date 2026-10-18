"""'Co mogę ugotować?' - dopasowanie przepisów do składników, które masz.

Dla każdego przepisu liczymy, których jego składników brakuje.
Składniki podstawowe (is_staple, np. sól) pomijamy. Przepisy z mniejszą
liczbą braków są wyżej.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session, selectinload

from ..models import Recipe, RecipeIngredient
from .ingredients import normalize_name


@dataclass
class Match:
    recipe: Recipe
    have: list[str]
    missing: list[str]


def covers(have: str, needed: str) -> bool:
    """'ser' pokrywa 'ser żółty', ale 'ser' nie pokrywa 'serek'."""
    return needed == have or needed.startswith(have + " ")


def find_recipes(db: Session, have_names: list[str], max_missing: int = 2) -> list[Match]:
    have = [normalize_name(n) for n in have_names if n.strip()]
    if not have:
        return []
    recipes = db.query(Recipe).options(
        selectinload(Recipe.ingredients).selectinload(RecipeIngredient.ingredient)
    ).all()
    matches = []
    for recipe in recipes:
        needed = sorted({ri.ingredient.name for ri in recipe.ingredients if not ri.ingredient.is_staple})
        if not needed:
            continue
        got = [n for n in needed if any(covers(h, n) for h in have)]
        missing = [n for n in needed if n not in got]
        if got and len(missing) <= max_missing:
            matches.append(Match(recipe=recipe, have=got, missing=missing))
    # Najpierw najmniej braków, potem najwięcej wykorzystanych składników
    matches.sort(key=lambda m: (len(m.missing), -len(m.have), m.recipe.title.lower()))
    return matches
