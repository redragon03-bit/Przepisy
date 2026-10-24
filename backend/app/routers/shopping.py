"""API listy zakupów: pozycje z przepisów albo dopisane ręcznie, odhaczanie, wysyłka do HA."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import MealPlanEntry, Recipe, ShoppingItem
from ..schemas import (
    ShoppingFromPlan,
    ShoppingFromRecipe,
    ShoppingItemIn,
    ShoppingItemOut,
    ShoppingItemPatch,
    ShoppingResult,
)
from ..services import shopping
from ..services.aisles import aisle, aisle_order

AISLE_ORDER = {name: index for index, name in enumerate(aisle_order())}

router = APIRouter(prefix="/api/shopping", tags=["zakupy"], dependencies=[Depends(require_auth)])


def to_out(item: ShoppingItem) -> ShoppingItemOut:
    name = aisle(item.name or item.text)
    return ShoppingItemOut(id=item.id, text=item.text, recipes=item.recipes, checked=item.checked,
                           aisle=name, aisle_order=AISLE_ORDER[name], in_ha=bool(item.ha_text))


def _all(db: Session) -> list[ShoppingItemOut]:
    return [to_out(i) for i in db.query(ShoppingItem).order_by(ShoppingItem.checked, ShoppingItem.id)]


def _get(db: Session, item_id: int) -> ShoppingItem:
    item = db.get(ShoppingItem, item_id)
    if item is None:
        raise HTTPException(404, "Nie ma takiej pozycji")
    return item


@router.get("", response_model=list[ShoppingItemOut])
def list_items(db: Session = Depends(get_db)):
    """Najpierw nieodhaczone, potem odhaczone; w kolejności dodania."""
    return _all(db)


@router.post("/sync", response_model=list[ShoppingItemOut])
def sync(db: Session = Depends(get_db)):
    """Pobiera zmiany z listy w Home Assistant (odhaczenia, nowe pozycje) i zwraca całą listę."""
    try:
        shopping.sync_with_home_assistant(db)
    except shopping.ShoppingError as exc:
        raise HTTPException(502, str(exc)) from exc
    db.commit()
    return _all(db)


@router.post("", response_model=ShoppingItemOut, status_code=201)
def add_item(data: ShoppingItemIn, db: Session = Depends(get_db)):
    item = ShoppingItem(text=data.text.strip())
    db.add(item)
    db.commit()
    return to_out(item)


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
    if data.checked is not None and data.checked != item.checked:
        item.checked = data.checked
        if item.ha_text:
            shopping.update_in_home_assistant([(item.ha_text, "completed" if item.checked else "needs_action")])
    if data.text is not None and data.text.strip():
        item.text = data.text.strip()
    db.commit()
    return to_out(item)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = _get(db, item_id)
    if item.ha_text:
        shopping.update_in_home_assistant([(item.ha_text, "remove")])
    db.delete(item)
    db.commit()


@router.post("/clear", status_code=204)
def clear(only_checked: bool = True, db: Session = Depends(get_db)):
    """Usuwa odhaczone pozycje (albo wszystkie, gdy only_checked=false)."""
    query = db.query(ShoppingItem)
    if only_checked:
        query = query.filter(ShoppingItem.checked.is_(True))
    shopping.update_in_home_assistant([(i.ha_text, "remove") for i in query if i.ha_text])
    query.delete()
    db.commit()


@router.post("/send-to-ha", response_model=ShoppingResult)
def send_to_ha(db: Session = Depends(get_db)):
    """Wysyła do listy "Do zrobienia" w Home Assistant nieodhaczone pozycje, których tam jeszcze nie ma."""
    items = db.query(ShoppingItem).filter_by(checked=False, ha_text="").order_by(ShoppingItem.id).all()
    if not items:
        raise HTTPException(400, "Wszystko z listy już jest w Home Assistant")
    try:
        shopping.send_to_home_assistant(items)
    except shopping.ShoppingError as exc:
        db.commit()  # zapamiętujemy pozycje, które zdążyły trafić do HA
        raise HTTPException(502, str(exc)) from exc
    db.commit()
    return ShoppingResult(added=len(items))
