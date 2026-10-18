"""Kopia zapasowa: jeden plik ZIP z bazą i wszystkimi obrazkami."""

import shutil
import sqlite3
import tempfile
import zipfile
from datetime import date
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import FileResponse

from ..auth import require_auth
from ..config import get_settings

router = APIRouter(prefix="/api", tags=["kopia"], dependencies=[Depends(require_auth)])


@router.get("/backup")
def download_backup(background: BackgroundTasks):
    settings = get_settings()
    tmp = Path(tempfile.mkdtemp())
    db_copy = tmp / "przepisy.db"
    # Kopiujemy bazę przez API SQLite - bezpieczne, nawet gdy ktoś akurat zapisuje
    source = sqlite3.connect(settings.data_dir / "przepisy.db")
    target = sqlite3.connect(db_copy)
    source.backup(target)
    source.close()
    target.close()

    zip_path = tmp / f"przepisy-{date.today()}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.write(db_copy, "przepisy.db")
        for image in settings.images_dir.iterdir():
            archive.write(image, f"images/{image.name}")

    # Pliki tymczasowe usuwamy dopiero po wysłaniu odpowiedzi
    background.add_task(shutil.rmtree, tmp, ignore_errors=True)
    return FileResponse(zip_path, filename=zip_path.name, media_type="application/zip")
