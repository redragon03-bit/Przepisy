"""0.11.0: konta domowników - wspólne przepisy, osobna kuchnia (plan, zakupy, spiżarnia, ulubione, oceny)."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_api import make_recipe


@pytest.fixture
def brother(client):
    """Drugi klient zalogowany jako domownik "Naszman" (właściciel: `client`)."""
    assert client.post("/api/auth/accounts", json={"name": "Naszman", "password": "brat123"}).status_code == 201
    other = TestClient(app)
    assert other.post("/api/auth/login", json={"name": "naszman", "password": "brat123"}).status_code == 204
    return other


def test_status_and_accounts(client, brother):
    me = client.get("/api/auth/status").json()
    assert me["is_owner"] and me["user_name"] == "Właściciel"
    him = brother.get("/api/auth/status").json()
    assert him["authenticated"] and not him["is_owner"] and him["user_name"] == "Naszman"
    assert not him["ha_enabled"] and not him["notify_enabled"]
    names = [a["name"] for a in client.get("/api/auth/accounts").json()]
    assert names == ["Właściciel", "Naszman"]
    # Domownik nie zarządza kontami ani kopiami
    assert brother.get("/api/auth/accounts").status_code == 403
    assert brother.get("/api/backups").status_code == 403
    assert brother.post("/api/shopping/send-to-ha").status_code == 403
    assert brother.get("/api/calendar/link").status_code == 403


def test_owner_rename_and_login_by_name(client):
    accounts = client.patch("/api/auth/accounts/owner", json={"name": "Bąble"}).json()
    assert accounts[0]["name"] == "Bąble"
    other = TestClient(app)
    assert other.post("/api/auth/login", json={"name": "bąble", "password": "tajne"}).status_code == 204
    assert other.get("/api/auth/status").json()["user_name"] == "Bąble"
    # Stary sposób (samo hasło) dalej działa - np. zapamiętane logowanie w Safari
    third = TestClient(app)
    assert third.post("/api/auth/login", json={"password": "tajne"}).status_code == 204
    assert third.post("/api/auth/login", json={"name": "ktoś", "password": "tajne"}).status_code == 401


def test_duplicate_and_wrong_password(client, brother):
    assert client.post("/api/auth/accounts", json={"name": "NASZMAN", "password": "xxxx"}).status_code == 400
    assert client.post("/api/auth/accounts", json={"name": "Właściciel", "password": "xxxx"}).status_code == 400
    other = TestClient(app)
    assert other.post("/api/auth/login", json={"name": "Naszman", "password": "tajne"}).status_code == 401


def test_recipes_shared_but_edit_only_own(client, brother):
    mine = make_recipe(client, "Gulasz", ["wołowina"])
    his = make_recipe(brother, "Placki", ["ziemniak"])
    assert {r["title"] for r in brother.get("/api/recipes").json()} == {"Gulasz", "Placki"}
    assert brother.get(f"/api/recipes/{mine['id']}").json()["can_edit"] is False
    assert brother.get(f"/api/recipes/{his['id']}").json()["can_edit"] is True
    assert brother.delete(f"/api/recipes/{mine['id']}").status_code == 403
    assert brother.patch(f"/api/recipes/{mine['id']}", json={"notes": "x"}).status_code == 403
    body = {"title": "Zmieniony", "ingredients": [], "steps": []}
    assert brother.put(f"/api/recipes/{mine['id']}", json=body).status_code == 403
    assert brother.put(f"/api/recipes/{his['id']}", json=body).status_code == 200
    # Właściciel może wszystko
    assert client.get(f"/api/recipes/{his['id']}").json()["can_edit"] is True
    assert client.delete(f"/api/recipes/{his['id']}").status_code == 204


def test_favorites_and_ratings_are_personal(client, brother):
    recipe = make_recipe(client, "Gulasz", ["wołowina"])
    rid = recipe["id"]
    brother.patch(f"/api/recipes/{rid}", json={"favorite": True, "rating": 5})
    assert brother.get(f"/api/recipes/{rid}").json()["favorite"] is True
    assert client.get(f"/api/recipes/{rid}").json()["favorite"] is False
    assert [r["id"] for r in brother.get("/api/recipes?favorite=true").json()] == [rid]
    assert client.get("/api/recipes?favorite=true").json() == []
    brother.post(f"/api/recipes/{rid}/cooked", data={"rating": "2"})
    his = brother.get(f"/api/recipes/{rid}").json()
    assert his["cooked_count"] == 1 and his["rating"] == 2 and len(his["cook_log"]) == 1
    mine = client.get(f"/api/recipes/{rid}").json()
    assert mine["cooked_count"] == 0 and mine["cook_log"] == []
    entry = his["cook_log"][0]["id"]
    assert client.delete(f"/api/recipes/{rid}/cooked/{entry}").status_code == 404
    assert brother.delete(f"/api/recipes/{rid}/cooked/{entry}").json()["cooked_count"] == 0


def test_plan_shopping_and_pantry_are_personal(client, brother):
    recipe = make_recipe(client, "Naleśniki", ["mąka pszenna", "mleko"])
    today = date.today().isoformat()
    brother.post("/api/plan", json={"day": today, "recipe_id": recipe["id"]})
    assert len(brother.get(f"/api/plan?start={today}&end={today}").json()) == 1
    assert client.get(f"/api/plan?start={today}&end={today}").json() == []

    brother.put("/api/pantry", json={"names": ["mleko"]})
    assert brother.get("/api/pantry").json() == ["mleko"]
    assert client.get("/api/pantry").json() == []
    brother.put("/api/pantry/expires", json={"name": "mleko", "expires": today})
    assert brother.get("/api/pantry/items").json()[0]["expires"] == today

    result = brother.post("/api/shopping/from-plan", json={"start": today, "end": today}).json()
    assert result["skipped"] == ["mleko"]  # brat ma mleko w swojej spiżarni
    assert [i["text"] for i in brother.get("/api/shopping").json()] == ["mąka pszenna"]
    assert client.get("/api/shopping").json() == []
    item = brother.get("/api/shopping").json()[0]
    assert client.patch(f"/api/shopping/{item['id']}", json={"checked": True}).status_code == 404
    brother.patch(f"/api/shopping/{item['id']}", json={"checked": True})
    brother.post("/api/shopping/clear")
    assert "mąka pszenna" in brother.get("/api/pantry").json()
    assert client.get("/api/pantry").json() == []


def test_promo_favorites_are_personal(client, brother):
    brother.put("/api/promotions/favorites/herbata")
    assert brother.get("/api/promotions/favorites").json() == ["herbata"]
    assert client.get("/api/promotions/favorites").json() == []


def test_password_change_and_delete_account(client, brother):
    assert brother.post("/api/auth/password", json={"old_password": "zle", "new_password": "nowe1"}).status_code == 400
    assert brother.post("/api/auth/password", json={"old_password": "brat123", "new_password": "nowe1"}).status_code == 204
    assert brother.get("/api/recipes").status_code == 200  # dostał nowe ciasteczko
    his = make_recipe(brother, "Placki", ["ziemniak"])
    account = client.get("/api/auth/accounts").json()[1]
    # Właściciel ustawia nowe hasło - stara sesja brata wygasa
    client.patch(f"/api/auth/accounts/{account['id']}", json={"password": "reset1"})
    assert brother.get("/api/recipes").status_code == 401
    client.delete(f"/api/auth/accounts/{account['id']}")
    assert len(client.get("/api/auth/accounts").json()) == 1
    # Jego przepis zostaje - teraz jako przepis właściciela
    assert client.get(f"/api/recipes/{his['id']}").json()["title"] == "Placki"


def test_member_timer_does_not_notify(client, brother, monkeypatch):
    from app.services import timer_notify

    started = []
    monkeypatch.setattr(timer_notify, "start", lambda *args: started.append(args))
    brother.post("/api/timers", json={"id": 1, "label": "Makaron", "seconds": 60})
    assert started == []
    client.post("/api/timers", json={"id": 2, "label": "Makaron", "seconds": 60})
    assert len(started) == 1
