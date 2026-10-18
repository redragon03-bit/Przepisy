"""Kształt danych wysyłanych i odbieranych przez API (JSON).

To nie są tabele bazy (te są w models.py) - to "umowa" z frontendem.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


def image_url(filename: str | None) -> str | None:
    return f"/media/{filename}" if filename else None


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
    total_minutes: int | None
    source_type: str
    created_at: datetime


class RecipeOut(RecipeSummary):
    description: str
    servings: str
    prep_minutes: int | None
    cook_minutes: int | None
    source_url: str
    original_language: str
    notes: str
    ingredients: list[IngredientLine]
    steps: list[StepOut]
    # Surowe nazwy plików obrazków kroków - potrzebne formularzowi edycji
    step_images: list[str | None]


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


class IngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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


class UrlImportIn(BaseModel):
    url: str


class ImportJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    source: str
    status: str
    error: str
    recipe_id: int | None
    created_at: datetime


class LoginIn(BaseModel):
    password: str


class AuthStatus(BaseModel):
    authenticated: bool
    auth_required: bool
    ai_enabled: bool
    # "anthropic", "gemini" albo None (AI wyłączone)
    ai_provider: str | None
