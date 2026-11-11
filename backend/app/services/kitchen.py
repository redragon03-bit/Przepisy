"""Osobna "kuchnia" każdej osoby: spiżarnia, ulubione, oceny i licznik gotowań.

Przepisy są wspólne. Właściciel trzyma swoje dane tam, gdzie przed kontami
(Ingredient.in_pantry, Recipe.favorite...), więc jego baza się nie zmienia.
Domownicy mają je w osobnych tabelach (MemberPantry, MemberMark).
Plan, lista zakupów i dziennik gotowania mają po prostu kolumnę user_id.
"""

from datetime import date, datetime

from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..models import Ingredient, MemberMark, MemberPantry, Recipe
from .ingredients import get_or_create_ingredient

OWNER = CurrentUser(None, "")


class Marks:
    """Ulubione / ocena / gotowania przepisów widziane przez jedną osobę."""

    def __init__(self, db: Session, user: CurrentUser = OWNER):
        self.user = user
        self._db = db
        self._rows: dict[int, MemberMark] = {}
        if user.id is not None:
            self._rows = {m.recipe_id: m for m in db.query(MemberMark).filter_by(user_id=user.id)}

    def _row(self, recipe: Recipe) -> MemberMark | None:
        return self._rows.get(recipe.id)

    def favorite(self, recipe: Recipe) -> bool:
        if self.user.id is None:
            return recipe.favorite
        row = self._row(recipe)
        return bool(row and row.favorite)

    def rating(self, recipe: Recipe) -> int | None:
        if self.user.id is None:
            return recipe.rating
        row = self._row(recipe)
        return row.rating if row else None

    def cooked_count(self, recipe: Recipe) -> int:
        if self.user.id is None:
            return recipe.cooked_count
        row = self._row(recipe)
        return row.cooked_count if row else 0

    def last_cooked_at(self, recipe: Recipe) -> datetime | None:
        if self.user.id is None:
            return recipe.last_cooked_at
        row = self._row(recipe)
        return row.last_cooked_at if row else None

    def edit(self, recipe: Recipe) -> "Recipe | MemberMark":
        """Obiekt do zmiany (favorite, rating, cooked_count, last_cooked_at) dla tej osoby."""
        if self.user.id is None:
            return recipe
        row = self._row(recipe)
        if row is None:
            row = MemberMark(user_id=self.user.id, recipe_id=recipe.id, favorite=False, cooked_count=0)
            self._db.add(row)
            self._rows[recipe.id] = row
        return row

    def favorite_ids(self) -> set[int]:
        return {recipe_id for recipe_id, m in self._rows.items() if m.favorite}


# --- Spiżarnia ---

def pantry(db: Session, user: CurrentUser = OWNER) -> list[tuple[str, date | None]]:
    """(nazwa, termin) produktów w spiżarni, alfabetycznie."""
    if user.id is None:
        rows = db.query(Ingredient).filter_by(in_pantry=True).order_by(Ingredient.name)
        return [(i.name, i.pantry_expires) for i in rows]
    rows = db.query(MemberPantry).filter_by(user_id=user.id).all()
    return sorted(((p.ingredient.name, p.expires) for p in rows), key=lambda item: item[0])


def set_pantry(db: Session, user: CurrentUser, names: set[str]) -> None:
    """Podane produkty są w domu, pozostałe nie (nazwy już znormalizowane)."""
    if user.id is None:
        for ingredient in db.query(Ingredient).filter(Ingredient.in_pantry.is_(True)):
            if ingredient.name not in names:
                # Produkt zniknął z domu - jego termin już nie obowiązuje
                ingredient.in_pantry, ingredient.pantry_expires = False, None
        for name in names:
            get_or_create_ingredient(db, name).in_pantry = True
        return
    rows = db.query(MemberPantry).filter_by(user_id=user.id).all()
    have = {p.ingredient.name for p in rows}
    for row in rows:
        if row.ingredient.name not in names:
            db.delete(row)
    for name in names - have:
        db.add(MemberPantry(user_id=user.id, ingredient=get_or_create_ingredient(db, name)))


def add_to_pantry(db: Session, user: CurrentUser, names: list[str]) -> None:
    """Dopisuje istniejące składniki do spiżarni (kupione z listy zakupów)."""
    ingredients = db.query(Ingredient).filter(Ingredient.name.in_(names)).all()
    if user.id is None:
        for ingredient in ingredients:
            ingredient.in_pantry = True
        return
    have = {p.ingredient_id for p in db.query(MemberPantry).filter_by(user_id=user.id)}
    for ingredient in ingredients:
        if ingredient.id not in have:
            db.add(MemberPantry(user_id=user.id, ingredient_id=ingredient.id))


def set_expires(db: Session, user: CurrentUser, name: str, expires: date | None) -> bool:
    """Termin zużycia produktu ze spiżarni. False = nie ma go w spiżarni."""
    if user.id is None:
        ingredient = db.query(Ingredient).filter_by(name=name, in_pantry=True).first()
        if ingredient is None:
            return False
        ingredient.pantry_expires = expires
        return True
    row = (db.query(MemberPantry).join(Ingredient, MemberPantry.ingredient_id == Ingredient.id)
           .filter(MemberPantry.user_id == user.id, Ingredient.name == name).first())
    if row is None:
        return False
    row.expires = expires
    return True


def merge_member_pantry(db: Session, keep: Ingredient, other: Ingredient) -> None:
    """Łączenie składników: spiżarnie domowników przechodzą na `keep`."""
    for row in db.query(MemberPantry).filter_by(ingredient_id=other.id).all():
        same = db.query(MemberPantry).filter_by(user_id=row.user_id, ingredient_id=keep.id).one_or_none()
        if same is None:
            row.ingredient_id = keep.id
        else:
            if row.expires and (same.expires is None or row.expires < same.expires):
                same.expires = row.expires
            db.delete(row)
    db.flush()
