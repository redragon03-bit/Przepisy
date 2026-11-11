"""API planu posiłków: które przepisy na który dzień, i plan tygodnia ułożony przez AI."""

import itertools
import logging
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user, owned, require_auth
from ..database import SessionLocal, get_db
from ..models import MealPlanEntry, Recipe
from ..schemas import MealPlanIn, MealPlanOut, MealPlanPatch, PlanSuggestionDay, PlanSuggestionIn, PlanSuggestionOut
from ..services import ai, plan_sensor
from ..services.kitchen import Marks
from ..services.shopping import pantry_text, parse_servings
from .chat import WEEKDAYS, recipe_line
from .recipes import to_summary

router = APIRouter(prefix="/api/plan", tags=["plan"], dependencies=[Depends(require_auth)])
log = logging.getLogger(__name__)


def to_out(entry: MealPlanEntry, marks: Marks | None = None) -> MealPlanOut:
    return MealPlanOut(id=entry.id, day=entry.day, recipe=to_summary(entry.recipe, marks), servings=entry.servings,
                       base_servings=parse_servings(entry.recipe.servings), in_shopping=entry.in_shopping)


@router.get("", response_model=list[MealPlanOut])
def list_plan(start: date, end: date, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Plan od `start` do `end` (włącznie), np. jeden tydzień."""
    entries = (
        db.query(MealPlanEntry)
        .filter(MealPlanEntry.day.between(start, end), owned(MealPlanEntry.user_id, user))
        .order_by(MealPlanEntry.day, MealPlanEntry.id)
        .all()
    )
    marks = Marks(db, user)
    return [to_out(e, marks) for e in entries]


def _publish(user: CurrentUser) -> None:
    # Czujnik "dziś na obiad" w HA pokazuje plan właściciela
    if user.is_owner:
        plan_sensor.publish_in_background()


def _entry(db: Session, entry_id: int, user: CurrentUser) -> MealPlanEntry:
    entry = db.get(MealPlanEntry, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(404, "Nie ma takiej pozycji planu")
    return entry


@router.post("", response_model=MealPlanOut, status_code=201)
def add_to_plan(data: MealPlanIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    if db.get(Recipe, data.recipe_id) is None:
        raise HTTPException(404, "Nie ma takiego przepisu")
    entry = MealPlanEntry(day=data.day, recipe_id=data.recipe_id, user_id=user.id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    _publish(user)
    return to_out(entry, Marks(db, user))


@router.patch("/{entry_id}", response_model=MealPlanOut)
def update_plan_entry(entry_id: int, data: MealPlanPatch, db: Session = Depends(get_db),
                      user: CurrentUser = Depends(current_user)):
    """Na ile porcji gotujemy - ilości na liście zakupów będą przeliczone."""
    entry = _entry(db, entry_id, user)
    entry.servings = data.servings
    db.commit()
    return to_out(entry, Marks(db, user))


@router.delete("/{entry_id}", status_code=204)
def remove_from_plan(entry_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    entry = _entry(db, entry_id, user)
    db.delete(entry)
    db.commit()
    _publish(user)


# Plan od AI układa się w tle (AI potrzebuje na to często ponad minutę, a Safari
# zrywa połączenie po około minucie) - frontend co kilka sekund pyta o wynik.
# Wyniki trzymamy tylko w pamięci: to propozycja, zapisuje ją dopiero użytkownik.
_suggestions: dict[int, PlanSuggestionOut] = {}
_next_id = itertools.count(1)
# Tyle przepisów najwyżej widzi AI (jak w czacie - darmowe limity)
MAX_PLAN_RECIPES = 120


def _plan_context(db: Session, user: CurrentUser) -> str:
    today = date.today()
    marks = Marks(db, user)
    recipes = db.query(Recipe).filter(Recipe.variant_of.is_(None)).all()
    # Ulubione, dobrze ocenione i dawno nie gotowane najpierw
    lately = today - timedelta(days=14)

    def order(r: Recipe) -> tuple:
        cooked = marks.last_cooked_at(r)
        return not marks.favorite(r), -(marks.rating(r) or 0), cooked is not None and cooked.date() > lately

    recipes.sort(key=order)
    last_week = MealPlanEntry.day.between(today - timedelta(days=7), today - timedelta(days=1))
    recent = (db.query(MealPlanEntry).filter(last_week, owned(MealPlanEntry.user_id, user))
              .order_by(MealPlanEntry.day).all())
    return "\n".join([
        f"Dziś: {WEEKDAYS[today.weekday()]}, {today}",
        "Przepisy użytkownika:",
        *[recipe_line(r, marks) for r in recipes[:MAX_PLAN_RECIPES]],
        "",
        "Jedzone w ostatnim tygodniu (nie powtarzaj): " + (", ".join(e.recipe.title for e in recent) or "brak danych"),
        "Spiżarnia (lista niepełna): " + pantry_text(db, user),
    ])


def _run_suggestion(suggestion_id: int, data: PlanSuggestionIn, user: CurrentUser) -> None:
    result = _suggestions[suggestion_id]
    try:
        with SessionLocal() as db:
            days = [d.isoformat() for d in data.days]
            plan = ai.suggest_plan(_plan_context(db, user), days, data.wishes)
            marks = Marks(db, user)
            proposed = []
            for item in plan.days:
                recipe = db.get(Recipe, item.recipe_id)
                # AI może podać nieistniejący przepis albo dzień spoza listy - takie pomijamy
                if recipe is not None and item.day in days:
                    proposed.append(PlanSuggestionDay(day=date.fromisoformat(item.day),
                                                      recipe=to_summary(recipe, marks), reason=item.reason))
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
def suggest(data: PlanSuggestionIn, background: BackgroundTasks, user: CurrentUser = Depends(current_user)):
    """AI układa plan obiadów z przepisów użytkownika (w tle)."""
    suggestion = PlanSuggestionOut(id=next(_next_id), status="running", error="", text="", days=[])
    _suggestions[suggestion.id] = suggestion
    background.add_task(_run_suggestion, suggestion.id, data, user)
    return suggestion


@router.get("/suggest/{suggestion_id}", response_model=PlanSuggestionOut)
def get_suggestion(suggestion_id: int):
    suggestion = _suggestions.get(suggestion_id)
    if suggestion is None:
        raise HTTPException(404, "Ta propozycja już wygasła - poproś o nową")
    return suggestion
