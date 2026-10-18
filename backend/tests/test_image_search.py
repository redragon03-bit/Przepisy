"""Szukanie zdjęć dla przepisów bez zdjęcia."""

from types import SimpleNamespace

from app.services import ai, fetcher, image_search, importer

# Prawdziwa funkcja - conftest podmienia ją w każdym teście, żeby nie łączyć się z internetem
SEARCH_RECIPE_PAGES = ai.search_recipe_pages

PAGE = '<html><head><meta property="og:image" content="https://blog.example/chia.jpg"></head><body>Pudding</body></html>'


def _fake_web(monkeypatch, saved):
    monkeypatch.setattr(image_search.ai, "search_recipe_pages", lambda title, names: ["https://blog.example/pudding"])
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: (PAGE, url))
    monkeypatch.setattr(image_search.images, "download_image", lambda url: saved.append(url) or "chia.jpg")


def test_candidates_from_found_pages(client, monkeypatch):
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")
    _fake_web(monkeypatch, [])
    recipe = client.post("/api/recipes", json={"title": "Pudding chia"}).json()
    assert client.get(f"/api/recipes/{recipe['id']}/image-candidates").json() == ["https://blog.example/chia.jpg"]


def test_fill_missing_for_existing_recipes(client, monkeypatch):
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")
    saved = []
    _fake_web(monkeypatch, saved)
    recipe = client.post("/api/recipes", json={"title": "Pudding chia"}).json()
    assert client.get("/api/recipes/image-search").json()["missing"] == 1
    # TestClient wykonuje zadanie w tle od razu po odpowiedzi
    client.post("/api/recipes/image-search")
    status = client.get("/api/recipes/image-search").json()
    assert status["found"] == 1 and status["missing"] == 0 and not status["running"]
    assert client.get(f"/api/recipes/{recipe['id']}").json()["image_url"] == "/media/chia.jpg"
    assert saved == ["https://blog.example/chia.jpg"]


def test_image_from_url(client, monkeypatch):
    recipe = client.post("/api/recipes", json={"title": "Placki"}).json()
    monkeypatch.setattr(fetcher, "fetch_image", lambda url: b"jpeg")
    monkeypatch.setattr(image_search.images, "save_image_bytes", lambda data: "placki.jpg")
    updated = client.post(f"/api/recipes/{recipe['id']}/image-from-url", json={"url": "https://x/p.jpg"}).json()
    assert updated["image_url"] == "/media/placki.jpg"


def test_gemini_search_reads_grounding_sources(monkeypatch):
    monkeypatch.setattr(ai, "search_recipe_pages", SEARCH_RECIPE_PAGES)
    monkeypatch.setattr(ai.get_settings(), "ai_provider", "gemini")
    monkeypatch.setattr(ai.get_settings(), "gemini_api_key", "test")
    response = SimpleNamespace(
        text="https://a.example/1\nhttps://b.example/2.",
        candidates=[SimpleNamespace(grounding_metadata=SimpleNamespace(grounding_chunks=[
            SimpleNamespace(web=SimpleNamespace(uri="https://a.example/1")),
            SimpleNamespace(web=SimpleNamespace(uri="https://redirect.example/c")),
        ]))],
    )
    sent = {}

    class FakeModels:
        def generate_content(self, **kwargs):
            sent.update(kwargs)
            return response

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=FakeModels()))
    urls = ai.search_recipe_pages("Pudding", ["chia"])
    assert urls == ["https://a.example/1", "https://b.example/2", "https://redirect.example/c"]
    assert sent["config"].tools[0].google_search is not None


def test_claude_search_reads_result_blocks(monkeypatch):
    monkeypatch.setattr(ai, "search_recipe_pages", SEARCH_RECIPE_PAGES)
    monkeypatch.setattr(ai.get_settings(), "ai_provider", "anthropic")
    monkeypatch.setattr(ai.get_settings(), "anthropic_api_key", "test")
    content = [
        SimpleNamespace(type="web_search_tool_result", content=[SimpleNamespace(url="https://a.example/1")]),
        SimpleNamespace(type="text", text="https://b.example/2"),
    ]

    class FakeMessages:
        def create(self, **kwargs):
            assert kwargs["tools"][0]["type"] == "web_search_20260209"
            return SimpleNamespace(content=content)

    monkeypatch.setattr(ai.anthropic, "Anthropic", lambda api_key: SimpleNamespace(messages=FakeMessages()))
    assert ai.search_recipe_pages("Pudding", []) == ["https://a.example/1", "https://b.example/2"]
