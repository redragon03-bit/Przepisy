"""'Co mogę ugotować?' - dopasowanie przepisów do składników, które masz.

Dla każdego przepisu liczymy, których jego składników brakuje.
Składniki podstawowe (is_staple, np. sól) pomijamy. Przepisy z mniejszą
liczbą braków są wyżej.
"""

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session, selectinload

from ..models import Ingredient, Recipe, RecipeIngredient
from .ingredients import _similar_word, _words, normalize_name


@dataclass
class Match:
    recipe: Recipe
    have: list[str]
    missing: list[str]
    use_first: list[str]


def _contains(general: list[str], specific: list[str]) -> bool:
    """Pierwszy wyraz (sam produkt) ten sam, a pozostałe wyrazy `general` są gdzieś w `specific`."""
    if not general or not specific or not _similar_word(general[0], specific[0]):
        return False
    left = specific[1:]
    for word in general[1:]:
        match = next((other for other in left if _similar_word(word, other)), None)
        if match is None:
            return False
        left.remove(match)
    return True


def covers(have: str, needed: str) -> bool:
    """Czy produkt ze spiżarni wystarczy na składnik przepisu.

    'ser' pokrywa 'ser żółty', 'karkówka' pokrywa 'karkówki wieprzowej' (odmiana się nie liczy),
    a 'ser feta' pokrywa 'ser'. Ale 'ser' nie pokrywa 'serek', a 'pomidor' - 'koncentratu pomidorowego'.
    Tak samo w aplikacji (similar.ts: covers).
    """
    if needed == have:
        return True
    have_words, needed_words = _words(have), _words(needed)
    return _contains(have_words, needed_words) or _contains(needed_words, have_words)


def in_stock(haves: list[str], needed: str) -> bool:
    """Czy w domu jest wszystko na składnik: 'sól i pieprz' wymaga obu, 'masło lub margaryna' - jednego.
    Tak samo w aplikacji (similar.ts: inStock)."""
    parts = [p for p in re.split(r"\s*,\s*|\s+(?:i|oraz)\s+", needed) if p.strip()]
    return bool(parts) and all(
        any(covers(have, option) for option in re.split(r"\s+(?:lub|albo)\s+|\s*/\s*", part) if option.strip()
            for have in haves)
        for part in parts
    )


def find_recipes(db: Session, have_names: list[str], max_missing: int = 2,
                 use_first: list[str] = ()) -> list[Match]:
    """`use_first` - produkty do zużycia najpierw: przepisy z nimi są wyżej."""
    have = [normalize_name(n) for n in have_names if n.strip()]
    if not have:
        return []
    # "Zawsze w domu" (sól, pieprz) też jest - liczy się w "sól i pieprz"
    staples = [i.name for i in db.query(Ingredient).filter(Ingredient.is_staple.is_(True))]
    recipes = db.query(Recipe).options(
        selectinload(Recipe.ingredients).selectinload(RecipeIngredient.ingredient)
    ).all()
    matches = []
    for recipe in recipes:
        needed = sorted({ri.ingredient.name for ri in recipe.ingredients if not ri.ingredient.is_staple})
        if not needed:
            continue
        got = [n for n in needed if in_stock(have + staples, n)]
        missing = [n for n in needed if n not in got]
        if got and len(missing) <= max_missing:
            urgent = [u for u in use_first if any(covers(u, n) for n in got)]
            matches.append(Match(recipe=recipe, have=got, missing=missing, use_first=urgent))
    # Najpierw te, które zużywają produkty z kończącym się terminem, potem najmniej braków,
    # potem najwięcej wykorzystanych składników
    matches.sort(key=lambda m: (not m.use_first, len(m.missing), -len(m.have), m.recipe.title.lower()))
    return matches
