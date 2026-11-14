"""API spiżarni: produkty, które są teraz w domu, i do kiedy trzeba je zużyć.

Spiżarnię widać w Zakupach (widok "W domu") i w "Co ugotuję?". Odhaczenie na liście
zakupów dopisuje produkt do spiżarni, a dopisanie do listy - usuwa. Lista zakupów pomija te produkty,
a czat i plan od AI biorą je pod uwagę (najpierw te, którym kończy się termin).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user, require_auth
from ..database import get_db
from ..schemas import PantryExpiresIn, PantryIn, PantryItem, PantryNamesIn, PantryRenameIn
from ..services import kitchen
from ..services.aisles import aisle, aisle_order
from ..services.ingredients import get_or_create_ingredient, normalize_name
from ..services.shopping import pantry_names

router = APIRouter(prefix="/api/pantry", tags=["spiżarnia"], dependencies=[Depends(require_auth)])


AISLE_ORDER = {name: index for index, name in enumerate(aisle_order())}


def pantry_item(name: str, expires) -> PantryItem:
    shelf = aisle(name)
    return PantryItem(name=name, expires=expires, aisle=shelf, aisle_order=AISLE_ORDER[shelf])


def _items(db: Session, user: CurrentUser) -> list[PantryItem]:
    return [pantry_item(name, expires) for name, expires in kitchen.pantry(db, user)]


@router.get("", response_model=list[str])
def list_pantry(db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    return pantry_names(db, user)


@router.put("", response_model=list[str])
def set_pantry(data: PantryIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Zapisuje całą spiżarnię naraz: podane produkty są w domu, pozostałe nie."""
    kitchen.set_pantry(db, user, {normalize_name(n) for n in data.names if n.strip()})
    db.commit()
    return pantry_names(db, user)


@router.get("/items", response_model=list[PantryItem])
def list_pantry_items(db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Spiżarnia z terminami."""
    return _items(db, user)


@router.put("/expires", response_model=list[PantryItem])
def set_expires(data: PantryExpiresIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Ustawia (albo usuwa, gdy null) termin zużycia produktu ze spiżarni."""
    if not kitchen.set_expires(db, user, normalize_name(data.name), data.expires):
        raise HTTPException(404, "Tego produktu nie ma w spiżarni")
    db.commit()
    return _items(db, user)


@router.post("/add", response_model=list[PantryItem])
def add_items(data: PantryNamesIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Dopisuje produkty do spiżarni (pozostałe zostają)."""
    kitchen.add_to_pantry(db, user, [normalize_name(n) for n in data.names if n.strip()], create=True)
    db.commit()
    return _items(db, user)


@router.post("/remove", response_model=list[PantryItem])
def remove_items(data: PantryNamesIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Usuwa produkty ze spiżarni (zużyte)."""
    kitchen.remove_from_pantry(db, user, [normalize_name(n) for n in data.names])
    db.commit()
    return _items(db, user)


@router.post("/rename", response_model=list[PantryItem])
def rename_item(data: PantryRenameIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Zmienia nazwę produktu w spiżarni (np. literówka z paragonu); termin zostaje."""
    old, new = normalize_name(data.name), normalize_name(data.new_name)
    expires = dict(kitchen.pantry(db, user)).get(old)
    if not new:
        raise HTTPException(422, "Podaj nazwę")
    if not kitchen.remove_from_pantry(db, user, [old]):
        raise HTTPException(404, "Tego produktu nie ma w spiżarni")
    db.flush()
    # Dokładnie ta nazwa (bez szukania podobnej - poprawiamy np. literówkę "mlekoo" -> "mleko")
    get_or_create_ingredient(db, new)
    db.flush()
    kitchen.add_to_pantry(db, user, [new])
    db.flush()
    if expires:
        kitchen.set_expires(db, user, new, expires)
    db.commit()
    return _items(db, user)
