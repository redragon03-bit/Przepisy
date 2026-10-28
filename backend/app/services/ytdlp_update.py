"""Świeży yt-dlp bez przebudowy dodatku.

TikTok, YouTube i Instagram często zmieniają strony i wtedy stary yt-dlp przestaje
odczytywać filmy. Poprawki wychodzą co kilka dni, a obraz aplikacji budujemy tylko
przy nowej wersji. Dlatego raz w tygodniu aplikacja sama pobiera najnowszy yt-dlp
do folderu danych (data/pylib) i od następnego importu filmu używa właśnie jego.
Gdy pobranie się nie uda, zostaje wersja z obrazu - import działa jak wcześniej.
"""

import importlib
import logging
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from types import ModuleType

from ..config import get_settings

log = logging.getLogger(__name__)

UPDATE_EVERY_SECONDS = 7 * 24 * 3600
# Pierwsze sprawdzenie chwilę po starcie, żeby nie spowalniać uruchamiania
FIRST_CHECK_SECONDS = 10 * 60
PIP_TIMEOUT_SECONDS = 300
RETRY_AFTER_FAILURE_SECONDS = 24 * 3600


def lib_dir() -> Path:
    return get_settings().data_dir / "pylib"


def _activate() -> None:
    """Folder z pobranym yt-dlp ma pierwszeństwo przed wersją z obrazu."""
    path = str(lib_dir())
    if lib_dir().exists() and path not in sys.path:
        sys.path.insert(0, path)


def module() -> ModuleType:
    """Moduł yt_dlp - najnowszy, jaki mamy (pobrany albo z obrazu)."""
    _activate()
    return importlib.import_module("yt_dlp")


def _due() -> bool:
    folder = lib_dir()
    return not folder.exists() or time.time() - folder.stat().st_mtime >= UPDATE_EVERY_SECONDS


def update() -> bool:
    """Pobiera najnowszy yt-dlp. True = jest nowa kopia (używana od następnego importu)."""
    folder = lib_dir()
    fresh = folder.with_name("pylib-new")
    shutil.rmtree(fresh, ignore_errors=True)
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "--no-cache-dir", "--no-deps",
             "--disable-pip-version-check", "--upgrade", "--target", str(fresh), "yt-dlp"],
            check=True, capture_output=True, timeout=PIP_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("Nie udało się pobrać nowego yt-dlp (zostaje obecny): %s", exc)
        shutil.rmtree(fresh, ignore_errors=True)
        return False
    shutil.rmtree(folder, ignore_errors=True)
    fresh.rename(folder)
    # Następny import yt_dlp wczyta pliki z nowego folderu
    for name in [n for n in sys.modules if n == "yt_dlp" or n.startswith("yt_dlp.")]:
        del sys.modules[name]
    importlib.invalidate_caches()
    log.info("Pobrano najnowszy yt-dlp do %s", folder)
    return True


def _loop() -> None:
    time.sleep(FIRST_CHECK_SECONDS)
    while True:
        if _due() and not update():
            time.sleep(RETRY_AFTER_FAILURE_SECONDS)  # bez internetu nie próbujemy co godzinę
        time.sleep(3600)


def start_scheduler() -> None:
    if get_settings().ytdlp_auto_update:
        threading.Thread(target=_loop, name="ytdlp-update", daemon=True).start()
