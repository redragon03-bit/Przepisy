"""0.9.6: ulubione w promocjach (każda marka), dział po pełnej nazwie, prostokąt wymagany na zdjęciu strony."""

from datetime import date, timedelta

from app.database import SessionLocal
from app.models import PromoLeaflet, Promotion
from app.services import ai

TODAY = date.today()


def add_promos(*promos):
    with SessionLocal() as db:
        leaflet = PromoLeaflet(store="Biedronka", title="Gazetka", url="https://example.com/b", status="done",
                               valid_from=TODAY, valid_to=TODAY + timedelta(days=3))
        leaflet.promotions += list(promos)
        db.add(leaflet)
        db.commit()


def test_favorites_match_any_brand(client):
    add_promos(
        Promotion(name="Herbata czarna Lipton Yellow Label", ingredient="herbata czarna", price="9,99 zł", note=""),
        Promotion(name="Herbata ekspresowa Remsey", ingredient="herbata", price="5,99 zł", note=""),
        Promotion(name="Pieluchy Dada 4", category="dziecko", ingredient="", price="39,99 zł", note=""),
        Promotion(name="Kawa mielona", ingredient="kawa", price="19,99 zł", note=""),
    )
    assert client.put("/api/promotions/favorites/Herbata").json() == ["herbata"]
    assert client.put("/api/promotions/favorites/pieluchy dada 4").json() == ["herbata", "pieluchy dada 4"]
    items = {i["name"]: i for i in client.get("/api/promotions").json()}
    assert items["Herbata czarna Lipton Yellow Label"]["favorite"]
    assert items["Herbata ekspresowa Remsey"]["favorite"]
    assert items["Pieluchy Dada 4"]["favorite"] and items["Pieluchy Dada 4"]["key"] == "pieluchy dada 4"
    assert not items["Kawa mielona"]["favorite"]
    assert client.delete("/api/promotions/favorites/herbata").json() == ["pieluchy dada 4"]
    assert client.get("/api/promotions/favorites").json() == ["pieluchy dada 4"]


def test_aisle_from_full_name_first(client):
    add_promos(Promotion(name="Owoce mrożone w czekoladzie Marletto", ingredient="ananas", price="5,00 zł", note=""))
    assert client.get("/api/promotions").json()[0]["aisle"] == "Mrożonki"


def test_page_reading_requires_box(monkeypatch):
    seen = {}

    def ask(content, system, schema):
        seen["schema"] = schema
        return schema(products=[])

    monkeypatch.setattr(ai, "_ask_provider", ask)
    ai.promotions_from_image("Lidl", "Gazetka", b"jpeg")
    assert "box" in seen["schema"].model_json_schema()["$defs"]["AiPagePromotion"]["required"]
