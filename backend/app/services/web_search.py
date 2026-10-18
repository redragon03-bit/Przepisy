"""Darmowe wyszukiwanie stron w internecie, bez klucza API i bez limitu AI.

Czytamy zwykłą stronę wyników DuckDuckGo (wersja HTML, bez JavaScriptu),
a gdy nic nie da - Bing. To tylko adresy stron; zdjęcie bierze z nich image_search.py.
Wyszukiwarki czasem zmieniają wygląd strony wyników - wtedy ta funkcja zwróci
pustą listę, a szukanie zdjęć przejdzie do AI.
"""

import base64
import re
from html import unescape
from urllib.parse import parse_qs, quote_plus, urlparse

from . import fetcher

# Strony, z których i tak nie weźmiemy zdjęcia (filmy, sklepy, same wyszukiwarki)
SKIP_DOMAINS = ("duckduckgo.com", "bing.com", "youtube.com", "facebook.com", "instagram.com",
                "tiktok.com", "pinterest.", "allegro.pl", "amazon.")

_DDG_LINK = re.compile(r'class="result__a"[^>]*href="([^"]+)"')
_BING_LINK = re.compile(r'<li class="b_algo".*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"', re.S)


def _ddg_target(href: str) -> str:
    """DuckDuckGo podaje adres przekierowania //duckduckgo.com/l/?uddg=<właściwy adres>."""
    href = unescape(href)
    if "uddg=" in href:
        return parse_qs(urlparse(href).query).get("uddg", [""])[0]
    return href


def _bing_target(href: str) -> str:
    """Bing czasem podaje bing.com/ck/a?...&u=a1<adres w base64>."""
    href = unescape(href)
    if "bing.com/ck/a" in href:
        encoded = parse_qs(urlparse(href).query).get("u", [""])[0]
        if encoded.startswith("a1"):
            encoded = encoded[2:]
            try:
                return base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
            except (ValueError, UnicodeDecodeError):
                return ""
    return href


def _results(url: str, pattern: re.Pattern, target) -> list[str]:
    try:
        html, _ = fetcher.fetch_html(url)
    except fetcher.FetchError:
        return []
    links = [target(href) for href in pattern.findall(html)]
    return [
        link for link in links
        if link.startswith(("http://", "https://")) and not any(d in urlparse(link).netloc for d in SKIP_DOMAINS)
    ]


def search_pages(query: str) -> list[str]:
    """Adresy stron pasujących do zapytania, najlepsze pierwsze. Pusta lista, gdy nic."""
    q = quote_plus(query)
    pages = _results(f"https://html.duckduckgo.com/html/?q={q}", _DDG_LINK, _ddg_target)
    if not pages:
        pages = _results(f"https://www.bing.com/search?q={q}&setlang=pl", _BING_LINK, _bing_target)
    return list(dict.fromkeys(pages))
