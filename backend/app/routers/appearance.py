"""Ustawienia wyglądu (skala czcionek i odstępów) - zapis do dziennika dodatku.

Skala działa na telefonie (localStorage), a serwer tylko zapamiętuje ostatnie ustawienia
każdej osoby i wypisuje je w logu dodatku, żeby było wiadomo, co jest ustawione.
"""

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, current_user, require_auth
from ..config import get_settings
from ..schemas import AppearanceIn, AppearanceOut

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/appearance", tags=["wygląd"], dependencies=[Depends(require_auth)])

GROUPS = ("title", "body", "list", "small", "kitchen", "timer", "check", "space")


def _file():
    return get_settings().data_dir / "appearance.json"


def _load() -> dict[str, dict]:
    try:
        return json.loads(_file().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@router.get("", response_model=list[AppearanceOut])
def list_appearance():
    """Ostatnie ustawienia wyglądu każdej osoby (do sprawdzania, co jest ustawione)."""
    return [AppearanceOut(**entry) for entry in _load().values()]


@router.post("", response_model=AppearanceOut)
def save_appearance(data: AppearanceIn, user: CurrentUser = Depends(current_user)):
    scales = {k: max(50, min(200, v)) for k, v in data.scales.items() if k in GROUPS}
    entry = AppearanceOut(user=user.name, device=data.device, scales=scales, saved_at=datetime.now())
    saved = _load()
    saved[user.name] = json.loads(entry.model_dump_json())
    try:
        _file().write_text(json.dumps(saved, ensure_ascii=False, indent=1), encoding="utf-8")
    except OSError:
        log.warning("Nie zapisałem ustawień wyglądu do %s", _file())
    summary = ", ".join(f"{k} {scales[k]}%" for k in GROUPS if k in scales)
    log.info("Wygląd (%s, %s): %s", user.name, data.device or "?", summary)
    return entry
