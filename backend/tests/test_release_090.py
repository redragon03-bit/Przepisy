"""Wydanie 0.9.0: promocje z gazetek (Lidl i Blix), przepisy z produktami w promocji, pomysły od AI."""

import time
from datetime import date, timedelta

from app.services import ai, promotions
from app.services.ai import AiPromoIdeas, AiPromotion, AiRecipe

TODAY = date.today()


def iso(days: int) -> str:
    return (TODAY + timedelta(days=days)).isoformat()


def dm(days: int) -> str:
    return (TODAY + timedelta(days=days)).strftime("%d.%m")


LIDL_LIST = """<a href="/l/pl/gazetki/gazetka-pon/ar/0?_ab=1">Gazetka</a>
<a href="/l/pl/gazetki/gazetka-katalog-kw45/ar/0">Katalog</a>
<a href="/l/pl/gazetki/katalog-zabawek-kw45/ar/0">Zabawki</a>"""

LIDL_FLYER = {"flyer": {
    "name": "Gazetka", "title": "2.11", "offerStartDate": iso(-1), "offerEndDate": iso(3),
    "pages": [
        {"number": 3, "altText": "Uda z kurczaka XXL marki Rzeźnik.", "keyWords": "Uda Xxl 1249 1399"},
        {"number": 4, "altText": "", "keyWords": ""},
    ],
}}


def blix_store(store: str) -> str:
    return f"""<section class="other-leaflets-section">
<a class="leaflet__link" href="/sklep/{store}/gazetka/100/" title="Od poniedziałku {dm(-1)}-{dm(4)}"><img></a>
<a href="/sklep/{store}/gazetka/100/">Od poniedziałku</a>
<a href="/sklep/{store}/gazetka/101/" title="Stara {dm(-20)}-{dm(-10)}"></a>
<a href="/sklep/{store}/gazetka/102/" title="Magiczna kraina zabawek"></a>
<a href="/sklep/inny/gazetka/200/" title="Inny sklep"></a>
</section>"""


BLIX_LEAFLET = f"""<html><body><h1>Gazetka - Od poniedziałku - {dm(-1)}-{dm(4)}</h1>
<nav>Menu</nav>
<section><h2>Wybrane oferty z tej gazetki</h2>
<div><span>Masło ekstra Polmlek</span> <span>2,49 zł</span></div>
<div><span>Masło ekstra Polmlek</span> <span>2,49 zł</span></div>
<div><span>Olej rzepakowy Wyborny</span> <a>Zobacz</a></div>
<div><span>Ręcznik papierowy</span> <span>8,99 zł</span></div>
</section></body></html>"""


def fake_web(monkeypatch, calls):
    def fetch_html(url):
        calls.append(url)
        if url == promotions.LIDL_LIST:
            return LIDL_LIST, url
        if url.endswith("/gazetka/100/"):
            return BLIX_LEAFLET, url
        store = url.rstrip("/").rsplit("/", 1)[-1]
        return blix_store(store), url

    def fetch_json(url):
        calls.append(url)
        assert "flyer_identifier=gazetka-pon" in url
        return LIDL_FLYER

    monkeypatch.setattr(promotions, "fetch_html", fetch_html)
    monkeypatch.setattr(promotions, "fetch_json", fetch_json)


def fake_ai(monkeypatch, texts):
    def read(store, title, text):
        texts.append((store, text))
        if store == "Lidl":
            return [AiPromotion(name="Uda z kurczaka XXL Rzeźnik", category="jedzenie", ingredient="udo z kurczaka",
                                price="12,49 zł",
                                note="")]
        return [AiPromotion(name="Masło ekstra Polmlek", category="jedzenie", ingredient="masło", price="2,49 zł",
                            note="z kartą")]

    monkeypatch.setattr(promotions.ai, "promotions_from_text", read)


def test_parse_dates():
    today = date(2026, 11, 3)
    assert promotions.parse_dates("Od poniedziałku - 02.11-07.11", today) == (date(2026, 11, 2), date(2026, 11, 7))
    assert promotions.parse_dates("29.12 – 04.01", date(2026, 12, 30)) == (date(2026, 12, 29), date(2027, 1, 4))
    assert promotions.parse_dates("od 02.11", today) == (date(2026, 11, 2), None)
    assert promotions.parse_dates("Hity tygodnia", today) == (None, None)


def test_blix_text_takes_offer_section_without_repeats():
    title, text = promotions.blix_text(BLIX_LEAFLET)
    assert title.startswith("Gazetka - Od poniedziałku")
    # Tylko oferty z ceną, każda raz, z ceną w tej samej linii
    assert text.splitlines() == ["Masło ekstra Polmlek 2,49 zł", "Ręcznik papierowy 8,99 zł"]


def test_priced_offers_joins_price_lines():
    lines = ["Nagłówek", "Jabłka polskie", "2,99 zł/kg", "Olej Wyborny", "Zobacz", "Mleko UHT 1,99 zł", "-30%"]
    # Rabat w osobnej linii dołącza do oferty przed nim
    assert promotions.priced_offers(lines) == ["Jabłka polskie 2,99 zł/kg", "Mleko UHT 1,99 zł -30%"]


def test_lidl_leaflet_uses_page_texts():
    leaflet = promotions.lidl_leaflet("gazetka-pon", LIDL_FLYER["flyer"])
    assert leaflet.title == "Gazetka 2.11"
    assert leaflet.valid_to == TODAY + timedelta(days=3)
    assert leaflet.text == "Strona 3: Uda z kurczaka XXL marki Rzeźnik. | Uda Xxl 1249 1399"


def test_refresh_reads_each_leaflet_once(client, monkeypatch):
    monkeypatch.setattr(promotions.get_settings(), "promo_stores", "lidl,biedronka")
    monkeypatch.setattr(promotions.get_settings(), "gemini_api_key", "klucz")
    calls, texts = [], []
    fake_web(monkeypatch, calls)
    fake_ai(monkeypatch, texts)

    promotions.refresh()
    # Lidl bez katalogów; Biedronka bez starej gazetki, zabawek i gazetek innego sklepu
    assert [store for store, _ in texts] == ["Lidl", "Biedronka"]
    assert "Olej" not in texts[1][1]
    assert not any("katalog" in url or "/gazetka/101/" in url or "/102/" in url for url in calls)
    items = client.get("/api/promotions").json()
    assert {(i["store"], i["ingredient"], i["price"]) for i in items} == {
        ("Lidl", "udo z kurczaka", "12,49 zł"), ("Biedronka", "masło", "2,49 zł")}
    status = client.get("/api/promotions/status").json()
    assert status["stores"] == ["Lidl", "Biedronka"] and not status["running"] and status["errors"] == []
    assert [lf["count"] for lf in status["leaflets"]] == [1, 1]

    # Drugie sprawdzenie: te same gazetki - AI nie czyta ich ponownie
    texts.clear()
    promotions.refresh()
    assert texts == []
    assert len(client.get("/api/promotions").json()) == 2


def test_refresh_stops_when_ai_fails_and_retries_later(client, monkeypatch):
    monkeypatch.setattr(promotions.get_settings(), "promo_stores", "biedronka")
    fake_web(monkeypatch, [])

    def broken(store, title, text):
        raise ai.AiError("Limit wyczerpany")

    monkeypatch.setattr(promotions.ai, "promotions_from_text", broken)
    promotions.refresh()
    status = client.get("/api/promotions/status").json()
    assert status["errors"] == ["Biedronka: Limit wyczerpany"]
    assert status["leaflets"][0]["status"] == "failed"

    texts = []
    fake_ai(monkeypatch, texts)
    promotions.refresh()
    assert len(texts) == 1
    assert client.get("/api/promotions/status").json()["leaflets"][0]["status"] == "done"


def make_recipe(client, title, names):
    body = {"title": title, "steps": [{"text": "Gotuj."}],
            "ingredients": [{"text": n, "name": n} for n in names]}
    return client.post("/api/recipes", json=body).json()


def with_promos(client, monkeypatch):
    monkeypatch.setattr(promotions.get_settings(), "promo_stores", "lidl,biedronka")
    fake_web(monkeypatch, [])
    fake_ai(monkeypatch, [])
    promotions.refresh()


def test_recipes_with_promoted_ingredients(client, monkeypatch):
    with_promos(client, monkeypatch)
    make_recipe(client, "Udka pieczone", ["udo z kurczaka", "masło", "sól"])
    make_recipe(client, "Ciasto", ["masło klarowane", "mąka"])
    make_recipe(client, "Sałatka", ["pomidor"])
    found = client.get("/api/promotions/recipes").json()
    assert [m["recipe"]["title"] for m in found] == ["Udka pieczone", "Ciasto"]
    assert found[0]["promos"] == [{"ingredient": "udo z kurczaka", "store": "Lidl", "label": "Lidl 12,49 zł"},
                                  {"ingredient": "masło", "store": "Biedronka", "label": "Biedronka 2,49 zł"}]


def test_promo_to_shopping_list_and_badge(client, monkeypatch):
    with_promos(client, monkeypatch)
    butter = next(p for p in client.get("/api/promotions").json() if p["ingredient"] == "masło")
    item = client.post(f"/api/promotions/{butter['id']}/shopping").json()
    assert item["text"] == "Masło ekstra Polmlek (Biedronka 2,49 zł)" and item["promo"] == "Biedronka 2,49 zł"
    client.post("/api/shopping", json={"text": "2 udka z kurczaka"})
    client.post("/api/shopping", json={"text": "chleb"})
    badges = {i["text"]: i["promo"] for i in client.get("/api/shopping").json()}
    assert badges["chleb"] == ""


def test_ideas_from_promotions(client, monkeypatch):
    with_promos(client, monkeypatch)
    seen = {}

    def ideas(promos, titles, wishes, categories):
        seen.update(promos=promos, wishes=wishes)
        recipe = AiRecipe(title="Udka w maśle", description="", servings="4 porcje", prep_minutes=None,
                          cook_minutes=None, total_minutes=None, original_language="pl", ingredients=[],
                          steps=[], main_image_index=None, categories=[])
        return AiPromoIdeas(text="Kup udka w Lidlu.", recipes=[recipe])

    monkeypatch.setattr(ai, "promo_ideas", ideas)
    job = client.post("/api/promotions/ideas", json={"wishes": "szybko", "stores": ["Lidl"]}).json()
    for _ in range(50):
        job = client.get(f"/api/promotions/ideas/{job['id']}").json()
        if job["status"] != "running":
            break
        time.sleep(0.05)
    assert job["status"] == "done" and job["recipes"][0]["title"] == "Udka w maśle"
    assert "udo z kurczaka" in seen["promos"] and "masło" not in seen["promos"] and seen["wishes"] == "szybko"


def test_ideas_without_promotions_fail(client):
    job = client.post("/api/promotions/ideas", json={}).json()
    job = client.get(f"/api/promotions/ideas/{job['id']}").json()
    assert job["status"] == "failed" and "promocji" in job["error"]


def test_chunks_split_on_lines():
    text = "\n".join(f"linia {i}" for i in range(1000))
    chunks = ai._chunks(text, 500)
    assert all(len(c) <= 520 for c in chunks)
    assert "".join(chunks).count("linia") == 1000


def test_leaflets_read_by_older_parser_are_read_again(client, monkeypatch):
    from app.database import SessionLocal
    from app.models import PromoLeaflet

    with_promos(client, monkeypatch)
    with SessionLocal() as db:
        db.query(PromoLeaflet).filter(PromoLeaflet.store == "Biedronka").update({"parser": 1})
        db.commit()
    texts = []
    fake_ai(monkeypatch, texts)
    promotions.refresh()
    assert [store for store, _ in texts] == ["Biedronka"]


def test_stores_take_turns(client, monkeypatch):
    monkeypatch.setattr(promotions.get_settings(), "promo_stores", "biedronka,kaufland")
    monkeypatch.setattr(promotions, "_store_leaflets", lambda store: [
        promotions.Leaflet(store=store, title=f"{store} {n}", url=f"https://x/{store}/{n}", text="Mleko 1,99 zł")
        for n in range(3)])
    texts = []
    monkeypatch.setattr(promotions.ai, "promotions_from_text", lambda store, title, text: texts.append(title) or [])
    promotions.refresh()
    assert texts == ["biedronka 0", "kaufland 0", "biedronka 1", "kaufland 1", "biedronka 2", "kaufland 2"]
    assert promotions.status.progress == ""


def test_bulk_reading_uses_lighter_gemini_first(monkeypatch):
    from app.services.ai import gemini

    settings = promotions.get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "klucz")
    monkeypatch.setattr(settings, "gemini_model", "glowny")
    monkeypatch.setattr(settings, "gemini_fallback_model", "lekki")
    used = []
    monkeypatch.setattr(gemini, "_gemini_once", lambda client, model, *args: used.append(model) or "ok")
    gemini._ask_gemini(["tekst"], "polecenie", AiPromotion)
    with ai.bulk():
        gemini._ask_gemini(["tekst"], "polecenie", AiPromotion)
    assert used == ["glowny", "lekki"]
