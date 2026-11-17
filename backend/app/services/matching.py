"""'Co mogę ugotować?' - dopasowanie przepisów do składników, które masz.

Dla każdego przepisu liczymy, których jego składników brakuje.
Składniki podstawowe (is_staple, np. sól) pomijamy. Przepisy z mniejszą
liczbą braków są wyżej.
"""

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session, selectinload

from ..database import fold
from ..models import Ingredient, Recipe, RecipeIngredient
from .ingredients import normalize_name, similar_word


@dataclass
class Match:
    recipe: Recipe
    have: list[str]
    missing: list[str]
    use_first: list[str]


# Krótkie wyrazy i jednostki, które nie zmieniają produktu (jak productWords w similar.ts)
_FILLER = {"z", "ze", "do", "w", "we", "na", "i", "o", "od", "dla", "bez"}
_UNITS = {"g", "kg", "dag", "ml", "l", "szt", "sztuk", "sztuki", "sztuka", "op", "opak", "opakowanie",
          "opakowania", "x"}
# Zdrobnienie albo przymiotnik to inny produkt: "oliwa"/"oliwki", "olej"/"olejek", "cukier"/"cukierki",
# "kasza"/"kaszanka", "pomidor"/"pomidorowy"
_OTHER_PRODUCT = re.compile(r"^(e?k|ank|ecz|ow[aeyo]|owej|owego|owych|sk|ck)")


# Rodzaj produktu przed marką albo odmianą: "serek almette", "ser feta", "jogurt skyr", "ryż basmati"
_KINDS = {"ser", "sera", "serek", "serka", "serki", "jogurt", "jogurtu", "makaron", "makaronu", "kasza", "kaszy",
          "ryz", "ryzu", "maka", "maki", "piwo", "piwa", "wino", "wina"}


def product_words(text: str) -> list[str]:
    text = re.sub(r"\(.*?\)", " ", fold(text))
    return [w for w in re.split(r"[^a-z0-9]+", text)
            if w and w not in _FILLER and w not in _UNITS and not w[0].isdigit() and not re.fullmatch(r"x\d+", w)]


def same_word(a: str, b: str) -> bool:
    """Ten sam wyraz w innej formie ('karkówka'/'karkówki', 'czosnek'/'czosnku'), ale nie zdrobnienie
    ani przymiotnik ('oliwa'/'oliwki', 'pomidor'/'pomidorowy'). Tak samo w aplikacji (similar.ts)."""
    if a == b:
        return True
    if not similar_word(a, b):
        return False
    common = 0
    while common < min(len(a), len(b)) and a[common] == b[common]:
        common += 1
    rest_a, rest_b = a[common:], b[common:]
    for rest, other in ((rest_a, rest_b), (rest_b, rest_a)):
        if _OTHER_PRODUCT.match(rest) and "k" not in other:
            return False
    return True


def covers(have: str, needed: str) -> bool:
    """Czy produkt ze spiżarni wystarczy na składnik przepisu.

    Pierwszy wyraz (sam produkt) ten sam, a pozostałe wyrazy z `have` są gdzieś w `needed`:
    'ser' pokrywa 'ser żółty', 'karkówka' pokrywa 'karkówki wieprzowej' (odmiana się nie liczy).
    Ale 'ser' nie pokrywa 'serek', 'oliwa' - 'oliwek', a 'papryka słodka' - 'papryki'.
    Tak samo w aplikacji (similar.ts: covers).
    """
    if needed == have:
        return True
    general, specific = product_words(have), product_words(needed)
    if _contains(general, specific):
        return True
    # "almette" w domu pokrywa "serek almette", "feta" - "ser feta", "spaghetti" - "makaron spaghetti"
    # ale nie "sos do spaghetti" ani "makaron do rosołu" - tam po rodzaju stoi "do"/"z"
    raw = [w for w in re.split(r"[^a-z0-9]+", re.sub(r"\(.*?\)", " ", fold(needed)))
           if w and w not in _UNITS and not w[0].isdigit()]
    return (len(specific) > 1 and specific[0] in _KINDS and len(raw) > 1 and raw[1] not in _FILLER
            and _contains(general, specific[1:]))


def _contains(general: list[str], specific: list[str]) -> bool:
    if not general or not specific or not same_word(general[0], specific[0]):
        return False
    left = specific[1:]
    for word in general[1:]:
        match = next((other for other in left if same_word(word, other)), None)
        if match is None:
            return False
        left.remove(match)
    return True


def _part_in_stock(haves: list[str], exact: set[str], part: str) -> bool:
    """Jeden człon składnika; 'masło lub margaryna' wystarczy jedno."""
    for option in re.split(r"\s+(?:lub|albo)\s+|\s*/\s*", part):
        option = option.strip()
        if option and (fold(option) in exact or any(covers(have, option) for have in haves)):
            return True
    return False


def in_stock(haves: list[str], needed: str, staples: list[str] = ()) -> bool:
    """Czy w domu jest wszystko na składnik: 'sól i pieprz' wymaga obu.

    `staples` ("Zawsze w domu") liczą się tylko dokładnie: 'cukier' nie pokrywa 'cukru pudru'.
    Tak samo w aplikacji (similar.ts: inStock).
    """
    exact = {fold(s) for s in staples}
    if fold(needed) in exact:
        return True
    parts = [p for p in re.split(r"\s+(?:i|oraz)\s+", re.sub(r"\(.*?\)", " ", needed)) if p.strip()]
    if len(parts) > 1:
        return all(_part_in_stock(haves, exact, part) for part in parts)
    return _part_in_stock(haves, exact, needed)


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
        got = [n for n in needed if in_stock(have, n, staples)]
        missing = [n for n in needed if n not in got]
        # Przepis musi mieć coś z tego, co wpisałeś - same "Zawsze w domu" to za mało
        if any(in_stock(have, n) for n in got) and len(missing) <= max_missing:
            urgent = [u for u in use_first if any(covers(u, n) for n in got)]
            matches.append(Match(recipe=recipe, have=got, missing=missing, use_first=urgent))
    # Najpierw te, które zużywają produkty z kończącym się terminem, potem najmniej braków,
    # potem najwięcej wykorzystanych składników
    matches.sort(key=lambda m: (not m.use_first, len(m.missing), -len(m.have), m.recipe.title.lower()))
    return matches
