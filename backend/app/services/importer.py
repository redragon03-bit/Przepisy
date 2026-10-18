"""Import przepisu w tle: link albo zdjęcia -> przepis w bazie.

Funkcje `run_url_import` i `run_image_import` są uruchamiane jako zadania
w tle (FastAPI BackgroundTasks). Same otwierają sesję bazy, bo sesja
z zapytania HTTP jest już wtedy zamknięta.
"""

import logging
import shutil
from datetime import datetime, timedelta
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
    """Wspólna obsługa statusu zadania: running -> done/failed.

    `work(db, job)` zwraca listę zapisanych przepisów.
    """
    with SessionLocal() as db:
        job = db.get(ImportJob, job_id)
        job.status, job.error = "running", ""
        db.commit()
        try:
            recipes = work(db, job)
            db.flush()
            job.recipe_id = recipes[0].id
            job.recipe_count = len(recipes)
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


def _import_url(db: Session, job: ImportJob) -> list[Recipe]:
    html, final_url = fetcher.fetch_html(job.source)
    page = scraper.read_page(html, final_url)
    if get_settings().ai_enabled:
        # Każdy przepis dostaje własne kopie zdjęć, żeby usunięcie jednego
        # przepisu nie skasowało zdjęcia drugiemu
        return [
            _save_ai_recipe(db, data, "url", job.source, page.image_urls, images.download_image)
            for data in ai.recipes_from_page(page)
        ]
    if page.recipe:
        return [_save_scraped_recipe(db, page.recipe, job.source)]
    raise ai.AiError(
        "Ta strona nie ma danych przepisu w standardowym formacie. "
        "Bez klucza API do AI (Anthropic albo Gemini) nie da się jej odczytać."
    )


def job_upload_dir(job_id: int) -> Path:
    return get_settings().uploads_dir / f"job-{job_id}"


def _import_images(db: Session, job: ImportJob) -> list[Recipe]:
    folder = job_upload_dir(job.id)
    if not folder.exists():
        raise ai.AiError("Zdjęcia z tego importu już nie istnieją - wgraj je jeszcze raz.")
    raw = [f.read_bytes() for f in sorted(folder.iterdir())]
    recipes = [
        _save_ai_recipe(db, data, "image", "", raw, images.save_image_bytes)
        for data in ai.recipes_from_images([images.image_for_ai(b) for b in raw])
    ]
    # Zdjęcia usuwamy dopiero po udanym imporcie, żeby nieudany dało się ponowić
    shutil.rmtree(folder, ignore_errors=True)
    return recipes


# Zdjęcia z nieudanego importu trzymamy tyle dni, żeby dało się go ponowić
KEEP_FAILED_UPLOADS_DAYS = 7


def remove_stale_uploads() -> None:
    """Usuwa zdjęcia importów, których już nie da się albo nie trzeba ponawiać."""
    oldest = datetime.now() - timedelta(days=KEEP_FAILED_UPLOADS_DAYS)
    with SessionLocal() as db:
        for folder in get_settings().uploads_dir.glob("job-*"):
            job = db.get(ImportJob, int(folder.name.removeprefix("job-")))
            if job is None or job.status == "done" or job.created_at < oldest:
                shutil.rmtree(folder, ignore_errors=True)


def run_url_import(job_id: int) -> None:
    _run(job_id, _import_url)


def run_image_import(job_id: int) -> None:
    _run(job_id, _import_images)
