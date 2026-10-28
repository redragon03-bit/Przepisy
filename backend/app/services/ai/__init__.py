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

Kod jest podzielony na pliki: base.py (błąd i limit czasu), claude.py, gemini.py
i openai_style.py (Groq, Mistral). Tutaj są formaty odpowiedzi, polecenia dla AI
i funkcje, których używa reszta aplikacji.
"""

import json
import logging
import time
from dataclasses import asdict

from pydantic import BaseModel, Field

from ...config import get_settings
from ..scraper import PageContent
from .base import (  # noqa: F401
    CHAT_PENALTY_SECONDS,
    CHAT_PROVIDER_SECONDS,
    CHAT_SECONDS,
    AiError,
    Content,
    _limit,
    _timeout,
    time_limit,
)
from .claude import _ask_claude, _search_claude
from .gemini import _ask_gemini, _search_gemini
from .openai_style import _ask_groq, _ask_mistral

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


# AI, które zawiodło przy limicie czasu, i do kiedy pytamy je na końcu (patrz CHAT_PENALTY_SECONDS)
_failed_until: dict[str, float] = {}


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
    # Gdy użytkownik czeka (time_limit), AI, które niedawno zawiodło, pytamy na końcu
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


def clean_text(text: str) -> str:
    """Tekst od AI do pokazania: niektóre AI wpisują w JSON-ie dosłowne "\\n" zamiast nowej linii."""
    return text.replace("\\r\\n", "\n").replace("\\n", "\n").strip()


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
    with time_limit(CHAT_SECONDS):  # użytkownik czeka na liście przepisów
        result = _ask_provider([text], CATEGORIZE_PROMPT, AiCategorization)
    return {item.id: item.categories for item in result.recipes}


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
    with time_limit(CHAT_SECONDS):  # użytkownik czeka na ekranie przepisu
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
Widzisz przepisy zapisane przez użytkownika i część produktów, które ma w domu.

Zasady:
- Gdy użytkownik pyta, co zjeść ("mam ochotę na...", "zaproponuj coś"), najpierw szukaj \
wśród jego przepisów i podaj ich numery w recipe_ids (najwyżej 3), z krótkim uzasadnieniem. \
Zapisany przepis, który pasuje, jest zawsze lepszy niż nowy.
- Spiżarnia to tylko produkty, które użytkownik zaznaczył - zwykle ma w domu dużo więcej. \
Traktuj ją jako podpowiedź, nigdy nie pisz, że ma "tylko" te produkty, i nie odrzucaj \
przepisów z tego powodu.
- Zawsze przestrzegaj tego, czego użytkownik nie chce (np. "bez ryżu", "nie chcę mięsa") \
i tego, co wcześniej powiedział w rozmowie.
- Gdy żaden zapisany przepis nie pasuje albo użytkownik prosi o nowy przepis, wymyśl \
jeden w new_recipe: po polsku, miary metryczne, temperatury w °C, kroki jako krótkie \
polecenia, original_text jak text, original_language "pl", obrazki null, kategorie \
z listy kategorii użytkownika. Chętnie z produktów ze spiżarni, ale nie tylko z nich.
- Gdy użytkownik prosi o zmianę zaproponowanego wcześniej przepisu ("zamień kurczaka \
na indyka", "na 2 osoby"), zwróć cały zmieniony przepis w new_recipe.
- W text nie przepisuj składników ani kroków - aplikacja pokazuje je sama.
- Pisz krótko i naturalnie, jak znajomy, który dobrze gotuje.
- Na pytania niezwiązane z jedzeniem odpowiedz krótko, że pomagasz w gotowaniu."""


def chat(context: str, conversation: str) -> ChatAnswer:
    """Jedna odpowiedź czatu. `context` - przepisy i spiżarnia, `conversation` - dotychczasowa rozmowa."""
    text = f"{context}\n\nRozmowa:\n{conversation}\n\nOdpowiedz na ostatnią wiadomość użytkownika."
    # Użytkownik czeka na ekranie - wolne AI pomijamy i pytamy następnego
    with time_limit(CHAT_SECONDS):
        answer = _ask_provider([text], CHAT_PROMPT, ChatAnswer)
    answer.text = clean_text(answer.text)
    return answer


def recipes_from_text(text: str, categories: list[str] = ()) -> list[AiRecipe]:
    """Przepis z wklejonego tekstu (np. wiadomość od znajomego albo notatka)."""
    return _ask([f"Tekst przepisu wklejony przez użytkownika:\n{text}\n\nBrak obrazków.\n\n"
                 + _categories_hint(list(categories))])


class AiPlanDay(BaseModel):
    day: str = Field(description="Data dnia z listy, w formacie RRRR-MM-DD")
    recipe_id: int = Field(description="Numer przepisu z listy użytkownika")
    reason: str = Field(description="Krótko, dlaczego ten przepis (kilka słów), albo ''")


class AiPlan(BaseModel):
    text: str = Field(description="1-2 zdania o planie po polsku")
    days: list[AiPlanDay] = Field(description="Jeden przepis na każdy podany dzień")


PLAN_PROMPT = """Jesteś asystentem kulinarnym. Układasz plan obiadów na podane dni \
wyłącznie z przepisów zapisanych przez użytkownika (podajesz ich numery).

Zasady:
- Na każdy podany dzień dokładnie jeden przepis.
- Przestrzegaj życzeń użytkownika (np. "raz ryba", "do 40 minut", "bez mięsa w piątek").
- Nie powtarzaj przepisu w planie, chyba że przepisów jest za mało.
- Różnicuj dania (nie dwa razy z rzędu to samo mięso albo makaron).
- Chętnie wybieraj ulubione i dobrze ocenione, a także te z produktami, które trzeba \
zużyć najpierw (kończy się ich termin).
- Unikaj przepisów, które nie są obiadem (desery, napoje, dodatki), chyba że użytkownik prosi."""


def suggest_plan(context: str, days: list[str], wishes: str) -> AiPlan:
    """Plan obiadów na `days` (RRRR-MM-DD) z przepisów w `context`. Działa w tle - bez limitu czasu."""
    text = (f"{context}\n\nDni do zaplanowania: {', '.join(days)}\n"
            f"Życzenia użytkownika: {wishes.strip() or 'brak'}")
    plan = _ask_provider([text], PLAN_PROMPT, AiPlan)
    plan.text = clean_text(plan.text)
    return plan


class AiSubstitute(BaseModel):
    text: str = Field(description="Odpowiedź po polsku: 1-3 zamienniki, każdy w osobnej linii od '• ', "
                      "z ilością i krótką uwagą, jak zmieni się danie")


SUBSTITUTE_PROMPT = """Jesteś doświadczonym kucharzem. Użytkownikowi brakuje składnika \
do przepisu. Podaj 1-3 najlepsze zamienniki, które zwykle są w polskim domu, z ilością \
w miejsce brakującego składnika, i krótko napisz, jak zmieni się danie. Gdy składnik \
można po prostu pominąć, też to napisz. Pisz krótko, bez wstępów."""


def substitute(title: str, lines: list[str], ingredient: str) -> AiSubstitute:
    """Czym zastąpić składnik w tym przepisie."""
    text = f"Danie: {title}\nSkładniki:\n" + "\n".join(lines) + f"\n\nBrakuje: {ingredient}"
    with time_limit(CHAT_SECONDS):  # użytkownik czeka na ekranie przepisu
        answer = _ask_provider([text], SUBSTITUTE_PROMPT, AiSubstitute)
    answer.text = clean_text(answer.text)
    return answer


class AiVariant(BaseModel):
    name: str = Field(description="Krótka nazwa wariantu, małymi literami, np. 'wege', 'na 8 osób', 'bez glutenu'")
    recipe: AiRecipe = Field(description="Cały zmieniony przepis")


VARIANT_PROMPT = """Jesteś asystentem kulinarnym. Dostajesz przepis użytkownika i jego \
prośbę o wariant (np. "wersja wege", "na 8 osób", "bez laktozy"). Zwróć cały zmieniony \
przepis: zmień tylko to, czego wymaga prośba, resztę zostaw jak w oryginale. Po polsku, \
miary metryczne, temperatury w °C, original_text jak text, original_language "pl", \
obrazki null, kategorie jak w oryginale (chyba że prośba je zmienia). Tytuł jak oryginał \
z dopiskiem wariantu, np. "Gulasz (wege)". Przelicz kalorie na porcję."""


def variant(recipe_text: str, wish: str) -> AiVariant:
    """Wariant przepisu według prośby użytkownika."""
    text = f"Przepis:\n{recipe_text}\n\nProśba: {wish}"
    with time_limit(CHAT_SECONDS):  # użytkownik czeka na ekranie przepisu
        return _ask_provider([text], VARIANT_PROMPT, AiVariant)


class AiDuplicateGroup(BaseModel):
    names: list[str] = Field(
        description="Nazwy z listy oznaczające ten sam produkt (co najmniej 2), dokładnie jak na liście")


class AiDuplicates(BaseModel):
    groups: list[AiDuplicateGroup]


DUPLICATES_PROMPT = """Dostajesz listę nazw składników z przepisów użytkownika. Znajdź nazwy, \
które oznaczają DOKŁADNIE ten sam produkt w zakupach, zapisany inaczej: inna forma \
gramatyczna ("pomidory" i "pomidor"), synonim ("ziemniak" i "kartofel"), literówka albo \
nazwa po angielsku. Nie łącz różnych produktów: "ser" i "ser żółty", "masło" i "masło \
klarowane", "mąka pszenna" i "mąka" to RÓŻNE produkty. Gdy nie masz pewności, nie łącz. \
Przepisuj nazwy dokładnie tak, jak są na liście."""


def find_duplicate_ingredients(names: list[str]) -> list[list[str]]:
    """Grupy nazw tego samego produktu według AI (tylko nazwy z listy)."""
    known = set(names)
    with time_limit(CHAT_SECONDS):  # użytkownik czeka w Ustawieniach
        answer = _ask_provider(["Składniki:\n" + "\n".join(names)], DUPLICATES_PROMPT, AiDuplicates)
    groups = [[n for n in dict.fromkeys(g.names) if n in known] for g in answer.groups]
    return [g for g in groups if len(g) > 1]
