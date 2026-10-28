"""Porównywanie linków do przepisów: ten sam przepis bywa udostępniany pod różnymi adresami.

"https://m.kwestiasmaku.com/przepis/x?utm_source=fb" i "https://www.kwestiasmaku.com/przepis/x/"
to ta sama strona - url_key() daje dla obu ten sam klucz.
"""

from urllib.parse import parse_qsl, urlencode, urlsplit

# Parametry dopisywane przy udostępnianiu (śledzenie), które nie zmieniają strony
TRACKING = {"fbclid", "gclid", "dclid", "msclkid", "igsh", "igshid", "si", "feature", "ref", "ref_src",
            "mc_cid", "mc_eid", "_ga", "share", "s", "t"}
# Przedrostki wersji mobilnej i "www" - ta sama strona
HOST_PREFIXES = ("www.", "m.", "mobile.", "amp.")


def _youtube_id(host: str, path: str, query: dict[str, str]) -> str | None:
    if host == "youtu.be":
        return path.strip("/").split("/")[0] or None
    if host.endswith("youtube.com"):
        if path.startswith(("/shorts/", "/embed/", "/live/")):
            return path.split("/")[2] or None
        return query.get("v")
    return None


def url_key(url: str) -> str:
    """Klucz do szukania duplikatów: bez http/https, www./m., śledzenia, # i końcowego "/"."""
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").lower()
    for prefix in HOST_PREFIXES:
        if host.startswith(prefix):
            host = host[len(prefix):]
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in TRACKING]
    video = _youtube_id(host, parts.path, dict(query))
    if video:
        return f"youtube.com/watch?v={video}"
    path = parts.path.rstrip("/")
    return host + path + ("?" + urlencode(sorted(query)) if query else "")
