"""Szukanie zdjęcia dla przepisu bez zdjęcia.

1. Szukamy stron z przepisem na to samo danie: najpierw zwykłą wyszukiwarką
   (DuckDuckGo/Bing, darmowo i bez limitu - patrz web_search.py), a gdy nic
   nie znajdzie - przez AI (Gemini z Google, Claude z web search). AI ma dzienny
   limit zapytań, więc zostawiamy je na import przepisów i czat.
2. Z każdej strony bierzemy jej główne zdjęcie (og:image - to, które widać
   po wklejeniu linku na Messengerze).
3. Gdy to nie wystarczy - zapas: Openverse, darmowa wyszukiwarka zdjęć
   na wolnych licencjach (bez klucza API).

Zdjęcia ze stron są czyjąś własnością - nadają się do prywatnej aplikacji,
nie do publikowania.
"""

import logging
import threading

import httpx

from ..config import get_settings
from ..database import SessionLocal
from ..models import Recipe
from . import ai, fetcher, images, scraper, web_search

log = logging.getLogger(__name__)

MAX_PAGES = 6


def _page_image(url: str) -> str | None:
    try:
        html, final_url = fetcher.fetch_html(url)
    except fetcher.FetchError:
        return None
    page = scraper.read_page(html, final_url)
    if page.recipe and page.recipe.image_url:
        return page.recipe.image_url
    return page.image_urls[0] if page.image_urls else None


def _openverse(query: str, limit: int) -> list[str]:
    try:
        response = httpx.get(
            "https://api.openverse.org/v1/images/",
            params={"q": query, "page_size": limit, "mature": "false"},
            headers=fetcher.HEADERS, timeout=15,
        )
        response.raise_for_status()
        return [r["url"] for r in response.json().get("results", []) if r.get("url")]
    except (httpx.HTTPError, ValueError, KeyError):
        return []


def find_candidates(recipe: Recipe, limit: int = 4) -> list[str]:
    """Adresy zdjęć pasujących do przepisu, najlepsze pierwsze."""
    names = [ri.ingredient.name for ri in recipe.ingredients]
    found: list[str] = []
    pages = web_search.search_pages(f"{recipe.title} przepis")
    if not pages and get_settings().ai_enabled:
        try:
            pages = ai.search_recipe_pages(recipe.title, names)
        except ai.AiError as exc:
            log.warning("Wyszukiwanie stron dla %r: %s", recipe.title, exc)
    for page_url in pages[:MAX_PAGES]:
        image = _page_image(page_url)
        if image and image not in found:
            found.append(image)
        if len(found) >= limit:
            return found
    for image in _openverse(recipe.title, limit):
        if image not in found:
            found.append(image)
    return found[:limit]


def attach_best(recipe: Recipe) -> bool:
    """Pobiera pierwsze działające zdjęcie i ustawia je jako główne. Nie zapisuje sesji."""
    for url in find_candidates(recipe):
        filename = images.download_image(url)
        if filename:
            recipe.image = filename
            return True
    return False


# Stan hurtowego szukania zdjęć (jedno naraz). Frontend odpytuje go co kilka sekund.
progress = {"running": False, "done": 0, "found": 0, "total": 0}
_lock = threading.Lock()


def fill_missing() -> None:
    """Szuka zdjęć dla wszystkich przepisów bez zdjęcia (zadanie w tle)."""
    with _lock:
        if progress["running"]:
            return
        progress.update(running=True, done=0, found=0, total=0)
    try:
        with SessionLocal() as db:
            ids = [r.id for r in db.query(Recipe.id).filter(Recipe.image.is_(None))]
            progress["total"] = len(ids)
            for recipe_id in ids:
                recipe = db.get(Recipe, recipe_id)
                try:
                    if recipe and recipe.image is None and attach_best(recipe):
                        progress["found"] += 1
                        db.commit()
                except Exception:  # jeden nieudany przepis nie przerywa reszty
                    log.exception("Szukanie zdjęcia dla przepisu %s", recipe_id)
                    db.rollback()
                progress["done"] += 1
    finally:
        progress["running"] = False
