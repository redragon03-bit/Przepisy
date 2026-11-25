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
import time
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor, wait

import httpx

from ..config import get_settings
from ..database import SessionLocal
from ..models import Recipe
from . import ai, fetcher, images, scraper, video, web_search

log = logging.getLogger(__name__)

MAX_PAGES = 6


def _page_image(url: str) -> tuple[str, int] | None:
    """Główne zdjęcie strony w największej wersji: (adres, dłuższy bok w px).
    Zdjęcie pobieramy od razu, żeby wiedzieć, czy nie jest za małe."""
    try:
        html, final_url = fetcher.fetch_html(url)
    except fetcher.FetchError:
        return None
    page = scraper.read_page(html, final_url)
    best: tuple[str, int] | None = None
    # Zdjęcie z danych przepisu i og:image stoją na początku listy (patrz scraper)
    for image in page.image_urls[:2]:
        for variant in images.bigger_variants(image):
            try:
                width = images.image_width(fetcher.fetch_image(variant))
            except Exception:
                continue
            if width and (best is None or width > best[1]):
                best = (variant, width)
            if width >= images.LOW_RES:
                return best
    return best


def _openverse(query: str, limit: int, page: int = 1) -> list[str]:
    try:
        response = httpx.get(
            "https://api.openverse.org/v1/images/",
            params={"q": query, "page_size": limit, "page": page, "mature": "false"},
            headers=fetcher.HEADERS, timeout=15,
        )
        response.raise_for_status()
        return [r["url"] for r in response.json().get("results", [])
                if r.get("url") and max(r.get("width") or 0, r.get("height") or 0) >= images.LOW_RES]
    except (httpx.HTTPError, ValueError, KeyError):
        return []


def _seconds_left() -> float | None:
    """Ile czasu zostało, gdy użytkownik czeka (ai.time_limit); None = bez limitu."""
    deadline = ai._limit.get()
    return None if deadline is None else deadline - time.monotonic()


def _query(recipe: Recipe, round_no: int) -> str:
    """Zapytanie do wyszukiwarki; każda kolejna runda ("Pokaż inne") pyta trochę inaczej."""
    names = [ri.ingredient.name for ri in recipe.ingredients][:3]
    variants = [
        f"{recipe.title} przepis",
        recipe.title,
        f"{recipe.title} zdjęcie",
        " ".join([recipe.title, *names]),
        f"{recipe.title} jak zrobić",
    ]
    return variants[round_no % len(variants)]


def find_candidates(recipe: Recipe, limit: int = 4, skip: Iterable[str] = (), round_no: int = 0) -> list[str]:
    """Adresy zdjęć pasujących do przepisu, najlepsze pierwsze.

    skip - zdjęcia już pokazane (pomijamy je), round_no - która to prośba o "inne".
    """
    names = [ri.ingredient.name for ri in recipe.ingredients]
    seen = set(skip)
    found: list[str] = []

    def add(image: str | None) -> None:
        if image and image not in seen and image not in found:
            found.append(image)

    pages = web_search.search_pages(_query(recipe, round_no))
    if not pages and round_no == 0 and get_settings().ai_enabled:
        try:
            pages = ai.search_recipe_pages(recipe.title, names)
        except ai.AiError as exc:
            log.warning("Wyszukiwanie stron dla %r: %s", recipe.title, exc)
    # Strony pobieramy naraz, nie po kolei - jedna wolna strona nie blokuje reszty.
    # W kolejnych rundach bierzemy więcej stron, bo część zdjęć już była.
    max_pages = MAX_PAGES if round_no == 0 else MAX_PAGES + 4
    pool = ThreadPoolExecutor(MAX_PAGES)
    futures = [pool.submit(_page_image, url) for url in pages[:max_pages]]
    left = _seconds_left()
    done, _ = wait(futures, timeout=None if left is None else max(0, left - 5))
    pool.shutdown(wait=False, cancel_futures=True)
    small: list[str] = []
    for future in futures:
        result = future.result() if future in done and not future.exception() else None
        if result and result[1] >= images.LOW_RES:
            add(result[0])
        elif result:
            small.append(result[0])  # rozmazane - pokażemy tylko, gdy nie ma nic lepszego
    if len(found) >= limit:
        return found[:limit]
    left = _seconds_left()
    if left is None or left > 5:
        for image in _openverse(recipe.title, limit + len(seen), page=round_no + 1):
            add(image)
    for image in small:
        add(image)
    return found[:limit]


def attach_best(recipe: Recipe) -> bool:
    """Pobiera pierwsze działające zdjęcie i ustawia je jako główne. Nie zapisuje sesji."""
    filename = images.download_first_good(find_candidates(recipe))
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


# "Popraw rozmazane zdjęcia": dla przepisów z linkiem do źródła szukamy na tej stronie
# tego samego zdjęcia w większej wersji. Podmieniamy je tylko, gdy to na pewno to samo
# zdjęcie (images.same_picture) - nigdy na zdjęcie innego dania.
upgrade_progress = {"running": False, "done": 0, "improved": 0, "total": 0}
_upgrade_lock = threading.Lock()
MAX_SOURCE_IMAGES = 12


def low_res_ids(db) -> list[int]:
    """Przepisy z rozmazanym zdjęciem (mniejszym niż images.LOW_RES)."""
    return [r.id for r in db.query(Recipe.id, Recipe.image).filter(Recipe.image.is_not(None))
            if images.is_low_res(r.image)]


def _source_images(source_url: str) -> list[str]:
    if video.is_video_url(source_url):
        return video.read_video(source_url).image_urls
    html, final_url = fetcher.fetch_html(source_url)
    return scraper.read_page(html, final_url).image_urls


def upgrade_image(recipe: Recipe) -> str | None:
    """Podmienia rozmazane zdjęcie przepisu na większą wersję ze strony źródłowej.
    Nie zapisuje sesji. Zwraca nazwę starego pliku (do usunięcia po zapisie) albo None."""
    if not recipe.image or not recipe.source_url.startswith(("http://", "https://")):
        return None
    try:
        current = (get_settings().images_dir / recipe.image).read_bytes()
    except OSError:
        return None
    current_width = images.image_width(current)
    try:
        urls = _source_images(recipe.source_url)
    except Exception:  # strona zniknęła albo film wymaga logowania
        return None
    for url in urls[:MAX_SOURCE_IMAGES]:
        try:
            data = images.fetch_best(url)
        except Exception:
            continue
        if images.image_width(data) >= current_width * 1.4 and images.same_picture(current, data):
            old = recipe.image
            recipe.image = images.save_image_bytes(data)
            return old
    return None


def upgrade_low_res() -> None:
    """Poprawia wszystkie rozmazane zdjęcia (zadanie w tle)."""
    with _upgrade_lock:
        if upgrade_progress["running"]:
            return
        upgrade_progress.update(running=True, done=0, improved=0, total=0)
    try:
        with SessionLocal() as db:
            ids = low_res_ids(db)
            upgrade_progress["total"] = len(ids)
            for recipe_id in ids:
                recipe = db.get(Recipe, recipe_id)
                try:
                    old = upgrade_image(recipe) if recipe else None
                    if old:
                        db.commit()
                        images.delete_image(old)
                        upgrade_progress["improved"] += 1
                except Exception:
                    log.exception("Poprawa zdjęcia przepisu %s", recipe_id)
                    db.rollback()
                upgrade_progress["done"] += 1
    finally:
        upgrade_progress["running"] = False
