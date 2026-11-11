"""API importu: link albo zdjęcia -> zadanie w tle -> przepis.

Frontend wysyła link/zdjęcia, dostaje od razu numer zadania i co kilka
sekund pyta o jego status (GET /api/imports/{id}).
"""

import shutil

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user, owned, require_auth
from ..config import get_settings
from ..database import get_db
from ..models import ImportJob, Recipe
from ..schemas import ImportJobOut, TextImportIn, UrlImportIn
from ..services.importer import (
    job_upload_dir,
    mark_stuck_jobs,
    run_image_import,
    run_text_import,
    run_url_import,
    save_import_text,
    utc_now,
)
from ..services.urls import url_key

router = APIRouter(prefix="/api/imports", tags=["import"], dependencies=[Depends(require_auth)])

MAX_FILES = 10
MAX_FILE_BYTES = 20 * 1024 * 1024


def _same_link(db: Session, url: str) -> Recipe | None:
    """Przepis z tym samym linkiem, także zapisanym inaczej (m., www., utm_..., youtu.be)."""
    key = url_key(url)
    recipes = db.query(Recipe).filter(Recipe.source_url != "").order_by(Recipe.id)
    return next((r for r in recipes if url_key(r.source_url) == key), None)


@router.post("/url", response_model=ImportJobOut, status_code=202)
def import_url(data: UrlImportIn, background: BackgroundTasks, db: Session = Depends(get_db),
               user: CurrentUser = Depends(current_user)):
    url = data.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Podaj pełny link, zaczynający się od https://")
    existing = _same_link(db, url)
    if existing and not data.force:
        # Nie importujemy drugi raz - frontend pokaże "już masz" z linkiem i "importuj mimo to"
        job = ImportJob(kind="url", source=url, status="duplicate", recipe_id=existing.id,
                        error=f"Ten link jest już w bazie: „{existing.title}”.", user_id=user.id)
        db.add(job)
        db.commit()
        return job
    job = ImportJob(kind="url", source=url, user_id=user.id)
    db.add(job)
    db.commit()
    background.add_task(run_url_import, job.id)
    return job


@router.post("/images", response_model=ImportJobOut, status_code=202)
def import_images(
    background: BackgroundTasks,
    files: list[UploadFile] = File(description="Zdjęcia/screeny jednego przepisu"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    if not files or len(files) > MAX_FILES:
        raise HTTPException(400, f"Wybierz od 1 do {MAX_FILES} zdjęć")
    # Rozmiar sprawdzamy, zanim cokolwiek zapiszemy - za duży plik nie zostawia zadania w kolejce
    for upload in files:
        if (upload.size or 0) > MAX_FILE_BYTES:
            raise HTTPException(400, f"Plik {upload.filename} jest za duży (max 20 MB)")
    job = ImportJob(kind="image", source=", ".join(f.filename or "zdjęcie" for f in files), user_id=user.id)
    db.add(job)
    db.commit()
    folder = job_upload_dir(job.id)
    folder.mkdir(parents=True, exist_ok=True)
    for index, upload in enumerate(files):
        # Numer z przodu zachowuje kolejność zdjęć
        (folder / f"{index:02d}").write_bytes(upload.file.read())
    background.add_task(run_image_import, job.id)
    return job


@router.post("/text", response_model=ImportJobOut, status_code=202)
def import_text(data: TextImportIn, background: BackgroundTasks, db: Session = Depends(get_db),
                user: CurrentUser = Depends(current_user)):
    """Przepis z wklejonego tekstu (np. z Messengera albo notatki) - odczytuje go AI."""
    if not get_settings().ai_enabled:
        raise HTTPException(400, "Tekst odczytuje AI - ustaw klucz API do AI.")
    text = data.text.strip()
    # Na liście importów widać początek tekstu
    job = ImportJob(kind="text", source=" ".join(text.split())[:120], user_id=user.id)
    db.add(job)
    db.commit()
    save_import_text(job.id, text)
    background.add_task(run_text_import, job.id)
    return job


@router.get("", response_model=list[ImportJobOut])
def list_imports(db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Ostatnie importy tej osoby."""
    mark_stuck_jobs(db)
    query = db.query(ImportJob).filter(owned(ImportJob.user_id, user))
    return query.order_by(ImportJob.id.desc()).limit(20).all()


def _get_job(db: Session, job_id: int, user: CurrentUser) -> ImportJob:
    job = db.get(ImportJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(404, "Nie ma takiego importu")
    return job


@router.get("/{job_id}", response_model=ImportJobOut)
def get_import(job_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    mark_stuck_jobs(db)
    return _get_job(db, job_id, user)


@router.delete("/{job_id}", status_code=204)
def delete_import(job_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Anuluje import (także zawieszony) albo usuwa go z listy. Gotowe przepisy zostają."""
    job = _get_job(db, job_id, user)
    db.delete(job)
    db.commit()
    # Import w tle, który jeszcze trwa, sam zauważy brak zadania i niczego nie zapisze
    shutil.rmtree(job_upload_dir(job_id), ignore_errors=True)


@router.post("/{job_id}/retry", response_model=ImportJobOut, status_code=202)
def retry_import(job_id: int, background: BackgroundTasks, db: Session = Depends(get_db),
                 user: CurrentUser = Depends(current_user)):
    """Ponawia nieudany import (np. gdy AI było chwilowo przeciążone)."""
    job = _get_job(db, job_id, user)
    if job.status != "failed":
        raise HTTPException(400, "Ponowić można tylko nieudany import")
    if job.kind in ("image", "text") and not job_upload_dir(job.id).exists():
        raise HTTPException(400, "Materiał z tego importu już nie istnieje - dodaj go jeszcze raz")
    job.status, job.error, job.started_at = "pending", "", utc_now()
    db.commit()
    run = {"image": run_image_import, "text": run_text_import, "url": run_url_import}[job.kind]
    background.add_task(run, job.id)
    return job
