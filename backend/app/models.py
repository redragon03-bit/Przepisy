"""Tabele w bazie danych.

Przepis (Recipe) ma listę kroków (Step) i listę składników (RecipeIngredient).
Każdy RecipeIngredient wskazuje na Ingredient - to "kanoniczna" nazwa
składnika, np. "pomidor". Dzięki temu "2 duże pomidory" i "400 g pomidorów"
to ten sam składnik przy wyszukiwaniu.
"""

from datetime import date, datetime

from sqlalchemy import Column, ForeignKey, String, Table, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# Tabela łącząca przepisy z kategoriami (przepis może mieć kilka kategorii)
recipe_categories = Table(
    "recipe_categories",
    Base.metadata,
    Column("recipe_id", ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class Category(Base):
    """Kategoria, np. "Deser", "Zupa". Nazwa z dużej litery."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    servings: Mapped[str] = mapped_column(String(100), default="")
    prep_minutes: Mapped[int | None]
    cook_minutes: Mapped[int | None]
    total_minutes: Mapped[int | None]
    # "url", "image", "text" (wklejony tekst), "ai" (z czatu) albo "manual"
    source_type: Mapped[str] = mapped_column(String(20), default="manual")
    source_url: Mapped[str] = mapped_column(String(2000), default="")
    # Język oryginału, np. "en". Pusty = nie wiadomo.
    original_language: Mapped[str] = mapped_column(String(10), default="")
    # Nazwa pliku w folderze images (nie pełna ścieżka)
    image: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str] = mapped_column(Text, default="")
    favorite: Mapped[bool] = mapped_column(default=False, server_default="0")
    # Ocena 1-5, None = bez oceny
    rating: Mapped[int | None]
    # Ile razy przycisk "Ugotowane" został wciśnięty i kiedy ostatnio
    cooked_count: Mapped[int] = mapped_column(default=0, server_default="0")
    last_cooked_at: Mapped[datetime | None]
    # Szacunek AI na 1 porcję: kalorie i gramy białka, tłuszczu, węglowodanów
    kcal: Mapped[int | None]
    protein: Mapped[int | None]
    fat: Mapped[int | None]
    carbs: Mapped[int | None]
    # Wariant innego przepisu (np. "wege", "na 8 osób") - pokazywany przy nim, nie na liście
    variant_of: Mapped[int | None] = mapped_column(ForeignKey("recipes.id", ondelete="SET NULL"))
    # Krótka nazwa wariantu, np. "wege"
    variant_name: Mapped[str] = mapped_column(String(100), default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    steps: Mapped[list["Step"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan", order_by="Step.position"
    )
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan", order_by="RecipeIngredient.position"
    )
    categories: Mapped[list[Category]] = relationship(
        secondary=recipe_categories, order_by=Category.name, lazy="selectin"
    )
    parent: Mapped["Recipe | None"] = relationship(remote_side="Recipe.id", back_populates="variants")
    variants: Mapped[list["Recipe"]] = relationship(back_populates="parent", order_by="Recipe.id")
    cook_log: Mapped[list["CookLogEntry"]] = relationship(
        back_populates="recipe", cascade="all, delete-orphan", order_by="CookLogEntry.cooked_at.desc()"
    )


class Step(Base):
    __tablename__ = "steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    position: Mapped[int]
    text: Mapped[str] = mapped_column(Text)
    image: Mapped[str | None] = mapped_column(String(200))

    recipe: Mapped[Recipe] = relationship(back_populates="steps")


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Zawsze małymi literami, w mianowniku liczby pojedynczej, np. "mąka pszenna"
    name: Mapped[str] = mapped_column(String(200), unique=True)
    # Podstawowe składniki (sól, woda...) ignorowane przy "co mogę ugotować"
    is_staple: Mapped[bool] = mapped_column(default=False)
    # Spiżarnia: produkt jest teraz w domu (pomijany na liście zakupów)
    in_pantry: Mapped[bool] = mapped_column(default=False, server_default="0")
    # Do kiedy produkt ze spiżarni trzeba zużyć (None = nie wiadomo / bez znaczenia)
    pantry_expires: Mapped[date | None]


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id"))
    position: Mapped[int]
    # Linijka do wyświetlenia, np. "200 g mąki pszennej"
    text: Mapped[str] = mapped_column(String(500))
    amount: Mapped[float | None]
    unit: Mapped[str] = mapped_column(String(30), default="")
    # Linijka ze źródła przed tłumaczeniem, np. "1 1/2 cups all-purpose flour"
    original_text: Mapped[str] = mapped_column(String(500), default="")

    recipe: Mapped[Recipe] = relationship(back_populates="ingredients")
    ingredient: Mapped[Ingredient] = relationship(lazy="joined")


class ImportJob(Base):
    """Jedno zlecenie importu (z linku albo zdjęć). Działa w tle."""

    __tablename__ = "import_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    # "url", "image" albo "text" (wklejony tekst; sam tekst leży w folderze zadania)
    kind: Mapped[str] = mapped_column(String(20))
    # Link albo lista nazw plików oddzielona przecinkami
    source: Mapped[str] = mapped_column(String(2000))
    # "pending" -> "running" -> "done" albo "failed"; "duplicate" = link już był w bazie
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error: Mapped[str] = mapped_column(Text, default="")
    # Pierwszy zaimportowany przepis (strona może mieć ich kilka)
    recipe_id: Mapped[int | None] = mapped_column(ForeignKey("recipes.id", ondelete="SET NULL"))
    # Ile przepisów powstało z tego importu
    recipe_count: Mapped[int] = mapped_column(default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ShoppingItem(Base):
    """Pozycja na liście zakupów (z przepisu albo dopisana ręcznie)."""

    __tablename__ = "shopping_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nazwa kanoniczna składnika - po niej łączymy te same produkty z kilku przepisów.
    # Pusta dla pozycji dopisanych ręcznie.
    name: Mapped[str] = mapped_column(String(200), default="")
    # Linijka do wyświetlenia, np. "300 g mąki pszennej"
    text: Mapped[str] = mapped_column(String(500))
    amount: Mapped[float | None]
    unit: Mapped[str] = mapped_column(String(30), default="")
    # Z jakich przepisów pochodzi, np. "Naleśniki, Pierogi"
    recipes: Mapped[str] = mapped_column(String(1000), default="")
    checked: Mapped[bool] = mapped_column(default=False)
    # Tekst pozycji na liście w Home Assistant; pusty = nie ma jej w HA (patrz shopping.sync_with_home_assistant)
    ha_text: Mapped[str] = mapped_column(String(500), default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class MealPlanEntry(Base):
    """Przepis zaplanowany na dany dzień."""

    __tablename__ = "meal_plan"

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date]
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    # Na ile porcji gotujemy (None = tyle, ile w przepisie) - przelicza ilości na liście zakupów
    servings: Mapped[int | None]
    # Składniki są już na liście zakupów - drugi raz ich nie dodajemy
    in_shopping: Mapped[bool] = mapped_column(default=False, server_default="0")

    recipe: Mapped[Recipe] = relationship(lazy="joined")


class CookLogEntry(Base):
    """Dziennik gotowania: każde "Ugotowane" z opcjonalną oceną, notatką i zdjęciem."""

    __tablename__ = "cook_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    cooked_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # Ocena tego gotowania 1-5; None = bez oceny
    rating: Mapped[int | None]
    note: Mapped[str] = mapped_column(Text, default="")
    image: Mapped[str | None] = mapped_column(String(200))

    recipe: Mapped[Recipe] = relationship(back_populates="cook_log")
