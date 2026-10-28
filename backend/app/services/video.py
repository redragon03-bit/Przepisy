"""Przepis z filmu: TikTok, YouTube, Instagram, Facebook.

Samego filmu nie oglądamy. Narzędzie yt-dlp pobiera tytuł, opis (autorzy często
wpisują tam cały przepis) i napisy, jeśli są. To wszystko trafia do AI jak tekst strony.
Instagram i Facebook często wymagają logowania - wtedy pokazujemy błąd z podpowiedzią.
"""

import re
from urllib.parse import urlparse

from . import fetcher, ytdlp_update
from .scraper import PageContent

VIDEO_SITES = ("tiktok.com", "youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.watch")
# Napisy w tych językach, w tej kolejności (pl - ręczne albo automatyczne, potem oryginał filmu)
SUBTITLE_LANGUAGES = ("pl", "en")
MAX_SUBTITLE_CHARS = 20_000


def is_video_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(host == site or host.endswith("." + site) for site in VIDEO_SITES)


def _extract_info(url: str) -> dict:
    options = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True,
               "socket_timeout": 20}
    # Najnowszy yt-dlp, jaki mamy - aplikacja pobiera go co tydzień (patrz ytdlp_update.py)
    with ytdlp_update.module().YoutubeDL(options) as ydl:
        return ydl.extract_info(url, download=False)


def _subtitle_url(info: dict) -> str | None:
    """Adres napisów w formacie VTT - najpierw ręczne, potem automatyczne."""
    languages = [*SUBTITLE_LANGUAGES, info.get("language") or ""]
    for source in ("subtitles", "automatic_captions"):
        tracks = info.get(source) or {}
        for lang in languages:
            for track in tracks.get(lang, []) if lang else []:
                if track.get("ext") == "vtt" and track.get("url"):
                    return track["url"]
    return None


_VTT_NOISE = re.compile(r"^(WEBVTT|Kind:|Language:|NOTE|\d+$|[\d:.]+ --> )")
_TAG = re.compile(r"<[^>]+>")


def vtt_to_text(vtt: str) -> str:
    """Napisy VTT -> zwykły tekst, bez znaczników czasu i powtórzeń (napisy automatyczne powtarzają linijki)."""
    lines: list[str] = []
    for line in vtt.splitlines():
        line = _TAG.sub("", line).strip()
        if line and not _VTT_NOISE.match(line) and (not lines or lines[-1] != line):
            lines.append(line)
    return " ".join(lines)


def read_video(url: str) -> PageContent:
    """Tytuł, opis i napisy filmu jako "strona" dla AI. Miniatura filmu to jedyny obrazek."""
    download_error = ytdlp_update.module().utils.DownloadError
    try:
        info = _extract_info(url)
    except download_error as exc:
        message = str(exc)
        if "login" in message.lower() or "cookies" in message.lower():
            raise fetcher.FetchError(
                "Ten film wymaga zalogowania. Zrób screen opisu przepisu i zaimportuj zdjęcie."
            ) from exc
        raise fetcher.FetchError("Nie udało się odczytać filmu. Zrób screen opisu i zaimportuj zdjęcie.") from exc
    parts = [f"Tytuł filmu: {info.get('title') or ''}", f"Autor: {info.get('uploader') or ''}",
             f"Opis filmu:\n{info.get('description') or '(brak)'}"]
    subtitles = _subtitle_url(info)
    if subtitles:
        try:
            text = vtt_to_text(fetcher.fetch_html(subtitles)[0])
            parts.append("Napisy (to, co mówi autor):\n" + text[:MAX_SUBTITLE_CHARS])
        except fetcher.FetchError:
            pass  # napisy to dodatek - opis zwykle wystarcza
    thumbnail = info.get("thumbnail")
    return PageContent(url=url, recipe=None, text="\n\n".join(parts), image_urls=[thumbnail] if thumbnail else [])
