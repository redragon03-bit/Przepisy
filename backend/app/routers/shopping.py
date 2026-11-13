"""API listy zakupów: pozycje z przepisów albo dopisane ręcznie, odhaczanie, wysyłka do HA."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user, owned, require_auth, require_owner
from ..database import get_db
from ..models import MealPlanEntry, Promotion, Recipe, ShoppingItem
from ..schemas import (
    PromoHit,
    ShoppingFromPlan,
    ShoppingFromRecipe,
    ShoppingItemIn,
    ShoppingItemOut,
    ShoppingItemPatch,
    ShoppingResult,
)
from ..services import promotions, shopping
from ..services.aisles import aisle, aisle_order
from ..services.ingredients import guess_ingredient_name
from ..services.kitchen import OWNER

AISLE_ORDER = {name: index for index, name in enumerate(aisle_order())}

router = APIRouter(prefix="/api/shopping", tags=["zakupy"], dependencies=[Depends(require_auth)])


def to_out(item: ShoppingItem, promos: list[Promotion] | None = None) -> ShoppingItemOut:
    """`promos` - aktualne promocje (patrz services/promotions.py); None = nie sprawdzamy."""
    name = aisle(item.name or item.text)
    found: list[Promotion] = []
    if promos and not item.checked:
        found = promotions.find_per_store(item.name or guess_ingredient_name(item.text), promos)
    hits = [PromoHit(ingredient=p.ingredient, store=p.leaflet.store, label=promotions.label(p)) for p in found]
    return ShoppingItemOut(id=item.id, text=item.text, recipes=item.recipes, checked=item.checked,
                           aisle=name, aisle_order=AISLE_ORDER[name], in_ha=bool(item.ha_text),
                           promo=hits[0].label if hits else "", promos=hits)


def _mine(db: Session, user: CurrentUser):
    return db.query(ShoppingItem).filter(owned(ShoppingItem.user_id, user))


def _all(db: Session, user: CurrentUser) -> list[ShoppingItemOut]:
    promos = [p for p in promotions.current(db) if p.ingredient]
    return [to_out(i, promos) for i in _mine(db, user).order_by(ShoppingItem.checked, ShoppingItem.id)]


def _get(db: Session, item_id: int, user: CurrentUser) -> ShoppingItem:
    item = db.get(ShoppingItem, item_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(404, "Nie ma takiej pozycji")
    return item


@router.get("", response_model=list[ShoppingItemOut])
def list_items(db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Najpierw nieodhaczone, potem odhaczone; w kolejności dodania."""
    return _all(db, user)


@router.post("/sync", response_model=list[ShoppingItemOut], dependencies=[Depends(require_owner)])
def sync(db: Session = Depends(get_db)):
    """Pobiera zmiany z listy w Home Assistant (odhaczenia, nowe pozycje) i zwraca całą listę."""
    try:
        shopping.sync_with_home_assistant(db)
    except shopping.ShoppingError as exc:
        raise HTTPException(502, str(exc)) from exc
    db.commit()
    return _all(db, OWNER)


@router.post("", response_model=ShoppingItemOut, status_code=201)
def add_item(data: ShoppingItemIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    item = ShoppingItem(text=data.text.strip(), user_id=user.id)
    db.add(item)
    # Dopisane do listy = nie ma tego w domu
    shopping.not_bought(db, [item], user)
    db.commit()
    return to_out(item)


@router.post("/from-recipe", response_model=ShoppingResult)
def add_from_recipe(data: ShoppingFromRecipe, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    recipe = db.get(Recipe, data.recipe_id)
    if recipe is None:
        raise HTTPException(404, "Nie ma takiego przepisu")
    skipped: list[str] = []
    added = shopping.add_recipe(db, recipe, data.factor, data.skip_staples, skipped, user)
    db.commit()
    return ShoppingResult(added=added, skipped=skipped)


@router.post("/from-plan", response_model=ShoppingResult)
def add_from_plan(data: ShoppingFromPlan, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Składniki wszystkich przepisów zaplanowanych między `start` a `end` (włącznie)."""
    entries = db.query(MealPlanEntry).filter(MealPlanEntry.day.between(data.start, data.end),
                                             owned(MealPlanEntry.user_id, user)).all()
    skipped: list[str] = []
    added = 0
    # Dania, których składniki już dodano (drugie stuknięcie), pomijamy - inaczej ilości by się podwoiły
    new = [e for e in entries if not e.in_shopping]
    for entry in new:
        added += shopping.add_recipe(db, entry.recipe, shopping.plan_factor(entry), data.skip_staples, skipped,
                                     user)
        entry.in_shopping = True
    db.commit()
    return ShoppingResult(added=added, skipped=skipped, already=len(entries) - len(new))


@router.patch("/{item_id}", response_model=ShoppingItemOut)
def update_item(item_id: int, data: ShoppingItemPatch, db: Session = Depends(get_db),
                user: CurrentUser = Depends(current_user)):
    item = _get(db, item_id, user)
    if data.checked is not None and data.checked != item.checked:
        item.checked = data.checked
        # Odhaczone = kupione, jest w domu; odznaczone (pomyłka) - znowu nie ma
        if item.checked:
            shopping.bought(db, [item], user)
        else:
            shopping.not_bought(db, [item], user)
        if item.ha_text:
            shopping.update_in_home_assistant([(item.ha_text, "completed" if item.checked else "needs_action")])
    if data.text is not None and data.text.strip():
        item.text = data.text.strip()
    db.commit()
    return to_out(item)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    item = _get(db, item_id, user)
    if item.ha_text:
        shopping.update_in_home_assistant([(item.ha_text, "remove")])
    db.delete(item)
    db.commit()


@router.post("/clear", status_code=204)
def clear(only_checked: bool = True, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Usuwa odhaczone pozycje (albo wszystkie, gdy only_checked=false).

    Kupione są już w spiżarni - trafiły tam przy odhaczeniu.
    """
    query = _mine(db, user)
    if only_checked:
        query = query.filter(ShoppingItem.checked.is_(True))
    else:
        # Cała lista wyczyszczona - plan można znów dodać do zakupów
        db.query(MealPlanEntry).filter(owned(MealPlanEntry.user_id, user)).update({"in_shopping": False})
    shopping.update_in_home_assistant([(i.ha_text, "remove") for i in query if i.ha_text])
    query.delete()
    db.commit()


@router.post("/send-to-ha", response_model=ShoppingResult, dependencies=[Depends(require_owner)])
def send_to_ha(db: Session = Depends(get_db)):
    """Wysyła do listy "Do zrobienia" w Home Assistant nieodhaczone pozycje, których tam jeszcze nie ma."""
    items = (db.query(ShoppingItem).filter_by(checked=False, ha_text="").filter(ShoppingItem.user_id.is_(None))
             .order_by(ShoppingItem.id).all())
    if not items:
        raise HTTPException(400, "Wszystko z listy już jest w Home Assistant")
    try:
        shopping.send_to_home_assistant(items)
    except shopping.ShoppingError as exc:
        db.commit()  # zapamiętujemy pozycje, które zdążyły trafić do HA
        raise HTTPException(502, str(exc)) from exc
    db.commit()
    return ShoppingResult(added=len(items))
