"""Tabele w bazie danych.

Przepis (Recipe) ma listę kroków (Step) i listę składników (RecipeIngredient).
Każdy RecipeIngredient wskazuje na Ingredient - to "kanoniczna" nazwa
składnika, np. "pomidor". Dzięki temu "2 duże pomidory" i "400 g pomidorów"
to ten sam składnik przy wyszukiwaniu.
"""

from datetime import date, datetime

from sqlalchemy import Column, ForeignKey, String, Table, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# Tabela łącząca przepisy z kategoriami (przepis może mieć kilka kategorii)
recipe_categories = Table(
    "recipe_categories",
    Base.metadata,
    Column("recipe_id", ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    """Konto domownika (np. brata). Właściciel aplikacji nie ma tu wiersza - loguje się hasłem
    z opcji dodatku (app_password), a jego dane mają user_id = None.

    Przepisy są wspólne; plan, lista zakupów, spiżarnia, ulubione i oceny - osobne (patrz services/kitchen.py).
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nazwa do logowania, np. "Naszman"
    name: Mapped[str] = mapped_column(String(50), unique=True)
    # pbkdf2: "sól$skrót" (patrz auth.hash_password)
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class AppSetting(Base):
    """Drobne ustawienia aplikacji zmieniane w Ustawieniach, np. nazwa konta właściciela."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(String(500), default="")


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
    # Kto dodał przepis: konto domownika (User.id); None = właściciel aplikacji
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
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
    # Sekcja, do której należy krok, np. "Kapusta" ('' = bez sekcji); nagłówek
    # pokazujemy tam, gdzie sekcja zmienia się względem poprzedniego kroku
    section: Mapped[str] = mapped_column(String(100), default="", server_default="")

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
    # Sekcja składnika, np. "Krem do omleta" ('' = bez sekcji), jak przy krokach
    section: Mapped[str] = mapped_column(String(100), default="", server_default="")

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
    # Kiedy zadanie ostatnio ruszyło (start albo "Ponów", czas UTC) - po nim poznajemy zawieszone
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    # Czyja to pozycja: konto domownika (User.id); None = właściciel aplikacji
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))


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
    # Czyja to pozycja: konto domownika (User.id); None = właściciel aplikacji
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))


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
    # Czyja to pozycja: konto domownika (User.id); None = właściciel aplikacji
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

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
    # Czyja to pozycja: konto domownika (User.id); None = właściciel aplikacji
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    recipe: Mapped[Recipe] = relationship(back_populates="cook_log")


class PromoLeaflet(Base):
    """Gazetka sklepu, z której odczytaliśmy promocje (patrz services/promotions.py).

    Każdą gazetkę AI czyta tylko raz - przy kolejnym sprawdzeniu pomijamy te, które już są.
    """

    __tablename__ = "promo_leaflets"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Sieć, np. "Lidl", "Biedronka"
    store: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(300))
    # Adres gazetki - po nim poznajemy, że już ją czytaliśmy
    url: Mapped[str] = mapped_column(String(2000), unique=True)
    valid_from: Mapped[date | None]
    valid_to: Mapped[date | None]
    # "done" albo "failed" (wtedy spróbujemy jeszcze raz przy następnym sprawdzeniu)
    status: Mapped[str] = mapped_column(String(20), default="done")
    error: Mapped[str] = mapped_column(Text, default="")
    # Wersja odczytu (services/promotions.py: PARSER_VERSION) - starsze czytamy jeszcze raz
    parser: Mapped[int] = mapped_column(default=1, server_default="1")
    fetched_at: Mapped[datetime] = mapped_column(server_default=func.now())

    promotions: Mapped[list["Promotion"]] = relationship(
        back_populates="leaflet", cascade="all, delete-orphan", order_by="Promotion.id"
    )
    pages: Mapped[list["PromoPage"]] = relationship(cascade="all, delete-orphan")


class PromoFavorite(Base):
    """Ulubiony produkt w promocjach, np. "herbata" - wyróżniany, gdy jest w promocji (każda marka)."""

    __tablename__ = "promo_favorites"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nazwa składnika ("herbata") albo produktu spoza jedzenia ("pieluchy dada"), małymi literami
    key: Mapped[str] = mapped_column(String(200), unique=True)


class PromoPage(Base):
    """Strona gazetki, której obrazek AI już przeczytało (nocne uzupełnianie cen)."""

    __tablename__ = "promo_pages"
    __table_args__ = (UniqueConstraint("leaflet_id", "number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    leaflet_id: Mapped[int] = mapped_column(ForeignKey("promo_leaflets.id", ondelete="CASCADE"))
    # Numer strony od 1
    number: Mapped[int]
    # "done" albo "failed" (obrazka nie dało się pobrać - nie próbujemy znowu)
    status: Mapped[str] = mapped_column(String(20), default="done")


class Promotion(Base):
    """Produkt spożywczy w promocji z gazetki."""

    __tablename__ = "promotions"

    id: Mapped[int] = mapped_column(primary_key=True)
    leaflet_id: Mapped[int] = mapped_column(ForeignKey("promo_leaflets.id", ondelete="CASCADE"))
    # Nazwa jak w gazetce, np. "Masło ekstra Polmlek 200 g"
    name: Mapped[str] = mapped_column(String(300))
    # "jedzenie", "dziecko" (pieluchy) albo "czystosc" (środki czystości)
    category: Mapped[str] = mapped_column(String(20), default="jedzenie", server_default="jedzenie")
    # Nazwa kanoniczna składnika (jak Ingredient.name), np. "masło"
    ingredient: Mapped[str] = mapped_column(String(200), default="")
    # Cena do wyświetlenia, np. "2,49 zł" albo "2+1 gratis"
    price: Mapped[str] = mapped_column(String(100), default="")
    # Dopisek, np. "z aplikacją", "-30%", "przy zakupie 2 szt."
    note: Mapped[str] = mapped_column(String(300), default="")
    # Rabat w procentach (0 = nie wiadomo)
    discount: Mapped[int] = mapped_column(default=0, server_default="0")
    # Wycinek produktu ze strony gazetki (plik w data/promo), "" gdy nie ma
    image: Mapped[str] = mapped_column(String(100), default="", server_default="")

    leaflet: Mapped[PromoLeaflet] = relationship(back_populates="promotions", lazy="joined")


class MemberMark(Base):
    """Ulubione, ocena i licznik gotowań przepisu dla domownika.

    Właściciel trzyma je w kolumnach Recipe (favorite, rating...), tak jak przed kontami.
    """

    __tablename__ = "member_marks"
    __table_args__ = (UniqueConstraint("user_id", "recipe_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    favorite: Mapped[bool] = mapped_column(default=False)
    rating: Mapped[int | None]
    cooked_count: Mapped[int] = mapped_column(default=0)
    last_cooked_at: Mapped[datetime | None]


class MemberPantry(Base):
    """Spiżarnia domownika (właściciel ma swoją w kolumnach Ingredient.in_pantry i pantry_expires)."""

    __tablename__ = "member_pantry"
    __table_args__ = (UniqueConstraint("user_id", "ingredient_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id", ondelete="CASCADE"))
    expires: Mapped[date | None]

    ingredient: Mapped[Ingredient] = relationship(lazy="joined")


class MemberPromoFavorite(Base):
    """Ulubiony produkt w promocjach domownika (właściciel: PromoFavorite)."""

    __tablename__ = "member_promo_favorites"
    __table_args__ = (UniqueConstraint("user_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(200))
