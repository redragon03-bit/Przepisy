"""Rozmowa z AI: Claude (Anthropic) albo Gemini (Google).

Który dostawca jest używany, decyduje ustawienie AI_PROVIDER (patrz config.py).
AI dostaje surowy przepis (dane ze strony, tekst strony albo zdjęcia)
i zwraca uporządkowany przepis po polsku, w miarach metrycznych.
Odpowiedź ma ściśle określony format (klasa AiResult z listą AiRecipe) - SDK obu dostawców
pilnuje, żeby AI zwróciło poprawny JSON, i zamienia go na obiekt Pythona.

Treść wysyłana do AI to lista elementów: tekst (str) albo obrazek JPEG (bytes).
Funkcje _ask_claude i _ask_gemini zamieniają ją na format danego dostawcy.
"""

import base64
import json
import logging
import time
from dataclasses import asdict

import anthropic
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, Field

from ..config import get_settings
from .scraper import PageContent

log = logging.getLogger(__name__)


class AiIngredient(BaseModel):
    text: str = Field(description="Linijka po polsku do wyświetlenia, np. '200 g mąki pszennej'")
    name: str = Field(
        description="Nazwa kanoniczna do wyszukiwania: po polsku, małymi literami, mianownik "
        "liczby pojedynczej, bez ilości i przymiotników typu 'duży', np. 'mąka pszenna', 'pomidor'"
    )
    amount: float | None = Field(description="Ilość jako liczba w jednostce `unit`, null gdy brak")
    unit: str = Field(description="g, kg, ml, l, szt., łyżka, łyżeczka, szczypta, ząbek, opakowanie albo ''")
    original_text: str = Field(description="Linijka dokładnie tak, jak w źródle")


class AiStep(BaseModel):
    text: str = Field(description="Treść kroku po polsku, temperatury w °C")
    image_index: int | None = Field(description="Numer obrazka (z listy obrazków) pokazującego ten krok, albo null")


class AiRecipe(BaseModel):
    title: str
    description: str = Field(description="1-2 zdania o daniu po polsku, albo ''")
    servings: str = Field(description="np. '4 porcje', albo ''")
    prep_minutes: int | None
    cook_minutes: int | None
    total_minutes: int | None
    original_language: str = Field(description="Kod języka źródła, np. 'pl', 'en'")
    ingredients: list[AiIngredient]
    steps: list[AiStep]
    main_image_index: int | None = Field(description="Numer obrazka ze zdjęciem gotowego dania, albo null")


class AiResult(BaseModel):
    """Odpowiedź AI: lista przepisów (strona może mieć ich kilka, np. "6 deserów")."""

    recipes: list[AiRecipe] = Field(description="Wszystkie przepisy z materiału; pusta lista, gdy nie ma żadnego")


SYSTEM_PROMPT = """Jesteś asystentem kulinarnym. Z materiału od użytkownika wyciągasz przepis \
i zapisujesz go po polsku dla polskiego kucharza domowego.

Zasady:
- Wszystko tłumacz na naturalny polski (tytuł, opis, składniki, kroki). Nazwy własne dań \
możesz zostawić, np. "Carbonara".
- Miary amerykańskie i brytyjskie zamieniaj na metryczne: cups, oz, lb, sticks na gramy \
(produkty sypkie i tłuszcze, użyj typowej gęstości danego produktu) albo mililitry (płyny); \
°F na °C (zaokrąglij do 5); cale na centymetry. Łyżki i łyżeczki zostaw jako "łyżka"/"łyżeczka".
- Ilości zaokrąglaj rozsądnie (np. 240 g zamiast 236,6 g).
- Kroki zapisz jako krótkie, jasne polecenia, jeden krok = jedna czynność lub etap. \
Nie wymyślaj kroków, których nie ma w źródle.
- Nie dodawaj składników, których nie ma w źródle.
- Obrazki są ponumerowane od 0. Wskaż zdjęcie gotowego dania i - jeśli są - zdjęcia \
pokazujące konkretne kroki. Gdy nie masz pewności, daj null.
- Jeśli materiał zawiera kilka osobnych przepisów (np. "5 pomysłów na..."), zwróć każdy \
jako osobny element listy recipes, z jego własnymi składnikami i krokami. Wspólne kroki \
(np. przygotowanie bazy) dopisz do każdego przepisu, który ich wymaga.
- Jeśli materiał nie zawiera przepisu, zwróć pustą listę recipes."""


class AiError(Exception):
    """Komunikat pokazywany użytkownikowi."""


# Element treści dla AI: tekst albo obrazek JPEG
Content = list[str | bytes]


def _ask_claude(content: Content) -> AiResult:
    settings = get_settings()
    blocks = [
        {"type": "text", "text": item} if isinstance(item, str) else {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg",
                       "data": base64.standard_b64encode(item).decode("ascii")},
        }
        for item in content
    ]
    try:
        response = anthropic.Anthropic(api_key=settings.anthropic_api_key).messages.parse(
            model=settings.claude_model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            # Przepisanie przepisu nie wymaga długiego myślenia - "low" jest szybsze i tańsze
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": blocks}],
            output_format=AiResult,
        )
    except anthropic.AuthenticationError as exc:
        raise AiError("Nieprawidłowy klucz API Anthropic.") from exc
    except anthropic.RateLimitError as exc:
        raise AiError("Za dużo zapytań do AI - spróbuj za chwilę.") from exc
    except anthropic.APIConnectionError as exc:
        raise AiError("Brak połączenia z AI.") from exc
    except anthropic.APIStatusError as exc:
        raise AiError(f"Błąd AI: {exc.message}") from exc

    if response.stop_reason == "refusal":
        raise AiError("AI odmówiło przetworzenia tego materiału.")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise AiError("AI nie dokończyło odpowiedzi - przepis jest za długi.")
    return response.parsed_output


# Przerwy przed kolejnymi próbami, gdy Gemini jest przeciążony (sekundy)
GEMINI_RETRY_DELAYS = [2, 6]


def _is_temporary(exc: genai_errors.APIError) -> bool:
    """Przeciążenie (503) albo chwilowy limit (429) - warto spróbować ponownie."""
    return isinstance(exc, genai_errors.ServerError) or exc.code == 429


def _gemini_once(client: genai.Client, model: str, parts: list) -> AiResult:
    try:
        response = client.models.generate_content(
            model=model,
            contents=parts,
            config=genai_types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=AiResult,
            ),
        )
    except genai_errors.ClientError as exc:
        if exc.code in (401, 403) or "API key" in str(exc):
            raise AiError("Nieprawidłowy klucz API Gemini.") from exc
        raise
    if not isinstance(response.parsed, AiResult):
        raise AiError("AI nie zwróciło poprawnego przepisu - spróbuj jeszcze raz.")
    return response.parsed


def _ask_gemini(content: Content) -> AiResult:
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
    if settings.gemini_fallback_model and settings.gemini_fallback_model != settings.gemini_model:
        attempts.append(settings.gemini_fallback_model)
    for number, model in enumerate(attempts):
        try:
            return _gemini_once(client, model, parts)
        except genai_errors.APIError as exc:
            last_try = number == len(attempts) - 1
            if not _is_temporary(exc) or last_try:
                if exc.code == 429:
                    raise AiError("Wyczerpany limit zapytań do Gemini - spróbuj za chwilę.") from exc
                if isinstance(exc, genai_errors.ServerError):
                    raise AiError("Gemini jest teraz przeciążony - spróbuj za kilka minut.") from exc
                raise AiError(f"Błąd AI: {exc.message}") from exc
            log.warning("Gemini %s: %s - próbuję ponownie", model, exc.code)
            if number < len(GEMINI_RETRY_DELAYS):
                time.sleep(GEMINI_RETRY_DELAYS[number])
    raise AssertionError("unreachable")


def _ask(content: Content) -> list[AiRecipe]:
    provider = get_settings().active_ai_provider
    if provider == "anthropic":
        result = _ask_claude(content)
    elif provider == "gemini":
        result = _ask_gemini(content)
    else:
        raise AiError("Brak klucza API do AI - ustaw ANTHROPIC_API_KEY albo GEMINI_API_KEY.")
    recipes = [r for r in result.recipes if r.title or r.ingredients or r.steps]
    if not recipes:
        raise AiError("Nie znaleziono przepisu w tym materiale.")
    return recipes


def _image_list(image_urls: list[str]) -> str:
    if not image_urls:
        return "Brak obrazków."
    return "\n".join(f"{i}: {url}" for i, url in enumerate(image_urls))


def recipes_from_page(page: PageContent) -> list[AiRecipe]:
    """Przepisy ze strony WWW (zwykle jeden, czasem kilka)."""
    if page.recipe:
        # Strona ma dane strukturalne - wysyłamy tylko je (mniej tekstu = taniej, mniej pomyłek)
        material = "Dane przepisu ze strony (JSON):\n" + json.dumps(asdict(page.recipe), ensure_ascii=False)
        # Tekst strony pomaga dopasować obrazki do kroków i znaleźć kolejne
        # przepisy, gdy dane strukturalne opisują tylko pierwszy
        material += "\n\nPoczątek tekstu strony:\n" + page.text[:15000]
    else:
        material = "Tekst strony:\n" + page.text
    text = (
        f"Adres strony: {page.url}\n\n{material}\n\n"
        f"Obrazki ze strony (numer: adres):\n{_image_list(page.image_urls)}"
    )
    return _ask([text])


def recipes_from_images(jpegs: list[bytes]) -> list[AiRecipe]:
    """Przepisy ze zdjęć/screenów (JPEG). Obrazki są numerowane w kolejności wysłania."""
    content: Content = []
    for i, jpeg in enumerate(jpegs):
        content += [f"Obrazek {i}:", jpeg]
    content.append(
        "Odczytaj przepis z powyższych obrazków (to zwykle screeny kolejnych części "
        "jednego przepisu, ale może być ich kilka). Jeśli któryś obrazek to zdjęcie "
        "gotowego dania, wskaż go jako główny."
    )
    return _ask(content)
