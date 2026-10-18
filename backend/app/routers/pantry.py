"""API spiżarni: produkty, które są teraz w domu.

Spiżarnię widać w "Co ugotuję?", lista zakupów pomija te produkty,
a czat bierze je pod uwagę przy proponowaniu dań.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import Ingredient
from ..schemas import PantryIn
from ..services.ingredients import get_or_create_ingredient, normalize_name
from ..services.shopping import pantry_names

router = APIRouter(prefix="/api/pantry", tags=["spiżarnia"], dependencies=[Depends(require_auth)])


@router.get("", response_model=list[str])
def list_pantry(db: Session = Depends(get_db)):
    return pantry_names(db)


@router.put("", response_model=list[str])
def set_pantry(data: PantryIn, db: Session = Depends(get_db)):
    """Zapisuje całą spiżarnię naraz: podane produkty są w domu, pozostałe nie."""
    names = {normalize_name(n) for n in data.names if n.strip()}
    db.query(Ingredient).filter(Ingredient.in_pantry.is_(True)).update({"in_pantry": False})
    for name in names:
        get_or_create_ingredient(db, name).in_pantry = True
    db.commit()
    return pantry_names(db)
