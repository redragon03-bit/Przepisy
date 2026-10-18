"""Rozmowa z Claude (AI firmy Anthropic).

AI dostaje surowy przepis (dane ze strony, tekst strony albo zdjęcia)
i zwraca uporządkowany przepis po polsku, w miarach metrycznych.
Odpowiedź ma ściśle określony format (klasa AiRecipe) - SDK pilnuje,
żeby AI zwróciło poprawny JSON, i od razu zamienia go na obiekt Pythona.
"""

import json
from dataclasses import asdict

import anthropic
from pydantic import BaseModel, Field

from ..config import get_settings
from .scraper import PageContent


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
    is_recipe: bool = Field(description="false, gdy w materiale nie ma przepisu")
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
- Jeśli materiał nie zawiera przepisu, ustaw is_recipe=false i zostaw resztę pustą."""


class AiError(Exception):
    """Komunikat pokazywany użytkownikowi."""


def _client() -> anthropic.Anthropic:
    settings = get_settings()
    if not settings.ai_enabled:
        raise AiError("Brak klucza API Anthropic - ustaw ANTHROPIC_API_KEY, żeby używać AI.")
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _ask(content: list[dict]) -> AiRecipe:
    try:
        response = _client().messages.parse(
            model=get_settings().claude_model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            # Przepisanie przepisu nie wymaga długiego myślenia - "low" jest szybsze i tańsze
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": content}],
            output_format=AiRecipe,
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
    recipe = response.parsed_output
    if not recipe.is_recipe:
        raise AiError("Nie znaleziono przepisu w tym materiale.")
    return recipe


def _image_list(image_urls: list[str]) -> str:
    if not image_urls:
        return "Brak obrazków."
    return "\n".join(f"{i}: {url}" for i, url in enumerate(image_urls))


def recipe_from_page(page: PageContent) -> AiRecipe:
    """Przepis ze strony WWW."""
    if page.recipe:
        # Strona ma dane strukturalne - wysyłamy tylko je (mniej tekstu = taniej, mniej pomyłek)
        material = "Dane przepisu ze strony (JSON):\n" + json.dumps(asdict(page.recipe), ensure_ascii=False)
        # Fragment tekstu strony pomaga dopasować obrazki do kroków
        material += "\n\nPoczątek tekstu strony:\n" + page.text[:8000]
    else:
        material = "Tekst strony:\n" + page.text
    text = (
        f"Adres strony: {page.url}\n\n{material}\n\n"
        f"Obrazki ze strony (numer: adres):\n{_image_list(page.image_urls)}"
    )
    return _ask([{"type": "text", "text": text}])


def recipe_from_images(image_blocks: list[dict]) -> AiRecipe:
    """Przepis ze zdjęć/screenów. Obrazki są numerowane w kolejności wysłania."""
    content: list[dict] = []
    for i, block in enumerate(image_blocks):
        content.append({"type": "text", "text": f"Obrazek {i}:"})
        content.append(block)
    content.append({
        "type": "text",
        "text": "Odczytaj przepis z powyższych obrazków (to mogą być screeny kolejnych części "
        "jednego przepisu). Jeśli któryś obrazek to zdjęcie gotowego dania, wskaż go jako główny.",
    })
    return _ask(content)
