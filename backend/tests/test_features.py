"""Ulubione, lista zakupów, plan posiłków, duplikaty."""

import httpx

from app.services import fetcher, shopping
from app.services.shopping import format_amount, scale_text


def make_recipe(client, title, lines):
    """lines: [(tekst, nazwa, ilość, jednostka)]"""
    body = {
        "title": title,
        "servings": "4 porcje",
        "ingredients": [{"text": t, "name": n, "amount": a, "unit": u} for t, n, a, u in lines],
        "steps": [{"text": "Wymieszaj."}],
    }
    return client.post("/api/recipes", json=body).json()


def test_scale_text():
    assert scale_text("200 g mąki pszennej", 200, 1.5) == "300 g mąki pszennej"
    assert scale_text("1,5 łyżki cukru", 1.5, 2) == "3 łyżki cukru"
    assert scale_text("szczypta soli", None, 2) == "szczypta soli"
    assert scale_text("jajka rozmiar L", 2, 2) == "jajka rozmiar L (×2)"
    assert format_amount(0.333) == "0,33"


def test_favorite_rating_cooked(client):
    recipe = make_recipe(client, "Placki", [("2 jajka", "jajko", 2, "szt.")])
    patched = client.patch(f"/api/recipes/{recipe['id']}", json={"favorite": True, "rating": 4}).json()
    assert patched["favorite"] and patched["rating"] == 4
    assert client.patch(f"/api/recipes/{recipe['id']}", json={"rating": 0}).json()["rating"] is None
    cooked = client.post(f"/api/recipes/{recipe['id']}/cooked").json()
    assert cooked["cooked_count"] == 1 and cooked["last_cooked_at"]
    make_recipe(client, "Zupa", [])
    assert [r["title"] for r in client.get("/api/recipes", params={"favorite": True}).json()] == ["Placki"]


def test_shopping_merges_same_ingredient(client):
    a = make_recipe(client, "Naleśniki", [("200 g mąki", "mąka pszenna", 200, "g"), ("szczypta soli", "sól", None, "")])
    b = make_recipe(client, "Pierogi", [("300 g mąki", "mąka pszenna", 300, "g"), ("1 cebula", "cebula", 1, "szt.")])
    client.post("/api/shopping/from-recipe", json={"recipe_id": a["id"], "factor": 2})
    client.post("/api/shopping/from-recipe", json={"recipe_id": b["id"]})
    items = client.get("/api/shopping").json()
    # Sól jest "zawsze w domu", więc jej nie ma; mąka zsumowana: 2 x 200 + 300
    assert [i["text"] for i in items] == ["700 g mąka pszenna", "1 cebula"]
    assert items[0]["recipes"] == "Naleśniki, Pierogi"

    client.patch(f"/api/shopping/{items[1]['id']}", json={"checked": True})
    client.post("/api/shopping", json={"text": "papier do pieczenia"})
    client.post("/api/shopping/clear")
    assert [i["text"] for i in client.get("/api/shopping").json()] == ["700 g mąka pszenna", "papier do pieczenia"]


def test_plan_to_shopping(client):
    recipe = make_recipe(client, "Gulasz", [("500 g wołowiny", "wołowina", 500, "g")])
    entry = client.post("/api/plan", json={"day": "2026-10-20", "recipe_id": recipe["id"]}).json()
    assert entry["recipe"]["title"] == "Gulasz"
    client.post("/api/plan", json={"day": "2026-11-20", "recipe_id": recipe["id"]})
    week = client.get("/api/plan", params={"start": "2026-10-19", "end": "2026-10-25"}).json()
    assert [e["day"] for e in week] == ["2026-10-20"]
    client.post("/api/shopping/from-plan", json={"start": "2026-10-19", "end": "2026-10-25"})
    assert [i["text"] for i in client.get("/api/shopping").json()] == ["500 g wołowiny"]
    assert client.delete(f"/api/plan/{entry['id']}").status_code == 204


def test_send_to_home_assistant(client, monkeypatch):
    settings = shopping.get_settings()
    monkeypatch.setattr(settings, "ha_url", "http://ha.local:8123")
    monkeypatch.setattr(settings, "ha_token", "token")
    assert client.get("/api/auth/status").json()["ha_enabled"]
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append((str(request.url), request.headers["authorization"], request.read()))
        return httpx.Response(200, json=[])

    real_client = httpx.Client
    monkeypatch.setattr(shopping.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    client.post("/api/shopping", json={"text": "masło"})
    assert client.post("/api/shopping/send-to-ha").json()["added"] == 1
    url, auth, body = sent[0]
    assert url == "http://ha.local:8123/api/services/todo/add_item"
    assert auth == "Bearer token"
    assert b'"todo.shopping_list"' in body and "masło".encode() in body


def test_duplicate_url_import(client, monkeypatch):
    client.post("/api/recipes", json={"title": "Placki", "source_url": "https://example.com/placki"})
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: ("<html></html>", url))
    job = client.post("/api/imports/url", json={"url": "https://example.com/placki"}).json()
    assert job["status"] == "duplicate" and "Placki" in job["error"]
    job = client.post("/api/imports/url", json={"url": "https://example.com/placki", "force": True}).json()
    assert job["status"] != "duplicate"
