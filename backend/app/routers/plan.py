"""API planu posiłków: które przepisy na który dzień, i plan tygodnia ułożony przez AI."""

import itertools
import logging
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import SessionLocal, get_db
from ..models import MealPlanEntry, Recipe
from ..schemas import MealPlanIn, MealPlanOut, MealPlanPatch, PlanSuggestionDay, PlanSuggestionIn, PlanSuggestionOut
from ..services import ai, plan_sensor
from ..services.shopping import pantry_text, parse_servings
from .chat import WEEKDAYS, recipe_line
from .recipes import to_summary

router = APIRouter(prefix="/api/plan", tags=["plan"], dependencies=[Depends(require_auth)])
log = logging.getLogger(__name__)


def to_out(entry: MealPlanEntry) -> MealPlanOut:
    return MealPlanOut(id=entry.id, day=entry.day, recipe=to_summary(entry.recipe), servings=entry.servings,
                       base_servings=parse_servings(entry.recipe.servings), in_shopping=entry.in_shopping)


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
    plan_sensor.publish_in_background()
    return to_out(entry)


@router.patch("/{entry_id}", response_model=MealPlanOut)
def update_plan_entry(entry_id: int, data: MealPlanPatch, db: Session = Depends(get_db)):
    """Na ile porcji gotujemy - ilości na liście zakupów będą przeliczone."""
    entry = db.get(MealPlanEntry, entry_id)
    if entry is None:
        raise HTTPException(404, "Nie ma takiej pozycji planu")
    entry.servings = data.servings
    db.commit()
    return to_out(entry)


@router.delete("/{entry_id}", status_code=204)
def remove_from_plan(entry_id: int, db: Session = Depends(get_db)):
    entry = db.get(MealPlanEntry, entry_id)
    if entry is None:
        raise HTTPException(404, "Nie ma takiej pozycji planu")
    db.delete(entry)
    db.commit()
    plan_sensor.publish_in_background()


# Plan od AI układa się w tle (AI potrzebuje na to często ponad minutę, a Safari
# zrywa połączenie po około minucie) - frontend co kilka sekund pyta o wynik.
# Wyniki trzymamy tylko w pamięci: to propozycja, zapisuje ją dopiero użytkownik.
_suggestions: dict[int, PlanSuggestionOut] = {}
_next_id = itertools.count(1)
# Tyle przepisów najwyżej widzi AI (jak w czacie - darmowe limity)
MAX_PLAN_RECIPES = 120


def _plan_context(db: Session) -> str:
    today = date.today()
    recipes = db.query(Recipe).filter(Recipe.variant_of.is_(None)).all()
    # Ulubione, dobrze ocenione i dawno nie gotowane najpierw
    lately = today - timedelta(days=14)
    recipes.sort(key=lambda r: (not r.favorite, -(r.rating or 0),
                                r.last_cooked_at is not None and r.last_cooked_at.date() > lately))
    last_week = MealPlanEntry.day.between(today - timedelta(days=7), today - timedelta(days=1))
    recent = db.query(MealPlanEntry).filter(last_week).order_by(MealPlanEntry.day).all()
    return "\n".join([
        f"Dziś: {WEEKDAYS[today.weekday()]}, {today}",
        "Przepisy użytkownika:",
        *[recipe_line(r) for r in recipes[:MAX_PLAN_RECIPES]],
        "",
        "Jedzone w ostatnim tygodniu (nie powtarzaj): " + (", ".join(e.recipe.title for e in recent) or "brak danych"),
        "Spiżarnia (lista niepełna): " + pantry_text(db),
    ])


def _run_suggestion(suggestion_id: int, data: PlanSuggestionIn) -> None:
    result = _suggestions[suggestion_id]
    try:
        with SessionLocal() as db:
            days = [d.isoformat() for d in data.days]
            plan = ai.suggest_plan(_plan_context(db), days, data.wishes)
            proposed = []
            for item in plan.days:
                recipe = db.get(Recipe, item.recipe_id)
                # AI może podać nieistniejący przepis albo dzień spoza listy - takie pomijamy
                if recipe is not None and item.day in days:
                    proposed.append(PlanSuggestionDay(day=date.fromisoformat(item.day), recipe=to_summary(recipe),
                                                      reason=item.reason))
            if not proposed:
                raise ai.AiError("AI nie dobrało żadnego przepisu - spróbuj inaczej opisać życzenia.")
            result.days = sorted(proposed, key=lambda d: d.day)
            result.text = plan.text
            result.status = "done"
    except ai.AiError as exc:
        result.status, result.error = "failed", str(exc)
    except Exception as exc:
        log.exception("Plan od AI")
        result.status, result.error = "failed", f"Nieoczekiwany błąd: {exc}"


@router.post("/suggest", response_model=PlanSuggestionOut, status_code=202)
def suggest(data: PlanSuggestionIn, background: BackgroundTasks):
    """AI układa plan obiadów z przepisów użytkownika (w tle)."""
    suggestion = PlanSuggestionOut(id=next(_next_id), status="running", error="", text="", days=[])
    _suggestions[suggestion.id] = suggestion
    background.add_task(_run_suggestion, suggestion.id, data)
    return suggestion


@router.get("/suggest/{suggestion_id}", response_model=PlanSuggestionOut)
def get_suggestion(suggestion_id: int):
    suggestion = _suggestions.get(suggestion_id)
    if suggestion is None:
        raise HTTPException(404, "Ta propozycja już wygasła - poproś o nową")
    return suggestion
