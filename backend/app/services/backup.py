"""Kopia zapasowa: jeden plik ZIP z bazą i wszystkimi obrazkami.

Oprócz kopii pobieranej ręcznie (Ustawienia -> Pobierz kopię) aplikacja raz
w tygodniu sama zapisuje kopię w folderze danych (data/backups) i trzyma
kilka ostatnich. Chroni to przed przypadkowym usunięciem przepisów.
Kopia leży na tym samym dysku - przed awarią dysku chroni kopia HA albo pobrana.
"""

import logging
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

from ..config import get_settings

log = logging.getLogger(__name__)

AUTO_BACKUP_EVERY = timedelta(days=7)
KEEP_AUTO_BACKUPS = 3
# Jak często wątek sprawdza, czy już pora na kopię; pierwsze sprawdzenie chwilę po starcie
CHECK_EVERY_SECONDS = 3600
FIRST_CHECK_AFTER_SECONDS = 120


def backups_dir() -> Path:
    folder = get_settings().data_dir / "backups"
    folder.mkdir(exist_ok=True)
    return folder


def create_zip(zip_path: Path) -> None:
    settings = get_settings()
    with tempfile.TemporaryDirectory() as tmp:
        db_copy = Path(tmp) / "przepisy.db"
        # Kopiujemy bazę przez API SQLite - bezpieczne, nawet gdy ktoś akurat zapisuje
        source = sqlite3.connect(settings.data_dir / "przepisy.db")
        target = sqlite3.connect(db_copy)
        source.backup(target)
        source.close()
        target.close()
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(db_copy, "przepisy.db")
            for image in settings.images_dir.iterdir():
                archive.write(image, f"images/{image.name}")


class RestoreError(Exception):
    """Komunikat pokazywany użytkownikowi."""


_BACKUP_IMAGE = re.compile(r"images/[0-9a-f]{32}\.jpg")


def restore_zip(zip_path: Path) -> int:
    """Zastępuje bazę i zdjęcia zawartością kopii ZIP. Zwraca liczbę przepisów w kopii.

    Najpierw sprawdzamy, czy plik naprawdę jest kopią tej aplikacji, a obecne dane
    zapisujemy jako kopię automatyczną - przywrócenie złej kopii da się więc cofnąć.
    """
    from ..database import engine, init_db

    settings = get_settings()
    try:
        archive = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as exc:
        raise RestoreError("To nie jest plik ZIP z kopią przepisów.") from exc
    with archive, tempfile.TemporaryDirectory() as tmp:
        names = archive.namelist()
        if "przepisy.db" not in names:
            raise RestoreError("W pliku nie ma bazy przepisów (przepisy.db).")
        db_copy = Path(tmp) / "przepisy.db"
        db_copy.write_bytes(archive.read("przepisy.db"))
        try:
            check = sqlite3.connect(db_copy)
            ok = check.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            count = check.execute("SELECT count(*) FROM recipes").fetchone()[0]
            check.close()
        except sqlite3.DatabaseError as exc:
            raise RestoreError("Baza w kopii jest uszkodzona albo to nie jest kopia przepisów.") from exc
        if not ok:
            raise RestoreError("Baza w kopii jest uszkodzona.")

        current = backups_dir() / f"przepisy-{datetime.now():%Y-%m-%d-%H%M%S}.zip"
        create_zip(current)
        log.info("Przed przywróceniem kopii zapisano obecne dane: %s", current.name)

        # Przez API SQLite, jak przy tworzeniu kopii - działa też przy otwartych połączeniach
        engine.dispose()
        source = sqlite3.connect(db_copy)
        target = sqlite3.connect(settings.data_dir / "przepisy.db")
        source.backup(target)
        source.close()
        target.close()

        for folder in (settings.images_dir, settings.thumbs_dir):
            shutil.rmtree(folder, ignore_errors=True)
            folder.mkdir()
        for name in names:
            # Tylko nasze nazwy plików - nic spoza folderu zdjęć
            if _BACKUP_IMAGE.fullmatch(name):
                (settings.images_dir / name.removeprefix("images/")).write_bytes(archive.read(name))
    init_db()  # kopia ze starszej wersji dostaje brakujące kolumny
    return count


def auto_backups() -> list[Path]:
    """Automatyczne kopie, najnowsza pierwsza."""
    return sorted(backups_dir().glob("przepisy-*.zip"), reverse=True)


def make_auto_backup_if_due() -> Path | None:
    """Tworzy kopię, jeśli ostatnia jest starsza niż tydzień. Zwraca ścieżkę nowej kopii."""
    existing = auto_backups()
    if existing:
        last = datetime.fromtimestamp(existing[0].stat().st_mtime)
        if datetime.now() - last < AUTO_BACKUP_EVERY:
            return None
    path = backups_dir() / f"przepisy-{datetime.now():%Y-%m-%d-%H%M}.zip"
    # Najpierw do pliku tymczasowego - przerwana kopia nie udaje gotowej
    partial = path.with_suffix(".part")
    create_zip(partial)
    partial.rename(path)
    for old in auto_backups()[KEEP_AUTO_BACKUPS:]:
        old.unlink(missing_ok=True)
    log.info("Automatyczna kopia zapasowa: %s", path.name)
    return path


def _loop() -> None:
    time.sleep(FIRST_CHECK_AFTER_SECONDS)
    while True:
        try:
            make_auto_backup_if_due()
        except Exception:
            log.exception("Automatyczna kopia zapasowa się nie udała")
        time.sleep(CHECK_EVERY_SECONDS)


def start_scheduler() -> None:
    """Uruchamia wątek w tle, który pilnuje cotygodniowej kopii."""
    threading.Thread(target=_loop, name="auto-backup", daemon=True).start()
