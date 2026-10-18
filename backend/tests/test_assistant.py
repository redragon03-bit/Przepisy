"""Spiżarnia, kalorie, czat z asystentem i automatyczna kopia zapasowa."""

import os
import time

from app.services import ai, backup
from app.services.ai import AiIngredient, AiNutrition, AiRecipe, AiStep, ChatAnswer


def make_recipe(client, title, lines):
    """lines: [(tekst, nazwa, ilość, jednostka)]"""
    body = {
        "title": title,
        "servings": "2 porcje",
        "ingredients": [{"text": t, "name": n, "amount": a, "unit": u} for t, n, a, u in lines],
        "steps": [{"text": "Wymieszaj."}],
    }
    return client.post("/api/recipes", json=body).json()


def ai_recipe(title="Shakshuka"):
    return AiRecipe(
        title=title, description="Jajka w sosie pomidorowym.", servings="2 porcje",
        prep_minutes=5, cook_minutes=15, total_minutes=20, original_language="pl",
        ingredients=[AiIngredient(text="4 jajka", name="jajko", amount=4, unit="szt.", original_text="4 jajka")],
        steps=[AiStep(text="Usmaż.", image_index=None)], main_image_index=None,
        categories=["Śniadanie"], kcal=350, protein=20, fat=22, carbs=12,
    )


def test_pantry_is_skipped_on_shopping_list(client):
    recipe = make_recipe(client, "Jajecznica", [("3 jajka", "jajko", 3, "szt."), ("50 g sera żółtego", "ser żółty", 50, "g")])
    assert client.put("/api/pantry", json={"names": ["Ser", "jajko"]}).json() == ["jajko", "ser"]
    result = client.post("/api/shopping/from-recipe", json={"recipe_id": recipe["id"]}).json()
    assert result == {"added": 0, "skipped": ["jajko", "ser żółty"]}
    # Zapis całej spiżarni zastępuje poprzednią
    assert client.put("/api/pantry", json={"names": ["jajko"]}).json() == ["jajko"]
    result = client.post("/api/shopping/from-recipe", json={"recipe_id": recipe["id"]}).json()
    assert result == {"added": 1, "skipped": ["jajko"]}
    assert client.get("/api/pantry").json() == ["jajko"]


def test_nutrition(client, monkeypatch):
    recipe = make_recipe(client, "Owsianka", [("50 g płatków owsianych", "płatki owsiane", 50, "g")])
    assert recipe["kcal"] is None
    asked = []

    def fake(title, servings, lines):
        asked.append((title, servings, lines))
        return AiNutrition(kcal=190, protein=7, fat=4, carbs=32)

    monkeypatch.setattr(ai, "estimate_nutrition", fake)
    result = client.post(f"/api/recipes/{recipe['id']}/nutrition").json()
    assert (result["kcal"], result["protein"], result["fat"], result["carbs"]) == (190, 7, 4, 32)
    assert asked == [("Owsianka", "2 porcje", ["50 g płatków owsianych"])]


def test_chat_suggests_saved_and_new_recipes(client, monkeypatch):
    saved = make_recipe(client, "Pierogi ruskie", [("500 g ziemniaków", "ziemniak", 500, "g")])
    client.put("/api/pantry", json={"names": ["jajko"]})
    seen = {}

    def fake_chat(context, conversation):
        seen["context"], seen["conversation"] = context, conversation
        # 999 nie istnieje - API ma to pominąć
        return ChatAnswer(text="Proponuję pierogi albo shakshukę.", recipe_ids=[saved["id"], 999], new_recipe=ai_recipe())

    monkeypatch.setattr(ai, "chat", fake_chat)
    answer = client.post("/api/chat", json={"messages": [
        {"role": "user", "text": "Mam ochotę na coś z jajkiem"},
        {"role": "assistant", "text": "Może to?", "recipe": ai_recipe("Omlet").model_dump()},
        {"role": "user", "text": "Coś innego, bez mleka"},
    ]}).json()
    assert answer["text"] == "Proponuję pierogi albo shakshukę."
    assert [r["title"] for r in answer["recipes"]] == ["Pierogi ruskie"]
    assert answer["new_recipe"]["title"] == "Shakshuka"
    assert f"{saved['id']}. Pierogi ruskie" in seen["context"] and "ziemniak" in seen["context"]
    assert "Mam w domu: jajko" in seen["context"]
    assert "Użytkownik: Coś innego, bez mleka" in seen["conversation"]
    assert '"title": "Omlet"' in seen["conversation"]


def test_chat_save(client):
    created = client.post("/api/chat/save", json={"recipe": ai_recipe().model_dump()})
    assert created.status_code == 201
    recipe = created.json()
    assert recipe["source_type"] == "ai"
    assert recipe["categories"] == ["Śniadanie"]
    assert recipe["kcal"] == 350
    assert recipe["ingredients"][0]["name"] == "jajko"


def test_auto_backup(client):
    for old in backup.auto_backups():
        old.unlink()
    first = backup.make_auto_backup_if_due()
    assert first is not None and first.exists()
    # Tydzień jeszcze nie minął
    assert backup.make_auto_backup_if_due() is None
    listed = client.get("/api/backups").json()
    assert [b["name"] for b in listed] == [first.name]
    assert client.get(f"/api/backups/{first.name}").status_code == 200
    assert client.get("/api/backups/..%2Fprzepisy.db").status_code == 404
    # Starsze niż tydzień -> nowa kopia; zostają tylko 3 najnowsze
    for i in range(4):
        newest = backup.auto_backups()[0]
        week_ago = time.time() - 8 * 24 * 3600
        os.utime(newest, (week_ago, week_ago))
        renamed = newest.with_name(f"przepisy-2020-01-0{i + 1}-0000.zip")
        newest.rename(renamed)
        assert backup.make_auto_backup_if_due() is not None
    assert len(backup.auto_backups()) == 3
