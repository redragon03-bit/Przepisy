"""Kształt danych wysyłanych i odbieranych przez API (JSON).

To nie są tabele bazy (te są w models.py) - to "umowa" z frontendem.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel as PydanticModel
from pydantic import ConfigDict, Field

from .services.ai import AiRecipe


class BaseModel(PydanticModel):
    # W odpowiedziach serwera pole z wartością domyślną i tak zawsze jest - typy dla
    # frontendu (app/export_types.py) mają je jako wymagane, a w danych wysyłanych do serwera jako opcjonalne
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


def image_url(filename: str | None) -> str | None:
    return f"/media/{filename}" if filename else None


def thumb_url(filename: str | None) -> str | None:
    """Mała wersja zdjęcia (do listy) - patrz images.thumbnail."""
    return f"/media/thumb/{filename}" if filename else None


class IngredientLine(BaseModel):
    text: str = Field(description="Linijka do wyświetlenia, np. '200 g mąki'")
    name: str = Field(description="Nazwa do wyszukiwania, np. 'mąka pszenna'")
    amount: float | None = None
    unit: str = ""
    original_text: str = ""


class StepOut(BaseModel):
    text: str
    image_url: str | None = None


class StepIn(BaseModel):
    text: str
    # Nazwa pliku istniejącego obrazka kroku - żeby edycja go nie gubiła
    image: str | None = None


class RecipeSummary(BaseModel):
    id: int
    title: str
    image_url: str | None
    # Miniatura do list (kilka razy mniejszy plik niż image_url)
    thumb_url: str | None
    total_minutes: int | None
    source_type: Literal["url", "image", "text", "manual", "ai"]
    categories: list[str]
    favorite: bool
    rating: int | None
    cooked_count: int
    last_cooked_at: datetime | None
    created_at: datetime


class RecipeStats(BaseModel):
    total: int = Field(description="Wszystkie przepisy")
    uncategorized: int = Field(description="Przepisy bez kategorii")


class VariantRef(BaseModel):
    id: int
    title: str
    # Krótka nazwa wariantu, np. "wege"; pusta dla przepisu głównego
    variant_name: str


class CookLogOut(BaseModel):
    id: int
    cooked_at: datetime
    rating: int | None
    note: str
    image_url: str | None


class RecipeOut(RecipeSummary):
    description: str
    servings: str
    prep_minutes: int | None
    cook_minutes: int | None
    source_url: str
    original_language: str
    notes: str
    # Szacunek AI na 1 porcję; None = jeszcze nie policzone
    kcal: int | None
    protein: int | None
    fat: int | None
    carbs: int | None
    ingredients: list[IngredientLine]
    steps: list[StepOut]
    # Surowe nazwy plików obrazków kroków - potrzebne formularzowi edycji
    step_images: list[str | None]
    # Przepis, którego to jest wariant (None = przepis główny)
    variant_of: VariantRef | None
    variant_name: str
    # Warianty tego przepisu (a dla wariantu: pozostałe warianty tego samego przepisu)
    variants: list[VariantRef]
    # Dziennik gotowania, najnowsze najpierw
    cook_log: list[CookLogOut]


class RecipeIn(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""
    servings: str = ""
    prep_minutes: int | None = None
    cook_minutes: int | None = None
    total_minutes: int | None = None
    source_url: str = ""
    notes: str = ""
    ingredients: list[IngredientLine] = []
    steps: list[StepIn] = []
    categories: list[str] = []


class RecipePatch(BaseModel):
    """Szybka zmiana pojedynczych pól bez wysyłania całego formularza."""

    favorite: bool | None = None
    rating: int | None = Field(default=None, ge=0, le=5, description="0 = usuń ocenę")
    notes: str | None = None


class SubstituteIn(BaseModel):
    ingredient: str = Field(min_length=1, description="Linijka składnika, którego brakuje")


class SubstituteOut(BaseModel):
    text: str


class VariantIn(BaseModel):
    wish: str = Field(min_length=2, max_length=300, description="Np. 'wersja wege', 'na 8 osób'")


class ShoppingItemOut(BaseModel):
    id: int
    text: str
    recipes: str
    checked: bool
    # Dział sklepu, np. "Warzywa i owoce" (lista jest pogrupowana działami)
    aisle: str
    # Miejsce działu na liście (mniej więcej kolejność w sklepie)
    aisle_order: int
    # Czy pozycja jest też na liście w Home Assistant
    in_ha: bool


class ShoppingItemIn(BaseModel):
    text: str = Field(min_length=1)


class ShoppingItemPatch(BaseModel):
    checked: bool | None = None
    text: str | None = None


class ShoppingFromRecipe(BaseModel):
    recipe_id: int
    # Mnożnik ilości, np. 0.5 = połowa porcji (patrz przeliczanie porcji)
    factor: float = Field(default=1, gt=0, le=20)
    # Pomija składniki "zawsze w domu" (sól, woda...)
    skip_staples: bool = True


class ShoppingFromPlan(BaseModel):
    start: date
    end: date
    skip_staples: bool = True


class ShoppingResult(BaseModel):
    added: int
    # Składniki pominięte, bo są w spiżarni
    skipped: list[str] = []
    # Ile dań z planu pominięto, bo ich składniki już są na liście
    already: int = 0


class PantryIn(BaseModel):
    names: list[str] = Field(description="Wszystkie produkty, które są teraz w domu")


class PantryItem(BaseModel):
    name: str
    # Do kiedy trzeba zużyć; None = bez terminu
    expires: date | None


class PantryExpiresIn(BaseModel):
    name: str
    expires: date | None


class MealPlanIn(BaseModel):
    day: date
    recipe_id: int


class MealPlanOut(BaseModel):
    id: int
    day: date
    recipe: "RecipeSummary"
    servings: int | None = Field(default=None, description="Na ile porcji gotujemy; None = jak w przepisie")
    base_servings: int | None = Field(default=None, description="Porcje z przepisu (np. 4), None = nie podano")
    in_shopping: bool = False


class MealPlanPatch(BaseModel):
    servings: int = Field(ge=1, le=50)


class PlanSuggestionIn(BaseModel):
    days: list[date] = Field(min_length=1, max_length=14)
    wishes: str = Field(default="", max_length=500, description="Np. 'raz ryba, do 40 minut'")


class PlanSuggestionDay(BaseModel):
    day: date
    recipe: RecipeSummary
    reason: str


class PlanSuggestionOut(BaseModel):
    id: int
    status: Literal["running", "done", "failed"]
    error: str
    text: str
    days: list[PlanSuggestionDay]


class ImageFromUrl(BaseModel):
    url: str


class ImageSearchProgress(BaseModel):
    running: bool
    done: int
    found: int
    total: int
    # Ile przepisów nadal nie ma zdjęcia
    missing: int


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str
    # Przepis zaproponowany w tej wiadomości (odsyłamy go, żeby AI mogło go zmienić)
    recipe: AiRecipe | None = None


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)


class ChatOut(BaseModel):
    text: str
    recipes: list[RecipeSummary]
    new_recipe: AiRecipe | None


class ChatSaveIn(BaseModel):
    recipe: AiRecipe


class CalendarLink(BaseModel):
    path: str


class BackupFile(BaseModel):
    name: str
    size: int
    created_at: datetime


class RestoreResult(BaseModel):
    recipes: int = Field(description="Ile przepisów jest w przywróconej kopii")


class CategoryOut(BaseModel):
    name: str
    recipe_count: int


class AutoCategorizeOut(BaseModel):
    updated: int = Field(description="Ilu przepisom AI przypisało kategorie")
    remaining: int = Field(description="Ile przepisów nadal nie ma kategorii")


class IngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_schema_serialization_defaults_required=True)

    id: int
    name: str
    is_staple: bool
    recipe_count: int = 0


class IngredientUpdate(BaseModel):
    is_staple: bool


class StapleIn(BaseModel):
    name: str


class CookRequest(BaseModel):
    ingredients: list[str]
    max_missing: int = Field(default=2, ge=0, le=10)


class CookMatch(BaseModel):
    recipe: RecipeSummary
    have: list[str]
    missing: list[str]
    # Produkty ze spiżarni, którym kończy się termin, a ten przepis je zużywa
    use_first: list[str]


class UrlImportIn(BaseModel):
    url: str
    # True = importuj, nawet jeśli przepis z tego linku już jest w bazie
    force: bool = False


class TextImportIn(BaseModel):
    text: str = Field(min_length=10, max_length=50_000, description="Tekst przepisu")


class ImportJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, json_schema_serialization_defaults_required=True)

    id: int
    kind: Literal["url", "image", "text"]
    source: str
    # "duplicate" = link już był w bazie (recipe_id wskazuje ten przepis)
    status: Literal["pending", "running", "done", "failed", "duplicate"]
    error: str
    recipe_id: int | None
    recipe_count: int
    created_at: datetime


class LoginIn(BaseModel):
    password: str


class AuthStatus(BaseModel):
    authenticated: bool
    auth_required: bool
    ai_enabled: bool
    # Pierwszy pytany AI: "anthropic", "gemini", "groq", "mistral" albo None (AI wyłączone)
    ai_provider: str | None
    # Wszystkie AI z kluczem, w kolejności pytania (kolejne są zapasem)
    ai_providers: list[str]
    # Czy lista zakupów może być wysłana do Home Assistant
    ha_enabled: bool
    # Czy koniec minutnika przychodzi jako powiadomienie z Home Assistant (opcja ha_notify)
    notify_enabled: bool = False


class TimerIn(BaseModel):
    id: int = Field(description="Numer minutnika nadany przez telefon")
    label: str = Field(max_length=300)
    seconds: int = Field(ge=1, le=24 * 3600)


class DuplicateGroup(BaseModel):
    keep: str = Field(description="Nazwa, która zostanie (najczęściej używana)")
    others: list[str] = Field(description="Nazwy do połączenia z `keep`")
    recipe_count: int = Field(description="W ilu przepisach występują wszystkie razem")


class MergeIn(BaseModel):
    keep: str
    others: list[str] = Field(min_length=1)
