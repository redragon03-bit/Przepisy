"""Zapisywanie obrazków na dysku.

Każdy obrazek zmniejszamy (max 1600 px) i zapisujemy jako JPEG o losowej
nazwie w folderze `data/images`. W bazie trzymamy tylko nazwę pliku.
"""

import io
import uuid
from pathlib import Path

from PIL import Image, ImageOps

from ..config import get_settings
from . import fetcher

MAX_SIZE = 1600
# Miniatury do list przepisów: wystarczą na kartę w dwóch kolumnach na ekranie Retina
THUMB_SIZE = 480
# Dla AI wystarczy mniejszy obraz - szybciej i taniej
AI_MAX_SIZE = 1568


def _to_jpeg(data: bytes, max_size: int) -> bytes:
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image)  # obróć zgodnie z zapisem z aparatu
    image.thumbnail((max_size, max_size))
    if image.mode != "RGB":
        image = image.convert("RGB")
    out = io.BytesIO()
    image.save(out, "JPEG", quality=85)
    return out.getvalue()


def save_image_bytes(data: bytes) -> str:
    """Zapisuje obrazek i zwraca nazwę pliku."""
    filename = f"{uuid.uuid4().hex}.jpg"
    (get_settings().images_dir / filename).write_bytes(_to_jpeg(data, MAX_SIZE))
    return filename


def download_image(url: str) -> str | None:
    """Pobiera obrazek z internetu. Zwraca nazwę pliku albo None, gdy się nie uda."""
    try:
        return save_image_bytes(fetcher.fetch_image(url))
    except Exception:  # obrazek to dodatek - jego brak nie może zepsuć importu
        return None


def delete_image(filename: str | None) -> None:
    if filename:
        (get_settings().images_dir / filename).unlink(missing_ok=True)
        (get_settings().thumbs_dir / filename).unlink(missing_ok=True)


def thumbnail(filename: str) -> Path | None:
    """Ścieżka miniatury; tworzy ją przy pierwszym użyciu. None, gdy nie ma zdjęcia.

    Miniatur nie ma w kopii zapasowej - zawsze da się je zrobić od nowa ze zdjęć.
    """
    settings = get_settings()
    thumb = settings.thumbs_dir / filename
    if not thumb.exists():
        source = settings.images_dir / filename
        if not source.exists():
            return None
        partial = thumb.with_suffix(".part")
        partial.write_bytes(_to_jpeg(source.read_bytes(), THUMB_SIZE))
        partial.replace(thumb)  # dwa równoczesne zapytania nie zobaczą połowy pliku
    return thumb


def image_for_ai(data: bytes) -> bytes:
    """Zmniejsza obrazek przed wysłaniem do AI i zwraca go jako JPEG."""
    return _to_jpeg(data, AI_MAX_SIZE)
