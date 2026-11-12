"""0.16.0: spiżarnia obok zakupów (odhaczone = w domu, dopisane = nie ma) i paragon przez AI."""

import time

import pytest

from app.services import ai, receipts
from tests.test_api import make_recipe
from tests.test_improvements import home_assistant  # noqa: F401 - fixture
from tests.test_release_0110 import brother  # noqa: F401 - fixture


def pantry(client) -> list[str]:
    return client.get("/api/pantry").json()


def test_checked_item_goes_to_pantry_and_unchecking_takes_it_back(client):
    milk = client.post("/api/shopping", json={"text": "mleko 2 l"}).json()
    client.patch(f"/api/shopping/{milk['id']}", json={"checked": True})
    assert pantry(client) == ["mleko"]
    # Pomyłka - odznaczenie zabiera produkt ze spiżarni
    client.patch(f"/api/shopping/{milk['id']}", json={"checked": False})
    assert pantry(client) == []


def test_only_food_goes_to_pantry(client):
    for text in ["papier do pieczenia", "baterie AA", "2 l mleka"]:
        item = client.post("/api/shopping", json={"text": text}).json()
        client.patch(f"/api/shopping/{item['id']}", json={"checked": True})
    # Chemia i nieznane rzeczy spoza jedzenia zostają tylko na liście; bez składnika "mleko" w bazie zostaje "mleka"
    assert pantry(client) == ["mleka"]


def test_written_form_matches_existing_ingredient(client):
    make_recipe(client, "Naleśniki", ["mleko", "jajko"])
    item = client.post("/api/shopping", json={"text": "2 l mleka"}).json()
    client.patch(f"/api/shopping/{item['id']}", json={"checked": True})
    assert pantry(client) == ["mleko"]


def test_adding_to_shopping_list_removes_from_pantry(client):
    client.put("/api/pantry", json={"names": ["mleko", "jajko"]})
    client.post("/api/shopping", json={"text": "mleko"})
    assert pantry(client) == ["jajko"]


def test_recipe_item_goes_to_pantry_on_check_and_clear_keeps_it(client):
    recipe = make_recipe(client, "Jajecznica", ["jajko", "masło"])
    client.post("/api/shopping/from-recipe", json={"recipe_id": recipe["id"]})
    eggs = next(i for i in client.get("/api/shopping").json() if "jajko" in i["text"])
    client.patch(f"/api/shopping/{eggs['id']}", json={"checked": True})
    assert pantry(client) == ["jajko"]
    client.post("/api/shopping/clear")
    assert pantry(client) == ["jajko"]
    assert [i["text"] for i in client.get("/api/shopping").json()] == ["masło"]


def test_home_assistant_check_and_add_update_pantry(client, home_assistant):  # noqa: F811
    client.put("/api/pantry", json={"names": ["masło"]})
    client.post("/api/shopping", json={"text": "chleb"})
    client.post("/api/shopping/send-to-ha")
    home_assistant.items[0]["status"] = "completed"
    home_assistant.items.append({"summary": "masło", "status": "needs_action"})
    client.post("/api/shopping/sync")
    assert pantry(client) == ["chleb"]


def test_pantry_items_have_aisles_and_add_remove(client):
    items = client.post("/api/pantry/add", json={"names": ["Pomidor", "mleko"]}).json()
    assert {i["name"]: i["aisle"] for i in items} == {"mleko": "Nabiał i jajka", "pomidor": "Warzywa i owoce"}
    items = client.post("/api/pantry/remove", json={"names": ["pomidor"]}).json()
    assert [i["name"] for i in items] == ["mleko"]


def test_pantry_rules_are_personal(client, brother):  # noqa: F811
    item = brother.post("/api/shopping", json={"text": "jogurt"}).json()
    brother.patch(f"/api/shopping/{item['id']}", json={"checked": True})
    assert pantry(brother) == ["jogurt"] and pantry(client) == []


@pytest.fixture
def receipt_ai(monkeypatch):
    from app import config

    monkeypatch.setattr(config.Settings, "ai_enabled", property(lambda self: True))
    seen = {}

    def fake(jpegs, hints=""):
        seen.update(count=len(jpegs), hints=hints)
        return ai.AiReceipt(store="Biedronka", items=[
            ai.AiReceiptLine(raw="SER GOUDA PLAST 150G", name="ser gouda", amount=150, unit="G", food=True, days=14),
            ai.AiReceiptLine(raw="POMIDOR LUZ", name="pomidory", amount=0.512, unit="kg", food=True, days=5),
            ai.AiReceiptLine(raw="PLYN DO NACZYN", name="płyn do naczyń", amount=None, unit="", food=False,
                             days=None),
        ])

    monkeypatch.setattr(ai, "receipt_from_images", fake)
    monkeypatch.setattr(receipts, "image_for_ai", lambda data: data)
    return seen


def scan(client) -> dict:
    started = client.post("/api/receipts", files=[("files", ("p.jpg", b"jpeg", "image/jpeg"))])
    assert started.status_code == 202, started.text
    for _ in range(50):
        result = client.get(f"/api/receipts/{started.json()['id']}").json()
        if result["status"] != "running":
            return result
        time.sleep(0.05)
    raise AssertionError("odczyt nie skończył się")


def test_receipts_are_off_by_default_and_per_account(client, brother, receipt_ai):  # noqa: F811
    assert client.get("/api/receipts/settings").json()["enabled"] is False
    assert client.post("/api/receipts", files=[("files", ("p.jpg", b"x", "image/jpeg"))]).status_code == 400
    client.put("/api/receipts/settings", json={"enabled": True})
    assert client.get("/api/receipts/settings").json()["enabled"] is True
    assert brother.get("/api/receipts/settings").json()["enabled"] is False


def test_receipt_scan_review_and_apply(client, receipt_ai):
    make_recipe(client, "Sałatka", ["pomidor"])
    client.put("/api/receipts/settings", json={"enabled": True})
    result = scan(client)
    assert result["status"] == "done" and result["store"] == "Biedronka"
    lines = {line["raw"]: line for line in result["items"]}
    # "pomidory" od AI = istniejący składnik "pomidor"; jednostka znormalizowana
    assert lines["POMIDOR LUZ"]["name"] == "pomidor" and lines["POMIDOR LUZ"]["known"]
    assert lines["SER GOUDA PLAST 150G"]["unit"] == "g"
    assert not lines["PLYN DO NACZYN"]["food"]

    # Użytkownik poprawia nazwę sera i odznacza płyn
    applied = client.post("/api/receipts/apply", json={"store": "Biedronka", "items": [
        {"raw": "SER GOUDA PLAST 150G", "name": "ser żółty", "expires": "2030-01-01"},
        {"raw": "POMIDOR LUZ", "name": "pomidor"},
    ]}).json()
    assert {i["name"]: i["expires"] for i in applied} == {"ser żółty": "2030-01-01", "pomidor": None}

    # Następny paragon: zapamiętana nazwa wygrywa, a AI dostaje ją jako podpowiedź
    again = {line["raw"]: line for line in scan(client)["items"]}
    assert again["SER GOUDA PLAST 150G"]["name"] == "ser żółty" and again["SER GOUDA PLAST 150G"]["known"]
    assert "ser żółty" in receipt_ai["hints"]
    assert client.get("/api/receipts/settings").json()["used_today"] == 2


def test_receipt_daily_limit(client, receipt_ai, monkeypatch):
    client.put("/api/receipts/settings", json={"enabled": True})
    monkeypatch.setattr(receipts, "DAILY_LIMIT", 1)
    scan(client)
    r = client.post("/api/receipts", files=[("files", ("p.jpg", b"x", "image/jpeg"))])
    assert r.status_code == 429


def test_receipt_ai_error_is_shown(client, receipt_ai, monkeypatch):
    client.put("/api/receipts/settings", json={"enabled": True})

    def broken(jpegs, hints=""):
        raise ai.AiError("Gemini: limit")

    monkeypatch.setattr(ai, "receipt_from_images", broken)
    result = scan(client)
    assert result["status"] == "failed" and "limit" in result["error"]
