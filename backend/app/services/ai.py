"""Rozmowa z AI: Claude (Anthropic), Gemini (Google), Groq albo Mistral.

Którego AI pytamy najpierw, decyduje ustawienie AI_PROVIDER (patrz config.py).
Gdy ten zawiedzie (np. wyczerpany darmowy limit), pytamy kolejnego, do którego jest klucz.
AI dostaje surowy przepis (dane ze strony, tekst strony albo zdjęcia)
i zwraca uporządkowany przepis po polsku, w miarach metrycznych.
Odpowiedź ma ściśle określony format (klasa AiResult z listą AiRecipe) - SDK obu dostawców
pilnuje, żeby AI zwróciło poprawny JSON, i zamienia go na obiekt Pythona.

Treść wysyłana do AI to lista elementów: tekst (str) albo obrazek JPEG (bytes).
Funkcje _ask_claude, _ask_gemini, _ask_groq i _ask_mistral zamieniają ją na format
danego dostawcy. Groq i Mistral mają API w tym samym stylu (OpenAI), więc obsługuje je
wspólna funkcja _ask_openai_style.
"""

import base64
import contextvars
import json
import logging
import re
import time
from dataclasses import asdict

import anthropic
import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, Field, ValidationError

from ..config import DEFAULT_GROQ_MODEL, DEFAULT_MISTRAL_MODEL, get_settings
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
    categories: list[str] = Field(
        description="1-4 kategorie, np. ['Danie główne', 'Air fryer']. Wybieraj z listy istniejących "
        "kategorii; nową (krótką, z dużej litery) dodaj tylko, gdy żadna nie pasuje"
    )
    # Szacunek AI na 1 porcję (gdy porcji nie podano - na 1/4 całości)
    kcal: int | None = Field(default=None, description="Szacunkowe kalorie na 1 porcję, null gdy nie da się ocenić")
    protein: int | None = Field(default=None, description="Szacunkowe białko na 1 porcję w gramach")
    fat: int | None = Field(default=None, description="Szacunkowy tłuszcz na 1 porcję w gramach")
    carbs: int | None = Field(default=None, description="Szacunkowe węglowodany na 1 porcję w gramach")


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
- Jeśli materiał nie zawiera przepisu, zwróć pustą listę recipes.
- Oszacuj kalorie, białko, tłuszcz i węglowodany na 1 porcję na podstawie składników \
i ich ilości. Gdy przepis nie podaje liczby porcji, przyjmij 4."""


class AiRecipeCategories(BaseModel):
    id: int = Field(description="Numer przepisu z listy")
    categories: list[str] = Field(description="1-4 kategorie tego przepisu")


class AiCategorization(BaseModel):
    recipes: list[AiRecipeCategories]


CATEGORIZE_PROMPT = """Jesteś asystentem kulinarnym. Dostajesz listę przepisów (numer, \
tytuł, składniki) i listę istniejących kategorii. Każdemu przepisowi przypisz 1-4 kategorie. \
Wybieraj z istniejących kategorii; nową (krótką, po polsku, z dużej litery) dodaj tylko, \
gdy żadna nie pasuje. Nie twórz kategorii będących synonimami istniejących."""


class AiError(Exception):
    """Komunikat pokazywany użytkownikowi."""


# Element treści dla AI: tekst albo obrazek JPEG
Content = list[str | bytes]

# Limit czasu dla czatu: do kiedy (wg time.monotonic()) obecne AI musi odpowiedzieć.
# None = bez limitu - import przepisu może trwać długo, bo działa w tle.
# Safari zrywa zapytanie po ok. minucie ciszy ("Load failed"), więc czat musi zdążyć wcześniej.
# Każde AI dostaje osobny kawałek czasu, żeby jedno przeciążone nie zjadło go wszystkim.
_limit: contextvars.ContextVar[float | None] = contextvars.ContextVar("ai_limit", default=None)
CHAT_SECONDS = 50
CHAT_PROVIDER_SECONDS = 20
# AI, które zawiodło w czacie, przez tyle sekund pytamy na końcu, żeby nie czekać na nie przy każdej wiadomości
CHAT_PENALTY_SECONDS = 300
_failed_until: dict[str, float] = {}


def _timeout() -> float | None:
    """Ile sekund może trwać najbliższe zapytanie do AI; None = domyślnie dla dostawcy."""
    deadline = _limit.get()
    if deadline is None:
        return None
    left = deadline - time.monotonic()
    if left < 3:
        raise AiError("AI odpowiada zbyt wolno - spróbuj jeszcze raz za chwilę.")
    return left


def _ask_claude(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    settings = get_settings()
    blocks = [
        {"type": "text", "text": item} if isinstance(item, str) else {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg",
                       "data": base64.standard_b64encode(item).decode("ascii")},
        }
        for item in content
    ]
    timeout = _timeout()
    extra = {"timeout": timeout} if timeout else {}
    try:
        response = anthropic.Anthropic(api_key=settings.anthropic_api_key).messages.parse(
            **extra,
            model=settings.claude_model,
            max_tokens=16000,
            system=system,
            # Przepisanie przepisu nie wymaga długiego myślenia - "low" jest szybsze i tańsze
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": blocks}],
            output_format=schema,
        )
    except anthropic.AuthenticationError as exc:
        raise AiError("Nieprawidłowy klucz API Anthropic.") from exc
    except anthropic.RateLimitError as exc:
        raise AiError("Za dużo zapytań do AI - spróbuj za chwilę.") from exc
    except anthropic.APITimeoutError as exc:
        raise AiError("Claude nie odpowiedział na czas.") from exc
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
        # Model, który nie umie wyłączyć myślenia - pytamy jeszcze raz normalnie
        if quick and exc.code == 400 and "thinking" in str(exc).lower():
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
            if not _is_temporary(exc) or last_try:
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


def _ask_openai_style(name: str, url: str, api_key: str, model: str, default_model: str,
                      content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    """Groq i Mistral: proszą o JSON, a my sprawdzamy, czy pasuje do klasy `schema`.

    Nie każdy ich model obsługuje ścisły format odpowiedzi, więc schemat JSON
    dopisujemy do instrukcji, a odpowiedź sprawdza Pydantic.
    """
    instructions = (
        f"{system}\n\nOdpowiedz wyłącznie jednym obiektem JSON zgodnym z tym schematem JSON "
        f"(bez komentarzy i bez bloku ```):\n{json.dumps(schema.model_json_schema(), ensure_ascii=False)}"
    )
    if all(isinstance(item, str) for item in content):
        user: str | list = "\n\n".join(content)
    else:
        user = [
            {"type": "text", "text": item} if isinstance(item, str) else {
                "type": "image_url",
                "image_url": {"url": "data:image/jpeg;base64," + base64.standard_b64encode(item).decode("ascii")},
            }
            for item in content
        ]
    chat = _limit.get() is not None
    body = {
        "model": model,
        "messages": [{"role": "system", "content": instructions}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        # Darmowe limity liczą też zarezerwowaną długość odpowiedzi - w czacie wystarczy krótsza
        "max_tokens": 3000 if chat else 8000,
    }
    if model.startswith("openai/gpt-oss"):
        # Model "myśli" przed odpowiedzią; do przepisów wystarczy krótko
        body["reasoning_effort"] = "low"
    try:
        response = httpx.post(url, timeout=_timeout() or 180, headers={"Authorization": f"Bearer {api_key}"}, json=body)
    except httpx.TimeoutException as exc:
        raise AiError(f"{name} nie odpowiedział na czas.") from exc
    except httpx.HTTPError as exc:
        raise AiError(f"Brak połączenia z {name}.") from exc
    if response.status_code in (401, 403):
        raise AiError(f"Nieprawidłowy klucz API {name}.")
    if response.status_code in (400, 404) and "model" in response.text and (
            "not_found" in response.text or "does not exist" in response.text or "decommissioned" in response.text):
        # Dostawca wycofał model ustawiony w dodatku - używamy aktualnego domyślnego
        if model != default_model:
            log.warning("%s: model %s niedostępny - używam %s", name, model, default_model)
            return _ask_openai_style(name, url, api_key, default_model, default_model, content, system, schema)
        raise AiError(f"{name} nie ma już modelu {model} - zmień model w ustawieniach dodatku.")
    if response.status_code == 413:
        raise AiError(f"Zapytanie jest za duże dla darmowego limitu {name}.")
    if response.status_code == 429:
        raise AiError(f"Wyczerpany limit zapytań do {name} - spróbuj za chwilę.")
    if response.status_code >= 500:
        raise AiError(f"{name} jest teraz przeciążony - spróbuj za kilka minut.")
    if response.status_code >= 400:
        raise AiError(f"Błąd AI {name}: {response.text[:300]}")
    choice = response.json()["choices"][0]
    if choice.get("finish_reason") == "length":
        raise AiError("AI nie dokończyło odpowiedzi - przepis jest za długi.")
    text = (choice["message"].get("content") or "").strip()
    # Na wszelki wypadek usuwamy ```json ... ```, gdyby model je dodał
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return schema.model_validate_json(text)
    except ValidationError as exc:
        raise AiError(f"{name} nie zwróciło poprawnej odpowiedzi - spróbuj jeszcze raz.") from exc


def _ask_groq(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    settings = get_settings()
    return _ask_openai_style("Groq", "https://api.groq.com/openai/v1/chat/completions",
                             settings.groq_api_key, settings.groq_model, DEFAULT_GROQ_MODEL, content, system, schema)


def _ask_mistral(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    settings = get_settings()
    return _ask_openai_style("Mistral", "https://api.mistral.ai/v1/chat/completions",
                             settings.mistral_api_key, settings.mistral_model, DEFAULT_MISTRAL_MODEL,
                             content, system, schema)


PROVIDER_NAMES = {"anthropic": "Claude", "gemini": "Gemini", "groq": "Groq", "mistral": "Mistral"}


def _ask_provider(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    """Wysyła treść do AI; odpowiedź ma kształt klasy `schema`.

    Pytamy po kolei wszystkie AI z kluczem (kolejność: config.ai_providers),
    aż któryś odpowie. Gdy zawiodą wszystkie, pokazujemy błąd każdego.
    """
    ask = {"anthropic": _ask_claude, "gemini": _ask_gemini, "groq": _ask_groq, "mistral": _ask_mistral}
    providers = get_settings().ai_providers
    if not providers:
        raise AiError("Brak klucza API do AI - ustaw klucz Gemini, Groq, Mistral albo Anthropic.")
    errors = []
    chat_deadline = _limit.get()
    if chat_deadline is not None:
        now = time.monotonic()
        providers = sorted(providers, key=lambda name: _failed_until.get(name, 0) > now)
    for provider in providers:
        token = None
        if chat_deadline is not None:
            token = _limit.set(min(chat_deadline, time.monotonic() + CHAT_PROVIDER_SECONDS))
        try:
            return ask[provider](content, system, schema)
        except AiError as exc:
            log.warning("%s zawiódł: %s - próbuję następnego AI", PROVIDER_NAMES[provider], exc)
            errors.append(f"{PROVIDER_NAMES[provider]}: {exc}")
            if chat_deadline is not None:
                _failed_until[provider] = time.monotonic() + CHAT_PENALTY_SECONDS
        finally:
            if token is not None:
                _limit.reset(token)
    if len(errors) == 1:
        raise AiError(errors[0].split(": ", 1)[1])
    raise AiError("Żadne AI nie odpowiedziało. " + " ".join(errors))


def _categories_hint(categories: list[str]) -> str:
    return (
        "Istniejące kategorie: " + (", ".join(categories) or "brak") + "\n"
        "Przepis może mieć kilka kategorii naraz: rodzaj dania (np. 'Danie główne') i sposób "
        "przygotowania - 'Air fryer', gdy danie robi się w air fryerze (frytkownicy beztłuszczowej)."
    )


def _ask(content: Content) -> list[AiRecipe]:
    result = _ask_provider(content, SYSTEM_PROMPT, AiResult)
    recipes = [r for r in result.recipes if r.title or r.ingredients or r.steps]
    if not recipes:
        raise AiError("Nie znaleziono przepisu w tym materiale.")
    return recipes


def _image_list(image_urls: list[str]) -> str:
    if not image_urls:
        return "Brak obrazków."
    return "\n".join(f"{i}: {url}" for i, url in enumerate(image_urls))


def recipes_from_page(page: PageContent, categories: list[str] = ()) -> list[AiRecipe]:
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
        f"Obrazki ze strony (numer: adres):\n{_image_list(page.image_urls)}\n\n"
        f"{_categories_hint(list(categories))}"
    )
    return _ask([text])


def recipes_from_images(jpegs: list[bytes], categories: list[str] = ()) -> list[AiRecipe]:
    """Przepisy ze zdjęć/screenów (JPEG). Obrazki są numerowane w kolejności wysłania."""
    content: Content = []
    for i, jpeg in enumerate(jpegs):
        content += [f"Obrazek {i}:", jpeg]
    content.append(
        "Odczytaj przepis z powyższych obrazków (to zwykle screeny kolejnych części "
        "jednego przepisu, ale może być ich kilka). Jeśli któryś obrazek to zdjęcie "
        "gotowego dania, wskaż go jako główny.\n\n" + _categories_hint(list(categories))
    )
    return _ask(content)


def categorize(recipes: list[tuple[int, str, list[str]]], categories: list[str]) -> dict[int, list[str]]:
    """Kategorie dla istniejących przepisów: [(id, tytuł, składniki)] -> {id: [kategorie]}."""
    lines = [f"{rid}. {title} (składniki: {', '.join(names[:15]) or 'brak'})" for rid, title, names in recipes]
    text = "Przepisy:\n" + "\n".join(lines) + "\n\n" + _categories_hint(categories)
    result = _ask_provider([text], CATEGORIZE_PROMPT, AiCategorization)
    return {item.id: item.categories for item in result.recipes}


SEARCH_PROMPT = """Znajdź w internecie strony z przepisem na podane danie (najlepiej polskie \
blogi i serwisy kulinarne ze zdjęciem gotowego dania). Odpowiedz wyłącznie listą adresów \
stron, po jednym w linii, najbardziej pasujące pierwsze. Bez komentarzy."""

_URL = re.compile(r"https?://[^\s)\]>\"']+")


def _search_claude(query: str) -> list[str]:
    settings = get_settings()
    try:
        response = anthropic.Anthropic(api_key=settings.anthropic_api_key).messages.create(
            model=settings.claude_model,
            max_tokens=4000,
            system=SEARCH_PROMPT,
            output_config={"effort": "low"},
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 2}],
            messages=[{"role": "user", "content": query}],
        )
    except anthropic.APIError as exc:
        raise AiError(f"Błąd wyszukiwania: {exc}") from exc
    urls: list[str] = []
    for block in response.content:
        if block.type == "text":
            urls += _URL.findall(block.text)
        elif block.type == "web_search_tool_result" and isinstance(block.content, list):
            # Wyniki wyszukiwania (lista); przy błędzie content jest obiektem, nie listą
            urls += [result.url for result in block.content]
    return urls


def _search_gemini(query: str) -> list[str]:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    # Zapasowy model ma osobny dzienny limit - próbujemy go, gdy główny wyczerpał swój
    models = [settings.gemini_model]
    if settings.gemini_fallback_model and settings.gemini_fallback_model != settings.gemini_model:
        models.append(settings.gemini_fallback_model)
    for number, model in enumerate(models):
        try:
            response = client.models.generate_content(
                model=model,
                contents=query,
                config=genai_types.GenerateContentConfig(
                    system_instruction=SEARCH_PROMPT,
                    # Gemini sam wyszukuje w Google ("grounding")
                    tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
                ),
            )
            break
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


def search_recipe_pages(title: str, ingredients: list[str]) -> list[str]:
    """Adresy stron z przepisem na to danie (AI szuka w internecie). Bez powtórzeń."""
    query = f"Danie: {title}\nGłówne składniki: {', '.join(ingredients[:8]) or 'brak'}"
    # Szukać w internecie umieją tylko Claude i Gemini
    search = {"anthropic": _search_claude, "gemini": _search_gemini}
    providers = [p for p in get_settings().ai_providers if p in search]
    if not providers:
        raise AiError("Wyszukiwanie przez AI wymaga klucza Gemini albo Anthropic.")
    for number, provider in enumerate(providers):
        try:
            urls = search[provider](query)
            break
        except AiError:
            if number == len(providers) - 1:
                raise
    return list(dict.fromkeys(u.rstrip(".,") for u in urls))


class AiNutrition(BaseModel):
    kcal: int | None = Field(description="Kalorie na 1 porcję")
    protein: int | None = Field(description="Białko na 1 porcję w gramach")
    fat: int | None = Field(description="Tłuszcz na 1 porcję w gramach")
    carbs: int | None = Field(description="Węglowodany na 1 porcję w gramach")


NUTRITION_PROMPT = """Jesteś dietetykiem. Na podstawie składników i ich ilości oszacuj \
wartości odżywcze na 1 porcję dania. Gdy liczba porcji nie jest podana, przyjmij 4. \
Gdy ilości nie są podane, przyjmij typowe dla takiego dania."""


def estimate_nutrition(title: str, servings: str, lines: list[str]) -> AiNutrition:
    """Kalorie i makro na porcję dla przepisu, który już jest w bazie."""
    text = f"Danie: {title}\nPorcje: {servings or 'nie podano'}\nSkładniki:\n" + "\n".join(lines)
    return _ask_provider([text], NUTRITION_PROMPT, AiNutrition)


class ChatAnswer(BaseModel):
    text: str = Field(description="Odpowiedź dla użytkownika po polsku, krótko (1-4 zdania)")
    recipe_ids: list[int] = Field(
        description="Numery przepisów z listy użytkownika, które polecasz (0-3); pusta lista, gdy żaden"
    )
    new_recipe: AiRecipe | None = Field(
        description="Nowy przepis, gdy żaden z zapisanych nie pasuje albo użytkownik prosi "
        "o coś nowego lub o zmianę zaproponowanego przepisu; inaczej null"
    )


CHAT_PROMPT = """Jesteś przyjaznym asystentem kulinarnym w aplikacji z przepisami. \
Widzisz przepisy zapisane przez użytkownika i produkty, które ma w domu.

Zasady:
- Gdy użytkownik pyta, co zjeść ("mam ochotę na...", "zaproponuj coś"), najpierw szukaj \
wśród jego przepisów i podaj ich numery w recipe_ids (najwyżej 3), z krótkim uzasadnieniem.
- Zawsze przestrzegaj tego, czego użytkownik nie chce (np. "bez ryżu", "nie chcę mięsa") \
i tego, co wcześniej powiedział w rozmowie.
- Gdy żaden zapisany przepis nie pasuje albo użytkownik prosi o nowy przepis, wymyśl \
jeden w new_recipe: po polsku, miary metryczne, temperatury w °C, kroki jako krótkie \
polecenia, original_text jak text, original_language "pl", obrazki null, kategorie \
z listy kategorii użytkownika. Najlepiej z produktów, które ma w domu.
- Gdy użytkownik prosi o zmianę zaproponowanego wcześniej przepisu ("zamień kurczaka \
na indyka", "na 2 osoby"), zwróć cały zmieniony przepis w new_recipe.
- W text nie przepisuj składników ani kroków - aplikacja pokazuje je sama.
- Pisz krótko i naturalnie, jak znajomy, który dobrze gotuje.
- Na pytania niezwiązane z jedzeniem odpowiedz krótko, że pomagasz w gotowaniu."""


def chat(context: str, conversation: str) -> ChatAnswer:
    """Jedna odpowiedź czatu. `context` - przepisy i spiżarnia, `conversation` - dotychczasowa rozmowa."""
    text = f"{context}\n\nRozmowa:\n{conversation}\n\nOdpowiedz na ostatnią wiadomość użytkownika."
    # Użytkownik czeka na ekranie - wolne AI pomijamy i pytamy następnego
    token = _limit.set(time.monotonic() + CHAT_SECONDS)
    try:
        return _ask_provider([text], CHAT_PROMPT, ChatAnswer)
    finally:
        _limit.reset(token)
