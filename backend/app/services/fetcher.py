"""Pobieranie stron i obrazków z internetu."""

import ipaddress
import socket

import httpx

# Niektóre strony nie lubią "robotów", więc przedstawiamy się jak przeglądarka.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ),
    "Accept-Language": "pl,en;q=0.8",
}
MAX_PAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_BYTES = 15 * 1024 * 1024


class FetchError(Exception):
    """Nie udało się pobrać strony - komunikat jest pokazywany użytkownikowi."""


def _only_internet(request: httpx.Request) -> None:
    """Nie pobieramy niczego z sieci domowej (router, Home Assistant, sam serwer).

    Sprawdzane przy każdym zapytaniu, także po przekierowaniu - strona w internecie
    mogłaby przekierować na adres w sieci domowej.
    """
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(request.url.host, None)}
    except (socket.gaierror, UnicodeError):
        return  # nie da się sprawdzić (np. serwer za proxy) - httpx sam zgłosi błąd połączenia
    if any(not ipaddress.ip_address(a.split("%")[0]).is_global for a in addresses):
        raise FetchError("Ten link prowadzi do sieci domowej - aplikacja pobiera tylko strony z internetu.")


def _get(url: str, max_bytes: int) -> httpx.Response:
    if not url.startswith(("http://", "https://")):
        raise FetchError("Link musi zaczynać się od http:// albo https://")
    try:
        with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=20,
                          event_hooks={"request": [_only_internet]}) as client:
            response = client.get(url)
    except httpx.HTTPError as exc:
        raise FetchError(f"Nie udało się połączyć ze stroną ({exc.__class__.__name__})") from exc
    if response.status_code >= 400:
        raise FetchError(
            f"Strona odpowiedziała błędem {response.status_code}. "
            "Może blokuje roboty albo wymaga logowania - spróbuj wrzucić screen."
        )
    if len(response.content) > max_bytes:
        raise FetchError("Plik jest za duży")
    return response


def fetch_html(url: str) -> tuple[str, str]:
    """Zwraca (html, końcowy_url) - końcowy po przekierowaniach."""
    response = _get(url, MAX_PAGE_BYTES)
    return response.text, str(response.url)


def fetch_image(url: str) -> bytes:
    response = _get(url, MAX_IMAGE_BYTES)
    if not response.headers.get("content-type", "").startswith("image/"):
        raise FetchError("To nie jest obrazek")
    return response.content
