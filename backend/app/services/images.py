"""Zapisywanie obrazków na dysku.

Każdy obrazek zmniejszamy (max 1600 px) i zapisujemy jako JPEG o losowej
nazwie w folderze `data/images`. W bazie trzymamy tylko nazwę pliku.
"""

import base64
import io
import uuid

from PIL import Image, ImageOps

from ..config import get_settings
from . import fetcher

MAX_SIZE = 1600
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


def image_for_ai(data: bytes) -> dict:
    """Zamienia obrazek na blok, który można wysłać do Claude."""
    jpeg = _to_jpeg(data, AI_MAX_SIZE)
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": base64.standard_b64encode(jpeg).decode("ascii"),
        },
    }
