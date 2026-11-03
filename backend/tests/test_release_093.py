"""0.9.3: wybór sklepu w sekcji "Z promocji" - promocja na składnik w każdym sklepie osobno."""

from datetime import date, timedelta

from app.database import SessionLocal
from app.models import PromoLeaflet, Promotion

TODAY = date.today()


def add_promo(store, name, ingredient, price):
    with SessionLocal() as db:
        leaflet = PromoLeaflet(store=store, title="Gazetka", url=f"https://example.com/{store}", status="done",
                               valid_from=TODAY, valid_to=TODAY + timedelta(days=3))
        leaflet.promotions.append(Promotion(name=name, ingredient=ingredient, price=price, note=""))
        db.add(leaflet)
        db.commit()


def test_promo_recipes_list_each_store(client):
    add_promo("Biedronka", "Cebula", "cebula", "1,99 zł")
    add_promo("Lidl", "Cebula żółta", "cebula", "1,79 zł")
    client.post("/api/recipes", json={"title": "Zupa cebulowa", "ingredients": [{"text": "cebula", "name": "cebula"}]})
    client.post("/api/recipes", json={"title": "Placki", "ingredients": [{"text": "jajko", "name": "jajko"}]})
    found = client.get("/api/promotions/recipes").json()
    assert [m["recipe"]["title"] for m in found] == ["Zupa cebulowa"]
    assert {(p["store"], p["label"]) for p in found[0]["promos"]} == {
        ("Biedronka", "Biedronka 1,99 zł"), ("Lidl", "Lidl 1,79 zł")}
