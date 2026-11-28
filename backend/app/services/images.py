"""Zapisywanie obrazków na dysku.

Każdy obrazek zmniejszamy (max 1600 px) i zapisujemy jako JPEG o losowej
nazwie w folderze `data/images`. W bazie trzymamy tylko nazwę pliku.
"""

import io
import re
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
# Zdjęcie węższe niż tyle pikseli wygląda na telefonie jak rozmazane kwadraty
# (u góry przepisu ma ok. 390 punktów szerokości = 1170 px na ekranie Retina)
LOW_RES = 640


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


# Strony podają często miniaturę zamiast zdjęcia. Te wzorce zamieniają adres
# miniatury na adres pełnej wersji: (wzorzec, zamiana).
_BIGGER = [
    # WordPress: zdjecie-300x200.jpg -> zdjecie.jpg
    (re.compile(r"-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp))(?=$|\?)", re.I), r"\1"),
    # WordPress/Jetpack i wiele CDN: ?w=300, ?resize=300,200, ?fit=300,200
    (re.compile(r"([?&])(?:w|width|resize|fit|h|height)=[^&]*&?", re.I), r"\1"),
    # Blogger/Google: /s320/ albo =s320 / =w400-h300 -> pełny rozmiar
    (re.compile(r"/s\d{2,4}(-c)?/"), "/s1600/"),
    (re.compile(r"=(?:s|w)\d{2,4}(?:-h\d{2,4})?(?:-[a-z0-9-]+)?$"), "=s1600"),
    # Wix: /v1/fill/w_300,h_200,.../plik.jpg -> oryginał
    (re.compile(r"(\.(?:jpe?g|png|webp))/v1/.*$", re.I), r"\1"),
]


def bigger_variants(url: str) -> list[str]:
    """Adresy możliwie większej wersji tego samego zdjęcia (najpierw te), na końcu oryginał."""
    variants: list[str] = []
    candidate = url
    for pattern, replacement in _BIGGER:
        candidate = pattern.sub(replacement, candidate).rstrip("?&")
    if candidate != url:
        variants.append(candidate)
    variants.append(url)
    return variants


def image_width(data: bytes) -> int:
    """Dłuższy bok obrazka w pikselach (0, gdy to nie obrazek)."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            return max(image.size)
    except Exception:
        return 0


def fetch_best(url: str) -> bytes:
    """Pobiera zdjęcie w największej dostępnej wersji (patrz bigger_variants)."""
    best: tuple[int, bytes] | None = None
    last: Exception | None = None
    for variant in bigger_variants(url):
        try:
            data = fetcher.fetch_image(variant)
        except Exception as exc:
            last = exc
            continue
        width = image_width(data)
        if width and (best is None or width > best[0]):
            best = (width, data)
        if width >= LOW_RES:
            break  # wystarczająco duże - oryginalnej miniatury nie trzeba już pobierać
    if best is None:
        raise last or fetcher.FetchError("To nie jest obrazek")
    return best[1]


def download_image(url: str) -> str | None:
    """Pobiera obrazek z internetu. Zwraca nazwę pliku albo None, gdy się nie uda."""
    try:
        return save_image_bytes(fetch_best(url))
    except Exception:  # obrazek to dodatek - jego brak nie może zepsuć importu
        return None


def download_first_good(urls: list[str]) -> str | None:
    """Pierwsze zdjęcie z listy, które jest wystarczająco duże; gdy żadne -
    największe z tych, które udało się pobrać (lepsze małe niż żadne)."""
    best: tuple[int, bytes] | None = None
    for url in urls:
        try:
            data = fetch_best(url)
        except Exception:
            continue
        width = image_width(data)
        if width >= LOW_RES:
            return save_image_bytes(data)
        if best is None or width > best[0]:
            best = (width, data)
    return save_image_bytes(best[1]) if best else None


def size(filename: str | None) -> int:
    """Dłuższy bok zapisanego zdjęcia w pikselach (0, gdy go nie ma).
    Czyta tylko nagłówek pliku, więc jest szybkie."""
    if not filename:
        return 0
    try:
        with Image.open(get_settings().images_dir / filename) as image:
            return max(image.size)
    except Exception:
        return 0


def is_low_res(filename: str | None) -> bool:
    return 0 < size(filename) < LOW_RES


def fingerprint(data: bytes) -> list[int]:
    """Odcisk zdjęcia (8x8 w kolorze) - do sprawdzenia, czy dwa pliki to to samo zdjęcie."""
    with Image.open(io.BytesIO(data)) as image:
        small = ImageOps.exif_transpose(image).convert("RGB").resize((8, 8), Image.Resampling.BOX)
        return [channel for pixel in small.getdata() for channel in pixel]


def same_picture(a: bytes, b: bytes) -> bool:
    """Czy to to samo zdjęcie, tylko w innym rozmiarze (średnia różnica jasności małej wersji)."""
    try:
        fa, fb = fingerprint(a), fingerprint(b)
    except Exception:
        return False
    if abs(_ratio(a) - _ratio(b)) > 0.08:
        return False
    # Ta sama fotka po zmniejszeniu i kompresji różni się o 1-3, inne zdjęcie o kilkadziesiąt
    return sum(abs(x - y) for x, y in zip(fa, fb, strict=True)) / len(fa) < 8


def _ratio(data: bytes) -> float:
    with Image.open(io.BytesIO(data)) as image:
        w, h = ImageOps.exif_transpose(image).size
        return w / h


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
