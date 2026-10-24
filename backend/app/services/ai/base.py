"""Wspólne elementy rozmowy z AI: błąd dla użytkownika i limit czasu odpowiedzi."""

import contextvars
import re
import time
from contextlib import contextmanager

class AiError(Exception):
    """Komunikat pokazywany użytkownikowi."""


# Element treści dla AI: tekst albo obrazek JPEG
Content = list[str | bytes]

# Limit czasu, gdy użytkownik czeka na ekranie (czat, kalorie, zdjęcia, kategorie):
# do kiedy (wg time.monotonic()) obecne AI musi odpowiedzieć.
# None = bez limitu - import przepisu może trwać długo, bo działa w tle.
# Safari zrywa zapytanie po ok. minucie ciszy ("Load failed"), więc trzeba zdążyć wcześniej.
# Każde AI dostaje osobny kawałek czasu, żeby jedno przeciążone nie zjadło go wszystkim.
_limit: contextvars.ContextVar[float | None] = contextvars.ContextVar("ai_limit", default=None)
CHAT_SECONDS = 50
CHAT_PROVIDER_SECONDS = 20
# AI, które zawiodło przy limicie czasu, przez tyle sekund pytamy na końcu, żeby nie czekać na nie za każdym razem
CHAT_PENALTY_SECONDS = 300


def _timeout() -> float | None:
    """Ile sekund może trwać najbliższe zapytanie do AI; None = domyślnie dla dostawcy."""
    deadline = _limit.get()
    if deadline is None:
        return None
    left = deadline - time.monotonic()
    if left < 3:
        raise AiError("AI odpowiada zbyt wolno - spróbuj jeszcze raz za chwilę.")
    return left



@contextmanager
def time_limit(seconds: float = CHAT_SECONDS):
    """Wszystko w środku bloku `with` musi zdążyć w `seconds` sekund (użytkownik czeka)."""
    token = _limit.set(time.monotonic() + seconds)
    try:
        yield
    finally:
        _limit.reset(token)


SEARCH_PROMPT = """Znajdź w internecie strony z przepisem na podane danie (najlepiej polskie \
blogi i serwisy kulinarne ze zdjęciem gotowego dania). Odpowiedz wyłącznie listą adresów \
stron, po jednym w linii, najbardziej pasujące pierwsze. Bez komentarzy."""

_URL = re.compile(r"https?://[^\s)\]>\"']+")
