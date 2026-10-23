"""Czat z asystentem kulinarnym: "mam ochotę na...", "zaproponuj coś bez ryżu".

AI widzi listę zapisanych przepisów i spiżarnię. Poleca przepisy z bazy,
a gdy nic nie pasuje - wymyśla nowy, który można zapisać jednym przyciskiem.
Rozmowy nie zapisujemy w bazie - frontend odsyła całą historię przy każdej wiadomości.
"""

import json
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import SessionLocal, get_db
from ..models import Recipe
from ..schemas import ChatIn, ChatMessage, ChatOut, ChatSaveIn, RecipeOut
from ..services import ai, importer
from ..services.categories import category_names
from ..services.shopping import pantry_names
from .recipes import to_out, to_summary

router = APIRouter(prefix="/api/chat", tags=["czat"], dependencies=[Depends(require_auth)])

WEEKDAYS = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"]


def _recipe_line(recipe: Recipe) -> str:
    """Jedna krótka linijka o przepisie dla AI, np. '12. Pierogi [Obiad] 90 min, ulubiony: mąka, ser, ziemniak'.

    Lista trafia do AI przy każdej wiadomości, więc jest jak najkrótsza: bez podstawowych
    produktów (sól, olej...) i najwyżej 8 składników. Długie zapytania odpowiadały za wolno
    i nie mieściły się w darmowych limitach Groq.
    """
    details = []
    if recipe.total_minutes:
        details.append(f"{recipe.total_minutes} min")
    if recipe.favorite:
        details.append("ulubiony")
    if recipe.rating:
        details.append(f"ocena {recipe.rating}/5")
    if recipe.cooked_count:
        details.append(f"ugotowany {recipe.cooked_count}×")
    names = [ri.ingredient.name for ri in recipe.ingredients if not ri.ingredient.is_staple][:8]
    categories = ", ".join(c.name for c in recipe.categories)
    head = f"{recipe.id}. {recipe.title}" + (f" [{categories}]" if categories else "")
    return f"{head} {', '.join(details)}: {', '.join(names)}".replace("  ", " ")


def _context(db: Session) -> str:
    recipes = db.query(Recipe).order_by(Recipe.title).all()
    today = date.today()
    return "\n".join([
        f"Dziś: {WEEKDAYS[today.weekday()]}, {today}",
        "Przepisy użytkownika:",
        *([_recipe_line(r) for r in recipes] or ["(brak)"]),
        "",
        "Mam w domu: " + (", ".join(pantry_names(db)) or "nie podano"),
        "Kategorie: " + ", ".join(category_names(db)),
    ])


def _conversation(messages: list[ChatMessage]) -> str:
    lines = []
    for message in messages:
        who = "Użytkownik" if message.role == "user" else "Asystent"
        lines.append(f"{who}: {message.text}")
        if message.recipe:
            recipe = json.dumps(message.recipe.model_dump(), ensure_ascii=False)
            lines.append(f"(Asystent zaproponował przepis: {recipe})")
    return "\n".join(lines)


@router.post("", response_model=ChatOut)
def chat(data: ChatIn, db: Session = Depends(get_db)):
    try:
        answer = ai.chat(_context(db), _conversation(data.messages))
    except ai.AiError as exc:
        raise HTTPException(502, str(exc)) from exc
    # AI może podać nieistniejący numer - takie pomijamy
    recipes = [r for r in (db.get(Recipe, i) for i in answer.recipe_ids[:3]) if r is not None]
    return ChatOut(text=answer.text, recipes=[to_summary(r) for r in recipes], new_recipe=answer.new_recipe)


def _find_image(recipe_id: int) -> None:
    with SessionLocal() as db:
        recipe = db.get(Recipe, recipe_id)
        if recipe is not None:
            importer.add_missing_images(db, [recipe])


@router.post("/save", response_model=RecipeOut, status_code=201)
def save(data: ChatSaveIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Zapisuje przepis wymyślony przez AI; zdjęcie szukamy w tle."""
    recipe = importer.save_ai_recipe(db, data.recipe, "ai", "", [], lambda _source: None)
    db.commit()
    background.add_task(_find_image, recipe.id)
    return to_out(recipe)
