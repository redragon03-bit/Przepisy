"""Wyszukiwanie z ogonkami, logowanie, miniatury, kopie, czat, działy sklepu i lista w HA."""

import io
import json
import zipfile

import httpx
import pytest
from PIL import Image

from app import auth
from app.config import get_settings
from app.routers import chat as chat_router
from app.services import ai, fetcher, shopping
from app.services.aisles import aisle


def make_recipe(client, title, names=(), **extra):
    body = {"title": title, "ingredients": [{"text": n, "name": n} for n in names],
            "steps": [{"text": "Wymieszaj."}], **extra}
    return client.post("/api/recipes", json=body).json()


def titles(client, **params):
    return sorted(r["title"] for r in client.get("/api/recipes", params=params).json())


def test_search_ignores_polish_letters_and_case(client):
    make_recipe(client, "Żurek śląski", ["kiełbasa biała"])
    make_recipe(client, "Łosoś w sosie", ["łosoś", "śmietana"])
    make_recipe(client, "Naleśniki", ["mąka pszenna"])
    assert titles(client, q="żurek") == ["Żurek śląski"]
    assert titles(client, q="ZUREK") == ["Żurek śląski"]
    assert titles(client, q="łosoś") == ["Łosoś w sosie"]
    # Słowo ze składnika i z tytułu naraz
    assert titles(client, q="kielbasa zurek") == ["Żurek śląski"]
    assert titles(client, q="maka") == ["Naleśniki"]
    # Inna forma słowa: "śmietany" znajduje składnik "śmietana"
    assert titles(client, q="smietany") == ["Łosoś w sosie"]
    assert titles(client, q="100%") == []


def test_stats(client):
    make_recipe(client, "Zupa", categories=["Zupa"])
    make_recipe(client, "Coś")
    assert client.get("/api/recipes/stats").json() == {"total": 2, "uncategorized": 1}


def test_ingredient_without_name_gets_guessed_name(client):
    recipe = client.post("/api/recipes", json={"title": "Placki", "ingredients": [{"text": "200 g mąki", "name": ""}]}).json()
    assert recipe["ingredients"][0]["name"] == "mąki"


def test_login_is_locked_after_many_wrong_passwords(client):
    for _ in range(auth.MAX_FAILURES):
        assert client.post("/api/auth/login", json={"password": "złe"}).status_code == 401
    response = client.post("/api/auth/login", json={"password": "tajne"})
    assert response.status_code == 429 and "Za dużo prób" in response.json()["detail"]


def test_changing_password_logs_out_old_sessions(client, monkeypatch):
    assert client.get("/api/recipes").status_code == 200
    monkeypatch.setattr(get_settings(), "app_password", "nowe")
    assert client.get("/api/recipes").status_code == 401
    client.post("/api/auth/login", json={"password": "nowe"})
    assert client.get("/api/recipes").status_code == 200


@pytest.mark.parametrize("url", ["http://127.0.0.1:8123/", "http://192.168.1.1/admin", "http://localhost/",
                                 "http://100.100.1.1/"])
def test_fetcher_refuses_home_network(url):
    with pytest.raises(fetcher.FetchError, match="sieci domowej"):
        fetcher.fetch_html(url)


def test_too_big_upload_leaves_no_job(client, monkeypatch):
    from app.routers import imports

    monkeypatch.setattr(imports, "MAX_FILE_BYTES", 10)
    response = client.post("/api/imports/images", files=[("files", ("a.jpg", b"x" * 100, "image/jpeg"))])
    assert response.status_code == 400
    assert client.get("/api/imports").json() == []


def _jpeg(size=(1200, 900)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, "orange").save(out, "JPEG")
    return out.getvalue()


def test_thumbnail(client):
    recipe = make_recipe(client, "Tarta")
    recipe = client.post(f"/api/recipes/{recipe['id']}/image", files={"file": ("t.jpg", _jpeg(), "image/jpeg")}).json()
    thumb = client.get(recipe["thumb_url"])
    assert thumb.status_code == 200
    assert max(Image.open(io.BytesIO(thumb.content)).size) == 480
    assert client.get("/media/thumb/../przepisy.db").status_code == 404
    assert client.get("/media/thumb/" + "0" * 32 + ".jpg").status_code == 404


def test_restore_backup(client):
    recipe = make_recipe(client, "Sernik")
    client.post(f"/api/recipes/{recipe['id']}/image", files={"file": ("s.jpg", _jpeg(), "image/jpeg")})
    backup = client.get("/api/backup").content
    make_recipe(client, "Dodany po kopii")
    assert len(client.get("/api/recipes").json()) == 2

    result = client.post("/api/backup/restore", files={"file": ("kopia.zip", backup, "application/zip")})
    assert result.status_code == 200, result.text
    assert result.json() == {"recipes": 1}
    recipes = client.get("/api/recipes").json()
    assert [r["title"] for r in recipes] == ["Sernik"]
    assert client.get(recipes[0]["image_url"]).status_code == 200
    # Dane sprzed przywrócenia są w kopiach automatycznych
    assert client.get("/api/backups").json()


def test_restore_rejects_wrong_file(client):
    response = client.post("/api/backup/restore", files={"file": ("x.zip", b"to nie zip", "application/zip")})
    assert response.status_code == 400
    empty = io.BytesIO()
    with zipfile.ZipFile(empty, "w") as archive:
        archive.writestr("inne.txt", "x")
    response = client.post("/api/backup/restore", files={"file": ("x.zip", empty.getvalue(), "application/zip")})
    assert response.status_code == 400 and "przepisy.db" in response.json()["detail"]


def test_chat_sends_only_matching_recipes_when_there_are_many(client, monkeypatch):
    monkeypatch.setattr(chat_router, "MAX_CHAT_RECIPES", 3)
    for i in range(5):
        make_recipe(client, f"Gulasz {i}", ["wołowina"])
    make_recipe(client, "Sernik", ["twaróg"])
    seen = {}

    def fake_chat(context, conversation):
        seen["context"] = context
        return ai.ChatAnswer(text="Sernik!", recipe_ids=[], new_recipe=None)

    monkeypatch.setattr(ai, "chat", fake_chat)
    client.post("/api/chat", json={"messages": [{"role": "user", "text": "Mam ochotę na sernik"}]})
    assert "Sernik" in seen["context"]
    assert "najbardziej pasujące 3 z 6" in seen["context"]


def test_nutrition_has_time_limit(client, monkeypatch):
    recipe = make_recipe(client, "Zupa", ["marchew"])
    limits = []
    monkeypatch.setattr(ai, "_ask_provider", lambda content, system, schema: limits.append(ai._limit.get()) or
                        ai.AiNutrition(kcal=100, protein=1, fat=1, carbs=10))
    assert client.post(f"/api/recipes/{recipe['id']}/nutrition").json()["kcal"] == 100
    assert limits[0] is not None


@pytest.mark.parametrize("text, expected", [
    ("200 g mąki pszennej", "Sypkie i makarony"), ("400 g pomidorów z puszki", "Puszki i słoiki"),
    ("2 pomidory", "Warzywa i owoce"), ("serwetki", "Chemia i dom"), ("ser żółty", "Nabiał i jajka"),
    ("kawałek kurczaka", "Mięso i ryby"), ("szczypta soli", "Przyprawy i sosy"), ("coś dziwnego", "Inne"),
])
def test_aisles(text, expected):
    assert aisle(text) == expected


class FakeHomeAssistant:
    """Lista "Do zrobienia" w HA: przyjmuje zapytania REST jak prawdziwy Home Assistant."""

    def __init__(self):
        self.items: list[dict] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        service = request.url.path.rsplit("/", 1)[1]
        body = json.loads(request.read())
        if service == "add_item":
            self.items.append({"summary": body["item"], "status": "needs_action"})
        elif service == "update_item":
            next(i for i in self.items if i["summary"] == body["item"])["status"] = body["status"]
        elif service == "remove_item":
            self.items = [i for i in self.items if i["summary"] != body["item"]]
        elif service == "get_items":
            return httpx.Response(200, json={"changed_states": [], "service_response": {
                "todo.shopping_list": {"items": [dict(i, uid=str(n)) for n, i in enumerate(self.items)]}}})
        return httpx.Response(200, json=[])


@pytest.fixture
def home_assistant(monkeypatch):
    settings = shopping.get_settings()
    monkeypatch.setattr(settings, "ha_url", "http://ha.local:8123")
    monkeypatch.setattr(settings, "ha_token", "token")
    ha = FakeHomeAssistant()
    real_client = httpx.Client
    monkeypatch.setattr(shopping.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(ha.handle), **kw))
    return ha


def test_shopping_list_syncs_with_home_assistant(client, home_assistant):
    milk = client.post("/api/shopping", json={"text": "mleko"}).json()
    assert milk["aisle"] == "Nabiał i jajka" and not milk["in_ha"]
    client.post("/api/shopping", json={"text": "chleb"})
    assert client.post("/api/shopping/send-to-ha").json()["added"] == 2
    # Drugie wysłanie nie dubluje pozycji w HA
    assert client.post("/api/shopping/send-to-ha").status_code == 400
    assert len(home_assistant.items) == 2

    # Odhaczone w aplikacji -> odhaczone w HA
    client.patch(f"/api/shopping/{milk['id']}", json={"checked": True})
    assert home_assistant.items[0]["status"] == "completed"
    # Odhaczone w HA i dopisane w HA (np. głosem) -> widać w aplikacji
    home_assistant.items[1]["status"] = "completed"
    home_assistant.items.append({"summary": "masło", "status": "needs_action"})
    items = {i["text"]: i for i in client.post("/api/shopping/sync").json()}
    assert items["chleb"]["checked"] and items["masło"]["in_ha"] and not items["masło"]["checked"]
    assert len(client.post("/api/shopping/sync").json()) == 3

    # Usunięte kupione znikają też z HA
    client.post("/api/shopping/clear")
    assert [i["summary"] for i in home_assistant.items] == ["masło"]


def test_shopping_does_not_merge_into_item_already_in_home_assistant(client, home_assistant):
    body = {"title": "Placki", "ingredients": [{"text": "200 g mąki", "name": "mąka", "amount": 200, "unit": "g"}]}
    recipe = client.post("/api/recipes", json=body).json()
    client.post("/api/shopping/from-recipe", json={"recipe_id": recipe["id"]})
    client.post("/api/shopping/send-to-ha")
    client.post("/api/shopping/from-recipe", json={"recipe_id": recipe["id"]})
    assert [i["text"] for i in client.get("/api/shopping").json()] == ["200 g mąki", "200 g mąki"]
