"""API spiżarni: produkty, które są teraz w domu, i do kiedy trzeba je zużyć.

Spiżarnię widać w "Co ugotuję?", lista zakupów pomija te produkty,
a czat i plan od AI biorą je pod uwagę (najpierw te, którym kończy się termin).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import Ingredient
from ..schemas import PantryExpiresIn, PantryIn, PantryItem
from ..services.ingredients import get_or_create_ingredient, normalize_name
from ..services.shopping import pantry_names

router = APIRouter(prefix="/api/pantry", tags=["spiżarnia"], dependencies=[Depends(require_auth)])


def _items(db: Session) -> list[PantryItem]:
    ingredients = db.query(Ingredient).filter_by(in_pantry=True).order_by(Ingredient.name)
    return [PantryItem(name=i.name, expires=i.pantry_expires) for i in ingredients]


@router.get("", response_model=list[str])
def list_pantry(db: Session = Depends(get_db)):
    return pantry_names(db)


@router.put("", response_model=list[str])
def set_pantry(data: PantryIn, db: Session = Depends(get_db)):
    """Zapisuje całą spiżarnię naraz: podane produkty są w domu, pozostałe nie."""
    names = {normalize_name(n) for n in data.names if n.strip()}
    for ingredient in db.query(Ingredient).filter(Ingredient.in_pantry.is_(True)):
        if ingredient.name not in names:
            # Produkt zniknął z domu - jego termin już nie obowiązuje
            ingredient.in_pantry, ingredient.pantry_expires = False, None
    for name in names:
        get_or_create_ingredient(db, name).in_pantry = True
    db.commit()
    return pantry_names(db)


@router.get("/items", response_model=list[PantryItem])
def list_pantry_items(db: Session = Depends(get_db)):
    """Spiżarnia z terminami."""
    return _items(db)


@router.put("/expires", response_model=list[PantryItem])
def set_expires(data: PantryExpiresIn, db: Session = Depends(get_db)):
    """Ustawia (albo usuwa, gdy null) termin zużycia produktu ze spiżarni."""
    ingredient = db.query(Ingredient).filter_by(name=normalize_name(data.name), in_pantry=True).first()
    if ingredient is None:
        raise HTTPException(404, "Tego produktu nie ma w spiżarni")
    ingredient.pantry_expires = data.expires
    db.commit()
    return _items(db)
