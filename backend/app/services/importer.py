"""Import przepisu w tle: link albo zdjęcia -> przepis w bazie.

Funkcje `run_url_import` i `run_image_import` są uruchamiane jako zadania
w tle (FastAPI BackgroundTasks). Same otwierają sesję bazy, bo sesja
z zapytania HTTP jest już wtedy zamknięta.
"""

import logging
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal
from ..models import ImportJob, Recipe, RecipeIngredient, Step
from . import ai, fetcher, images, scraper
from .ingredients import get_or_create_ingredient, guess_ingredient_name

log = logging.getLogger(__name__)


def _pick(urls: list[str], index: int | None) -> str | None:
    if index is None or not 0 <= index < len(urls):
        return None
    return urls[index]


def _save_ai_recipe(db: Session, data: ai.AiRecipe, source_type: str, source_url: str,
                    image_sources: list, load_image) -> Recipe:
    """Zapisuje przepis od AI. `load_image(źródło)` zwraca nazwę zapisanego pliku albo None."""
    recipe = Recipe(
        title=data.title or "Przepis bez nazwy",
        description=data.description,
        servings=data.servings,
        prep_minutes=data.prep_minutes,
        cook_minutes=data.cook_minutes,
        total_minutes=data.total_minutes,
        source_type=source_type,
        source_url=source_url,
        original_language=data.original_language[:10],
    )
    main = _pick(image_sources, data.main_image_index)
    recipe.image = load_image(main) if main is not None else None
    for position, item in enumerate(data.ingredients):
        recipe.ingredients.append(RecipeIngredient(
            position=position,
            text=item.text,
            amount=item.amount,
            unit=item.unit,
            original_text=item.original_text,
            ingredient=get_or_create_ingredient(db, item.name),
        ))
    for position, step in enumerate(data.steps):
        source = _pick(image_sources, step.image_index)
        # To samo zdjęcie co główne nie powtarza się przy kroku
        image = load_image(source) if source is not None and source != main else None
        recipe.steps.append(Step(position=position, text=step.text, image=image))
    db.add(recipe)
    return recipe


def _save_scraped_recipe(db: Session, data: scraper.ScrapedRecipe, url: str) -> Recipe:
    """Zapis bez AI: dane ze strony 1:1, bez tłumaczenia i przeliczania."""
    recipe = Recipe(
        title=data.title or "Przepis bez nazwy",
        description=data.description,
        servings=data.servings,
        prep_minutes=data.prep_minutes,
        cook_minutes=data.cook_minutes,
        total_minutes=data.total_minutes,
        source_type="url",
        source_url=url,
        original_language=data.language,
        image=images.download_image(data.image_url) if data.image_url else None,
    )
    for position, line in enumerate(data.ingredients):
        recipe.ingredients.append(RecipeIngredient(
            position=position, text=line, amount=None, unit="", original_text=line,
            ingredient=get_or_create_ingredient(db, guess_ingredient_name(line)),
        ))
    for position, text in enumerate(data.steps):
        recipe.steps.append(Step(position=position, text=text))
    db.add(recipe)
    return recipe


def _run(job_id: int, work) -> None:
    """Wspólna obsługa statusu zadania: running -> done/failed."""
    with SessionLocal() as db:
        job = db.get(ImportJob, job_id)
        job.status = "running"
        db.commit()
        try:
            recipe = work(db, job)
            db.flush()
            job.recipe_id = recipe.id
            job.status = "done"
            db.commit()
        except (fetcher.FetchError, ai.AiError) as exc:
            db.rollback()
            job.status, job.error = "failed", str(exc)
            db.commit()
        except Exception as exc:
            log.exception("Import %s failed", job_id)
            db.rollback()
            job.status, job.error = "failed", f"Nieoczekiwany błąd: {exc}"
            db.commit()


def _import_url(db: Session, job: ImportJob) -> Recipe:
    html, final_url = fetcher.fetch_html(job.source)
    page = scraper.read_page(html, final_url)
    if get_settings().ai_enabled:
        data = ai.recipe_from_page(page)
        return _save_ai_recipe(db, data, "url", job.source, page.image_urls, images.download_image)
    if page.recipe:
        return _save_scraped_recipe(db, page.recipe, job.source)
    raise ai.AiError(
        "Ta strona nie ma danych przepisu w standardowym formacie. "
        "Bez klucza API Anthropic nie da się jej odczytać."
    )


def job_upload_dir(job_id: int) -> Path:
    return get_settings().uploads_dir / f"job-{job_id}"


def _import_images(db: Session, job: ImportJob) -> Recipe:
    folder = job_upload_dir(job.id)
    files = sorted(folder.iterdir())
    try:
        raw = [f.read_bytes() for f in files]
        data = ai.recipe_from_images([images.image_for_ai(b) for b in raw])
        recipe = _save_ai_recipe(db, data, "image", "", raw, images.save_image_bytes)
    finally:
        shutil.rmtree(folder, ignore_errors=True)
    return recipe


def run_url_import(job_id: int) -> None:
    _run(job_id, _import_url)


def run_image_import(job_id: int) -> None:
    _run(job_id, _import_images)
