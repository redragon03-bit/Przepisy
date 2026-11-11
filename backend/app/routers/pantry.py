"""API spiżarni: produkty, które są teraz w domu, i do kiedy trzeba je zużyć.

Spiżarnię widać w "Co ugotuję?", lista zakupów pomija te produkty,
a czat i plan od AI biorą je pod uwagę (najpierw te, którym kończy się termin).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user, require_auth
from ..database import get_db
from ..schemas import PantryExpiresIn, PantryIn, PantryItem
from ..services import kitchen
from ..services.ingredients import normalize_name
from ..services.shopping import pantry_names

router = APIRouter(prefix="/api/pantry", tags=["spiżarnia"], dependencies=[Depends(require_auth)])


def _items(db: Session, user: CurrentUser) -> list[PantryItem]:
    return [PantryItem(name=name, expires=expires) for name, expires in kitchen.pantry(db, user)]


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
