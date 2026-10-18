"""API listy zakupów: pozycje z przepisów albo dopisane ręcznie, odhaczanie, wysyłka do HA."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import MealPlanEntry, Recipe, ShoppingItem
from ..schemas import (ShoppingFromPlan, ShoppingFromRecipe, ShoppingItemIn, ShoppingItemOut,
                       ShoppingItemPatch, ShoppingResult)
from ..services import shopping

router = APIRouter(prefix="/api/shopping", tags=["zakupy"], dependencies=[Depends(require_auth)])


def _get(db: Session, item_id: int) -> ShoppingItem:
    item = db.get(ShoppingItem, item_id)
    if item is None:
        raise HTTPException(404, "Nie ma takiej pozycji")
    return item


@router.get("", response_model=list[ShoppingItemOut])
def list_items(db: Session = Depends(get_db)):
    """Najpierw nieodhaczone, potem odhaczone; w kolejności dodania."""
    return db.query(ShoppingItem).order_by(ShoppingItem.checked, ShoppingItem.id).all()


@router.post("", response_model=ShoppingItemOut, status_code=201)
def add_item(data: ShoppingItemIn, db: Session = Depends(get_db)):
    item = ShoppingItem(text=data.text.strip())
    db.add(item)
    db.commit()
    return item


@router.post("/from-recipe", response_model=ShoppingResult)
def add_from_recipe(data: ShoppingFromRecipe, db: Session = Depends(get_db)):
    recipe = db.get(Recipe, data.recipe_id)
    if recipe is None:
        raise HTTPException(404, "Nie ma takiego przepisu")
    skipped: list[str] = []
    added = shopping.add_recipe(db, recipe, data.factor, data.skip_staples, skipped)
    db.commit()
    return ShoppingResult(added=added, skipped=skipped)


@router.post("/from-plan", response_model=ShoppingResult)
def add_from_plan(data: ShoppingFromPlan, db: Session = Depends(get_db)):
    """Składniki wszystkich przepisów zaplanowanych między `start` a `end` (włącznie)."""
    entries = db.query(MealPlanEntry).filter(MealPlanEntry.day.between(data.start, data.end)).all()
    skipped: list[str] = []
    added = sum(shopping.add_recipe(db, e.recipe, 1, data.skip_staples, skipped) for e in entries)
    db.commit()
    return ShoppingResult(added=added, skipped=skipped)


@router.patch("/{item_id}", response_model=ShoppingItemOut)
def update_item(item_id: int, data: ShoppingItemPatch, db: Session = Depends(get_db)):
    item = _get(db, item_id)
    if data.checked is not None:
        item.checked = data.checked
    if data.text is not None and data.text.strip():
        item.text = data.text.strip()
    db.commit()
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, item_id))
    db.commit()


@router.post("/clear", status_code=204)
def clear(only_checked: bool = True, db: Session = Depends(get_db)):
    """Usuwa odhaczone pozycje (albo wszystkie, gdy only_checked=false)."""
    query = db.query(ShoppingItem)
    if only_checked:
        query = query.filter(ShoppingItem.checked.is_(True))
    query.delete()
    db.commit()


@router.post("/send-to-ha", response_model=ShoppingResult)
def send_to_ha(db: Session = Depends(get_db)):
    """Wysyła nieodhaczone pozycje do listy "Do zrobienia" w Home Assistant."""
    items = db.query(ShoppingItem).filter_by(checked=False).order_by(ShoppingItem.id).all()
    if not items:
        raise HTTPException(400, "Lista zakupów jest pusta")
    try:
        shopping.send_to_home_assistant(items)
    except shopping.ShoppingError as exc:
        raise HTTPException(502, str(exc)) from exc
    return ShoppingResult(added=len(items))
