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

    monkeypatch.setattr(ai.gemini.genai, "Client", lambda api_key: SimpleNamespace(models=FakeModels()))
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

    monkeypatch.setattr(ai.claude.anthropic, "Anthropic", lambda api_key: SimpleNamespace(messages=FakeMessages()))
    assert ai.search_recipe_pages("Pudding", []) == ["https://a.example/1", "https://b.example/2"]


WEB_SEARCH_PAGES = image_search.web_search.search_pages

DDG_HTML = """
<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kwestiasmaku.com%2Fprzepis%2Fbutter-chicken&amp;rut=abc">Butter chicken</a>
<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1&amp;rut=def">Film</a>
<a rel="nofollow" class="result__a" href="https://aniagotuje.pl/przepis/butter-chicken">Ania</a>
"""

BING_HTML = """
<li class="b_algo" data-x="1"><div><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=1&amp;u=a1aHR0cHM6Ly9leGFtcGxlLnBsL3BsYWNraQ&amp;ntb=1" h="ID=1">Placki</a></h2></div></li>
<li class="b_algo"><h2><a href="https://www.mojewypieki.com/przepis/placki">Placki</a></h2></li>
"""


def test_web_search_reads_duckduckgo(monkeypatch):
    monkeypatch.setattr(image_search.web_search, "search_pages", WEB_SEARCH_PAGES)
    asked = []
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: asked.append(url) or (DDG_HTML, url))
    pages = image_search.web_search.search_pages("butter chicken przepis")
    assert pages == ["https://www.kwestiasmaku.com/przepis/butter-chicken", "https://aniagotuje.pl/przepis/butter-chicken"]
    assert asked == ["https://html.duckduckgo.com/html/?q=butter+chicken+przepis"]


def test_web_search_falls_back_to_bing(monkeypatch):
    monkeypatch.setattr(image_search.web_search, "search_pages", WEB_SEARCH_PAGES)

    def fake(url):
        if "duckduckgo" in url:
            raise fetcher.FetchError("blokada")
        return BING_HTML, url

    monkeypatch.setattr(fetcher, "fetch_html", fake)
    assert image_search.web_search.search_pages("placki") == [
        "https://example.pl/placki", "https://www.mojewypieki.com/przepis/placki",
    ]


def test_web_search_is_tried_before_ai(client, monkeypatch):
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")
    monkeypatch.setattr(image_search.web_search, "search_pages", lambda query: ["https://blog.example/pudding"])

    def no_ai(title, names):
        raise AssertionError("AI nie powinno być pytane, gdy wyszukiwarka coś znalazła")

    monkeypatch.setattr(image_search.ai, "search_recipe_pages", no_ai)
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: (PAGE, url))
    recipe = client.post("/api/recipes", json={"title": "Pudding chia"}).json()
    assert client.get(f"/api/recipes/{recipe['id']}/image-candidates").json() == ["https://blog.example/chia.jpg"]
