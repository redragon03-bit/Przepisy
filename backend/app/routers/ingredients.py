"""API składników: podpowiedzi przy wpisywaniu, 'co mogę ugotować', składniki podstawowe."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..config import get_settings
from ..database import get_db
from ..models import Ingredient, RecipeIngredient
from ..schemas import CookMatch, CookRequest, DuplicateGroup, IngredientOut, IngredientUpdate, MergeIn, StapleIn
from ..services import ai
from ..services.ingredients import get_or_create_ingredient, group_similar, merge_ingredients, normalize_name
from ..services.matching import find_recipes
from ..services.shopping import expiring_names
from .recipes import to_summary

router = APIRouter(prefix="/api", tags=["składniki"], dependencies=[Depends(require_auth)])


@router.get("/ingredients", response_model=list[IngredientOut])
def list_ingredients(q: str = "", staples_only: bool = False, db: Session = Depends(get_db)):
    """Składniki z liczbą przepisów, w których występują (najpopularniejsze pierwsze)."""
    count = func.count(RecipeIngredient.id)
    query = (
        db.query(Ingredient, count)
        .outerjoin(RecipeIngredient, RecipeIngredient.ingredient_id == Ingredient.id)
        .group_by(Ingredient.id)
    )
    if q.strip():
        query = query.filter(Ingredient.name.like(f"%{q.strip().lower()}%"))
    if staples_only:
        query = query.filter(Ingredient.is_staple.is_(True))
    else:
        # Składniki nieużywane w żadnym przepisie nie są ciekawe w podpowiedziach
        query = query.having(count > 0)
    rows = query.order_by(count.desc(), Ingredient.name).limit(50).all()
    return [
        IngredientOut(id=i.id, name=i.name, is_staple=i.is_staple, recipe_count=n) for i, n in rows
    ]


@router.patch("/ingredients/{ingredient_id}", response_model=IngredientOut)
def update_ingredient(ingredient_id: int, data: IngredientUpdate, db: Session = Depends(get_db)):
    ingredient = db.get(Ingredient, ingredient_id)
    if ingredient is None:
        raise HTTPException(404, "Nie ma takiego składnika")
    ingredient.is_staple = data.is_staple
    db.commit()
    return ingredient


@router.post("/ingredients/staples", response_model=IngredientOut, status_code=201)
def add_staple(data: StapleIn, db: Session = Depends(get_db)):
    """Dodaje składnik do podstawowych, np. {"name": "masło"}."""
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Podaj nazwę")
    ingredient = get_or_create_ingredient(db, name)
    ingredient.is_staple = True
    db.commit()
    return ingredient


# Tyle najczęstszych składników najwyżej widzi AI (darmowe limity)
MAX_DUPLICATE_NAMES = 400


@router.get("/ingredients/duplicates", response_model=list[DuplicateGroup])
def find_duplicates(db: Session = Depends(get_db)):
    """Składniki zapisane na kilka sposobów ("pomidor", "pomidory") - do połączenia jednym stuknięciem.

    Podobne formy wyrazu znajdujemy sami; synonimy ("kartofel") dokłada AI, jeśli jest.
    """
    count = func.count(RecipeIngredient.id)
    rows = (db.query(Ingredient.name, count).join(RecipeIngredient, RecipeIngredient.ingredient_id == Ingredient.id)
            .group_by(Ingredient.id).order_by(count.desc(), Ingredient.name).limit(MAX_DUPLICATE_NAMES).all())
    counts = dict(rows)
    groups = group_similar(list(counts))
    if get_settings().ai_enabled:
        try:
            for group in ai.find_duplicate_ingredients(list(counts)):
                group = [n for n in group if n in counts]  # tylko nazwy z bazy
                if len(group) < 2:
                    continue
                # Grupę AI łączymy z naszą, jeśli mają wspólną nazwę
                same = next((g for g in groups if set(g) & set(group)), None)
                if same is None:
                    groups.append(group)
                else:
                    same.extend(n for n in group if n not in same)
        except ai.AiError:
            pass  # bez AI zostają podobne formy wyrazu
    result = []
    for group in groups:
        # Zostaje nazwa z największą liczbą przepisów, przy remisie krótsza
        keep = min(group, key=lambda n: (-counts[n], len(n), n))
        result.append(DuplicateGroup(keep=keep, others=[n for n in group if n != keep],
                                     recipe_count=sum(counts[n] for n in group)))
    return result


@router.post("/ingredients/merge", status_code=204)
def merge(data: MergeIn, db: Session = Depends(get_db)):
    """Łączy składniki `others` w `keep` (przepisy, lista zakupów, spiżarnia)."""
    keep = db.query(Ingredient).filter_by(name=normalize_name(data.keep)).one_or_none()
    if keep is None:
        raise HTTPException(404, "Nie ma takiego składnika")
    names = [normalize_name(n) for n in data.others]
    others = db.query(Ingredient).filter(Ingredient.name.in_(names), Ingredient.id != keep.id).all()
    merge_ingredients(db, keep, others)
    db.commit()


@router.post("/cook", response_model=list[CookMatch])
def what_can_i_cook(data: CookRequest, db: Session = Depends(get_db)):
    return [
        CookMatch(recipe=to_summary(m.recipe), have=m.have, missing=m.missing, use_first=m.use_first)
        for m in find_recipes(db, data.ingredients, data.max_missing, expiring_names(db))
    ]
