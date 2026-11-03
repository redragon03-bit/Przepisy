"""0.9.2: ceny z obrazków stron gazetki (nocą) i tylko jedzenie, pieluchy i środki czystości."""

from datetime import date, timedelta

from app.database import SessionLocal
from app.models import PromoLeaflet, Promotion
from app.services import ai, promotions
from app.services.ai import AiPromotion

TODAY = date.today()
URL = "https://blix.pl/sklep/biedronka/gazetka/100/"


def page_html(numbers):
    imgs = "".join(
        f'<img data-src="https://imgproxy.blix.pl/image/leaflet/100/p{n}.jpg?ext=webp&bucket=800" '
        f'srcset="https://imgproxy.blix.pl/image/leaflet/100/p{n}.jpg?bucket=400 400w">' for n in numbers)
    return f'<html><body>{imgs}<img src="https://imgproxy.blix.pl/image/leaflet/999/x.jpg"></body></html>'


def test_blix_page_images_once_per_page_and_only_this_leaflet():
    urls = promotions.blix_page_images(page_html([1, 2]), "100")
    assert urls == ["https://imgproxy.blix.pl/image/leaflet/100/p1.jpg?ext=webp&bucket=800",
                    "https://imgproxy.blix.pl/image/leaflet/100/p2.jpg?ext=webp&bucket=800"]


def test_clean_promotions_keeps_priced_and_clears_ingredient_for_non_food():
    found = [
        AiPromotion(name=" Masło ", category="jedzenie", ingredient="Masło", price="2,49 zł", note=""),
        AiPromotion(name="Olej", category="jedzenie", ingredient="olej", price="", note=""),
        AiPromotion(name="Pieluchy Dada 4", category="dziecko", ingredient="pieluchy", price="39,99 zł", note=""),
    ]
    products = {}
    ai._clean_promotions(found, products)
    assert [(p.name, p.category, p.ingredient) for p in products.values()] == [
        ("Masło", "jedzenie", "masło"), ("Pieluchy Dada 4", "dziecko", "")]


def add_leaflet(title="Od poniedziałku", store="Biedronka", url=URL, butter=True):
    with SessionLocal() as db:
        leaflet = PromoLeaflet(store=store, title=title, url=url, valid_from=TODAY - timedelta(days=1),
                               valid_to=TODAY + timedelta(days=4), status="done", parser=promotions.PARSER_VERSION)
        if butter:
            leaflet.promotions.append(Promotion(name="Masło ekstra", ingredient="masło", price="2,49 zł", note=""))
        db.add(leaflet)
        db.commit()


def fake_pages(monkeypatch, read, fail_at=None):
    monkeypatch.setattr(promotions, "fetch_html",
                        lambda url: (page_html([1, 2]) if "pageNumber" not in url else page_html([3]), url))
    monkeypatch.setattr(promotions, "fetch_image", lambda url: url.encode())
    monkeypatch.setattr(promotions, "image_for_ai", lambda data: data)

    def from_image(store, title, jpeg):
        read.append(jpeg.decode())
        if fail_at is not None and len(read) == fail_at:
            raise ai.AiError("429")
        n = len(read)
        return [AiPromotion(name="Masło ekstra", category="jedzenie", ingredient="masło", price="2,49 zł", note=""),
                AiPromotion(name=f"Płyn do naczyń {n}", category="czystosc", ingredient="", price="4,99 zł",
                            note="")]

    monkeypatch.setattr(promotions.ai, "promotions_from_image", from_image)


def test_read_pages_adds_priced_products_and_remembers_pages(client, monkeypatch):
    add_leaflet()
    add_leaflet(title="Katalog domowy", url="https://blix.pl/sklep/biedronka/gazetka/101/", butter=False)  # nie główna
    read = []
    fake_pages(monkeypatch, read)

    assert promotions.read_pages(limit=2) == 2
    assert [u.split("/")[-1].split("?")[0] for u in read] == ["p1.jpg", "p2.jpg"]
    items = client.get("/api/promotions").json()
    # Masło było już z tekstu - nie dublujemy; płyny z kategorią czystość i bez składnika
    assert sorted((i["name"], i["category"], i["ingredient"]) for i in items) == [
        ("Masło ekstra", "jedzenie", "masło"), ("Płyn do naczyń 1", "czystosc", ""),
        ("Płyn do naczyń 2", "czystosc", "")]

    # Następnej nocy tylko nowe strony (3. z kolejnej partii)
    read.clear()
    assert promotions.read_pages(limit=5) == 1
    assert read[0].endswith("p3.jpg?ext=webp&bucket=800")


def test_read_pages_stops_on_ai_error_and_retries_page(client, monkeypatch):
    add_leaflet()
    read = []
    fake_pages(monkeypatch, read, fail_at=2)
    assert promotions.read_pages(limit=5) == 1
    read.clear()
    fake_pages(monkeypatch, read)
    assert promotions.read_pages(limit=5) == 2  # strona 2 jeszcze raz i strona 3
    assert not promotions.status.running


def test_non_food_promo_goes_to_shopping_by_name(client):
    add_leaflet()
    with SessionLocal() as db:
        leaflet = db.query(PromoLeaflet).one()
        leaflet.promotions.append(Promotion(name="Pieluchy Dada 4", category="dziecko", ingredient="",
                                            price="39,99 zł", note=""))
        db.commit()
    promo = next(p for p in client.get("/api/promotions").json() if p["category"] == "dziecko")
    item = client.post(f"/api/promotions/{promo['id']}/shopping").json()
    assert item["text"] == "Pieluchy Dada 4 (Biedronka 39,99 zł)"
    # Przepisy i pomysły tylko z jedzenia
    assert client.get("/api/promotions/recipes").json() == []
