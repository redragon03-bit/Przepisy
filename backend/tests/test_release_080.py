"""Wydanie 0.8.0: szukanie w krokach i notatkach, duplikaty linków, eksport schema.org,
kalendarz .ics z planem i cotygodniowy yt-dlp."""

import subprocess
from datetime import date

from app.services import ytdlp_update
from app.services.urls import url_key


def make_recipe(client, title, **extra):
    body = {
        "title": title,
        "ingredients": [{"text": "200 g mąki", "name": "mąka pszenna", "amount": 200, "unit": "g"}],
        "steps": [{"text": "Wymieszaj."}],
        **extra,
    }
    return client.post("/api/recipes", json=body).json()


def titles(client, q):
    return [r["title"] for r in client.get("/api/recipes", params={"q": q}).json()]


def test_search_in_description_steps_and_notes(client):
    make_recipe(client, "Indyk", notes="Najlepszy z żurawiną")
    make_recipe(client, "Sernik", steps=[{"text": "Piecz w kąpieli wodnej."}])
    make_recipe(client, "Zupa", description="Rozgrzewająca, z imbirem")
    make_recipe(client, "Placki")
    assert titles(client, "zurawina") == ["Indyk"]
    assert titles(client, "kąpieli") == ["Sernik"]
    assert titles(client, "imbir") == ["Zupa"]
    # Tytuł i składniki dalej działają
    assert set(titles(client, "mąka")) == {"Indyk", "Sernik", "Zupa", "Placki"}


def test_url_key_ignores_tracking_and_mobile():
    page = "https://www.kwestiasmaku.com/przepis/sernik"
    assert url_key("https://m.kwestiasmaku.com/przepis/sernik/?utm_source=fb&fbclid=1#komentarze") == url_key(page)
    assert url_key("http://kwestiasmaku.com/przepis/sernik") == url_key(page)
    assert url_key("https://kwestiasmaku.com/przepis/sernik?page=2") != url_key(page)
    video = url_key("https://www.youtube.com/watch?v=abc123&t=30")
    assert url_key("https://youtu.be/abc123?si=xyz") == video
    assert url_key("https://m.youtube.com/shorts/abc123") == video


def test_import_finds_duplicate_with_other_link_form(client, monkeypatch):
    from app.routers import imports

    monkeypatch.setattr(imports, "run_url_import", lambda job_id: None)
    recipe = make_recipe(client, "Sernik", source_url="https://www.kwestiasmaku.com/przepis/sernik")
    job = client.post("/api/imports/url", json={"url": "https://m.kwestiasmaku.com/przepis/sernik/?utm_source=ig"})
    assert job.json()["status"] == "duplicate" and job.json()["recipe_id"] == recipe["id"]
    other = client.post("/api/imports/url", json={"url": "https://www.kwestiasmaku.com/przepis/makowiec"})
    assert other.json()["status"] != "duplicate"


def test_schema_org_export(client):
    recipe = make_recipe(client, "Gulasz", servings="4 porcje", prep_minutes=20, notes="Z kluskami",
                         source_url="https://example.com/gulasz")
    client.patch(f"/api/recipes/{recipe['id']}", json={"rating": 5})
    response = client.get("/api/backup/schema-org")
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    [data] = response.json()
    assert data["@type"] == "Recipe" and data["name"] == "Gulasz"
    assert data["recipeYield"] == "4 porcje" and data["prepTime"] == "PT20M"
    assert data["recipeIngredient"] == ["200 g mąki"]
    assert data["recipeInstructions"] == [{"@type": "HowToStep", "text": "Wymieszaj."}]
    assert data["url"] == "https://example.com/gulasz"
    assert data["aggregateRating"]["ratingValue"] == 5
    assert "cookTime" not in data  # puste pola pomijamy


def test_calendar_feed(client):
    recipe = make_recipe(client, "Gulasz, węgierski")
    entry = client.post("/api/plan", json={"day": date.today().isoformat(), "recipe_id": recipe["id"]}).json()
    client.patch(f"/api/plan/{entry['id']}", json={"servings": 6})
    path = client.get("/api/calendar/link").json()["path"]
    client.cookies.clear()  # kalendarz pobiera plik bez logowania
    assert client.get("/api/calendar.ics", params={"token": "zly"}).status_code == 404
    response = client.get(path + "&app=https://przepisy.example.ts.net")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    body = response.text
    assert "SUMMARY:Gulasz\\, węgierski (6 por.)" in body
    assert f"DTSTART;VALUE=DATE:{date.today():%Y%m%d}" in body
    assert f"URL:https://przepisy.example.ts.net/przepis/{recipe['id']}" in body
    assert all(len(line.encode()) <= 75 for line in body.split("\r\n"))


def test_calendar_link_needs_login(client):
    client.cookies.clear()
    assert client.get("/api/calendar/link").status_code == 401


def test_ytdlp_update_failure_keeps_current(monkeypatch, tmp_path):
    monkeypatch.setattr(ytdlp_update, "lib_dir", lambda: tmp_path / "pylib")

    def fail(*args, **kwargs):
        raise subprocess.CalledProcessError(1, "pip")

    monkeypatch.setattr(ytdlp_update.subprocess, "run", fail)
    assert ytdlp_update.update() is False
    assert not (tmp_path / "pylib").exists()
    assert ytdlp_update._due()
    assert ytdlp_update.module().__name__ == "yt_dlp"


def test_ytdlp_update_installs_to_data_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(ytdlp_update, "lib_dir", lambda: tmp_path / "pylib")

    def fake_pip(command, **kwargs):
        target = command[command.index("--target") + 1]
        (tmp_path / "pylib-new").mkdir()
        assert target == str(tmp_path / "pylib-new")

    monkeypatch.setattr(ytdlp_update.subprocess, "run", fake_pip)
    assert ytdlp_update.update() is True
    assert (tmp_path / "pylib").is_dir() and not (tmp_path / "pylib-new").exists()
    assert not ytdlp_update._due()

