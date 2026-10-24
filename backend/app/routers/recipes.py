"""API przepisów: lista, wyszukiwanie, szczegóły, dodawanie, edycja, usuwanie."""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import fold, get_db
from ..models import Category, Ingredient, Recipe, RecipeIngredient, Step
from ..schemas import (
    ImageFromUrl,
    ImageSearchProgress,
    IngredientLine,
    RecipeIn,
    RecipeOut,
    RecipePatch,
    RecipeStats,
    RecipeSummary,
    StepOut,
    image_url,
    thumb_url,
)
from ..services import ai, fetcher, image_search, images
from ..services.categories import normalize_category, set_categories
from ..services.ingredients import get_or_create_ingredient, guess_ingredient_name, normalize_name

router = APIRouter(prefix="/api/recipes", tags=["przepisy"], dependencies=[Depends(require_auth)])


def to_summary(recipe: Recipe) -> RecipeSummary:
    return RecipeSummary(
        id=recipe.id,
        title=recipe.title,
        image_url=image_url(recipe.image),
        thumb_url=thumb_url(recipe.image),
        total_minutes=recipe.total_minutes,
        source_type=recipe.source_type,
        categories=sorted(c.name for c in recipe.categories),
        favorite=recipe.favorite,
        rating=recipe.rating,
        cooked_count=recipe.cooked_count,
        last_cooked_at=recipe.last_cooked_at,
        created_at=recipe.created_at,
    )


def to_out(recipe: Recipe) -> RecipeOut:
    return RecipeOut(
        **to_summary(recipe).model_dump(),
        description=recipe.description,
        servings=recipe.servings,
        prep_minutes=recipe.prep_minutes,
        cook_minutes=recipe.cook_minutes,
        source_url=recipe.source_url,
        original_language=recipe.original_language,
        notes=recipe.notes,
        kcal=recipe.kcal,
        protein=recipe.protein,
        fat=recipe.fat,
        carbs=recipe.carbs,
        ingredients=[
            IngredientLine(text=ri.text, name=ri.ingredient.name, amount=ri.amount,
                           unit=ri.unit, original_text=ri.original_text)
            for ri in recipe.ingredients
        ],
        steps=[StepOut(text=s.text, image_url=image_url(s.image)) for s in recipe.steps],
        step_images=[s.image for s in recipe.steps],
    )


def _get(db: Session, recipe_id: int) -> Recipe:
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(404, "Nie ma takiego przepisu")
    return recipe


@router.get("", response_model=list[RecipeSummary])
def list_recipes(
    q: str = "",
    ingredients: list[str] = Query(default=[], description="Przepis musi mieć WSZYSTKIE te składniki"),
    category: str = Query(default="", description="Tylko przepisy z tej kategorii; '-' = bez kategorii"),
    favorite: bool = Query(default=False, description="Tylko ulubione"),
    db: Session = Depends(get_db),
):
    query = db.query(Recipe)
    if favorite:
        query = query.filter(Recipe.favorite.is_(True))
    # Każde słowo musi być w tytule albo w nazwie któregoś składnika.
    # fold() pomija wielkość liter i ogonki: "zurek" znajdzie "Żurek".
    for word in fold(q).split():
        # Bez ostatniej litery dłuższe słowa łapią polską odmianę: "feta" znajdzie "fety"
        word = word[:-1] if len(word) >= 4 else word
        pattern = "%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        in_ingredient = RecipeIngredient.ingredient.has(func.fold(Ingredient.name).like(pattern, escape="\\"))
        query = query.filter(func.fold(Recipe.title).like(pattern, escape="\\") | Recipe.ingredients.any(in_ingredient))
    if category == "-":
        query = query.filter(~Recipe.categories.any())
    elif category.strip():
        query = query.filter(Recipe.categories.any(Category.name == normalize_category(category)))
    for name in ingredients:
        name = normalize_name(name)
        # "ser" znajduje też "ser żółty" (tak samo jak w "co mogę ugotować")
        has_it = Recipe.ingredients.any(RecipeIngredient.ingredient.has(
            (Ingredient.name == name) | Ingredient.name.like(f"{name} %")
        ))
        query = query.filter(has_it)
    return [to_summary(r) for r in query.order_by(Recipe.created_at.desc(), Recipe.id.desc())]


@router.get("/stats", response_model=RecipeStats)
def recipe_stats(db: Session = Depends(get_db)):
    """Liczniki do paska kategorii - bez pobierania całej listy przepisów."""
    return RecipeStats(
        total=db.query(Recipe).count(),
        uncategorized=db.query(Recipe).filter(~Recipe.categories.any()).count(),
    )


def _search_progress(db: Session) -> ImageSearchProgress:
    missing = db.query(Recipe).filter(Recipe.image.is_(None)).count()
    return ImageSearchProgress(**image_search.progress, missing=missing)


@router.get("/image-search", response_model=ImageSearchProgress)
def image_search_status(db: Session = Depends(get_db)):
    """Postęp hurtowego szukania zdjęć."""
    return _search_progress(db)


@router.post("/image-search", response_model=ImageSearchProgress, status_code=202)
def start_image_search(background: BackgroundTasks, db: Session = Depends(get_db)):
    """Szuka w internecie zdjęć dla wszystkich przepisów bez zdjęcia (w tle)."""
    if not image_search.progress["running"]:
        background.add_task(image_search.fill_missing)
    return _search_progress(db)


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    return to_out(_get(db, recipe_id))


def _apply(db: Session, recipe: Recipe, data: RecipeIn) -> None:
    """Przepisuje dane z formularza do obiektu przepisu (składniki i kroki w całości)."""
    for field in ("title", "description", "servings", "prep_minutes", "cook_minutes",
                  "total_minutes", "source_url", "notes"):
        setattr(recipe, field, getattr(data, field))

    old_images = {s.image for s in recipe.steps if s.image}
    kept_images = {s.image for s in data.steps if s.image}
    for filename in old_images - kept_images:
        images.delete_image(filename)
    # Nie pozwalamy podpiąć cudzego pliku - tylko obrazki, które ten przepis już miał
    recipe.steps = [
        Step(position=i, text=s.text, image=s.image if s.image in old_images else None)
        for i, s in enumerate(data.steps) if s.text.strip()
    ]
    recipe.ingredients = [
        RecipeIngredient(
            position=i, text=line.text, amount=line.amount, unit=line.unit,
            original_text=line.original_text,
            # Bez nazwy (np. składnik wklejony z kartki) zgadujemy ją z linijki: "200 g mąki" -> "mąki"
            ingredient=get_or_create_ingredient(db, line.name or guess_ingredient_name(line.text)),
        )
        for i, line in enumerate(data.ingredients) if line.text.strip()
    ]
    set_categories(db, recipe, data.categories)


@router.post("", response_model=RecipeOut, status_code=201)
def create_recipe(data: RecipeIn, db: Session = Depends(get_db)):
    recipe = Recipe(source_type="manual")
    db.add(recipe)
    _apply(db, recipe, data)
    db.commit()
    return to_out(recipe)


@router.put("/{recipe_id}", response_model=RecipeOut)
def update_recipe(recipe_id: int, data: RecipeIn, db: Session = Depends(get_db)):
    recipe = _get(db, recipe_id)
    _apply(db, recipe, data)
    db.commit()
    db.refresh(recipe)
    return to_out(recipe)


@router.patch("/{recipe_id}", response_model=RecipeOut)
def patch_recipe(recipe_id: int, data: RecipePatch, db: Session = Depends(get_db)):
    """Ulubione, ocena, notatki - zmieniane jednym tapnięciem na stronie przepisu."""
    recipe = _get(db, recipe_id)
    if data.favorite is not None:
        recipe.favorite = data.favorite
    if data.rating is not None:
        recipe.rating = data.rating or None
    if data.notes is not None:
        recipe.notes = data.notes
    db.commit()
    return to_out(recipe)


@router.post("/{recipe_id}/cooked", response_model=RecipeOut)
def mark_cooked(recipe_id: int, db: Session = Depends(get_db)):
    """Przycisk "Ugotowane": licznik i data ostatniego gotowania."""
    recipe = _get(db, recipe_id)
    recipe.cooked_count += 1
    recipe.last_cooked_at = datetime.now()
    db.commit()
    return to_out(recipe)


@router.delete("/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    recipe = _get(db, recipe_id)
    files = [recipe.image] + [s.image for s in recipe.steps]
    db.delete(recipe)
    db.commit()
    for filename in files:
        images.delete_image(filename)


@router.post("/{recipe_id}/nutrition", response_model=RecipeOut)
def calculate_nutrition(recipe_id: int, db: Session = Depends(get_db)):
    """AI szacuje kalorie i makro na 1 porcję."""
    recipe = _get(db, recipe_id)
    try:
        result = ai.estimate_nutrition(recipe.title, recipe.servings, [ri.text for ri in recipe.ingredients])
    except ai.AiError as exc:
        raise HTTPException(502, str(exc)) from exc
    recipe.kcal, recipe.protein, recipe.fat, recipe.carbs = result.kcal, result.protein, result.fat, result.carbs
    db.commit()
    return to_out(recipe)


@router.get("/{recipe_id}/image-candidates", response_model=list[str])
def image_candidates(recipe_id: int, db: Session = Depends(get_db)):
    """Kilka zdjęć z internetu pasujących do przepisu - do wyboru przez użytkownika."""
    # Użytkownik czeka na ekranie - zwracamy to, co uda się znaleźć w limicie czasu
    with ai.time_limit(ai.CHAT_SECONDS):
        return image_search.find_candidates(_get(db, recipe_id))


@router.post("/{recipe_id}/image-from-url", response_model=RecipeOut)
def image_from_url(recipe_id: int, data: ImageFromUrl, db: Session = Depends(get_db)):
    recipe = _get(db, recipe_id)
    try:
        filename = images.save_image_bytes(fetcher.fetch_image(data.url))
    except Exception as exc:
        raise HTTPException(400, "Nie udało się pobrać tego zdjęcia - wybierz inne") from exc
    images.delete_image(recipe.image)
    recipe.image = filename
    db.commit()
    return to_out(recipe)


@router.post("/{recipe_id}/image", response_model=RecipeOut)
def upload_main_image(recipe_id: int, file: UploadFile, db: Session = Depends(get_db)):
    recipe = _get(db, recipe_id)
    try:
        filename = images.save_image_bytes(file.file.read())
    except Exception as exc:
        raise HTTPException(400, "Nie udało się odczytać obrazka") from exc
    images.delete_image(recipe.image)
    recipe.image = filename
    db.commit()
    return to_out(recipe)
