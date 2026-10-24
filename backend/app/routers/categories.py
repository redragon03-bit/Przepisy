"""API kategorii: lista z liczbą przepisów i automatyczne przypisanie przez AI."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..config import get_settings
from ..database import get_db
from ..models import Category, Recipe, recipe_categories
from ..schemas import AutoCategorizeOut, CategoryOut
from ..services import ai
from ..services.categories import category_names, set_categories

router = APIRouter(prefix="/api/categories", tags=["kategorie"], dependencies=[Depends(require_auth)])

# Tyle przepisów wysyłamy do AI naraz (krótkie dane: tytuł + składniki).
# Użytkownik czeka na odpowiedź, więc partia musi być gotowa w limicie czasu (ai.CHAT_SECONDS).
AUTO_BATCH = 25


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    """Wszystkie kategorie; najpierw te z największą liczbą przepisów."""
    count = func.count(recipe_categories.c.recipe_id)
    rows = (
        db.query(Category, count)
        .outerjoin(recipe_categories, recipe_categories.c.category_id == Category.id)
        .group_by(Category.id)
        .order_by(count.desc(), Category.name)
        .all()
    )
    return [CategoryOut(name=c.name, recipe_count=n) for c, n in rows]


@router.post("/auto", response_model=AutoCategorizeOut)
def auto_categorize(db: Session = Depends(get_db)):
    """AI przypisuje kategorie przepisom, które jeszcze ich nie mają."""
    if not get_settings().ai_enabled:
        raise HTTPException(400, "Do automatycznych kategorii potrzebny jest klucz API do AI")
    without = db.query(Recipe).filter(~Recipe.categories.any()).order_by(Recipe.id)
    batch = without.limit(AUTO_BATCH).all()
    if batch:
        try:
            answer = ai.categorize(
                [(r.id, r.title, [ri.ingredient.name for ri in r.ingredients]) for r in batch],
                category_names(db),
            )
        except ai.AiError as exc:
            raise HTTPException(502, str(exc)) from exc
        for recipe in batch:
            set_categories(db, recipe, answer.get(recipe.id, []))
        db.commit()
    updated = sum(1 for r in batch if r.categories)
    return AutoCategorizeOut(updated=updated, remaining=without.count())
