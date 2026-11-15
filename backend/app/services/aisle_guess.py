"""Działy sklepu od AI dla produktów, których nie zna słownik w aisles.py ("Inne").

Lista zakupów pokazuje się od razu (słownik), a nieznane nazwy w tle wysyłamy do AI jednym
pytaniem. Odpowiedź zapamiętujemy w bazie (tabela aisle_guesses), więc każdą nazwę AI dostaje
tylko raz; po następnym odświeżeniu listy pozycja jest już w dobrym dziale.
"""

import logging

from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal
from ..models import AisleGuess
from . import ai, aisles

log = logging.getLogger(__name__)

# Nazwy, o które już pytaliśmy w tym uruchomieniu (także bez odpowiedzi) - nie pytamy w kółko
_asked: set[str] = set()
MAX_PER_ASK = 40


def load(db: Session) -> None:
    """Wczytuje zapamiętane odpowiedzi AI (przy starcie aplikacji)."""
    aisles.learned.clear()
    _asked.clear()
    aisles.learned.update({g.key: g.aisle for g in db.query(AisleGuess)})


def unknown(texts: list[str]) -> list[str]:
    """Nazwy, o które warto zapytać AI: słownik ich nie zna i jeszcze nie pytaliśmy."""
    found: dict[str, str] = {}
    for text in texts:
        key = aisles.guess_key(text)
        if key and key not in aisles.learned and key not in _asked and aisles.known_aisle(text) == aisles.OTHER:
            found.setdefault(key, text)
    return list(found.values())[:MAX_PER_ASK]


def learn(texts: list[str]) -> None:
    """W tle: pyta AI o działy dla `texts` i zapamiętuje odpowiedzi (także "Inne")."""
    if not texts or not get_settings().ai_providers:
        return
    keys = [aisles.guess_key(t) for t in texts]
    _asked.update(keys)
    names = [n for n in aisles.aisle_order()]
    try:
        answer = ai.aisles_for(texts, names)
    except ai.AiError as exc:
        log.warning("AI nie przypisało działów na liście zakupów: %s", exc)
        return
    with SessionLocal() as db:
        for index, shelf in answer.items():
            key = keys[index]
            db.merge(AisleGuess(key=key, aisle=shelf))
            aisles.learned[key] = shelf
        db.commit()
    log.info("AI przypisało działy: %s", {texts[i]: s for i, s in answer.items()})
