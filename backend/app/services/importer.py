"""Import przepisu w tle: link albo zdjęcia -> przepis w bazie.

Funkcje `run_url_import` i `run_image_import` są uruchamiane jako zadania
w tle (FastAPI BackgroundTasks). Same otwierają sesję bazy, bo sesja
z zapytania HTTP jest już wtedy zamknięta.
"""

import logging
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal
from ..models import ImportJob, Recipe, RecipeIngredient, Step
from . import ai, fetcher, image_search, images, scraper, video
from .categories import category_names, set_categories
from .ingredients import get_or_create_ingredient, guess_ingredient_name

log = logging.getLogger(__name__)


def _pick(urls: list[str], index: int | None) -> str | None:
    if index is None or not 0 <= index < len(urls):
        return None
    return urls[index]


def save_ai_recipe(db: Session, data: ai.AiRecipe, source_type: str, source_url: str,
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
        kcal=data.kcal,
        protein=data.protein,
        fat=data.fat,
        carbs=data.carbs,
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
    set_categories(db, recipe, data.categories)
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


def add_missing_images(db: Session, recipes: list[Recipe]) -> None:
    """Przepisom bez zdjęcia szukamy zdjęcia w internecie (już po zakończeniu importu)."""
    if not get_settings().ai_enabled:
        return
    for recipe in recipes:
        if recipe.image is None:
            try:
                if image_search.attach_best(recipe):
                    db.commit()
            except Exception:  # zdjęcie to dodatek - błąd nie psuje importu
                log.exception("Szukanie zdjęcia dla przepisu %s", recipe.id)
                db.rollback()


# Import dłuższy niż tyle minut uznajemy za zawieszony (pokazujemy błąd i "Ponów").
# Każde zapytanie do AI ma własny limit (ai.BACKGROUND_REQUEST_SECONDS), ale przy kilku
# AI po kolei i ponownych próbach całość może potrwać kilka minut.
STUCK_MINUTES = 15


def utc_now() -> datetime:
    # SQLite zapisuje czas bez strefy - trzymamy wszędzie UTC, jak func.now() w bazie
    return datetime.now(UTC).replace(tzinfo=None)


def mark_stuck_jobs(db: Session) -> None:
    """Zadania, które "czytają przepis" podejrzanie długo, oznaczamy jako nieudane."""
    oldest = utc_now() - timedelta(minutes=STUCK_MINUTES)
    stuck = db.query(ImportJob).filter(
        ImportJob.status.in_(["pending", "running"]),
        func.coalesce(ImportJob.started_at, ImportJob.created_at) < oldest,
    ).all()
    for job in stuck:
        job.status = "failed"
        job.error = f"Import trwał ponad {STUCK_MINUTES} minut i został przerwany - spróbuj ponownie."
    if stuck:
        db.commit()


def _still_wanted(job_id: int, started_at: datetime) -> bool:
    """Czy zadanie nadal czeka na ten wynik - mogło zostać anulowane, przerwane jako
    zawieszone albo ponowione (wtedy wynik da nowe uruchomienie, nie to)."""
    with SessionLocal() as other:
        job = other.get(ImportJob, job_id)
        return job is not None and job.status == "running" and job.started_at == started_at


def _fail(db: Session, job_id: int, started_at: datetime, error: str) -> None:
    db.rollback()
    if not _still_wanted(job_id, started_at):  # anulowanego nie wskrzeszamy
        return
    job = db.get(ImportJob, job_id)
    if job is not None:
        job.status, job.error = "failed", error
        db.commit()


def _run(job_id: int, work) -> None:
    """Wspólna obsługa statusu zadania: running -> done/failed.

    `work(db, job)` zwraca listę zapisanych przepisów. Gdy w międzyczasie
    ktoś anulował import, wynik wyrzucamy.
    """
    with SessionLocal() as db:
        job = db.get(ImportJob, job_id)
        if job is None or job.status != "pending":
            return  # anulowany, zanim ruszył
        started_at = utc_now()
        job.status, job.error, job.started_at = "running", "", started_at
        db.commit()
        try:
            recipes = work(db, job)
            if not _still_wanted(job_id, started_at):
                db.rollback()
                log.info("Import %s anulowany - wynik pominięty", job_id)
                return
            for recipe in recipes:
                recipe.created_by = job.user_id  # przepis należy do osoby, która go zaimportowała
            db.flush()
            job.recipe_id = recipes[0].id
            job.recipe_count = len(recipes)
            job.status = "done"
            db.commit()
            add_missing_images(db, recipes)
        except (fetcher.FetchError, ai.AiError) as exc:
            _fail(db, job_id, started_at, str(exc))
        except Exception as exc:
            log.exception("Import %s failed", job_id)
            _fail(db, job_id, started_at, f"Nieoczekiwany błąd: {exc}")


def _import_url(db: Session, job: ImportJob) -> list[Recipe]:
    if video.is_video_url(job.source):
        if not get_settings().ai_enabled:
            raise ai.AiError("Przepis z filmu odczytuje AI - ustaw klucz API do AI.")
        page = video.read_video(job.source)
    else:
        html, final_url = fetcher.fetch_html(job.source)
        page = scraper.read_page(html, final_url)
    if get_settings().ai_enabled:
        # Każdy przepis dostaje własne kopie zdjęć, żeby usunięcie jednego
        # przepisu nie skasowało zdjęcia drugiemu
        return [
            save_ai_recipe(db, data, "url", job.source, page.image_urls, images.download_image)
            for data in ai.recipes_from_page(page, category_names(db))
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
        save_ai_recipe(db, data, "image", "", raw, images.save_image_bytes)
        for data in ai.recipes_from_images([images.image_for_ai(b) for b in raw], category_names(db))
    ]
    # Zdjęcia usuwamy dopiero po udanym imporcie, żeby nieudany dało się ponowić
    shutil.rmtree(folder, ignore_errors=True)
    return recipes


def save_import_text(job_id: int, text: str) -> None:
    folder = job_upload_dir(job_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "text.txt").write_text(text, encoding="utf-8")


def _import_text(db: Session, job: ImportJob) -> list[Recipe]:
    file = job_upload_dir(job.id) / "text.txt"
    if not file.exists():
        raise ai.AiError("Tekst z tego importu już nie istnieje - wklej go jeszcze raz.")
    recipes = [
        save_ai_recipe(db, data, "text", "", [], lambda source: None)
        for data in ai.recipes_from_text(file.read_text(encoding="utf-8"), category_names(db))
    ]
    shutil.rmtree(file.parent, ignore_errors=True)
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


def run_text_import(job_id: int) -> None:
    _run(job_id, _import_text)
