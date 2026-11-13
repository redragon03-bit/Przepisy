"""Gemini (Google): przepisy w ścisłym formacie i wyszukiwanie stron w Google."""

import logging
import time

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel

from ...config import get_settings
from .base import _URL, SEARCH_PROMPT, AiError, Content, _bulk, _limit, _timeout

log = logging.getLogger(__name__)


# Przerwy przed kolejnymi próbami, gdy Gemini jest przeciążony (sekundy)
GEMINI_RETRY_DELAYS = [2, 6]


def _is_temporary(exc: genai_errors.APIError) -> bool:
    """Przeciążenie (503) albo chwilowy limit (429) - warto spróbować ponownie."""
    return isinstance(exc, genai_errors.ServerError) or exc.code == 429


def _gemini_once(client: genai.Client, model: str, parts: list, system: str,
                 schema: type[BaseModel], quick_ok: bool = True) -> BaseModel:
    timeout = _timeout()
    # W czacie Gemini nie "myśli" przed odpowiedzią: poleca przepisy z listy, do tego
    # myślenie nie jest potrzebne, a z nim odpowiedź trwała ponad 25 s (błąd 504)
    quick = _limit.get() is not None and quick_ok
    try:
        response = client.models.generate_content(
            model=model,
            contents=parts,
            config=genai_types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
                response_schema=schema,
                thinking_config=genai_types.ThinkingConfig(thinking_budget=0) if quick else None,
                # Gemini liczy w milisekundach
                http_options=genai_types.HttpOptions(timeout=int(timeout * 1000)) if timeout else None,
            ),
        )
    except httpx.TimeoutException as exc:
        raise AiError("Gemini nie odpowiedział na czas.") from exc
    except httpx.HTTPError as exc:
        raise AiError("Brak połączenia z Gemini.") from exc
    except genai_errors.ClientError as exc:
        if exc.code in (401, 403) or "API key" in str(exc):
            raise _KeyFailed("Nieprawidłowy klucz API Gemini.") from exc
        # Model, który nie umie wyłączyć myślenia (np. flash-lite odpowiada wtedy ogólnym
        # "invalid argument") - pytamy jeszcze raz normalnie
        if quick and exc.code == 400:
            log.warning("Gemini %s nie przyjął wyłączenia myślenia: %s", model, exc.message)
            return _gemini_once(client, model, parts, system, schema, quick_ok=False)
        raise
    except genai_errors.ServerError as exc:
        # 504 = Gemini nie zdążył w naszym limicie czasu; ponowna próba nic nie da
        if exc.code == 504:
            raise AiError("Gemini nie odpowiedział na czas.") from exc
        raise
    if not isinstance(response.parsed, schema):
        raise AiError("AI nie zwróciło poprawnej odpowiedzi - spróbuj jeszcze raz.")
    return response.parsed


# Klucz, któremu skończył się limit, i do kiedy (wg time.monotonic()) pytamy nim na końcu
_key_exhausted_until: dict[str, float] = {}
# Na tyle odkładamy klucz po błędzie 429: limit dzienny wraca dopiero następnego dnia,
# limit na minutę - po chwili
DAILY_QUOTA_PAUSE = 3600
MINUTE_QUOTA_PAUSE = 60


class _KeyFailed(AiError):
    """Ten klucz wyczerpał limit albo jest nieprawidłowy - warto spróbować kolejnym kluczem."""


def _keys_in_order() -> list[tuple[int, str]]:
    """(numer klucza od 1, klucz): najpierw te z limitem, wyczerpane na końcu."""
    now = time.monotonic()
    keys = list(enumerate(get_settings().gemini_keys, start=1))
    return sorted(keys, key=lambda item: _key_exhausted_until.get(item[1], 0) > now)


def _mark_exhausted(key: str, exc: genai_errors.APIError) -> None:
    daily = "PerDay" in str(exc) or "per day" in str(exc).lower()
    _key_exhausted_until[key] = time.monotonic() + (DAILY_QUOTA_PAUSE if daily else MINUTE_QUOTA_PAUSE)


def key_label(number: int) -> str:
    return "Gemini" if len(get_settings().gemini_keys) == 1 else f"Gemini (klucz {number})"


def _ask_gemini(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    """Pytamy kolejnymi kluczami Gemini: następny klucz, gdy poprzedni wyczerpał limit (429)."""
    parts = [
        item if isinstance(item, str) else genai_types.Part.from_bytes(data=item, mime_type="image/jpeg")
        for item in content
    ]
    keys = _keys_in_order()
    for position, (number, key) in enumerate(keys):
        try:
            result = _ask_gemini_key(key, parts, system, schema, more_keys=position < len(keys) - 1)
        except _KeyFailed as exc:
            if position == len(keys) - 1:
                raise AiError(str(exc)) from exc
            log.warning("%s: %s - próbuję kolejnym kluczem", key_label(number), exc)
            continue
        if len(keys) > 1:
            log.info("Odpowiedział %s", key_label(number))
        return result
    raise AiError("Brak klucza API Gemini.")


def _ask_gemini_key(key: str, parts: list, system: str, schema: type[BaseModel], more_keys: bool) -> BaseModel:
    settings = get_settings()
    # Klient musi być w zmiennej - utworzony "w locie" zostaje sprzątnięty
    # przez Pythona (i zamyka połączenie), zanim zapytanie się wykona
    client = genai.Client(api_key=key)
    # Najpierw główny model kilka razy, potem zapasowy (zwykle mniej obciążony)
    attempts = [settings.gemini_model] * (len(GEMINI_RETRY_DELAYS) + 1)
    lite = settings.gemini_fallback_model
    if lite and lite != settings.gemini_model:
        attempts.append(lite)
        # W czacie liczy się czas: lżejszy model odpowiada szybciej, a do polecania przepisów wystarcza
        if _limit.get() is not None:
            attempts = [lite, settings.gemini_model]
        # Dużo zapytań w tle: lżejszy model ma wyższe limity (główny tylko na koniec)
        elif _bulk.get():
            attempts = [lite] * (len(GEMINI_RETRY_DELAYS) + 1) + [settings.gemini_model]
    skip_model = None
    for number, model in enumerate(attempts):
        if model == skip_model:
            continue
        try:
            return _gemini_once(client, model, parts, system, schema)
        except genai_errors.APIError as exc:
            # Wyczerpany limit, a jest kolejny klucz: nie czekamy, tylko próbujemy jeszcze
            # drugiego modelu (ma osobny limit), a potem następnego klucza
            if exc.code == 429 and more_keys:
                skip_model = model
                if all(m == model for m in attempts[number + 1:]):
                    _mark_exhausted(key, exc)
                    raise _KeyFailed("Wyczerpany limit zapytań do Gemini - spróbuj za chwilę.") from exc
                continue
            last_try = all(m == skip_model for m in attempts[number + 1:])
            # W czacie po każdym błędzie próbujemy jeszcze drugiego modelu
            if (not _is_temporary(exc) and _limit.get() is None) or last_try:
                if exc.code == 429:
                    _mark_exhausted(key, exc)
                    raise _KeyFailed("Wyczerpany limit zapytań do Gemini - spróbuj za chwilę.") from exc
                if isinstance(exc, genai_errors.ServerError):
                    raise AiError("Gemini jest teraz przeciążony - spróbuj za kilka minut.") from exc
                raise AiError(f"Błąd AI: {exc.message}") from exc
            log.warning("Gemini %s: %s - próbuję ponownie", model, exc.code)
            # W czacie nie czekamy - liczy się każda sekunda
            if number < len(GEMINI_RETRY_DELAYS) and _limit.get() is None:
                time.sleep(GEMINI_RETRY_DELAYS[number])
    raise AssertionError("unreachable")


def _search_gemini(query: str) -> list[str]:
    keys = _keys_in_order()
    for position, (number, key) in enumerate(keys):
        try:
            return _search_gemini_key(key, query)
        except _KeyFailed as exc:
            if position == len(keys) - 1:
                raise AiError(str(exc)) from exc
            log.warning("Wyszukiwanie %s: wyczerpany limit - próbuję kolejnym kluczem", key_label(number))
    raise AiError("Brak klucza API Gemini.")


def _search_gemini_key(key: str, query: str) -> list[str]:
    settings = get_settings()
    client = genai.Client(api_key=key)
    # Zapasowy model ma osobny dzienny limit - próbujemy go, gdy główny wyczerpał swój
    models = [settings.gemini_model]
    if settings.gemini_fallback_model and settings.gemini_fallback_model != settings.gemini_model:
        models.append(settings.gemini_fallback_model)
    for number, model in enumerate(models):
        timeout = _timeout()
        try:
            response = client.models.generate_content(
                model=model,
                contents=query,
                config=genai_types.GenerateContentConfig(
                    http_options=genai_types.HttpOptions(timeout=int(timeout * 1000)) if timeout else None,
                    system_instruction=SEARCH_PROMPT,
                    # Gemini sam wyszukuje w Google ("grounding")
                    tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
                ),
            )
            break
        except httpx.HTTPError as exc:
            raise AiError("Gemini nie odpowiedział na czas.") from exc
        except genai_errors.APIError as exc:
            if not _is_temporary(exc) or number == len(models) - 1:
                if exc.code == 429:
                    _mark_exhausted(key, exc)
                    raise _KeyFailed(f"Błąd wyszukiwania: {exc.message}") from exc
                raise AiError(f"Błąd wyszukiwania: {exc.message}") from exc
            log.warning("Wyszukiwanie Gemini %s: %s - próbuję zapasowy model", model, exc.code)
    urls = _URL.findall(response.text or "")
    # Źródła wyszukiwania - adresy przekierowujące Google, prowadzą do właściwych stron
    for candidate in response.candidates or []:
        metadata = candidate.grounding_metadata
        for chunk in (metadata.grounding_chunks or []) if metadata else []:
            if chunk.web and chunk.web.uri:
                urls.append(chunk.web.uri)
    return urls

