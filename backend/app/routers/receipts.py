"""API paragonów: zdjęcie paragonu -> AI w tle -> lista do sprawdzenia -> spiżarnia.

Opis działania i ograniczeń: services/receipts.py.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user, require_auth
from ..config import get_settings
from ..database import get_db
from ..schemas import PantryItem, ReceiptApplyIn, ReceiptScanOut, ReceiptSettingsIn, ReceiptSettingsOut
from ..services import kitchen, receipts
from ..services.ingredients import normalize_name
from .pantry import pantry_item

router = APIRouter(prefix="/api/receipts", tags=["paragony"], dependencies=[Depends(require_auth)])

MAX_FILE_BYTES = 20 * 1024 * 1024


def _settings(db: Session, user: CurrentUser) -> ReceiptSettingsOut:
    return ReceiptSettingsOut(
        enabled=receipts.enabled(db, user),
        used_today=receipts.used_today(db, user),
        daily_limit=receipts.DAILY_LIMIT,
        ai_enabled=get_settings().ai_enabled,
    )


@router.get("/settings", response_model=ReceiptSettingsOut)
def get_settings_(db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    return _settings(db, user)


@router.put("/settings", response_model=ReceiptSettingsOut)
def put_settings(data: ReceiptSettingsIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Włącza albo wyłącza paragony - osobno dla każdego konta."""
    receipts.set_enabled(db, user, data.enabled)
    db.commit()
    return _settings(db, user)


@router.post("", response_model=ReceiptScanOut, status_code=202)
def scan(
    background: BackgroundTasks,
    files: list[UploadFile] = File(description="Zdjęcia jednego paragonu (długi paragon - kilka części)"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    if not receipts.enabled(db, user):
        raise HTTPException(400, "Paragony są wyłączone - włączysz je w Ustawieniach.")
    if not get_settings().ai_enabled:
        raise HTTPException(400, "Paragon odczytuje AI - ustaw klucz API do AI.")
    if not files or len(files) > receipts.MAX_PHOTOS:
        raise HTTPException(400, f"Wybierz od 1 do {receipts.MAX_PHOTOS} zdjęć jednego paragonu")
    if receipts.used_today(db, user) >= receipts.DAILY_LIMIT:
        raise HTTPException(429, f"Dziś odczytano już {receipts.DAILY_LIMIT} paragonów - spróbuj jutro.")
    for upload in files:
        if (upload.size or 0) > MAX_FILE_BYTES:
            raise HTTPException(400, f"Plik {upload.filename} jest za duży (max 20 MB)")
    photos = [upload.file.read() for upload in files]
    receipts.count_use(db, user)
    db.commit()
    result = receipts.start(user)
    background.add_task(receipts.run, result.id, photos)
    return result


@router.get("/{scan_id}", response_model=ReceiptScanOut)
def get_scan(scan_id: int, user: CurrentUser = Depends(current_user)):
    result = receipts.get(scan_id, user)
    if result is None:
        raise HTTPException(404, "Ten odczyt już wygasł - zrób zdjęcie paragonu jeszcze raz")
    return result


@router.post("/apply", response_model=list[PantryItem])
def apply(data: ReceiptApplyIn, db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Zaznaczone produkty z paragonu trafiają do spiżarni; nazwy zapamiętujemy na następny raz."""
    lines = [(line.raw, normalize_name(line.name)[:200], line.expires) for line in data.items]
    lines = [line for line in lines if line[1]]
    if not lines:
        raise HTTPException(400, "Zaznacz co najmniej jeden produkt")
    stored = kitchen.add_to_pantry(db, user, [name for _raw, name, _expires in lines], create=True)
    db.flush()
    for _raw, name, expires in lines:
        if expires:
            kitchen.set_expires(db, user, stored.get(name, name), expires)
    receipts.remember(db, data.store, [(raw, name) for raw, name, _expires in lines])
    db.commit()
    return [pantry_item(name, expires) for name, expires in kitchen.pantry(db, user)]
