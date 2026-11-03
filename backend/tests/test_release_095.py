"""0.9.5: promocje w działach sklepu, rabaty w % i wycinki produktów z gazetki."""

import io
from datetime import date, timedelta

from PIL import Image

from app.config import get_settings
from app.database import SessionLocal
from app.models import PromoLeaflet, Promotion
from app.services import promotions
from app.services.ai import AiPromotion

TODAY = date.today()
URL = "https://blix.pl/sklep/kaufland/gazetka/100/"


def page_jpeg() -> bytes:
    image = Image.new("RGB", (1000, 1400), "white")
    out = io.BytesIO()
    image.save(out, "JPEG")
    return out.getvalue()


def add_leaflet(*promos, url=URL, title="Od poniedziałku"):
    with SessionLocal() as db:
        leaflet = PromoLeaflet(store="Kaufland", title=title, url=url, status="done", valid_from=TODAY,
                               valid_to=TODAY + timedelta(days=3), parser=promotions.PARSER_VERSION)
        leaflet.promotions += list(promos)
        db.add(leaflet)
        db.commit()


def test_clean_name_and_discount():
    assert promotions.clean_name("Półbagietka graham pełnoziarnista 1,49 zł") == "Półbagietka graham pełnoziarnista"
    assert promotions.clean_name("Masło 200 g") == "Masło 200 g"
    assert promotions.discount_of(Promotion(note="-30% z kartą", price="2,49 zł", discount=0)) == 30
    assert promotions.discount_of(Promotion(note="", price="2,49 zł", discount=25)) == 25
    assert promotions.discount_of(Promotion(note="2+1 gratis", price="2,49 zł", discount=0)) == 0


def test_crop_product_saves_small_jpeg(client):
    name = promotions.crop_product(page_jpeg(), [100, 100, 500, 600])
    crop = Image.open(get_settings().promo_dir / name)
    assert max(crop.size) <= promotions.CROP_SIZE
    assert promotions.crop_product(page_jpeg(), [100, 100, 105, 600]) == ""  # za mały
    assert promotions.crop_product(page_jpeg(), []) == ""


def test_list_has_aisles_discount_and_no_repeats(client):
    add_leaflet(
        Promotion(name="Schab bez kości", ingredient="schab", price="10,99 zł/kg", note="-35%"),
        Promotion(name="Banany", ingredient="banan", price="2,99 zł", note=""),
        Promotion(name="Pieluchy Dada", category="dziecko", ingredient="", price="39,99 zł", note=""),
        Promotion(name="Płyn do naczyń Ludwik", category="czystosc", ingredient="", price="5,99 zł", note=""),
    )
    add_leaflet(Promotion(name="Banany", ingredient="banan", price="2,99 zł", note=""),
                url="https://blix.pl/sklep/kaufland/gazetka/101/", title="Owoce")
    items = {i["name"]: i for i in client.get("/api/promotions").json()}
    assert len(items) == 4  # banany z dwóch gazetek raz
    assert items["Schab bez kości"]["aisle"] == "Mięso i ryby" and items["Schab bez kości"]["discount"] == 35
    assert items["Banany"]["aisle"] == "Warzywa i owoce"
    assert items["Pieluchy Dada"]["aisle"] == "Dla dziecka"
    assert items["Płyn do naczyń Ludwik"]["aisle"] == "Chemia i dom"
    assert items["Pieluchy Dada"]["aisle_order"] > items["Płyn do naczyń Ludwik"]["aisle_order"]
    assert items["Banany"]["image_url"] == ""


def test_read_pages_adds_crop_to_product_known_from_text(client, monkeypatch):
    add_leaflet(Promotion(name="Schab bez kości", ingredient="schab", price="10,99 zł/kg", note=""))
    html = '<img src="https://imgproxy.blix.pl/image/leaflet/100/p1.jpg?bucket=800">'
    monkeypatch.setattr(promotions, "fetch_html", lambda url: (html, url))
    monkeypatch.setattr(promotions, "fetch_image", lambda url: page_jpeg())
    monkeypatch.setattr(promotions, "image_for_ai", lambda data: data)
    monkeypatch.setattr(promotions.ai, "promotions_from_image", lambda store, title, jpeg: [
        AiPromotion(name="Schab bez kości 10,99 zł", category="jedzenie", ingredient="schab", price="10,99 zł/kg",
                    note="", discount=35, box=[100, 100, 500, 600]),
        AiPromotion(name="Karkówka", category="jedzenie", ingredient="karkówka", price="12,99 zł/kg", note="",
                    box=[500, 100, 900, 600]),
    ])
    assert promotions.read_pages(limit=1) == 1
    items = {i["name"]: i for i in client.get("/api/promotions").json()}
    assert set(items) == {"Schab bez kości", "Karkówka"}
    schab = items["Schab bez kości"]
    assert schab["image_url"] and schab["discount"] == 35
    response = client.get(schab["image_url"])
    assert response.status_code == 200 and response.headers["content-type"] == "image/jpeg"

    # Gazetka czytana od nowa - stare wycinki znikają z dysku
    with SessionLocal() as db:
        files = [p.image for p in db.query(Promotion) if p.image]
    leaflet = promotions.Leaflet(store="Kaufland", title="Od poniedziałku", url=URL, valid_from=TODAY,
                                 valid_to=TODAY + timedelta(days=3))
    with SessionLocal() as db:
        promotions._save(db, leaflet, [])
    assert files and not any((get_settings().promo_dir / f).exists() for f in files)


def test_image_404_without_crop(client):
    add_leaflet(Promotion(name="Banany", ingredient="banan", price="2,99 zł", note=""))
    promo = client.get("/api/promotions").json()[0]
    assert client.get(f"/api/promotions/{promo['id']}/image").status_code == 404
