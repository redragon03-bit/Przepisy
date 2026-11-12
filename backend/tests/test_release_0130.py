"""0.13.0: sekcje w składnikach i krokach (np. "Omlet", "Krem do omleta")."""

from app.services import ai


def _form(**extra):
    return {
        "title": "Omlet z kremem",
        "ingredients": [
            {"text": "2 jajka", "name": "jajko", "section": "Omlet"},
            {"text": "100 g masła", "name": "masło", "section": " Krem do omleta "},
        ],
        "steps": [
            {"text": "Ubij jajka", "section": "Omlet"},
            {"text": "Utrzyj masło", "section": "Krem do omleta"},
            {"text": "Podawaj"},
        ],
        **extra,
    }


def test_sections_are_saved_and_returned(client):
    recipe = client.post("/api/recipes", json=_form()).json()
    assert [i["section"] for i in recipe["ingredients"]] == ["Omlet", "Krem do omleta"]
    assert [s["section"] for s in recipe["steps"]] == ["Omlet", "Krem do omleta", ""]
    # Edycja bez sekcji (stary klient) czyści je
    form = _form()
    for line in form["ingredients"]:
        del line["section"]
    updated = client.put(f"/api/recipes/{recipe['id']}", json=form).json()
    assert [i["section"] for i in updated["ingredients"]] == ["", ""]


def test_ai_sections_keep_every_item(client, monkeypatch):
    seen = {}

    def fake(title, ingredients, steps):
        seen.update(title=title, ingredients=ingredients, steps=steps)
        return ai.AiSections(
            ingredients=[ai.AiSectionItem(index=1, section="Krem"), ai.AiSectionItem(index=1, section="x"),
                         ai.AiSectionItem(index=7, section="zły numer")],
            steps=[ai.AiSectionItem(index=1, section="Ziemniaki"), ai.AiSectionItem(index=0, section="Ziemniaki")],
        )

    monkeypatch.setattr(ai, "sections", fake)
    r = client.post("/api/recipes/sections", json={"title": "Pierogi", "ingredients": ["mąka", "masło"],
                                                   "steps": ["Odlej wodę i ubij", "Ugotuj ziemniaki", "Podawaj"]})
    assert r.status_code == 200
    # Powtórzone i złe numery pominięte, brakujące dołożone na końcu bez sekcji
    assert r.json() == {
        "ingredient_order": [1, 0], "ingredient_sections": ["Krem", ""],
        "step_order": [1, 0, 2], "step_sections": ["Ziemniaki", "Ziemniaki", ""],
    }
    assert seen["steps"][1] == "Ugotuj ziemniaki"


def test_variant_text_keeps_sections(client):
    from app.database import SessionLocal
    from app.models import Recipe
    from app.routers.recipes import recipe_text

    recipe = client.post("/api/recipes", json=_form()).json()
    with SessionLocal() as db:
        text = recipe_text(db.get(Recipe, recipe["id"]))
    assert "[Krem do omleta]\n- 100 g masła" in text
    assert "[bez części]\n3. Podawaj" in text


def test_sections_review_flow(client, monkeypatch):
    plain = client.post("/api/recipes", json={
        "title": "Kotlet z ziemniakami",
        "ingredients": [{"text": t, "name": ""} for t in ["schab", "jajko", "ziemniaki"]],
        "steps": [{"text": "Odlej wodę z ziemniaków"}, {"text": "Ugotuj ziemniaki"}, {"text": "Usmaż kotlety"}],
    }).json()
    client.post("/api/recipes", json=_form())  # ma już sekcje - nie trafia do przeglądu
    todo = client.get("/api/recipes/sections/todo").json()
    assert [r["title"] for r in todo] == ["Kotlet z ziemniakami"]

    monkeypatch.setattr(ai, "sections", lambda title, ingredients, steps: ai.AiSections(
        ingredients=[ai.AiSectionItem(index=2, section="Ziemniaki"), ai.AiSectionItem(index=0, section="Kotlety"),
                     ai.AiSectionItem(index=1, section="Kotlety")],
        steps=[ai.AiSectionItem(index=1, section="Ziemniaki"), ai.AiSectionItem(index=0, section="Ziemniaki"),
               ai.AiSectionItem(index=2, section="Kotlety")],
    ))
    proposal = client.post(f"/api/recipes/{plain['id']}/sections").json()
    assert proposal["step_order"] == [1, 0, 2]

    saved = client.put(f"/api/recipes/{plain['id']}/sections", json=proposal).json()
    assert [(i["section"], i["text"]) for i in saved["ingredients"]] == [
        ("Ziemniaki", "ziemniaki"), ("Kotlety", "schab"), ("Kotlety", "jajko")]
    assert [s["text"] for s in saved["steps"]] == ["Ugotuj ziemniaki", "Odlej wodę z ziemniaków", "Usmaż kotlety"]
    assert client.get("/api/recipes/sections/todo").json() == []

    # Propozycja do innej liczby kroków (przepis zmieniony w międzyczasie) jest odrzucana
    bad = {**proposal, "step_order": [0, 1], "step_sections": ["", ""]}
    assert client.put(f"/api/recipes/{plain['id']}/sections", json=bad).status_code == 409
