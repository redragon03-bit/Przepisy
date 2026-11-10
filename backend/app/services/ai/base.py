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
# W tle (import, gazetki) jedno zapytanie do AI też ma limit - bez niego zawieszone
# połączenie (Gemini nie ma domyślnego limitu) trzymało import na "czytam przepis…" bez końca
BACKGROUND_REQUEST_SECONDS = 120
# Jedno AI w tle (razem z ponownymi próbami po 503) dostaje tyle czasu, potem pytamy następne.
# Bez tego przeciążony Gemini (kilka prób po 2 minuty) trzymał import kilkanaście minut.
BACKGROUND_PROVIDER_SECONDS = 180
_background_deadline: contextvars.ContextVar[float | None] = contextvars.ContextVar(
    "ai_background_deadline", default=None
)


def _timeout() -> float | None:
    """Ile sekund może trwać najbliższe zapytanie do AI."""
    deadline = _limit.get()
    if deadline is None:
        deadline = _background_deadline.get()
        if deadline is None:
            return BACKGROUND_REQUEST_SECONDS
        left = deadline - time.monotonic()
        if left < 3:
            raise AiError("AI odpowiada zbyt wolno - próbuję następnego.")
        return min(left, BACKGROUND_REQUEST_SECONDS)
    left = deadline - time.monotonic()
    if left < 3:
        raise AiError("AI odpowiada zbyt wolno - spróbuj jeszcze raz za chwilę.")
    return left



# Dużo zapytań w tle (np. czytanie gazetek): najpierw lżejszy model - ma wyższe darmowe
# limity na minutę i na dzień, a do wypisania produktów z tekstu wystarcza
_bulk: contextvars.ContextVar[bool] = contextvars.ContextVar("ai_bulk", default=False)


@contextmanager
def bulk():
    token = _bulk.set(True)
    try:
        yield
    finally:
        _bulk.reset(token)


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
