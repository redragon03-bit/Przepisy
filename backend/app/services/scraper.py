"""Czytanie przepisu ze strony WWW.

Krok 1: biblioteka `recipe-scrapers` szuka na stronie ukrytych danych
przepisu (schema.org/Recipe). Ma je większość stron z przepisami.
Krok 2: niezależnie od tego zbieramy tekst strony i listę obrazków -
przydają się AI, gdy danych strukturalnych brak, i do zdjęć kroków.
"""

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from recipe_scrapers import scrape_html

# Tyle znaków tekstu strony wysyłamy do AI. Przepis mieści się z zapasem;
# reszta to zwykle komentarze i reklamy.
MAX_PAGE_TEXT = 60_000
MAX_IMAGES = 30


@dataclass
class ScrapedRecipe:
    """Surowe dane przepisu, zanim AI je przetłumaczy i uporządkuje."""

    title: str = ""
    description: str = ""
    ingredients: list[str] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)
    servings: str = ""
    prep_minutes: int | None = None
    cook_minutes: int | None = None
    total_minutes: int | None = None
    language: str = ""
    image_url: str = ""


@dataclass
class PageContent:
    url: str
    recipe: ScrapedRecipe | None  # None = strona nie ma danych strukturalnych
    text: str  # widoczny tekst strony
    image_urls: list[str]  # obrazki znalezione na stronie, w kolejności


def _safe(func, default=None):
    """recipe-scrapers rzuca wyjątek, gdy jakiegoś pola brak - wtedy zwracamy domyślne."""
    try:
        value = func()
    except Exception:
        return default
    return value if value not in (None, "", []) else default


def _scrape_structured(html: str, url: str) -> tuple[ScrapedRecipe | None, str]:
    """Przepis z danych strukturalnych (albo None) i zdjęcie z tych danych (albo "")."""
    try:
        scraper = scrape_html(html, org_url=url, supported_only=False)
    except Exception:
        return None, ""
    recipe = ScrapedRecipe(
        title=_safe(scraper.title, ""),
        description=_safe(scraper.description, ""),
        ingredients=_safe(scraper.ingredients, []),
        steps=_safe(scraper.instructions_list, []),
        servings=_safe(scraper.yields, ""),
        prep_minutes=_safe(scraper.prep_time),
        cook_minutes=_safe(scraper.cook_time),
        total_minutes=_safe(scraper.total_time),
        language=(_safe(scraper.language, "") or "")[:10],
        image_url=_safe(scraper.image, ""),
    )
    # Bez składników albo kroków to nie jest użyteczny przepis
    if not recipe.ingredients or not recipe.steps:
        return None, recipe.image_url
    return recipe, recipe.image_url


def _largest_from_srcset(srcset: str) -> str:
    """Największy obrazek z srcset ("a.jpg 300w, b.jpg 1024w" -> b.jpg)."""
    best, best_size = "", -1.0
    for part in srcset.split(","):
        bits = part.strip().split()
        if not bits:
            continue
        size = 1.0
        if len(bits) > 1:
            try:
                size = float(bits[1].rstrip("wxWX"))
            except ValueError:
                pass
        if size > best_size:
            best, best_size = bits[0], size
    return best


def _image_urls(soup: BeautifulSoup, url: str, first: str = "") -> list[str]:
    """Obrazki ze strony w kolejności. `first` - zdjęcie z danych przepisu (zwykle pełny rozmiar)."""
    urls: list[str] = []
    if first:
        urls.append(urljoin(url, first))
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        full = urljoin(url, og["content"])
        if full not in urls:
            urls.append(full)
    for img in soup.find_all("img"):
        # Strony często ładują obrazki leniwie i trzymają adres w data-src.
        # srcset ma kilka rozmiarów - bierzemy największy, src bywa miniaturą.
        srcset = img.get("data-srcset") or img.get("data-lazy-srcset") or img.get("srcset") or ""
        src = _largest_from_srcset(srcset) if srcset else ""
        src = src or img.get("data-src") or img.get("data-lazy-src") or img.get("src") or ""
        if not src or src.startswith("data:") or src.lower().endswith(".svg"):
            continue
        width = img.get("width", "")
        if width.isdigit() and int(width) < 150:  # ikonki, awatary
            continue
        full = urljoin(url, src)
        if full not in urls:
            urls.append(full)
    return urls[:MAX_IMAGES]


def _visible_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "aside", "form", "svg"]):
        tag.decompose()
    text = soup.get_text("\n")
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()[:MAX_PAGE_TEXT]


def read_page(html: str, url: str) -> PageContent:
    recipe, main_image = _scrape_structured(html, url)
    soup = BeautifulSoup(html, "html.parser")
    images = _image_urls(soup, url, main_image)
    return PageContent(url=url, recipe=recipe, text=_visible_text(soup), image_urls=images)
