"""Uruchomienie serwera w Dockerze: http na porcie 8000 i - gdy jest certyfikat - https na 8443.

Przez https Safari włącza funkcje, których przez http nie ma: ekran nie gaśnie
w trybie gotowania (Wake Lock), aplikacja otwiera się bez internetu (service worker).
Certyfikat daje za darmo Tailscale (patrz README, "HTTPS"). Tailscale sam go odnawia,
więc co godzinę sprawdzamy, czy plik się zmienił, i wczytujemy nowy bez restartu.

Uruchomienie: python -m app.serve
"""

import asyncio
import contextlib
import logging
import ssl
from pathlib import Path

import uvicorn

from .config import get_settings

log = logging.getLogger("przepisy.serve")

CERT_CHECK_SECONDS = 3600


class _SecondServer(uvicorn.Server):
    """Serwer https: sygnały (zatrzymanie dodatku) obsługuje serwer http i zatrzymuje też ten."""

    @contextlib.contextmanager
    def capture_signals(self):
        yield


def _certificate_ok(certfile: str, keyfile: str) -> bool:
    if not (Path(certfile).exists() and Path(keyfile).exists()):
        log.info("Brak plików certyfikatu (%s) - aplikacja działa tylko przez http", certfile)
        return False
    try:
        ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER).load_cert_chain(certfile, keyfile)
    except (OSError, ssl.SSLError) as exc:
        log.warning("Certyfikat HTTPS nie działa (%s) - aplikacja działa tylko przez http", exc)
        return False
    return True


async def _reload_certificate(server: uvicorn.Server, certfile: str, keyfile: str) -> None:
    def stamp():
        return [Path(f).stat().st_mtime for f in (certfile, keyfile)]

    last = stamp()
    while not server.should_exit:
        await asyncio.sleep(CERT_CHECK_SECONDS)
        with contextlib.suppress(OSError, ssl.SSLError):
            if stamp() != last and server.config.ssl is not None:
                server.config.ssl.load_cert_chain(certfile, keyfile)  # nowe połączenia dostają nowy certyfikat
                last = stamp()
                log.info("Wczytano odnowiony certyfikat HTTPS")


async def _run() -> None:
    settings = get_settings()
    http = uvicorn.Server(uvicorn.Config("app.main:app", host="0.0.0.0", port=8000))
    tasks = [asyncio.create_task(http.serve())]
    https = None
    certfile, keyfile = str(settings.ssl_certfile or ""), str(settings.ssl_keyfile or "")
    if certfile and keyfile:
        if _certificate_ok(certfile, keyfile):
            # lifespan="off": baza i zadania w tle startują raz, w serwerze http
            https = _SecondServer(uvicorn.Config("app.main:app", host="0.0.0.0", port=settings.https_port,
                                                 ssl_certfile=certfile, ssl_keyfile=keyfile, lifespan="off"))
            tasks.append(asyncio.create_task(https.serve()))
            tasks.append(asyncio.create_task(_reload_certificate(https, certfile, keyfile)))
            log.info("HTTPS na porcie %s", settings.https_port)
    await tasks[0]
    if https is not None:
        https.should_exit = True
    for task in tasks[1:]:
        task.cancel()
    await asyncio.gather(*tasks[1:], return_exceptions=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_run())
