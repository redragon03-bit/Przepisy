from app.services import ai, fetcher, importer
from app.services.ai import AiIngredient, AiRecipe, AiStep


def make_recipe(client, title, names):
    body = {
        "title": title,
        "ingredients": [{"text": n, "name": n} for n in names],
        "steps": [{"text": "Wymieszaj."}],
    }
    response = client.post("/api/recipes", json=body)
    assert response.status_code == 201
    return response.json()


def test_requires_login(client):
    client.post("/api/auth/logout")
    client.cookies.clear()
    assert client.get("/api/recipes").status_code == 401
    assert client.get("/api/recipes", headers={"X-App-Password": "tajne"}).status_code == 200
    assert client.post("/api/auth/login", json={"password": "złe"}).status_code == 401


def test_crud(client):
    recipe = make_recipe(client, "Naleśniki", ["Mąka pszenna", "jajko", "mleko"])
    assert [i["name"] for i in recipe["ingredients"]] == ["mąka pszenna", "jajko", "mleko"]

    body = {"title": "Naleśniki z serem", "ingredients": [{"text": "ser biały", "name": "ser biały"}],
            "steps": [{"text": "Usmaż."}, {"text": "Nadziej serem."}]}
    updated = client.put(f"/api/recipes/{recipe['id']}", json=body).json()
    assert updated["title"] == "Naleśniki z serem"
    assert len(updated["steps"]) == 2

    assert client.delete(f"/api/recipes/{recipe['id']}").status_code == 204
    assert client.get(f"/api/recipes/{recipe['id']}").status_code == 404


def test_search_by_ingredients(client):
    make_recipe(client, "Zapiekanka", ["ser żółty", "makaron"])
    make_recipe(client, "Sałatka", ["pomidor", "ogórek"])
    found = client.get("/api/recipes", params={"ingredients": ["ser", "makaron"]}).json()
    assert [r["title"] for r in found] == ["Zapiekanka"]
    assert client.get("/api/recipes", params={"q": "sałat"}).json()[0]["title"] == "Sałatka"


def test_what_can_i_cook(client):
    make_recipe(client, "Jajecznica", ["jajko", "masło", "sól"])
    make_recipe(client, "Omlet z szynką", ["jajko", "szynka", "mleko", "ser żółty"])
    make_recipe(client, "Sałatka", ["pomidor", "ogórek"])

    matches = client.post("/api/cook", json={"ingredients": ["jajko", "masło"], "max_missing": 2}).json()
    # Sól jest składnikiem podstawowym - nie liczy się jako brak
    assert matches[0]["recipe"]["title"] == "Jajecznica"
    assert matches[0]["missing"] == []
    # Omletowi brakuje 3 składników, więc przy max_missing=2 go nie ma
    assert [m["recipe"]["title"] for m in matches] == ["Jajecznica"]


def test_url_import_without_ai(client, monkeypatch):
    from pathlib import Path

    html = (Path(__file__).parent / "recipe_page.html").read_text()
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: (html, url))
    monkeypatch.setattr(importer.images, "download_image", lambda url: None)

    job = client.post("/api/imports/url", json={"url": "https://example.com/pancakes"}).json()
    job = client.get(f"/api/imports/{job['id']}").json()  # TestClient uruchamia zadania w tle od razu
    assert job["status"] == "done", job["error"]
    recipe = client.get(f"/api/recipes/{job['recipe_id']}").json()
    assert recipe["title"] == "Fluffy Pancakes"
    assert recipe["ingredients"][0]["name"] == "all-purpose flour"


def test_url_import_with_ai(client, monkeypatch):
    from pathlib import Path

    html = (Path(__file__).parent / "recipe_page.html").read_text()
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: (html, url))
    monkeypatch.setattr(importer.images, "download_image", lambda url: url.rsplit("/", 1)[1])
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")

    seen = {}

    def fake_ai(page, categories):
        seen["page"] = page
        return [AiRecipe(
            title="Puszyste naleśniki", description="", servings="4 porcje",
            prep_minutes=None, cook_minutes=None, total_minutes=25, original_language="en",
            ingredients=[AiIngredient(text="190 g mąki pszennej", name="mąka pszenna", amount=190,
                                      unit="g", original_text="1 1/2 cups all-purpose flour")],
            steps=[AiStep(text="Wymieszaj mąkę z solą.", image_index=1), AiStep(text="Usmaż.", image_index=None)],
            main_image_index=0, categories=["Śniadanie", "deser"],
        )]

    monkeypatch.setattr(ai, "recipes_from_page", fake_ai)
    job = client.post("/api/imports/url", json={"url": "https://example.com/pancakes"}).json()
    job = client.get(f"/api/imports/{job['id']}").json()
    assert job["status"] == "done", job["error"]
    assert job["recipe_count"] == 1
    assert seen["page"].recipe.title == "Fluffy Pancakes"

    recipe = client.get(f"/api/recipes/{job['recipe_id']}").json()
    assert recipe["title"] == "Puszyste naleśniki"
    assert recipe["categories"] == ["Deser", "Śniadanie"]
    assert recipe["ingredients"][0] == {
        "text": "190 g mąki pszennej", "name": "mąka pszenna", "amount": 190.0, "unit": "g",
        "original_text": "1 1/2 cups all-purpose flour",
    }
    assert recipe["image_url"] == "/media/pancakes.jpg"
    assert recipe["steps"][0]["image_url"] == "/media/step1.jpg"


def test_failed_import_shows_message(client, monkeypatch):
    def boom(url):
        raise fetcher.FetchError("Strona odpowiedziała błędem 403.")

    monkeypatch.setattr(fetcher, "fetch_html", boom)
    job = client.post("/api/imports/url", json={"url": "https://example.com/x"}).json()
    job = client.get(f"/api/imports/{job['id']}").json()
    assert job["status"] == "failed"
    assert "403" in job["error"]


def _simple_recipe(title):
    return AiRecipe(
        title=title, description="", servings="", prep_minutes=None, cook_minutes=None,
        total_minutes=None, original_language="pl", ingredients=[],
        steps=[AiStep(text="Wymieszaj.", image_index=None)], main_image_index=None, categories=["Deser"],
    )


def test_page_with_several_recipes(client, monkeypatch):
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: ("<html><body>Desery</body></html>", url))
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")
    monkeypatch.setattr(ai, "recipes_from_page", lambda page, categories: [_simple_recipe("Chia kakao"), _simple_recipe("Chia mango")])
    job = client.post("/api/imports/url", json={"url": "https://example.com/desery"}).json()
    job = client.get(f"/api/imports/{job['id']}").json()
    assert job["status"] == "done", job["error"]
    assert job["recipe_count"] == 2
    titles = [r["title"] for r in client.get("/api/recipes", params={"q": "Chia"}).json()]
    assert sorted(titles) == ["Chia kakao", "Chia mango"]


def test_failed_import_can_be_retried(client, monkeypatch):
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: ("<html><body>Placki</body></html>", url))
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")
    answers = [ai.AiError("Gemini jest teraz przeciążony"), [_simple_recipe("Placki ponowione")]]

    def flaky_ai(page, categories):
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(ai, "recipes_from_page", flaky_ai)
    job = client.post("/api/imports/url", json={"url": "https://example.com/placki"}).json()
    assert client.get(f"/api/imports/{job['id']}").json()["status"] == "failed"

    job = client.post(f"/api/imports/{job['id']}/retry").json()
    job = client.get(f"/api/imports/{job['id']}").json()
    assert job["status"] == "done", job["error"]
    assert job["error"] == ""
    assert client.get(f"/api/recipes/{job['recipe_id']}").json()["title"] == "Placki ponowione"
    # Udanego importu nie da się ponowić
    assert client.post(f"/api/imports/{job['id']}/retry").status_code == 400


def test_categories_filter_and_edit(client):
    recipe = client.post("/api/recipes", json={"title": "Zupa dyniowa", "categories": ["zupa", "Zupa", "jesień"]}).json()
    assert recipe["categories"] == ["Jesień", "Zupa"]
    client.post("/api/recipes", json={"title": "Bez kategorii"})

    assert [r["title"] for r in client.get("/api/recipes", params={"category": "zupa"}).json()] == ["Zupa dyniowa"]
    assert "Bez kategorii" in [r["title"] for r in client.get("/api/recipes", params={"category": "-"}).json()]
    counts = {c["name"]: c["recipe_count"] for c in client.get("/api/categories").json()}
    assert counts["Zupa"] >= 1 and "Deser" in counts  # domyślne kategorie też są na liście


def test_auto_categorize(client, monkeypatch):
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")
    recipe = client.post("/api/recipes", json={"title": "Pudding chia"}).json()
    monkeypatch.setattr(ai, "categorize", lambda recipes, names: {rid: ["Deser"] for rid, _, _ in recipes})
    result = client.post("/api/categories/auto").json()
    assert result["updated"] >= 1 and result["remaining"] == 0
    assert client.get(f"/api/recipes/{recipe['id']}").json()["categories"] == ["Deser"]
