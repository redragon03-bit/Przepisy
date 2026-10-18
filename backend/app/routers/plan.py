"""API planu posiłków: które przepisy na który dzień."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import MealPlanEntry, Recipe
from ..schemas import MealPlanIn, MealPlanOut
from .recipes import to_summary

router = APIRouter(prefix="/api/plan", tags=["plan"], dependencies=[Depends(require_auth)])


def to_out(entry: MealPlanEntry) -> MealPlanOut:
    return MealPlanOut(id=entry.id, day=entry.day, recipe=to_summary(entry.recipe))


@router.get("", response_model=list[MealPlanOut])
def list_plan(start: date, end: date, db: Session = Depends(get_db)):
    """Plan od `start` do `end` (włącznie), np. jeden tydzień."""
    entries = (
        db.query(MealPlanEntry)
        .filter(MealPlanEntry.day.between(start, end))
        .order_by(MealPlanEntry.day, MealPlanEntry.id)
        .all()
    )
    return [to_out(e) for e in entries]


@router.post("", response_model=MealPlanOut, status_code=201)
def add_to_plan(data: MealPlanIn, db: Session = Depends(get_db)):
    if db.get(Recipe, data.recipe_id) is None:
        raise HTTPException(404, "Nie ma takiego przepisu")
    entry = MealPlanEntry(day=data.day, recipe_id=data.recipe_id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return to_out(entry)


@router.delete("/{entry_id}", status_code=204)
def remove_from_plan(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(MealPlanEntry, entry_id)
    if entry is None:
        raise HTTPException(404, "Nie ma takiej pozycji planu")
    db.delete(entry)
    db.commit()
