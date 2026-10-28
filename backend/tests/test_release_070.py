"""Wydanie 0.7.0: limit prób hasła w nagłówku, porcje w planie, łączenie jednostek na liście zakupów,
kupione do spiżarni, łączenie podwójnych składników i powiadomienia z minutników."""

from app import auth
from app.services import ai, timer_notify
from app.services.ingredients import group_similar, similar


def make_recipe(client, title, lines, servings=""):
    body = {
        "title": title,
        "servings": servings,
        "ingredients": [{"text": t, "name": n, "amount": a, "unit": u} for t, n, a, u in lines],
        "steps": [{"text": "Gotuj."}],
    }
    return client.post("/api/recipes", json=body).json()


def test_header_password_is_rate_limited(client):
    client.cookies.clear()
    for _ in range(auth.MAX_FAILURES):
        assert client.get("/api/recipes", headers={"X-App-Password": "zle"}).status_code == 401
    # Po 5 złych próbach nawet dobre hasło jest odrzucane przez chwilę
    assert client.get("/api/recipes", headers={"X-App-Password": "tajne"}).status_code == 401
    auth._failures.clear()
    assert client.get("/api/recipes", headers={"X-App-Password": "tajne"}).status_code == 200


def test_plan_servings_and_no_double_shopping(client):
    recipe = make_recipe(client, "Gulasz", [("500 g wołowiny", "wołowina", 500, "g")], servings="4 porcje")
    entry = client.post("/api/plan", json={"day": "2026-10-20", "recipe_id": recipe["id"]}).json()
    assert entry["base_servings"] == 4 and entry["servings"] is None
    entry = client.patch(f"/api/plan/{entry['id']}", json={"servings": 6}).json()
    assert entry["servings"] == 6
    week = {"start": "2026-10-19", "end": "2026-10-25"}
    result = client.post("/api/shopping/from-plan", json=week).json()
    assert result["added"] == 1 and result["already"] == 0
    assert [i["text"] for i in client.get("/api/shopping").json()] == ["750 g wołowiny"]
    # Drugie stuknięcie nie podwaja ilości
    assert client.post("/api/shopping/from-plan", json=week).json() == {"added": 0, "skipped": [], "already": 1}
    assert [i["text"] for i in client.get("/api/shopping").json()] == ["750 g wołowiny"]
    # Po wyczyszczeniu całej listy plan można dodać jeszcze raz
    client.post("/api/shopping/clear", params={"only_checked": "false"})
    assert client.post("/api/shopping/from-plan", json=week).json()["added"] == 1


def test_shopping_merges_kg_and_g(client):
    a = make_recipe(client, "Placki", [("0,5 kg mąki", "mąka pszenna", 0.5, "kg")])
    b = make_recipe(client, "Pierogi", [("700 g mąki", "mąka pszenna", 700, "g")])
    client.post("/api/shopping/from-recipe", json={"recipe_id": a["id"]})
    client.post("/api/shopping/from-recipe", json={"recipe_id": b["id"]})
    assert [i["text"] for i in client.get("/api/shopping").json()] == ["1,2 kg mąka pszenna"]


def test_bought_items_go_to_pantry(client):
    recipe = make_recipe(client, "Jajecznica", [("3 jajka", "jajko", 3, "szt.")])
    client.post("/api/shopping/from-recipe", json={"recipe_id": recipe["id"]})
    item = client.get("/api/shopping").json()[0]
    client.patch(f"/api/shopping/{item['id']}", json={"checked": True})
    client.post("/api/shopping/clear")
    assert client.get("/api/pantry").json() == ["jajko"]


def test_similar_ingredient_names():
    assert similar("pomidor", "pomidory")
    assert similar("jajko", "jajka")
    assert similar("ser żółty", "sera żółtego") is False  # "sera"/"ser" za krótkie, żeby zgadywać
    assert not similar("ser", "serek")
    assert not similar("masło", "masa")
    assert not similar("mąka pszenna", "mąka")
    assert group_similar(["pomidor", "cebula", "pomidory", "cebuli"]) == [["pomidor", "pomidory"], ["cebula", "cebuli"]]


def test_find_and_merge_duplicates(client, monkeypatch):
    make_recipe(client, "Sałatka", [("2 pomidory", "pomidor", 2, "szt."), ("ziemniaki", "ziemniak", None, "")])
    make_recipe(client, "Zupa", [("3 pomidory", "pomidor", 3, "szt.")])
    make_recipe(client, "Sos", [("pomidory", "pomidory", None, ""), ("kartofle", "kartofel", None, "")])
    monkeypatch.setattr(ai.get_settings(), "gemini_api_key", "test")
    monkeypatch.setattr(ai, "find_duplicate_ingredients", lambda names: [["ziemniak", "kartofel"], ["nieznany", "pomidory"]])
    groups = client.get("/api/ingredients/duplicates").json()
    assert {(g["keep"], tuple(g["others"])) for g in groups} == {("pomidor", ("pomidory",)), ("kartofel", ("ziemniak",))}
    client.put("/api/pantry", json={"names": ["pomidory"]})
    assert client.post("/api/ingredients/merge", json={"keep": "pomidor", "others": ["pomidory"]}).status_code == 204
    assert client.get("/api/pantry").json() == ["pomidor"]
    found = client.get("/api/recipes", params={"ingredients": "pomidor"}).json()
    assert {r["title"] for r in found} == {"Sałatka", "Zupa", "Sos"}


def test_timer_notification(client, monkeypatch):
    sent = []
    monkeypatch.setattr(timer_notify.get_settings(), "ha_notify", "notify.mobile_app_iphone")
    monkeypatch.setattr(timer_notify.get_settings(), "ha_url", "http://ha")
    monkeypatch.setattr(timer_notify.get_settings(), "ha_token", "t")
    monkeypatch.setattr(timer_notify, "notify", sent.append)
    assert client.get("/api/auth/status").json()["notify_enabled"] is True
    assert client.post("/api/timers", json={"id": 1, "label": "Makaron", "seconds": 600}).status_code == 204
    assert 1 in timer_notify._timers
    client.delete("/api/timers/1")
    assert 1 not in timer_notify._timers
    timer_notify._fire(2, "Jajka")
    assert sent == ["Jajka"]
