"""Nowe funkcje: import z tekstu i filmów, dziennik gotowania, zamienniki, warianty,
terminy w spiżarni, plan od AI i plan na dziś w Home Assistant."""

import io
from datetime import date, timedelta

from PIL import Image

from app.database import SessionLocal
from app.services import ai, importer, plan_sensor, video
from app.services.ai import AiIngredient, AiRecipe, AiStep


def make_recipe(client, title, names=(), **extra):
    body = {"title": title, "ingredients": [{"text": n, "name": n} for n in names],
            "steps": [{"text": "Wymieszaj."}], **extra}
    return client.post("/api/recipes", json=body).json()


def ai_recipe(title, names=("mąka",)):
    return AiRecipe(
        title=title, description="", servings="4 porcje", prep_minutes=None, cook_minutes=None,
        total_minutes=30, original_language="pl",
        ingredients=[AiIngredient(text=f"100 g {n}", name=n, amount=100, unit="g", original_text=n) for n in names],
        steps=[AiStep(text="Wymieszaj.", image_index=None)], main_image_index=None, categories=["Obiad"],
    )


def _jpeg() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (100, 100), "green").save(out, "JPEG")
    return out.getvalue()


def test_import_from_pasted_text(client, monkeypatch):
    monkeypatch.setattr(importer.get_settings(), "gemini_api_key", "test")
    seen = {}

    def fake(text, categories):
        seen["text"] = text
        return [ai_recipe("Placki od cioci")]

    monkeypatch.setattr(ai, "recipes_from_text", fake)
    text = "Placki cioci Basi: 2 jajka, szklanka mąki, mleko. Wymieszać i smażyć."
    job = client.post("/api/imports/text", json={"text": text}).json()
    assert job["kind"] == "text" and job["source"].startswith("Placki cioci")
    job = client.get(f"/api/imports/{job['id']}").json()
    assert job["status"] == "done", job["error"]
    assert seen["text"] == text
    recipe = client.get(f"/api/recipes/{job['recipe_id']}").json()
    assert recipe["title"] == "Placki od cioci" and recipe["source_type"] == "text"
    # Po udanym imporcie tekst jest usuwany
    assert not importer.job_upload_dir(job["id"]).exists()


def test_failed_text_import_can_be_retried(client, monkeypatch):
    monkeypatch.setattr(importer.get_settings(), "gemini_api_key", "test")
    answers = [ai.AiError("przeciążone"), [ai_recipe("Zupa")]]

    def flaky(text, categories):
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(ai, "recipes_from_text", flaky)
    job = client.post("/api/imports/text", json={"text": "Zupa: woda, marchew, gotować 20 minut."}).json()
    assert client.get(f"/api/imports/{job['id']}").json()["status"] == "failed"
    client.post(f"/api/imports/{job['id']}/retry")
    assert client.get(f"/api/imports/{job['id']}").json()["status"] == "done"


def test_video_link_uses_description_and_subtitles(client, monkeypatch):
    monkeypatch.setattr(importer.get_settings(), "gemini_api_key", "test")
    info = {"title": "Najlepszy makaron", "uploader": "kucharz", "description": "Składniki: makaron 200 g, czosnek",
            "thumbnail": "https://cdn.example.com/thumb.jpg",
            "automatic_captions": {"pl": [{"ext": "json3", "url": "x"},
                                          {"ext": "vtt", "url": "https://cdn.example.com/napisy.vtt"}]}}
    monkeypatch.setattr(video, "_extract_info", lambda url: info)
    vtt = "WEBVTT\n\n00:00.000 --> 00:02.000\ndodaj <c>czosnek</c>\n\n00:02.000 --> 00:04.000\ndodaj czosnek\n"
    monkeypatch.setattr(video.fetcher, "fetch_html", lambda url: (vtt, url))
    monkeypatch.setattr(importer.images, "download_image", lambda url: None)
    seen = {}

    def fake(page, categories):
        seen["page"] = page
        return [ai_recipe("Makaron z czosnkiem")]

    monkeypatch.setattr(ai, "recipes_from_page", fake)
    job = client.post("/api/imports/url", json={"url": "https://www.tiktok.com/@kucharz/video/123"}).json()
    job = client.get(f"/api/imports/{job['id']}").json()
    assert job["status"] == "done", job["error"]
    text = seen["page"].text
    assert "makaron 200 g" in text and "Napisy" in text and text.count("dodaj czosnek") == 1
    assert seen["page"].image_urls == ["https://cdn.example.com/thumb.jpg"]


def test_video_sites_detection():
    assert video.is_video_url("https://youtu.be/abc")
    assert video.is_video_url("https://vm.tiktok.com/xyz")
    assert video.is_video_url("https://www.instagram.com/reel/abc/")
    assert not video.is_video_url("https://www.kwestiasmaku.com/przepis/tiktok.com")


def test_cook_log_with_rating_note_and_photo(client):
    recipe = make_recipe(client, "Gulasz")
    first = client.post(f"/api/recipes/{recipe['id']}/cooked", data={"rating": "5", "note": "pyszne"},
                        files={"photo": ("g.jpg", _jpeg(), "image/jpeg")}).json()
    assert first["cooked_count"] == 1 and first["rating"] == 5
    assert first["cook_log"][0]["note"] == "pyszne" and first["cook_log"][0]["image_url"]
    # Bez niczego - jak dawny przycisk "Ugotowane"
    second = client.post(f"/api/recipes/{recipe['id']}/cooked").json()
    assert second["cooked_count"] == 2 and len(second["cook_log"]) == 2
    # Ocena to średnia z ocenionych gotowań
    third = client.post(f"/api/recipes/{recipe['id']}/cooked", data={"rating": "2", "note": "za słone"}).json()
    assert third["rating"] == 4  # (5 + 2) / 2 = 3,5 -> 4
    assert [e["note"] for e in third["cook_log"]] == ["za słone", "", "pyszne"]
    # Pomyłkę można usunąć
    undone = client.delete(f"/api/recipes/{recipe['id']}/cooked/{third['cook_log'][0]['id']}").json()
    assert undone["cooked_count"] == 2 and len(undone["cook_log"]) == 2


def test_substitute(client, monkeypatch):
    recipe = make_recipe(client, "Sos", ["śmietana"])
    seen = {}

    def fake(title, lines, ingredient):
        seen.update(title=title, ingredient=ingredient)
        return ai.AiSubstitute(text="Jogurt grecki, 1:1.")

    monkeypatch.setattr(ai, "substitute", fake)
    answer = client.post(f"/api/recipes/{recipe['id']}/substitute", json={"ingredient": "śmietana"}).json()
    assert answer == {"text": "Jogurt grecki, 1:1."}
    assert seen == {"title": "Sos", "ingredient": "śmietana"}


def test_variants_are_kept_with_main_recipe(client, monkeypatch):
    main = make_recipe(client, "Gulasz", ["wołowina"])
    client.post(f"/api/recipes/{main['id']}/image", files={"file": ("g.jpg", _jpeg(), "image/jpeg")})
    monkeypatch.setattr(ai, "variant", lambda text, wish: ai.AiVariant(name="wege", recipe=ai_recipe("Gulasz (wege)", ["ciecierzyca"])))
    variant = client.post(f"/api/recipes/{main['id']}/variant", json={"wish": "wersja wege"}).json()
    assert variant["variant_name"] == "wege" and variant["variant_of"]["id"] == main["id"]
    assert variant["image_url"] and variant["image_url"] != client.get(f"/api/recipes/{main['id']}").json()["image_url"]
    # Na liście jest tylko przepis główny, a on zna swój wariant
    assert [r["title"] for r in client.get("/api/recipes").json()] == ["Gulasz"]
    assert client.get("/api/recipes/stats").json()["total"] == 1
    assert [v["variant_name"] for v in client.get(f"/api/recipes/{main['id']}").json()["variants"]] == ["wege"]
    # Wariant wariantu też należy do przepisu głównego
    monkeypatch.setattr(ai, "variant", lambda text, wish: ai.AiVariant(name="na 8 osób", recipe=ai_recipe("Gulasz wege x2")))
    second = client.post(f"/api/recipes/{variant['id']}/variant", json={"wish": "na 8 osób"}).json()
    assert second["variant_of"]["id"] == main["id"]
    assert [v["variant_name"] for v in second["variants"]] == ["wege"]
    # Usunięcie przepisu głównego zostawia warianty jako zwykłe przepisy
    client.delete(f"/api/recipes/{main['id']}")
    assert sorted(r["title"] for r in client.get("/api/recipes").json()) == ["Gulasz (wege)", "Gulasz wege x2"]


def test_pantry_expiry_puts_recipes_using_it_first(client):
    make_recipe(client, "Jajecznica", ["jajko", "masło"])
    make_recipe(client, "Twarożek", ["twaróg", "szczypiorek"])
    client.put("/api/pantry", json={"names": ["jajko", "masło", "twaróg", "szczypiorek"]})
    soon = (date.today() + timedelta(days=1)).isoformat()
    items = client.put("/api/pantry/expires", json={"name": "twaróg", "expires": soon}).json()
    assert {"name": "twaróg", "expires": soon} in items
    matches = client.post("/api/cook", json={"ingredients": ["jajko", "masło", "twaróg", "szczypiorek"]}).json()
    assert matches[0]["recipe"]["title"] == "Twarożek" and matches[0]["use_first"] == ["twaróg"]
    # Produkt usunięty ze spiżarni traci termin
    client.put("/api/pantry", json={"names": ["jajko"]})
    client.put("/api/pantry", json={"names": ["jajko", "twaróg"]})
    assert {"name": "twaróg", "expires": None} in client.get("/api/pantry/items").json()
    assert client.put("/api/pantry/expires", json={"name": "kawior", "expires": soon}).status_code == 404


def test_plan_suggestion_runs_in_background(client, monkeypatch):
    fish = make_recipe(client, "Łosoś z piekarnika", ["łosoś"])
    soup = make_recipe(client, "Zupa pomidorowa", ["pomidor"])
    days = [date.today() + timedelta(days=n) for n in (1, 2)]
    seen = {}

    def fake(context, day_list, wishes):
        seen.update(context=context, days=day_list, wishes=wishes)
        return ai.AiPlan(text="Raz ryba, raz zupa.", days=[
            ai.AiPlanDay(day=day_list[1], recipe_id=soup["id"], reason="szybka"),
            ai.AiPlanDay(day=day_list[0], recipe_id=fish["id"], reason="ryba"),
            ai.AiPlanDay(day=day_list[0], recipe_id=9999, reason="nie istnieje"),
        ])

    monkeypatch.setattr(ai, "suggest_plan", fake)
    started = client.post("/api/plan/suggest", json={"days": [d.isoformat() for d in days], "wishes": "raz ryba"}).json()
    result = client.get(f"/api/plan/suggest/{started['id']}").json()
    assert result["status"] == "done", result["error"]
    assert [d["recipe"]["title"] for d in result["days"]] == ["Łosoś z piekarnika", "Zupa pomidorowa"]
    assert "Łosoś z piekarnika" in seen["context"] and seen["wishes"] == "raz ryba"
    assert client.get("/api/plan/suggest/12345").status_code == 404


def test_plan_suggestion_failure_is_shown(client, monkeypatch):
    def boom(*args):
        raise ai.AiError("Żadne AI nie odpowiedziało.")

    monkeypatch.setattr(ai, "suggest_plan", boom)
    started = client.post("/api/plan/suggest", json={"days": [date.today().isoformat()]}).json()
    result = client.get(f"/api/plan/suggest/{started['id']}").json()
    assert result["status"] == "failed" and "Żadne AI" in result["error"]


def test_today_sensor_for_home_assistant(client):
    gulasz = make_recipe(client, "Gulasz", ["wołowina"])
    salad = make_recipe(client, "Sałatka", ["ogórek"])
    today = date.today()
    client.post("/api/plan", json={"day": today.isoformat(), "recipe_id": gulasz["id"]})
    client.post("/api/plan", json={"day": (today + timedelta(days=1)).isoformat(), "recipe_id": salad["id"]})
    with SessionLocal() as db:
        body = plan_sensor.sensor_state(db, today)
        empty = plan_sensor.sensor_state(db, today + timedelta(days=5))
    assert body["state"] == "Gulasz"
    assert body["attributes"]["recipes"][0]["ingredients"] == ["wołowina"]
    assert body["attributes"]["tomorrow"] == "Sałatka"
    assert empty["state"] == "nic nie zaplanowano"


def test_today_sensor_is_sent_to_home_assistant(client, monkeypatch):
    settings = plan_sensor.get_settings()
    monkeypatch.setattr(settings, "ha_url", "http://ha.local:8123")
    monkeypatch.setattr(settings, "ha_token", "token")
    sent = {}

    class Response:
        status_code = 200

    def fake_post(url, json, timeout, headers):
        sent.update(url=url, body=json, auth=headers["Authorization"])
        return Response()

    monkeypatch.setattr(plan_sensor.httpx, "post", fake_post)
    plan_sensor.publish()
    assert sent["url"] == "http://ha.local:8123/api/states/sensor.przepisy_dzis"
    assert sent["auth"] == "Bearer token" and sent["body"]["state"] == "nic nie zaplanowano"
