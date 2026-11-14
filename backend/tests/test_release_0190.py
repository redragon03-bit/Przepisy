"""0.19.0: zmiana tekstu pozycji na liście zakupów i nazwy produktu w spiżarni."""

import json

import httpx
import pytest

from app.services import shopping
from tests.test_improvements import FakeHomeAssistant
from tests.test_release_090 import with_promos


class RenamingHomeAssistant(FakeHomeAssistant):
    def handle(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.read())
        if request.url.path.endswith("/update_item") and "rename" in body:
            next(i for i in self.items if i["summary"] == body["item"])["summary"] = body["rename"]
            return httpx.Response(200, json=[])
        return super().handle(request)


@pytest.fixture
def home_assistant(monkeypatch):
    settings = shopping.get_settings()
    monkeypatch.setattr(settings, "ha_url", "http://ha.local:8123")
    monkeypatch.setattr(settings, "ha_token", "token")
    ha = RenamingHomeAssistant()
    real_client = httpx.Client
    monkeypatch.setattr(shopping.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(ha.handle), **kw))
    return ha


def test_rename_matches_promos_again(client, monkeypatch):
    with_promos(client, monkeypatch)
    item = client.post("/api/shopping", json={"text": "chleb"}).json()
    renamed = client.patch(f"/api/shopping/{item['id']}", json={"text": "masło"}).json()
    assert renamed["text"] == "masło" and renamed["aisle"] == "Nabiał i jajka"
    assert renamed["promo"] == "Biedronka 2,49 zł"
    assert client.get("/api/shopping").json()[0]["promos"][0]["store"] == "Biedronka"


def test_renamed_recipe_item_is_not_merged_with_old_amount(client):
    body = {"title": "Placki", "ingredients": [{"text": "200 g mąki", "name": "mąka", "amount": 200, "unit": "g"}]}
    recipe = client.post("/api/recipes", json=body).json()
    client.post("/api/shopping/from-recipe", json={"recipe_id": recipe["id"]})
    item = client.get("/api/shopping").json()[0]
    client.patch(f"/api/shopping/{item['id']}", json={"text": "1 kg mąki"})
    client.post("/api/shopping/from-recipe", json={"recipe_id": recipe["id"]})
    assert [i["text"] for i in client.get("/api/shopping").json()] == ["1 kg mąki", "200 g mąki"]
    # Odhaczona po zmianie nazwy trafia do spiżarni pod nazwą produktu
    client.patch(f"/api/shopping/{item['id']}", json={"checked": True})
    assert "mąka" in client.get("/api/pantry").json()


def test_rename_in_home_assistant(client, home_assistant):
    item = client.post("/api/shopping", json={"text": "sok z cytryny"}).json()
    client.post("/api/shopping/send-to-ha")
    client.patch(f"/api/shopping/{item['id']}", json={"text": "sok z pomarańczy"})
    assert [i["summary"] for i in home_assistant.items] == ["sok z pomarańczy"]
    # Po synchronizacji nie ma duplikatu ze starą nazwą
    assert [i["text"] for i in client.post("/api/shopping/sync").json()] == ["sok z pomarańczy"]
    client.patch(f"/api/shopping/{item['id']}", json={"checked": True})
    assert home_assistant.items[0]["status"] == "completed"


def test_pantry_rename_keeps_term(client):
    client.post("/api/pantry/add", json={"names": ["mlekoo"]})
    client.put("/api/pantry/expires", json={"name": "mlekoo", "expires": "2030-01-05"})
    items = client.post("/api/pantry/rename", json={"name": "mlekoo", "new_name": "Mleko"}).json()
    assert [(i["name"], i["expires"]) for i in items] == [("mleko", "2030-01-05")]
    assert client.post("/api/pantry/rename", json={"name": "nie ma", "new_name": "x"}).status_code == 404


def test_same_ingredient_after_rename():
    from app.routers.shopping import _same_ingredient
    assert _same_ingredient("mąka", "1 kg mąki")
    assert _same_ingredient("sok z cytryny", "2 soki z cytryny")
    assert not _same_ingredient("sok z cytryny", "sok z pomarańczy")
    assert not _same_ingredient("", "chleb")
