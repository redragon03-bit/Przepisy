"""0.9.3-0.9.4: wybór sklepu w "Z promocji" (promocja na składnik w każdym sklepie) i promocje w czacie."""

from datetime import date, timedelta

from app.database import SessionLocal
from app.models import PromoLeaflet, Promotion
from app.services import ai

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


def ask_chat(client, monkeypatch, text):
    seen = {}

    def fake_chat(context, conversation):
        seen["context"] = context
        return ai.ChatAnswer(text="Schab!", recipe_ids=[], new_recipe=None)

    monkeypatch.setattr(ai, "chat", fake_chat)
    client.post("/api/chat", json={"messages": [{"role": "user", "text": text}]})
    return seen["context"]


def test_chat_sees_promotions_of_named_store(client, monkeypatch):
    add_promo("Kaufland", "Schab bez kości", "schab", "13,99 zł/kg")
    add_promo("Lidl", "Udo z kurczaka", "udo z kurczaka", "9,99 zł/kg")
    context = ask_chat(client, monkeypatch, "Zaproponuj obiad z mięsa z promocji z Kauflandu")
    assert "schab: Schab bez kości - Kaufland 13,99 zł/kg" in context
    assert "Udo z kurczaka" not in context
    # O promocje bez sklepu - wszystkie sklepy
    assert "Udo z kurczaka" in ask_chat(client, monkeypatch, "Co dobrego jest w promocji?")
    # Zwykłe pytanie - bez listy promocji (darmowe limity AI)
    assert "w promocji" not in ask_chat(client, monkeypatch, "Mam ochotę na coś słodkiego")
