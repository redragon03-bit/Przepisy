"""Wydanie 0.21.0: podwójne składniki nie łączą odmian ("twaróg chudy" i "twaróg półtłusty")."""

from app.services import ai
from app.services.ingredients import same_product, split_different

from tests.test_api import make_recipe


def test_same_product_keeps_variants_apart():
    assert same_product("pierś z kurczaka", "kurczak piersi")
    assert same_product("twarog", "twaróg")
    assert same_product("ziemniak", "kartofel")
    assert not same_product("twaróg", "twaróg chudy")
    assert not same_product("twaróg chudy", "twaróg półtłusty")
    assert not same_product("twaróg biały", "twaróg sernikowy")


def test_split_different():
    group = ["twaróg", "twaróg półtłusty", "twaróg chudy", "twaróg biały", "twaróg sernikowy", "twarogi"]
    assert split_different(group) == [["twaróg", "twarogi"]]
    assert split_different(["ziemniak", "kartofel", "ziemniaki"]) == [["ziemniak", "kartofel", "ziemniaki"]]


def test_duplicates_ignore_ai_variant_groups(client, monkeypatch):
    names = ["twaróg", "twaróg półtłusty", "twaróg chudy", "twaróg biały", "twaróg sernikowy"]
    for i, name in enumerate(names):
        make_recipe(client, f"Sernik {i}", [name])
    make_recipe(client, "Sernik extra", ["twaróg sernikowy"])
    make_recipe(client, "Placki", ["ziemniak"])
    make_recipe(client, "Zupa", ["kartofel"])
    monkeypatch.setattr(ai.get_settings(), "gemini_api_key", "test")
    monkeypatch.setattr(ai, "find_duplicate_ingredients", lambda _: [names, ["ziemniak", "kartofel"]])
    groups = client.get("/api/ingredients/duplicates").json()
    assert [(g["keep"], g["others"]) for g in groups] == [("kartofel", ["ziemniak"])]
    assert groups[0]["counts"] == {"ziemniak": 1, "kartofel": 1}
