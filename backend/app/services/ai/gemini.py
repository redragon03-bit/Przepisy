"""Gemini (Google): przepisy w ścisłym formacie i wyszukiwanie stron w Google."""

import logging
import time

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel

from ...config import get_settings
from .base import _URL, SEARCH_PROMPT, AiError, Content, _limit, _timeout

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
    quick = timeout is not None and quick_ok
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
            raise AiError("Nieprawidłowy klucz API Gemini.") from exc
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


def _ask_gemini(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    settings = get_settings()
    parts = [
        item if isinstance(item, str) else genai_types.Part.from_bytes(data=item, mime_type="image/jpeg")
        for item in content
    ]
    # Klient musi być w zmiennej - utworzony "w locie" zostaje sprzątnięty
    # przez Pythona (i zamyka połączenie), zanim zapytanie się wykona
    client = genai.Client(api_key=settings.gemini_api_key)
    # Najpierw główny model kilka razy, potem zapasowy (zwykle mniej obciążony)
    attempts = [settings.gemini_model] * (len(GEMINI_RETRY_DELAYS) + 1)
    lite = settings.gemini_fallback_model
    if lite and lite != settings.gemini_model:
        attempts.append(lite)
        # W czacie liczy się czas: lżejszy model odpowiada szybciej, a do polecania przepisów wystarcza
        if _limit.get() is not None:
            attempts = [lite, settings.gemini_model]
    for number, model in enumerate(attempts):
        try:
            return _gemini_once(client, model, parts, system, schema)
        except genai_errors.APIError as exc:
            last_try = number == len(attempts) - 1
            # W czacie po każdym błędzie próbujemy jeszcze drugiego modelu
            if (not _is_temporary(exc) and _limit.get() is None) or last_try:
                if exc.code == 429:
                    raise AiError("Wyczerpany limit zapytań do Gemini - spróbuj za chwilę.") from exc
                if isinstance(exc, genai_errors.ServerError):
                    raise AiError("Gemini jest teraz przeciążony - spróbuj za kilka minut.") from exc
                raise AiError(f"Błąd AI: {exc.message}") from exc
            log.warning("Gemini %s: %s - próbuję ponownie", model, exc.code)
            # W czacie nie czekamy - liczy się każda sekunda
            if number < len(GEMINI_RETRY_DELAYS) and _limit.get() is None:
                time.sleep(GEMINI_RETRY_DELAYS[number])
    raise AssertionError("unreachable")



def _search_gemini(query: str) -> list[str]:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
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

