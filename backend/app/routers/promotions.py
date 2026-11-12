"""API promocji z gazetek: lista produktów w promocji, przepisy z nimi i pomysły od AI."""

import itertools
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, selectinload

from ..auth import CurrentUser, current_user, require_auth
from ..config import get_settings
from ..database import SessionLocal, get_db
from ..models import MemberPromoFavorite, PromoFavorite, PromoLeaflet, Promotion, Recipe, RecipeIngredient, ShoppingItem
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
from ..services import ai, promotions, shopping
from ..services.aisles import OTHER, aisle, aisle_order
from ..services.categories import category_names
from ..services.kitchen import Marks
from .recipes import to_summary
from .shopping import to_out as shopping_out

router = APIRouter(prefix="/api/promotions", tags=["promocje"], dependencies=[Depends(require_auth)])
log = logging.getLogger(__name__)


# Działy jak na liście zakupów; pieluchy osobno, zaraz po chemii
CHILD = "Dla dziecka"
AISLES = [name for name in aisle_order() if name != OTHER] + [CHILD, OTHER]
AISLE_ORDER = {name: index for index, name in enumerate(AISLES)}


def promo_aisle(promo: Promotion) -> str:
    if promo.category == "dziecko":
        return CHILD
    if promo.category == "czystosc":
        return "Chemia i dom"
    # Najpierw pełna nazwa ("Owoce mrożone..." to mrożonki), potem składnik
    found = aisle(promo.name)
    return found if found != OTHER or not promo.ingredient else aisle(promo.ingredient)


def promo_key(promo: Promotion) -> str:
    return promo.ingredient or promotions.clean_name(promo.name).lower()[:200]


def is_favorite(promo: Promotion, favorites: list[str]) -> bool:
    key = promo_key(promo)
    return any(fav == key or promotions.matches(fav, key) for fav in favorites)


def to_out(promo: Promotion, favorites: list[str] = ()) -> PromotionOut:
    leaflet = promo.leaflet
    name = promo_aisle(promo)
    return PromotionOut(id=promo.id, store=leaflet.store, name=promotions.clean_name(promo.name),
                        category=promo.category, ingredient=promo.ingredient, price=promo.price, note=promo.note,
                        discount=promotions.discount_of(promo), aisle=name, aisle_order=AISLE_ORDER[name],
                        image_url=f"/api/promotions/{promo.id}/image" if promo.image else "",
                        key=promo_key(promo), favorite=is_favorite(promo, list(favorites)), leaflet=leaflet.title,
                        valid_from=leaflet.valid_from, valid_to=leaflet.valid_to)


@router.get("", response_model=list[PromotionOut])
def list_promotions(db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Produkty w promocji z gazetek, które jeszcze obowiązują (ten sam produkt w sklepie raz)."""
    favorites = _favorite_keys(db, user)
    seen, found = set(), []
    for promo in promotions.current(db):
        out = to_out(promo, favorites)
        key = (out.store, out.name.lower(), out.price)
        if key not in seen:
            seen.add(key)
            found.append(out)
    return found


@router.get("/favorites", response_model=list[str])
def list_favorites(db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Ulubione produkty, np. ["herbata", "masło"] (każda osoba ma swoje)."""
    return sorted(_favorite_keys(db, user))


def _favorite_keys(db: Session, user: CurrentUser) -> list[str]:
    if user.is_owner:
        return [f.key for f in db.query(PromoFavorite)]
    return [f.key for f in db.query(MemberPromoFavorite).filter_by(user_id=user.id)]


@router.put("/favorites/{key}", response_model=list[str])
def add_favorite(key: str, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    key = key.strip().lower()[:200]
    if key and key not in _favorite_keys(db, user):
        db.add(PromoFavorite(key=key) if user.is_owner else MemberPromoFavorite(user_id=user.id, key=key))
        db.commit()
    return list_favorites(db, user)


@router.delete("/favorites/{key}", response_model=list[str])
def remove_favorite(key: str, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    key = key.strip().lower()
    if user.is_owner:
        db.query(PromoFavorite).filter_by(key=key).delete()
    else:
        db.query(MemberPromoFavorite).filter_by(user_id=user.id, key=key).delete()
    db.commit()
    return list_favorites(db, user)


@router.get("/{promo_id}/image")
def promo_image(promo_id: int, db: Session = Depends(get_db)):
    """Wycinek produktu ze strony gazetki."""
    promo = db.get(Promotion, promo_id)
    path = get_settings().promo_dir / promo.image if promo and promo.image else None
    if path is None or not path.exists():
        raise HTTPException(404, "Brak zdjęcia")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "max-age=604800"})


@router.get("/status", response_model=PromoStatus)
def get_status(db: Session = Depends(get_db)):
    """Kiedy ostatnio sprawdzaliśmy gazetki i które udało się odczytać."""
    leaflets = db.query(PromoLeaflet).order_by(PromoLeaflet.store, PromoLeaflet.valid_from).all()
    status = promotions.status
    return PromoStatus(
        stores=[promotions.STORE_NAMES.get(s, s.capitalize()) for s in promotions.configured_stores()],
        running=status.running, progress=status.progress, last_check=status.last_check, errors=status.errors,
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
def promo_recipes(db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Zapisane przepisy, w których składniki są w promocji (najwięcej takich składników na górze)."""
    promos = [p for p in promotions.current(db) if p.ingredient]
    if not promos:
        return []
    recipes = db.query(Recipe).filter(Recipe.variant_of.is_(None)).options(
        selectinload(Recipe.ingredients).selectinload(RecipeIngredient.ingredient)
    ).all()
    marks = Marks(db, user)
    stores: dict[str, list[Promotion]] = {}
    for promo in promos:
        stores.setdefault(promo.leaflet.store, []).append(promo)
    found = []
    for recipe in recipes:
        # Jedna promocja na składnik w każdym sklepie - ekran może pokazać tylko wybrane sklepy
        hits, names = [], set()
        for ri in recipe.ingredients:
            name = ri.ingredient.name
            if ri.ingredient.is_staple or name in names:
                continue
            for store, store_promos in stores.items():
                promo = promotions.find_for(name, store_promos)
                if promo is not None:
                    names.add(name)
                    hits.append(PromoHit(ingredient=name, store=store, label=promotions.label(promo)))
        if hits:
            found.append(PromoRecipe(recipe=to_summary(recipe, marks), promos=hits))
    found.sort(key=lambda m: (-len({p.ingredient for p in m.promos}), not m.recipe.favorite,
                              -(m.recipe.rating or 0), m.recipe.title.lower()))
    return found[:MAX_PROMO_RECIPES]


@router.post("/{promo_id}/shopping", response_model=ShoppingItemOut, status_code=201)
def add_to_shopping(promo_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Dopisuje produkt z promocji do listy zakupów, np. 'Masło ekstra Polmlek (Biedronka 2,49 zł)'."""
    promo = db.get(Promotion, promo_id)
    if promo is None:
        raise HTTPException(404, "Ta promocja już się skończyła")
    # Pieluchy czy płyn do naczyń nie mają składnika - wtedy na liście jest nazwa produktu
    name = promo.ingredient or promo.name.lower()[:200]
    item = ShoppingItem(name=name, text=f"{promo.name} ({promotions.label(promo)})"[:500], user_id=user.id)
    db.add(item)
    # Dopisane do listy = nie ma tego w domu
    shopping.not_bought(db, [item], user)
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
