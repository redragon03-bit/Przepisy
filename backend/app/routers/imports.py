"""API importu: link albo zdjęcia -> zadanie w tle -> przepis.

Frontend wysyła link/zdjęcia, dostaje od razu numer zadania i co kilka
sekund pyta o jego status (GET /api/imports/{id}).
"""

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import require_auth
from ..database import get_db
from ..models import ImportJob, Recipe
from ..schemas import ImportJobOut, UrlImportIn
from ..services.importer import job_upload_dir, run_image_import, run_url_import

router = APIRouter(prefix="/api/imports", tags=["import"], dependencies=[Depends(require_auth)])

MAX_FILES = 10
MAX_FILE_BYTES = 20 * 1024 * 1024


@router.post("/url", response_model=ImportJobOut, status_code=202)
def import_url(data: UrlImportIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    url = data.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Podaj pełny link, zaczynający się od https://")
    existing = db.query(Recipe).filter_by(source_url=url).order_by(Recipe.id).first()
    if existing and not data.force:
        # Nie importujemy drugi raz - frontend pokaże "już masz" z linkiem i "importuj mimo to"
        job = ImportJob(kind="url", source=url, status="duplicate", recipe_id=existing.id,
                        error=f"Ten link jest już w bazie: „{existing.title}”.")
        db.add(job)
        db.commit()
        return job
    job = ImportJob(kind="url", source=url)
    db.add(job)
    db.commit()
    background.add_task(run_url_import, job.id)
    return job


@router.post("/images", response_model=ImportJobOut, status_code=202)
def import_images(
    background: BackgroundTasks,
    files: list[UploadFile] = File(description="Zdjęcia/screeny jednego przepisu"),
    db: Session = Depends(get_db),
):
    if not files or len(files) > MAX_FILES:
        raise HTTPException(400, f"Wybierz od 1 do {MAX_FILES} zdjęć")
    # Rozmiar sprawdzamy, zanim cokolwiek zapiszemy - za duży plik nie zostawia zadania w kolejce
    for upload in files:
        if (upload.size or 0) > MAX_FILE_BYTES:
            raise HTTPException(400, f"Plik {upload.filename} jest za duży (max 20 MB)")
    job = ImportJob(kind="image", source=", ".join(f.filename or "zdjęcie" for f in files))
    db.add(job)
    db.commit()
    folder = job_upload_dir(job.id)
    folder.mkdir(parents=True, exist_ok=True)
    for index, upload in enumerate(files):
        # Numer z przodu zachowuje kolejność zdjęć
        (folder / f"{index:02d}").write_bytes(upload.file.read())
    background.add_task(run_image_import, job.id)
    return job


@router.get("", response_model=list[ImportJobOut])
def list_imports(db: Session = Depends(get_db)):
    return db.query(ImportJob).order_by(ImportJob.id.desc()).limit(20).all()


def _get_job(db: Session, job_id: int) -> ImportJob:
    job = db.get(ImportJob, job_id)
    if job is None:
        raise HTTPException(404, "Nie ma takiego importu")
    return job


@router.get("/{job_id}", response_model=ImportJobOut)
def get_import(job_id: int, db: Session = Depends(get_db)):
    return _get_job(db, job_id)


@router.post("/{job_id}/retry", response_model=ImportJobOut, status_code=202)
def retry_import(job_id: int, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Ponawia nieudany import (np. gdy AI było chwilowo przeciążone)."""
    job = _get_job(db, job_id)
    if job.status != "failed":
        raise HTTPException(400, "Ponowić można tylko nieudany import")
    if job.kind == "image" and not job_upload_dir(job.id).exists():
        raise HTTPException(400, "Zdjęcia z tego importu już nie istnieją - wgraj je jeszcze raz")
    job.status, job.error = "pending", ""
    db.commit()
    background.add_task(run_image_import if job.kind == "image" else run_url_import, job.id)
    return job
