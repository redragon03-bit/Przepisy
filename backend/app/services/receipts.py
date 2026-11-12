"""Paragon -> spiżarnia: AI odczytuje zdjęcie paragonu, użytkownik sprawdza listę i zapisuje.

Funkcja jest domyślnie wyłączona - każda osoba włącza ją sobie w Ustawieniach (AppSetting
"receipts:<konto>"). Zdjęć nie zapisujemy na dysku: są w pamięci tylko na czas odczytu
(paragon ma numer karty i godzinę zakupów). Odczyt działa w tle, bo trwa dłużej niż minutę,
po której Safari zrywa połączenie - telefon co kilka sekund pyta o wynik.

Poprawione nazwy zapamiętujemy (ReceiptAlias), więc kolejny paragon z tego samego sklepu
dostaje je od razu, a AI widzi je jako podpowiedź.
"""

import itertools
import logging
import re
from datetime import date

from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..database import SessionLocal, fold
from ..models import AppSetting, ReceiptAlias
from ..schemas import ReceiptLineOut, ReceiptScanOut
from . import ai
from .images import image_for_ai
from .ingredients import find_ingredient, normalize_name

log = logging.getLogger(__name__)

# Tyle paragonów dziennie może odczytać jedna osoba (żeby przypadkowe zdjęcia nie zjadły
# darmowego limitu AI potrzebnego np. do gazetek)
DAILY_LIMIT = 10
MAX_PHOTOS = 3
# Tyle zapamiętanych skrótów z tego sklepu dostaje AI jako podpowiedź
HINTS = 60


def _who(user: CurrentUser) -> str:
    return "owner" if user.id is None else str(user.id)


def _setting(db: Session, key: str) -> str:
    row = db.get(AppSetting, key)
    return row.value if row else ""


def _set(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def enabled(db: Session, user: CurrentUser) -> bool:
    return _setting(db, f"receipts:{_who(user)}") == "1"


def set_enabled(db: Session, user: CurrentUser, on: bool) -> None:
    _set(db, f"receipts:{_who(user)}", "1" if on else "0")


def used_today(db: Session, user: CurrentUser) -> int:
    """Ile paragonów ta osoba odczytała dziś (zapis: 'RRRR-MM-DD:liczba')."""
    day, _, count = _setting(db, f"receipts-used:{_who(user)}").partition(":")
    return int(count) if day == date.today().isoformat() and count.isdigit() else 0


def count_use(db: Session, user: CurrentUser) -> None:
    _set(db, f"receipts-used:{_who(user)}", f"{date.today().isoformat()}:{used_today(db, user) + 1}")


def _key(text: str) -> str:
    return " ".join(fold(text).split())[:200]


def aliases(db: Session, store: str) -> dict[str, str]:
    """Zapamiętane nazwy linijek z paragonów: najpierw z dowolnego sklepu, potem z tego (ważniejsze)."""
    rows = db.query(ReceiptAlias).order_by(ReceiptAlias.updated_at).all()
    found = {r.raw: r.name for r in rows if r.store != _key(store)}
    found.update({r.raw: r.name for r in rows if r.store == _key(store)})
    return found


def remember(db: Session, store: str, lines: list[tuple[str, str]]) -> None:
    """Zapamiętuje [(linijka z paragonu, nazwa w spiżarni)]."""
    store_key = _key(store)
    for raw, name in lines:
        raw_key = _key(raw)
        if not raw_key or not name:
            continue
        row = db.query(ReceiptAlias).filter_by(store=store_key, raw=raw_key).one_or_none()
        if row is None:
            db.add(ReceiptAlias(store=store_key, raw=raw_key, name=name))
        else:
            row.name = name


# Odczyty w toku i gotowe (w pamięci, jak plan tygodnia od AI) - po restarcie znikają
_scans: dict[int, tuple[CurrentUser, ReceiptScanOut]] = {}
_next_id = itertools.count(1)


def start(user: CurrentUser) -> ReceiptScanOut:
    scan = ReceiptScanOut(id=next(_next_id), status="running", error="", store="", items=[])
    _scans[scan.id] = (user, scan)
    # Starych wyników nie trzymamy w nieskończoność
    for old in sorted(_scans)[:-20]:
        del _scans[old]
    return scan


def get(scan_id: int, user: CurrentUser) -> ReceiptScanOut | None:
    found = _scans.get(scan_id)
    return found[1] if found and found[0].id == user.id else None


def _clean_amount(amount: float | None, unit: str) -> tuple[float | None, str]:
    unit = unit.strip().lower().rstrip(".")
    unit = {"szt": "szt", "sztuk": "szt", "gr": "g", "kg": "kg", "g": "g", "ml": "ml", "l": "l"}.get(unit, "")
    if amount is None or amount <= 0:
        return None, ""
    return round(amount, 3), unit


def lines_from_ai(db: Session, result: ai.AiReceipt) -> list[ReceiptLineOut]:
    """Odpowiedź AI -> wiersze do sprawdzenia: zapamiętane nazwy i istniejące składniki mają pierwszeństwo."""
    known = aliases(db, result.store)
    lines = []
    for item in result.items:
        raw = re.sub(r"\s+", " ", item.raw).strip()[:200]
        remembered = known.get(_key(raw))
        name = normalize_name(remembered or item.name)[:200]
        ingredient = find_ingredient(db, name) if name else None
        if ingredient is not None:
            name = ingredient.name
        amount, unit = _clean_amount(item.amount, item.unit)
        lines.append(
            ReceiptLineOut(
                raw=raw,
                name=name,
                amount=amount,
                unit=unit,
                # Zapamiętana nazwa = ktoś już to kupił i dodał do spiżarni, więc to jedzenie
                food=bool(remembered) or (item.food and bool(name)),
                days=item.days if item.days and 0 < item.days <= 365 else None,
                known=bool(remembered) or ingredient is not None,
            )
        )
    return lines


def run(scan_id: int, photos: list[bytes]) -> None:
    """Odczyt w tle. Błąd AI pokazujemy użytkownikowi; zdjęcia znikają razem z tą funkcją."""
    found = _scans.get(scan_id)
    if found is None:
        return
    scan = found[1]
    try:
        with SessionLocal() as db:
            jpegs = [image_for_ai(p) for p in photos]
            store_hints = "\n".join(f"{raw} -> {name}" for raw, name in list(aliases(db, "").items())[-HINTS:])
            result = ai.receipt_from_images(jpegs, store_hints)
            scan.store = result.store.strip()[:100]
            scan.items = lines_from_ai(db, result)
            if not scan.items:
                raise ai.AiError(
                    "Nie widzę produktów na tym zdjęciu - zrób zdjęcie całego paragonu, płasko i w dobrym świetle."
                )
            scan.status = "done"
    except ai.AiError as exc:
        scan.status, scan.error = "failed", str(exc)
    except Exception as exc:
        log.exception("Odczyt paragonu")
        scan.status, scan.error = "failed", f"Nie udało się odczytać paragonu: {exc}"
