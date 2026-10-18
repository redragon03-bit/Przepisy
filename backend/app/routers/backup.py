"""Kopia zapasowa: pobranie ZIP-a z bazą i obrazkami oraz lista kopii automatycznych."""

import re
import shutil
import tempfile
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse

from ..auth import require_auth
from ..schemas import BackupFile
from ..services import backup

router = APIRouter(prefix="/api", tags=["kopia"], dependencies=[Depends(require_auth)])


@router.get("/backup")
def download_backup(background: BackgroundTasks):
    tmp = Path(tempfile.mkdtemp())
    zip_path = tmp / f"przepisy-{date.today()}.zip"
    backup.create_zip(zip_path)
    # Pliki tymczasowe usuwamy dopiero po wysłaniu odpowiedzi
    background.add_task(shutil.rmtree, tmp, ignore_errors=True)
    return FileResponse(zip_path, filename=zip_path.name, media_type="application/zip")


@router.get("/backups", response_model=list[BackupFile])
def list_auto_backups():
    """Kopie robione automatycznie co tydzień, najnowsza pierwsza."""
    return [
        BackupFile(name=p.name, size=p.stat().st_size, created_at=datetime.fromtimestamp(p.stat().st_mtime))
        for p in backup.auto_backups()
    ]


@router.get("/backups/{name}")
def download_auto_backup(name: str):
    # Tylko nasze nazwy plików - nic spoza folderu kopii
    if not re.fullmatch(r"przepisy-[\d-]+\.zip", name):
        raise HTTPException(404)
    path = backup.backups_dir() / name
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, filename=name, media_type="application/zip")
