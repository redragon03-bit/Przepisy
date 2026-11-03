"""API promocji z gazetek: lista produktów w promocji, przepisy z nimi i pomysły od AI."""

import itertools
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..database import SessionLocal, get_db
from ..models import PromoLeaflet, Promotion, Recipe, RecipeIngredient, ShoppingItem
from ..schemas import (
    PromoHit,
    PromoIdeasIn,
    PromoIdeasOut,
    PromoLeafletOut,
    PromoRecipe,
    PromoStatus,
    PromotionOut,
    ShoppingItemOut,
)
from ..services import ai, promotions
from ..services.categories import category_names
from .recipes import to_summary
from .shopping import to_out as shopping_out

router = APIRouter(prefix="/api/promotions", tags=["promocje"], dependencies=[Depends(require_auth)])
log = logging.getLogger(__name__)


def to_out(promo: Promotion) -> PromotionOut:
    leaflet = promo.leaflet
    return PromotionOut(id=promo.id, store=leaflet.store, name=promo.name, ingredient=promo.ingredient,
                        price=promo.price, note=promo.note, leaflet=leaflet.title,
                        valid_from=leaflet.valid_from, valid_to=leaflet.valid_to)


@router.get("", response_model=list[PromotionOut])
def list_promotions(db: Session = Depends(get_db)):
    """Produkty w promocji z gazetek, które jeszcze obowiązują."""
    return [to_out(p) for p in promotions.current(db)]


@router.get("/status", response_model=PromoStatus)
def get_status(db: Session = Depends(get_db)):
    """Kiedy ostatnio sprawdzaliśmy gazetki i które udało się odczytać."""
    leaflets = db.query(PromoLeaflet).order_by(PromoLeaflet.store, PromoLeaflet.valid_from).all()
    status = promotions.status
    return PromoStatus(
        stores=[promotions.STORE_NAMES.get(s, s.capitalize()) for s in promotions.configured_stores()],
        running=status.running, last_check=status.last_check, errors=status.errors,
        leaflets=[PromoLeafletOut(store=lf.store, title=lf.title, url=lf.url, valid_from=lf.valid_from,
                                  valid_to=lf.valid_to, status=lf.status, error=lf.error,
                                  count=len(lf.promotions)) for lf in leaflets],
    )


@router.post("/refresh", response_model=PromoStatus, status_code=202)
def refresh(db: Session = Depends(get_db)):
    """Sprawdza gazetki teraz (w tle) - AI czyta tylko te, których jeszcze nie było."""
    if not promotions.configured_stores():
        raise HTTPException(400, "Nie wybrano sklepów - ustaw je w opcjach dodatku (promo_stores).")
    if not ai.get_settings().ai_enabled:
        raise HTTPException(400, "Promocje z gazetek wymagają klucza do AI.")
    promotions.status.running = True  # od razu, żeby ekran pokazał "sprawdzam"
    promotions.refresh_in_background()
    return get_status(db)


# Tyle przepisów z promocjami najwyżej pokazujemy
MAX_PROMO_RECIPES = 30


@router.get("/recipes", response_model=list[PromoRecipe])
def promo_recipes(db: Session = Depends(get_db)):
    """Zapisane przepisy, w których składniki są w promocji (najwięcej takich składników na górze)."""
    promos = [p for p in promotions.current(db) if p.ingredient]
    if not promos:
        return []
    recipes = db.query(Recipe).filter(Recipe.variant_of.is_(None)).options(
        selectinload(Recipe.ingredients).selectinload(RecipeIngredient.ingredient)
    ).all()
    found = []
    for recipe in recipes:
        hits = {}
        for ri in recipe.ingredients:
            name = ri.ingredient.name
            if ri.ingredient.is_staple or name in hits:
                continue
            promo = promotions.find_for(name, promos)
            if promo is not None:
                hits[name] = PromoHit(ingredient=name, label=promotions.label(promo))
        if hits:
            found.append(PromoRecipe(recipe=to_summary(recipe), promos=list(hits.values())))
    found.sort(key=lambda m: (-len(m.promos), not m.recipe.favorite, -(m.recipe.rating or 0), m.recipe.title.lower()))
    return found[:MAX_PROMO_RECIPES]


@router.post("/{promo_id}/shopping", response_model=ShoppingItemOut, status_code=201)
def add_to_shopping(promo_id: int, db: Session = Depends(get_db)):
    """Dopisuje produkt z promocji do listy zakupów, np. 'Masło ekstra Polmlek (Biedronka 2,49 zł)'."""
    promo = db.get(Promotion, promo_id)
    if promo is None:
        raise HTTPException(404, "Ta promocja już się skończyła")
    item = ShoppingItem(name=promo.ingredient, text=f"{promo.name} ({promotions.label(promo)})"[:500])
    db.add(item)
    db.commit()
    return shopping_out(item, [promo])


# Pomysły od AI układają się w tle (jak plan tygodnia - Safari zrywa połączenie po minucie).
# Wyniki trzymamy w pamięci: to propozycje, zapisuje je dopiero użytkownik.
_ideas: dict[int, PromoIdeasOut] = {}
_next_id = itertools.count(1)
# Tyle produktów z promocji najwyżej widzi AI (darmowe limity)
MAX_IDEA_PRODUCTS = 150


def promo_lines(promos: list[Promotion]) -> str:
    """Lista dla AI: jeden produkt w linii, bez powtórzeń tego samego składnika w tym samym sklepie."""
    seen, lines = set(), []
    for promo in promos:
        key = (promo.leaflet.store, promo.ingredient)
        if key in seen:
            continue
        seen.add(key)
        note = f", {promo.note}" if promo.note else ""
        lines.append(f"- {promo.ingredient}: {promo.name} - {promotions.label(promo)}{note}")
    return "\n".join(lines[:MAX_IDEA_PRODUCTS])


def _run_ideas(ideas_id: int, data: PromoIdeasIn) -> None:
    result = _ideas[ideas_id]
    try:
        with SessionLocal() as db:
            promos = [p for p in promotions.current(db)
                      if p.ingredient and (not data.stores or p.leaflet.store in data.stores)]
            if not promos:
                raise ai.AiError("Nie ma jeszcze promocji z gazetek - poczekaj, aż aplikacja je odczyta.")
            titles = [r.title for r in db.query(Recipe).order_by(Recipe.title)]
            answer = ai.promo_ideas(promo_lines(promos), titles, data.wishes, category_names(db))
            if not answer.recipes:
                raise ai.AiError("AI nie zaproponowało przepisów - spróbuj jeszcze raz.")
            result.recipes, result.text, result.status = answer.recipes, answer.text, "done"
    except ai.AiError as exc:
        result.status, result.error = "failed", str(exc)
    except Exception as exc:
        log.exception("Pomysły z promocji")
        result.status, result.error = "failed", f"Nieoczekiwany błąd: {exc}"


@router.post("/ideas", response_model=PromoIdeasOut, status_code=202)
def ideas(data: PromoIdeasIn, background: BackgroundTasks):
    """AI wymyśla nowe obiady z produktów w promocji (w tle). Zapis: POST /api/chat/save."""
    result = PromoIdeasOut(id=next(_next_id), status="running", error="", text="", recipes=[])
    _ideas[result.id] = result
    background.add_task(_run_ideas, result.id, data)
    return result


@router.get("/ideas/{ideas_id}", response_model=PromoIdeasOut)
def get_ideas(ideas_id: int):
    result = _ideas.get(ideas_id)
    if result is None:
        raise HTTPException(404, "Te pomysły już wygasły - poproś o nowe")
    return result
