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
    # "url", "image" albo "manual"
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
    # "url" albo "image"
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
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class MealPlanEntry(Base):
    """Przepis zaplanowany na dany dzień."""

    __tablename__ = "meal_plan"

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date]
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))

    recipe: Mapped[Recipe] = relationship(lazy="joined")
