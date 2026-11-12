"""API przepisów: lista, wyszukiwanie, szczegóły, dodawanie, edycja, usuwanie."""

from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user, require_auth, require_owner
from ..config import get_settings
from ..database import fold, get_db
from ..models import Category, CookLogEntry, Ingredient, Recipe, RecipeIngredient, Step
from ..schemas import (
    CookLogOut,
    ImageFromUrl,
    ImageSearchProgress,
    IngredientLine,
    MoreImageCandidates,
    RecipeIn,
    RecipeOut,
    RecipePatch,
    RecipeStats,
    RecipeSummary,
    SectionsIn,
    SectionsOut,
    StepOut,
    SubstituteIn,
    SubstituteOut,
    VariantIn,
    VariantRef,
    image_url,
    thumb_url,
)
from ..services import ai, fetcher, image_search, images, importer
from ..services.categories import normalize_category, set_categories
from ..services.ingredients import get_or_create_ingredient, guess_ingredient_name, normalize_name
from ..services.kitchen import OWNER, Marks

router = APIRouter(prefix="/api/recipes", tags=["przepisy"], dependencies=[Depends(require_auth)])


def to_summary(recipe: Recipe, marks: Marks | None = None) -> RecipeSummary:
    """`marks` - ulubione/oceny osoby, która ogląda; None = właściciela."""
    marks = marks or _OWNER_MARKS
    return RecipeSummary(
        id=recipe.id,
        title=recipe.title,
        image_url=image_url(recipe.image),
        thumb_url=thumb_url(recipe.image),
        total_minutes=recipe.total_minutes,
        source_type=recipe.source_type,
        categories=sorted(c.name for c in recipe.categories),
        favorite=marks.favorite(recipe),
        rating=marks.rating(recipe),
        cooked_count=marks.cooked_count(recipe),
        last_cooked_at=marks.last_cooked_at(recipe),
        created_at=recipe.created_at,
    )


class _OwnerMarks(Marks):
    """Marks właściciela bez sesji bazy - czyta tylko kolumny przepisu."""

    def __init__(self):
        self.user, self._rows = OWNER, {}


_OWNER_MARKS = _OwnerMarks()


def can_edit(recipe: Recipe, user: CurrentUser) -> bool:
    """Właściciel zmienia każdy przepis, domownik - tylko te, które sam dodał."""
    return user.is_owner or recipe.created_by == user.id


def to_out(recipe: Recipe, marks: Marks | None = None) -> RecipeOut:
    user = marks.user if marks else OWNER
    return RecipeOut(
        **to_summary(recipe, marks).model_dump(),
        can_edit=can_edit(recipe, user),
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
                           unit=ri.unit, original_text=ri.original_text, section=ri.section)
            for ri in recipe.ingredients
        ],
        steps=[StepOut(text=s.text, image_url=image_url(s.image), section=s.section) for s in recipe.steps],
        step_images=[s.image for s in recipe.steps],
        variant_of=_ref(recipe.parent) if recipe.parent else None,
        variant_name=recipe.variant_name,
        variants=[_ref(v) for v in _variants(recipe)],
        cook_log=[
            CookLogOut(id=e.id, cooked_at=e.cooked_at, rating=e.rating, note=e.note, image_url=image_url(e.image))
            for e in recipe.cook_log if e.user_id == user.id
        ],
    )


def _ref(recipe: Recipe) -> VariantRef:
    return VariantRef(id=recipe.id, title=recipe.title, variant_name=recipe.variant_name)


def _variants(recipe: Recipe) -> list[Recipe]:
    """Warianty przepisu; dla wariantu - jego "rodzeństwo" (bez niego samego)."""
    family = recipe.parent.variants if recipe.parent else recipe.variants
    return [v for v in family if v.id != recipe.id]


def _get(db: Session, recipe_id: int) -> Recipe:
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(404, "Nie ma takiego przepisu")
    return recipe


def _get_editable(db: Session, recipe_id: int, user: CurrentUser) -> Recipe:
    recipe = _get(db, recipe_id)
    if not can_edit(recipe, user):
        raise HTTPException(403, "Ten przepis może zmienić tylko osoba, która go dodała")
    return recipe


@router.get("", response_model=list[RecipeSummary])
def list_recipes(
    q: str = "",
    ingredients: list[str] = Query(default=[], description="Przepis musi mieć WSZYSTKIE te składniki"),
    category: str = Query(default="", description="Tylko przepisy z tej kategorii; '-' = bez kategorii"),
    favorite: bool = Query(default=False, description="Tylko ulubione"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    marks = Marks(db, user)
    # Warianty (np. "wege") widać na stronie przepisu głównego, nie na liście
    query = db.query(Recipe).filter(Recipe.variant_of.is_(None))
    if favorite:
        query = query.filter(Recipe.favorite.is_(True) if user.is_owner else Recipe.id.in_(marks.favorite_ids()))
    # Każde słowo musi być w tytule, składnikach, opisie, krokach albo notatkach.
    # fold() pomija wielkość liter i ogonki: "zurek" znajdzie "Żurek".
    for word in fold(q).split():
        # Bez ostatniej litery dłuższe słowa łapią polską odmianę: "feta" znajdzie "fety"
        word = word[:-1] if len(word) >= 4 else word
        pattern = "%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        in_ingredient = RecipeIngredient.ingredient.has(func.fold(Ingredient.name).like(pattern, escape="\\"))
        in_step = Recipe.steps.any(func.fold(Step.text).like(pattern, escape="\\"))
        query = query.filter(
            func.fold(Recipe.title).like(pattern, escape="\\")
            | Recipe.ingredients.any(in_ingredient)
            | func.fold(Recipe.description).like(pattern, escape="\\")
            | func.fold(Recipe.notes).like(pattern, escape="\\")
            | in_step
        )
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
    return [to_summary(r, marks) for r in query.order_by(Recipe.created_at.desc(), Recipe.id.desc())]


@router.get("/stats", response_model=RecipeStats)
def recipe_stats(db: Session = Depends(get_db)):
    """Liczniki do paska kategorii - bez pobierania całej listy przepisów."""
    main = db.query(Recipe).filter(Recipe.variant_of.is_(None))
    return RecipeStats(total=main.count(), uncategorized=main.filter(~Recipe.categories.any()).count())


def _search_progress(db: Session) -> ImageSearchProgress:
    missing = db.query(Recipe).filter(Recipe.image.is_(None)).count()
    return ImageSearchProgress(**image_search.progress, missing=missing)


@router.get("/image-search", response_model=ImageSearchProgress)
def image_search_status(db: Session = Depends(get_db)):
    """Postęp hurtowego szukania zdjęć."""
    return _search_progress(db)


@router.post("/image-search", response_model=ImageSearchProgress, status_code=202,
             dependencies=[Depends(require_owner)])
def start_image_search(background: BackgroundTasks, db: Session = Depends(get_db)):
    """Szuka w internecie zdjęć dla wszystkich przepisów bez zdjęcia (w tle)."""
    if not image_search.progress["running"]:
        background.add_task(image_search.fill_missing)
    return _search_progress(db)


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    return to_out(_get(db, recipe_id), Marks(db, user))


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
        Step(position=i, text=s.text, image=s.image if s.image in old_images else None,
             section=s.section.strip()[:100])
        for i, s in enumerate(data.steps) if s.text.strip()
    ]
    recipe.ingredients = [
        RecipeIngredient(
            position=i, text=line.text, amount=line.amount, unit=line.unit,
            original_text=line.original_text, section=line.section.strip()[:100],
            # Bez nazwy (np. składnik wklejony z kartki) zgadujemy ją z linijki: "200 g mąki" -> "mąki"
            ingredient=get_or_create_ingredient(db, line.name or guess_ingredient_name(line.text)),
        )
        for i, line in enumerate(data.ingredients) if line.text.strip()
    ]
    set_categories(db, recipe, data.categories)


@router.post("", response_model=RecipeOut, status_code=201)
def create_recipe(data: RecipeIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    recipe = Recipe(source_type="manual", created_by=user.id)
    db.add(recipe)
    _apply(db, recipe, data)
    db.commit()
    return to_out(recipe, Marks(db, user))


@router.put("/{recipe_id}", response_model=RecipeOut)
def update_recipe(recipe_id: int, data: RecipeIn, db: Session = Depends(get_db),
                  user: CurrentUser = Depends(current_user)):
    recipe = _get_editable(db, recipe_id, user)
    _apply(db, recipe, data)
    db.commit()
    db.refresh(recipe)
    return to_out(recipe, Marks(db, user))


@router.patch("/{recipe_id}", response_model=RecipeOut)
def patch_recipe(recipe_id: int, data: RecipePatch, db: Session = Depends(get_db),
                 user: CurrentUser = Depends(current_user)):
    """Ulubione, ocena (każdy ma swoje), notatki (część przepisu) - jednym tapnięciem na stronie przepisu."""
    recipe = _get(db, recipe_id)
    marks = Marks(db, user)
    if data.favorite is not None:
        marks.edit(recipe).favorite = data.favorite
    if data.rating is not None:
        marks.edit(recipe).rating = data.rating or None
    if data.notes is not None:
        _get_editable(db, recipe_id, user).notes = data.notes
    db.commit()
    return to_out(recipe, marks)


# Ocena przepisu to średnia z tylu ostatnich ocenionych gotowań - zmienia się z czasem
RATING_FROM_LAST = 5


def _rating_from_log(recipe: Recipe, marks: Marks) -> None:
    ratings = [e.rating for e in recipe.cook_log if e.rating and e.user_id == marks.user.id][:RATING_FROM_LAST]
    if ratings:
        marks.edit(recipe).rating = round(sum(ratings) / len(ratings))


@router.post("/{recipe_id}/cooked", response_model=RecipeOut)
def mark_cooked(
    recipe_id: int,
    rating: int | None = Form(default=None, ge=1, le=5),
    note: str = Form(default="", max_length=2000),
    photo: UploadFile | None = File(default=None, description="Zdjęcie tego, co wyszło"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """Przycisk "Ugotowane": wpis w dzienniku gotowania (ocena, notatka i zdjęcie - wszystko opcjonalne)."""
    recipe = _get(db, recipe_id)
    image = None
    if photo is not None and photo.size:
        try:
            image = images.save_image_bytes(photo.file.read())
        except Exception as exc:
            raise HTTPException(400, "Nie udało się odczytać zdjęcia") from exc
    marks = Marks(db, user)
    mark = marks.edit(recipe)
    mark.cooked_count = (mark.cooked_count or 0) + 1
    mark.last_cooked_at = datetime.now()
    recipe.cook_log.insert(0, CookLogEntry(cooked_at=mark.last_cooked_at, rating=rating,
                                           note=note.strip(), image=image, user_id=user.id))
    _rating_from_log(recipe, marks)
    db.commit()
    return to_out(recipe, marks)


@router.delete("/{recipe_id}/cooked/{entry_id}", response_model=RecipeOut)
def delete_cooked(recipe_id: int, entry_id: int, db: Session = Depends(get_db),
                  user: CurrentUser = Depends(current_user)):
    """Usuwa wpis z dziennika (np. "Ugotowane" wciśnięte przez pomyłkę)."""
    recipe = _get(db, recipe_id)
    entry = next((e for e in recipe.cook_log if e.id == entry_id and e.user_id == user.id), None)
    if entry is None:
        raise HTTPException(404, "Nie ma takiego wpisu")
    recipe.cook_log.remove(entry)
    images.delete_image(entry.image)
    marks = Marks(db, user)
    mark = marks.edit(recipe)
    mine = [e for e in recipe.cook_log if e.user_id == user.id]
    mark.cooked_count = max((mark.cooked_count or 0) - 1, 0)
    mark.last_cooked_at = mine[0].cooked_at if mine else None
    db.commit()
    return to_out(recipe, marks)


@router.post("/{recipe_id}/substitute", response_model=SubstituteOut)
def substitute(recipe_id: int, data: SubstituteIn, db: Session = Depends(get_db)):
    """Czym zastąpić składnik, którego brakuje - odpowiedź AI dla tego przepisu."""
    recipe = _get(db, recipe_id)
    try:
        answer = ai.substitute(recipe.title, [ri.text for ri in recipe.ingredients], data.ingredient)
    except ai.AiError as exc:
        raise HTTPException(502, str(exc)) from exc
    return SubstituteOut(text=answer.text)


def _arrange(items: list[ai.AiSectionItem], count: int) -> tuple[list[int], list[str]]:
    """Kolejność i sekcje z odpowiedzi AI; złe lub powtórzone numery pomijamy,
    a pozycje, o których AI zapomniało, dokładamy na końcu bez sekcji."""
    order: list[int] = []
    names: list[str] = []
    for item in items:
        if 0 <= item.index < count and item.index not in order:
            order.append(item.index)
            names.append(item.section.strip()[:100])
    for i in range(count):
        if i not in order:
            order.append(i)
            names.append("")
    return order, names


@router.post("/sections", response_model=SectionsOut)
def suggest_sections(data: SectionsIn):
    """AI dzieli składniki i kroki z formularza na sekcje (np. "Omlet", "Krem"). Nic nie zapisuje."""
    try:
        answer = ai.sections(data.title, data.ingredients, data.steps)
    except ai.AiError as exc:
        raise HTTPException(502, str(exc)) from exc
    ingredient_order, ingredient_sections = _arrange(answer.ingredients, len(data.ingredients))
    step_order, step_sections = _arrange(answer.steps, len(data.steps))
    return SectionsOut(ingredient_order=ingredient_order, ingredient_sections=ingredient_sections,
                       step_order=step_order, step_sections=step_sections)


def recipe_text(recipe: Recipe) -> str:
    """Przepis jako zwykły tekst dla AI."""
    lines = [f"Tytuł: {recipe.title}", f"Porcje: {recipe.servings or 'nie podano'}",
             f"Kategorie: {', '.join(c.name for c in recipe.categories) or 'brak'}", "Składniki:"]
    section = ""
    for ri in recipe.ingredients:
        if ri.section != section:
            section = ri.section
            lines.append(f"[{section or 'bez części'}]")
        lines.append(f"- {ri.text}")
    lines.append("Kroki:")
    section = ""
    for i, s in enumerate(recipe.steps, 1):
        if s.section != section:
            section = s.section
            lines.append(f"[{section or 'bez części'}]")
        lines.append(f"{i}. {s.text}")
    return "\n".join(lines)


@router.post("/{recipe_id}/variant", response_model=RecipeOut, status_code=201)
def create_variant(recipe_id: int, data: VariantIn, db: Session = Depends(get_db),
                   user: CurrentUser = Depends(current_user)):
    """AI tworzy wariant przepisu (np. "wersja wege"), zapisany przy przepisie głównym."""
    recipe = _get(db, recipe_id)
    main = recipe.parent or recipe  # wariant wariantu też należy do przepisu głównego
    try:
        answer = ai.variant(recipe_text(recipe), data.wish)
    except ai.AiError as exc:
        raise HTTPException(502, str(exc)) from exc
    variant = importer.save_ai_recipe(db, answer.recipe, "ai", "", [], lambda _source: None)
    variant.variant_name = answer.name.strip()[:100] or data.wish.strip()[:100]
    variant.parent = main
    variant.created_by = user.id
    variant.source_url = recipe.source_url
    if recipe.image:
        # Własna kopia zdjęcia - usunięcie jednego przepisu nie kasuje zdjęcia drugiemu
        original = get_settings().images_dir / recipe.image
        if original.exists():
            variant.image = images.save_image_bytes(original.read_bytes())
    db.commit()
    return to_out(variant, Marks(db, user))


@router.delete("/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    recipe = _get_editable(db, recipe_id, user)
    files = [recipe.image] + [s.image for s in recipe.steps] + [e.image for e in recipe.cook_log]
    db.delete(recipe)
    db.commit()
    for filename in files:
        images.delete_image(filename)


@router.post("/{recipe_id}/nutrition", response_model=RecipeOut)
def calculate_nutrition(recipe_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """AI szacuje kalorie i makro na 1 porcję."""
    recipe = _get_editable(db, recipe_id, user)
    try:
        result = ai.estimate_nutrition(recipe.title, recipe.servings, [ri.text for ri in recipe.ingredients])
    except ai.AiError as exc:
        raise HTTPException(502, str(exc)) from exc
    recipe.kcal, recipe.protein, recipe.fat, recipe.carbs = result.kcal, result.protein, result.fat, result.carbs
    db.commit()
    return to_out(recipe, Marks(db, user))


@router.get("/{recipe_id}/image-candidates", response_model=list[str])
def image_candidates(recipe_id: int, db: Session = Depends(get_db)):
    """Kilka zdjęć z internetu pasujących do przepisu - do wyboru przez użytkownika."""
    # Użytkownik czeka na ekranie - zwracamy to, co uda się znaleźć w limicie czasu
    with ai.time_limit(ai.CHAT_SECONDS):
        return image_search.find_candidates(_get(db, recipe_id))


@router.post("/{recipe_id}/image-candidates", response_model=list[str])
def more_image_candidates(recipe_id: int, data: MoreImageCandidates, db: Session = Depends(get_db)):
    """"Pokaż inne" - kolejne zdjęcia, bez tych, które już były pokazane."""
    with ai.time_limit(ai.CHAT_SECONDS):
        return image_search.find_candidates(_get(db, recipe_id), skip=data.skip[-60:], round_no=data.round)


@router.post("/{recipe_id}/image-from-url", response_model=RecipeOut)
def image_from_url(recipe_id: int, data: ImageFromUrl, db: Session = Depends(get_db),
                   user: CurrentUser = Depends(current_user)):
    recipe = _get_editable(db, recipe_id, user)
    try:
        filename = images.save_image_bytes(fetcher.fetch_image(data.url))
    except Exception as exc:
        raise HTTPException(400, "Nie udało się pobrać tego zdjęcia - wybierz inne") from exc
    images.delete_image(recipe.image)
    recipe.image = filename
    db.commit()
    return to_out(recipe, Marks(db, user))


@router.post("/{recipe_id}/image", response_model=RecipeOut)
def upload_main_image(recipe_id: int, file: UploadFile, db: Session = Depends(get_db),
                      user: CurrentUser = Depends(current_user)):
    recipe = _get_editable(db, recipe_id, user)
    try:
        filename = images.save_image_bytes(file.file.read())
    except Exception as exc:
        raise HTTPException(400, "Nie udało się odczytać obrazka") from exc
    images.delete_image(recipe.image)
    recipe.image = filename
    db.commit()
    return to_out(recipe, Marks(db, user))
