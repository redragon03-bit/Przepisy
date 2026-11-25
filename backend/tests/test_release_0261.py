"""0.26.1: ostrzejsze zdjęcia - pełne wersje zamiast miniatur, oznaczenie i poprawa rozmazanych."""

import io

from PIL import Image, ImageDraw

from app.config import get_settings
from app.services import fetcher, image_search, images
from app.services.scraper import read_page
from app.services.video import _best_thumbnail


def picture(width: int, height: int, color=(30, 140, 60)) -> bytes:
    """Zdjęcie z wyraźnym wzorem, żeby odcisk różnych zdjęć się różnił."""
    image = Image.new("RGB", (width, height), (240, 230, 210))
    draw = ImageDraw.Draw(image)
    draw.ellipse((width * 0.2, height * 0.1, width * 0.7, height * 0.8), fill=color)
    draw.rectangle((0, height * 0.85, width, height), fill=(60, 40, 30))
    out = io.BytesIO()
    image.save(out, "JPEG", quality=90)
    return out.getvalue()


def test_bigger_variants_of_thumbnail_urls():
    assert images.bigger_variants("https://blog.pl/wp-content/chia-300x200.jpg") == [
        "https://blog.pl/wp-content/chia.jpg", "https://blog.pl/wp-content/chia-300x200.jpg"]
    assert images.bigger_variants("https://i0.wp.com/a.pl/x.jpg?resize=300%2C200&ssl=1")[0] == (
        "https://i0.wp.com/a.pl/x.jpg?ssl=1")
    assert images.bigger_variants("https://bp.blogspot.com/a/s320/chia.jpg")[0] == (
        "https://bp.blogspot.com/a/s1600/chia.jpg")
    assert images.bigger_variants("https://x.pl/full.jpg") == ["https://x.pl/full.jpg"]


def test_fetch_best_prefers_full_size(monkeypatch):
    sizes = {"https://b.pl/chia.jpg": picture(1200, 800), "https://b.pl/chia-300x200.jpg": picture(300, 200)}
    monkeypatch.setattr(fetcher, "fetch_image", lambda url: sizes[url])
    assert images.image_width(images.fetch_best("https://b.pl/chia-300x200.jpg")) == 1200


def test_fetch_best_keeps_thumbnail_when_full_size_missing(monkeypatch):
    def fake(url):
        if "300x200" not in url:
            raise fetcher.FetchError("404")
        return picture(300, 200)

    monkeypatch.setattr(fetcher, "fetch_image", fake)
    assert images.image_width(images.fetch_best("https://b.pl/chia-300x200.jpg")) == 300


def test_scraper_takes_largest_srcset_and_structured_image_first():
    html = """<html><head>
    <script type="application/ld+json">{"@context": "https://schema.org", "@type": "Recipe", "name": "Chia", "image": "https://b.pl/full.jpg"}</script>
    <meta property="og:image" content="https://b.pl/og.jpg"></head><body>
    <img src="https://b.pl/a-300x200.jpg" srcset="https://b.pl/a-300x200.jpg 300w, https://b.pl/a-1024x683.jpg 1024w">
    <img data-src="https://b.pl/lazy.jpg" src="data:image/gif;base64,R0">
    </body></html>"""
    page = read_page(html, "https://b.pl/chia")
    assert page.image_urls == ["https://b.pl/full.jpg", "https://b.pl/og.jpg",
                               "https://b.pl/a-1024x683.jpg", "https://b.pl/lazy.jpg"]


def test_video_takes_largest_thumbnail():
    info = {"thumbnail": "https://t/small.jpg", "thumbnails": [
        {"url": "https://t/big.jpg", "width": 1080, "height": 1920},
        {"url": "https://t/small.jpg", "width": 240, "height": 426},
        {"url": "https://t/nosize.jpg"},
    ]}
    assert _best_thumbnail(info) == "https://t/big.jpg"
    assert _best_thumbnail({"thumbnail": "https://t/only.jpg"}) == "https://t/only.jpg"


def test_same_picture_detects_resized_copy_only():
    small, big = picture(320, 240), picture(1280, 960)
    other = picture(1280, 960, color=(200, 30, 30))
    assert images.same_picture(small, big)
    assert not images.same_picture(small, other)
    assert not images.same_picture(small, picture(1280, 600))  # inne proporcje


def _recipe_with_image(client, data: bytes, source_url: str = "https://blog.pl/chia") -> dict:
    recipe = client.post("/api/recipes", json={"title": "Chmurka z chia", "source_url": source_url}).json()
    filename = images.save_image_bytes(data)
    from app.database import SessionLocal
    from app.models import Recipe

    with SessionLocal() as db:
        db.get(Recipe, recipe["id"]).image = filename
        db.commit()
    return recipe


def test_low_res_flag_and_upgrade_from_source(client, monkeypatch):
    recipe = _recipe_with_image(client, picture(320, 240))
    assert client.get(f"/api/recipes/{recipe['id']}").json()["image_low_res"] is True
    assert client.get("/api/recipes/image-upgrade").json()["low_res"] == 1

    page = '<html><head><meta property="og:image" content="https://blog.pl/other.jpg"></head><body>' \
           '<img src="https://blog.pl/chia.jpg"></body></html>'
    files = {"https://blog.pl/other.jpg": picture(1280, 960, color=(200, 30, 30)),
             "https://blog.pl/chia.jpg": picture(1280, 960)}
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: (page, url))
    monkeypatch.setattr(fetcher, "fetch_image", lambda url: files[url])
    client.post("/api/recipes/image-upgrade")  # TestClient wykonuje zadanie w tle od razu
    status = client.get("/api/recipes/image-upgrade").json()
    assert status["improved"] == 1 and status["low_res"] == 0 and not status["running"]
    detail = client.get(f"/api/recipes/{recipe['id']}").json()
    assert detail["image_low_res"] is False
    assert images.size(detail["image_url"].rsplit("/", 1)[1]) == 1280


def test_upgrade_never_swaps_for_a_different_photo(client, monkeypatch):
    recipe = _recipe_with_image(client, picture(320, 240))
    page = '<html><head><meta property="og:image" content="https://blog.pl/other.jpg"></head></html>'
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: (page, url))
    monkeypatch.setattr(fetcher, "fetch_image", lambda url: picture(1280, 960, color=(200, 30, 30)))
    before = client.get(f"/api/recipes/{recipe['id']}").json()["image_url"]
    client.post("/api/recipes/image-upgrade")
    assert client.get("/api/recipes/image-upgrade").json()["improved"] == 0
    assert client.get(f"/api/recipes/{recipe['id']}").json()["image_url"] == before
    assert (get_settings().images_dir / before.rsplit("/", 1)[1]).exists()


def test_blurry_candidates_go_last(client, monkeypatch):
    pages = {"https://a.pl/1": ("https://a.pl/small.jpg", 300), "https://b.pl/2": ("https://b.pl/big.jpg", 1200)}
    monkeypatch.setattr(image_search.web_search, "search_pages", lambda q: list(pages))
    monkeypatch.setattr(image_search, "_page_image", lambda url: pages[url])
    monkeypatch.setattr(image_search, "_openverse", lambda q, limit, page=1: ["https://ov.pl/1.jpg"])
    recipe = client.post("/api/recipes", json={"title": "Sernik"}).json()
    found = client.get(f"/api/recipes/{recipe['id']}/image-candidates").json()
    assert found == ["https://b.pl/big.jpg", "https://ov.pl/1.jpg", "https://a.pl/small.jpg"]
