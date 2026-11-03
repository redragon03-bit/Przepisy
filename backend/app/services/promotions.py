"""Promocje z gazetek sklepów spożywczych.

Skąd bierzemy gazetki:
- Lidl: oficjalna przeglądarka gazetek Lidla (leaflets.schwarz) podaje dla każdej strony
  opis produktów i ceny jako tekst.
- Pozostałe sieci (Biedronka, Kaufland...): serwis Blix pokazuje przy każdej gazetce
  listę ofert (nazwa i cena) jako tekst.

Obrazków stron nie czytamy - AI dostaje tylko tekst, więc wystarczają darmowe limity.
AI wybiera z tekstu produkty spożywcze i nadaje im nazwę składnika (np. "masło"),
po której dopasowujemy je do przepisów.

Każdą gazetkę czytamy tylko raz (PromoLeaflet). Co kilka godzin sprawdzamy, czy pojawiły
się nowe gazetki - pobranie listy to kilka zapytań, AI pracuje tylko przy nowych.
Pobieramy tylko na prywatny użytek, rzadko i bez obciążania stron.
"""

import io
import itertools
import logging
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from bs4 import BeautifulSoup
from PIL import Image
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal, fold
from ..models import PromoLeaflet, PromoPage, Promotion
from . import ai
from .fetcher import FetchError, fetch_html, fetch_image, fetch_json
from .images import image_for_ai

log = logging.getLogger(__name__)

# Nazwy sieci do wyświetlenia (klucz = nazwa w ustawieniach i w adresie na Blixie)
STORE_NAMES = {
    "lidl": "Lidl", "biedronka": "Biedronka", "kaufland": "Kaufland", "auchan": "Auchan",
    "carrefour": "Carrefour", "dino": "Dino", "netto": "Netto", "aldi": "Aldi", "stokrotka": "Stokrotka",
    "intermarche": "Intermarché", "lewiatan": "Lewiatan", "polomarket": "POLOmarket", "zabka": "Żabka",
}

# Gazetki bez jedzenia i chemii - nie warto ich czytać (sprawdzamy w tytule i adresie, bez ogonków)
SKIP_WORDS = ("zabaw", "alkohol", "home", "dom-i-ogrod", "ubrani", "odziez", "moda", "toast", "elektronik")

LIDL_LIST = "https://www.lidl.pl/c/nasze-gazetki/s10008614"
LIDL_FLYER = "https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier={slug}&region_id=0&region_code=0"
BLIX_STORE = "https://blix.pl/sklep/{store}/"

# Wersja odczytu gazetek: gazetki odczytane starszą wersją czytamy jeszcze raz
# (2 = z Blixa tylko oferty z ceną)
PARSER_VERSION = 2

# Najwięcej tyle znaków tekstu z jednej gazetki trafia do AI
MAX_LEAFLET_TEXT = 40_000
# Najwięcej tyle nowych gazetek jednej sieci czytamy przy jednym sprawdzeniu
MAX_NEW_LEAFLETS = 8

CHECK_EVERY_SECONDS = 12 * 3600
FIRST_CHECK_SECONDS = 5 * 60


@dataclass
class Leaflet:
    store: str
    title: str
    url: str
    valid_from: date | None = None
    valid_to: date | None = None
    # Tekst gazetki dla AI (Blix: wypełniany dopiero przy czytaniu gazetki)
    text: str = ""


@dataclass
class RefreshStatus:
    running: bool = False
    last_check: datetime | None = None
    # Błędy sieci przy ostatnim sprawdzeniu, np. "Biedronka: strona odpowiedziała błędem 403"
    errors: list[str] = field(default_factory=list)
    # Co teraz czytamy, np. "Biedronka: Od poniedziałku (3/9)"
    progress: str = ""


status = RefreshStatus()
_lock = threading.Lock()


def _skip(title: str, url: str) -> bool:
    text = fold(f"{title} {url}")
    return any(word in text for word in SKIP_WORDS)


def _parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value[:10]) if value else None
    except ValueError:
        return None


# "02.11-07.11", "02.11.2026 - 07.11.2026", "od 02.11"
_RANGE = re.compile(r"(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*[-–]\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?")
_FROM = re.compile(r"\bod\s+(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?")


def _day(day: str, month: str, year: str | None, today: date) -> date | None:
    try:
        if year:
            return date(int(year), int(month), int(day))
        value = date(today.year, int(month), int(day))
    except ValueError:
        return None
    # Gazetka z przełomu roku: "29.12-04.01" w styczniu to jeszcze grudzień zeszłego roku
    if (value - today).days > 180:
        value = value.replace(year=today.year - 1)
    elif (today - value).days > 180:
        value = value.replace(year=today.year + 1)
    return value


def parse_dates(text: str, today: date | None = None) -> tuple[date | None, date | None]:
    """Daty obowiązywania z tytułu gazetki, np. 'Od poniedziałku - 02.11-07.11'."""
    today = today or date.today()
    if match := _RANGE.search(text):
        d1, m1, y1, d2, m2, y2 = match.groups()
        start, end = _day(d1, m1, y1, today), _day(d2, m2, y2, today)
        if start and end and end < start:
            end = end.replace(year=end.year + 1)
        return start, end
    if match := _FROM.search(text):
        return _day(*match.groups(), today), None
    return None, None


# --- Lidl ---

def lidl_leaflets() -> list[Leaflet]:
    """Aktualne gazetki Lidla z tekstem stron (opisy produktów i ceny)."""
    html, _ = fetch_html(LIDL_LIST)
    slugs = list(dict.fromkeys(re.findall(r"/l/pl/gazetki/([a-z0-9-]+)/ar/\d+", html)))
    leaflets = []
    for slug in slugs:
        # "Katalog" to u Lidla oferta bez jedzenia (sprzęt, ubrania)
        if _skip(slug, "") or "katalog" in slug:
            continue
        try:
            data = fetch_json(LIDL_FLYER.format(slug=slug))
        except FetchError as exc:
            log.warning("Gazetka Lidla %s: %s", slug, exc)
            continue
        flyer = data.get("flyer") if isinstance(data, dict) else None
        if not isinstance(flyer, dict):
            continue
        leaflets.append(lidl_leaflet(slug, flyer))
    return leaflets


def lidl_leaflet(slug: str, flyer: dict) -> Leaflet:
    lines = []
    for page in flyer.get("pages") or []:
        parts = [str(page.get(key) or "").strip() for key in ("altText", "keyWords")]
        if any(parts):
            lines.append(f"Strona {page.get('number', '?')}: " + " | ".join(p for p in parts if p))
    title = " ".join(str(flyer.get(key) or "") for key in ("name", "title")).strip() or slug
    return Leaflet(
        store="Lidl",
        title=title,
        url=f"https://www.lidl.pl/l/pl/gazetki/{slug}/ar/0",
        valid_from=_parse_date(flyer.get("offerStartDate") or flyer.get("startDate")),
        valid_to=_parse_date(flyer.get("offerEndDate") or flyer.get("endDate")),
        text="\n".join(lines),
    )


# --- Blix (pozostałe sieci) ---

def blix_leaflets(store: str) -> list[Leaflet]:
    """Gazetki sieci z Blixa (bez tekstu - ten pobiera blix_text przy czytaniu gazetki)."""
    html, url = fetch_html(BLIX_STORE.format(store=store))
    return blix_leaflet_list(html, url, store)


def blix_leaflet_list(html: str, base_url: str, store: str) -> list[Leaflet]:
    soup = BeautifulSoup(html, "html.parser")
    pattern = re.compile(rf"/sklep/{re.escape(store)}/gazetka/(\d+)")
    found: dict[str, Leaflet] = {}
    for link in soup.find_all("a", href=pattern):
        leaflet_id = pattern.search(link["href"]).group(1)
        title = (link.get("title") or link.get_text(" ", strip=True)).strip()
        if leaflet_id in found:
            # Ten sam link bywa dwa razy (okładka i tytuł) - zostawiamy dłuższy opis
            if len(title) > len(found[leaflet_id].title):
                found[leaflet_id].title = title
            continue
        found[leaflet_id] = Leaflet(
            store=STORE_NAMES.get(store, store.capitalize()),
            title=title,
            url=f"https://blix.pl/sklep/{store}/gazetka/{leaflet_id}/",
        )
    for leaflet in found.values():
        leaflet.valid_from, leaflet.valid_to = parse_dates(leaflet.title)
    return list(found.values())


def blix_text(html: str) -> tuple[str, str]:
    """(tytuł z datami, lista ofert jako tekst) ze strony gazetki na Blixie."""
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find("h1")
    title = heading.get_text(" ", strip=True) if heading else (soup.title.get_text(strip=True) if soup.title else "")
    offers = soup.find(lambda tag: tag.name in ("h2", "h3", "h4") and "oferty z tej gazetki" in tag.get_text().lower())
    if offers is not None:
        section = offers.find_parent("section") or offers.parent
        root = section
    else:
        for tag in soup(["script", "style", "nav", "header", "footer", "noscript"]):
            tag.decompose()
        root = soup.find("main") or soup.body or soup
    lines = [line.strip() for line in root.get_text("\n").splitlines()]
    # Usuwamy powtórzenia (ta sama oferta bywa kilka razy)
    text = "\n".join(dict.fromkeys(priced_offers(lines)))
    return title, text[:MAX_LEAFLET_TEXT]


_PRICE = re.compile(r"\d+[,.]\d{2}\s*zł", re.IGNORECASE)
_ONLY_PRICE = re.compile(r"[-–\s]*\d+[,.]\d{2}\s*zł\S*(\s.*)?", re.IGNORECASE)
# Rabat, np. "-30%", "- 25 %"; w osobnej linii dołącza do oferty przed nim
_PERCENT = re.compile(r"[-–]\s*(\d{1,2})\s*%")
_ONLY_PERCENT = re.compile(r"\s*[-–]\s*\d{1,2}\s*%\s*")
# Cena doklejona do nazwy: "Półbagietka graham 1,49 zł"
_NAME_PRICE = re.compile(r"\s+\d+[,.]\d{2}\s*zł.*$", re.IGNORECASE)


def priced_offers(lines: list[str]) -> list[str]:
    """Tylko oferty z ceną: "Masło ekstra 2,49 zł". Cena w osobnej linii dołącza do nazwy przed nią.

    Na Blixie większość ofert ma tylko "Zobacz" bez ceny - takich nie bierzemy
    (bez ceny promocja nic nie mówi, a AI miałoby 2-3 razy więcej tekstu do przeczytania).
    """
    offers, previous = [], ""
    for line in (line for line in lines if line):
        if _ONLY_PERCENT.fullmatch(line):
            if offers and not previous:
                offers[-1] += f" {line.strip()}"
            continue
        if _ONLY_PRICE.fullmatch(line):
            if previous:
                offers.append(f"{previous} {line}")
            previous = ""
        elif _PRICE.search(line):
            offers.append(line)
            previous = ""
        else:
            previous = line
    return offers


# --- Sprawdzanie i zapis ---

def configured_stores() -> list[str]:
    return [s.strip().lower() for s in get_settings().promo_stores.split(",") if s.strip()]


def _store_leaflets(store: str) -> list[Leaflet]:
    return lidl_leaflets() if store == "lidl" else blix_leaflets(store)


def _read(leaflet: Leaflet) -> list[ai.AiPromotion]:
    if not leaflet.text:  # Blix: tekst ofert jest na stronie gazetki
        html, _ = fetch_html(leaflet.url)
        title, leaflet.text = blix_text(html)
        start, end = parse_dates(title)
        leaflet.valid_from, leaflet.valid_to = start or leaflet.valid_from, end or leaflet.valid_to
    if not leaflet.text.strip() or _expired(leaflet, date.today()):
        return []
    return ai.promotions_from_text(leaflet.store, leaflet.title, leaflet.text)


def _expired(leaflet: Leaflet | PromoLeaflet, today: date) -> bool:
    return leaflet.valid_to is not None and leaflet.valid_to < today


def clean_name(name: str) -> str:
    """Nazwa bez doklejonej ceny: "Półbagietka graham 1,49 zł" -> "Półbagietka graham"."""
    return _NAME_PRICE.sub("", name).strip() or name.strip()


def discount_of(promo: Promotion) -> int:
    """Rabat w %: zapisany przez AI albo odczytany z dopisku/ceny ("-30%")."""
    if 0 < (promo.discount or 0) < 100:
        return promo.discount
    match = _PERCENT.search(f"{promo.note} {promo.price}")
    return int(match.group(1)) if match else 0


def _promotion(product: ai.AiPromotion, image: str = "") -> Promotion:
    discount = product.discount if 0 < product.discount < 100 else 0
    return Promotion(name=clean_name(product.name)[:300], category=product.category,
                     ingredient=product.ingredient[:200], price=product.price[:100], note=product.note[:300],
                     discount=discount, image=image)


# Wycinek produktu ze strony gazetki: tyle pikseli najwyżej (miniatura na liście)
CROP_SIZE = 240


def crop_product(jpeg: bytes, box: list[int]) -> str:
    """Wycina produkt ze strony gazetki (box w skali 0-1000) i zapisuje. Zwraca nazwę pliku albo ""."""
    if len(box) != 4:
        return ""
    top, left, bottom, right = (min(max(v, 0), 1000) for v in box)
    if bottom - top < 20 or right - left < 20:  # za mały prostokąt - pewnie pomyłka AI
        return ""
    try:
        page = Image.open(io.BytesIO(jpeg))
        width, height = page.size
        crop = page.crop((left * width // 1000, top * height // 1000, right * width // 1000,
                          bottom * height // 1000)).convert("RGB")
        crop.thumbnail((CROP_SIZE, CROP_SIZE))
        folder = get_settings().promo_dir
        folder.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.jpg"
        crop.save(folder / filename, "JPEG", quality=85)
        return filename
    except OSError as exc:
        log.warning("Wycinek z gazetki: %s", exc)
        return ""


def delete_crops(leaflet: PromoLeaflet) -> None:
    for promo in leaflet.promotions:
        if promo.image:
            (get_settings().promo_dir / promo.image).unlink(missing_ok=True)


def _save(db: Session, leaflet: Leaflet, products: list[ai.AiPromotion], error: str = "") -> None:
    row = db.query(PromoLeaflet).filter_by(url=leaflet.url).one_or_none()
    if row is None:
        row = PromoLeaflet(url=leaflet.url, store=leaflet.store)
        db.add(row)
    row.title, row.valid_from, row.valid_to = leaflet.title[:300], leaflet.valid_from, leaflet.valid_to
    row.status, row.error, row.fetched_at = ("failed" if error else "done"), error, datetime.now()
    row.parser = PARSER_VERSION
    delete_crops(row)
    row.promotions = [
        _promotion(p) for p in products
    ]
    db.commit()


def refresh() -> None:
    """Sprawdza gazetki wszystkich sieci z ustawień i czyta nowe. Wywoływać w tle."""
    if not _lock.acquire(blocking=False):
        return  # już trwa
    status.running, errors = True, []
    try:
        today = date.today()
        with SessionLocal() as db:
            # Stare gazetki i ich promocje nie są już potrzebne
            for old in db.query(PromoLeaflet).filter(PromoLeaflet.valid_to < today - timedelta(days=1)):
                delete_crops(old)
                db.delete(old)
            db.commit()
            done = {row.url for row in db.query(PromoLeaflet).filter_by(status="done", parser=PARSER_VERSION)}
            queues = []
            for store in configured_stores():
                name = STORE_NAMES.get(store, store.capitalize())
                status.progress = f"{name}: lista gazetek"
                try:
                    leaflets = _store_leaflets(store)
                except FetchError as exc:
                    log.warning("Gazetki %s: %s", name, exc)
                    errors.append(f"{name}: {exc}")
                    continue
                new = [lf for lf in leaflets if lf.url not in done and not _expired(lf, today)
                       and not _skip(lf.title, lf.url)]
                queues.append(new[:MAX_NEW_LEAFLETS])
            # Na zmianę ze wszystkich sieci, żeby jedna z wieloma gazetkami nie blokowała reszty
            order = [lf for group in itertools.zip_longest(*queues) for lf in group if lf is not None]
            for number, leaflet in enumerate(order, 1):
                status.progress = f"{leaflet.store}: {leaflet.title} ({number}/{len(order)})"
                try:
                    products = _read(leaflet)
                except (FetchError, ai.AiError) as exc:
                    log.warning("Gazetka %s %s: %s", leaflet.store, leaflet.title, exc)
                    _save(db, leaflet, [], str(exc))
                    if isinstance(exc, ai.AiError):
                        errors.append(f"{leaflet.store}: {exc}")
                        return  # AI nie działa (np. limit) - spróbujemy przy następnym sprawdzeniu
                    continue
                _save(db, leaflet, products)
    except Exception as exc:  # błąd w naszym kodzie nie może zatrzymać wątku sprawdzania
        log.exception("Sprawdzanie gazetek")
        errors.append(f"Nieoczekiwany błąd: {exc}")
    finally:
        status.running, status.last_check, status.errors, status.progress = False, datetime.now(), errors, ""
        _lock.release()


# --- Nocne czytanie obrazków stron (ceny, których Blix nie podaje w tekście) ---

# Tyle stron najwyżej czyta AI w ciągu jednej nocy (darmowy limit Gemini jest też dla czatu i importu)
PAGES_PER_NIGHT = 50
# Godziny, w których czytamy strony (czas serwera)
NIGHT_HOURS = range(1, 6)
# Główne gazetki tygodnia - tylko je czytamy stronami (bez ogonków, jak zwraca fold)
MAIN_WORDS = ("od poniedzialku", "od czwartku", "oferta tygodnia", "gazetka tygodnia", "aktualna gazetka")


def blix_page_images(html: str, leaflet_id: str) -> list[str]:
    """Adresy obrazków kolejnych stron gazetki z HTML-a Blixa (imgproxy.blix.pl/image/leaflet/<id>/...)."""
    soup = BeautifulSoup(html, "html.parser")
    needle = f"/image/leaflet/{leaflet_id}/"
    found: dict[str, str] = {}
    for tag in soup.find_all(["img", "source"]):
        candidates = [tag.get("data-src"), tag.get("src")]
        srcset = tag.get("srcset") or tag.get("data-srcset") or ""
        candidates += [part.strip().split(" ")[0] for part in srcset.split(",")]
        for url in candidates:
            if url and needle in url:
                found.setdefault(url.split("?")[0], url)  # ta sama strona w kilku rozmiarach - raz
                break
    return list(found.values())


def _leaflet_id(url: str) -> str:
    match = re.search(r"/gazetka/(\d+)", url)
    return match.group(1) if match else ""


def _page_images(leaflet: PromoLeaflet, want: int) -> list[str]:
    """Obrazki stron gazetki; Blix pokazuje je partiami (?pageNumber=N), więc dociągamy, aż starczy."""
    leaflet_id = _leaflet_id(leaflet.url)
    html, _ = fetch_html(leaflet.url)
    images = blix_page_images(html, leaflet_id)
    number = 2
    while len(images) < want and number <= want + 5:
        try:
            html, _ = fetch_html(f"{leaflet.url}?pageNumber={number}")
        except FetchError:
            break
        new = [url for url in blix_page_images(html, leaflet_id) if url not in images]
        if not new:
            break
        images += new
        number += 1
    return images


def _main_leaflets(db: Session, today: date) -> list[list[PromoLeaflet]]:
    """Główne gazetki tygodnia z Blixa, pogrupowane na sieci (Lidl ma ceny w tekście)."""
    rows = [lf for lf in db.query(PromoLeaflet).filter_by(status="done")
            if "blix.pl" in lf.url and not _expired(lf, today) and any(w in fold(lf.title) for w in MAIN_WORDS)]
    stores: dict[str, list[PromoLeaflet]] = {}
    for row in sorted(rows, key=lambda lf: lf.valid_from or today):
        stores.setdefault(row.store, []).append(row)
    return list(stores.values())


def read_pages(limit: int = PAGES_PER_NIGHT) -> int:
    """Czyta obrazki stron głównych gazetek i dopisuje produkty z cenami. Zwraca liczbę przeczytanych stron."""
    if not _lock.acquire(blocking=False):
        return 0
    status.running, read = True, 0
    try:
        today = date.today()
        with SessionLocal() as db:
            queues = []
            for group in _main_leaflets(db, today):
                for leaflet in group:
                    done = {page.number for page in leaflet.pages}
                    try:
                        images = _page_images(leaflet, len(done) + limit)
                    except FetchError as exc:
                        log.warning("Strony gazetki %s %s: %s", leaflet.store, leaflet.title, exc)
                        continue
                    queues.append([(leaflet, n, url) for n, url in enumerate(images, 1) if n not in done])
            # Na zmianę ze wszystkich gazetek, żeby każda sieć dostała część nocnego limitu
            order = [item for group in itertools.zip_longest(*queues) for item in group if item is not None][:limit]
            for leaflet, number, url in order:
                status.progress = f"{leaflet.store}: strona {number} ({read + 1}/{len(order)})"
                try:
                    jpeg = image_for_ai(fetch_image(url))
                except (FetchError, OSError) as exc:
                    log.warning("Strona %s gazetki %s: %s", number, leaflet.title, exc)
                    leaflet.pages.append(PromoPage(number=number, status="failed"))
                    db.commit()
                    continue
                try:
                    products = ai.promotions_from_image(leaflet.store, leaflet.title, jpeg)
                except ai.AiError as exc:
                    log.warning("Strona %s gazetki %s: %s - kończę na tę noc", number, leaflet.title, exc)
                    break  # zwykle wyczerpany limit - dokończymy następnej nocy
                known = {p.name.lower(): p for p in leaflet.promotions}
                for product in products:
                    old = known.get(clean_name(product.name).lower())
                    if old is not None and old.image:
                        continue
                    image = crop_product(jpeg, product.box)
                    if old is None:
                        leaflet.promotions.append(_promotion(product, image))
                    else:  # znany już z tekstu - dokładamy zdjęcie i rabat
                        old.image = image
                        old.discount = old.discount or _promotion(product).discount
                leaflet.pages.append(PromoPage(number=number))
                db.commit()
                read += 1
    except Exception:
        log.exception("Czytanie stron gazetek")
    finally:
        status.running, status.progress = False, ""
        _lock.release()
    return read


def _night_loop() -> None:
    last_night = None
    while True:
        time.sleep(20 * 60)
        now = datetime.now()
        if now.hour in NIGHT_HOURS and last_night != now.date() and not status.running:
            read_pages()
            last_night = now.date()


def refresh_in_background() -> None:
    threading.Thread(target=refresh, name="promotions-refresh", daemon=True).start()


def _loop() -> None:
    time.sleep(FIRST_CHECK_SECONDS)
    while True:
        refresh()
        time.sleep(CHECK_EVERY_SECONDS)


def start_scheduler() -> None:
    settings = get_settings()
    if configured_stores() and settings.ai_enabled and settings.promo_auto_refresh:
        threading.Thread(target=_loop, name="promotions", daemon=True).start()
        if settings.promo_read_pages:
            threading.Thread(target=_night_loop, name="promotions-pages", daemon=True).start()


# --- Dopasowanie do przepisów ---

def matches(promo: str, needed: str) -> bool:
    """Czy produkt z promocji pasuje do składnika przepisu: 'ser żółty' ~ 'ser', 'mąka' ~ 'mąka pszenna'."""
    if not promo or not needed:
        return False
    return promo == needed or needed.startswith(promo + " ") or promo.startswith(needed + " ")


def current(db: Session) -> list[Promotion]:
    """Promocje z gazetek, które jeszcze obowiązują (także te od przyszłego tygodnia)."""
    today = date.today()
    rows = (
        db.query(Promotion).join(PromoLeaflet)
        .filter((PromoLeaflet.valid_to.is_(None)) | (PromoLeaflet.valid_to >= today))
        .all()
    )
    return sorted(rows, key=lambda p: (p.leaflet.store, p.ingredient, p.price))


def label(promo: Promotion) -> str:
    """Krótki opis na plakietkę, np. 'Lidl 2,49 zł'."""
    return f"{promo.leaflet.store} {promo.price}".strip()


def find_for(name: str, promos: list[Promotion]) -> Promotion | None:
    """Promocja na ten składnik (najpierw dokładnie ta sama nazwa)."""
    hits = [p for p in promos if matches(p.ingredient, name)]
    hits.sort(key=lambda p: p.ingredient != name)
    return hits[0] if hits else None
