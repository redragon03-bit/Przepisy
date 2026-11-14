"""0.17.0: promocje w Zakupach osobno dla każdego sklepu; "sok" nie jest "sokiem z cytryny"."""

from types import SimpleNamespace

from app.services import promotions
from tests.test_release_090 import with_promos


def _promo(ingredient, name, store="Biedronka"):
    return SimpleNamespace(ingredient=ingredient, name=name, leaflet=SimpleNamespace(store=store))


def test_details_must_be_in_product_name():
    assert promotions.find_for("sok z cytryny", [_promo("sok", "Sok pomarańczowy Tymbark 1 l")]) is None
    assert promotions.find_for("sok z cytryny", [_promo("sok", "Sok z cytryn 100% 200 ml")]) is not None
    # 0.17.1: cała nazwa po kolei - sok imbirowy z cytryną to nie sok z cytryny
    assert promotions.find_for("sok z cytryny", [_promo("sok", "Sok NFC imbir z cytryną Premium Rosa 100%")]) is None
    assert promotions.find_for("mąka pszenna", [_promo("mąka", "Mąka pszenna typ 450")]) is not None
    assert promotions.find_for("kurczak piersi", [_promo("kurczak", "Kurczak cały")]) is None
    assert promotions.find_for("masło klarowane", [_promo("masło", "Masło ekstra Polmlek")]) is None
    # promocja dokładniejsza niż potrzebny produkt dalej pasuje
    assert promotions.find_for("ser", [_promo("ser żółty", "Ser Gouda plastry")]) is not None


def test_find_per_store():
    promos = [_promo("masło", "Masło ekstra", "Biedronka"), _promo("masło", "Masło Łaciate", "Lidl"),
              _promo("masło", "Masło osełka", "Lidl"), _promo("mąka", "Mąka", "Kaufland")]
    found = promotions.find_per_store("masło", promos)
    assert [(p.leaflet.store, p.name) for p in found] == [("Biedronka", "Masło ekstra"), ("Lidl", "Masło Łaciate")]


def test_shopping_lists_promo_from_each_store(client, monkeypatch):
    with_promos(client, monkeypatch)
    client.post("/api/shopping", json={"text": "masło"})
    client.post("/api/shopping", json={"text": "udo z kurczaka"})
    items = {i["text"]: i for i in client.get("/api/shopping").json()}
    assert items["masło"]["promos"] == [{"ingredient": "masło", "store": "Biedronka", "label": "Biedronka 2,49 zł"}]
    assert items["masło"]["promo"] == "Biedronka 2,49 zł"
    assert [p["store"] for p in items["udo z kurczaka"]["promos"]] == ["Lidl"]


def test_placeholder_price_is_dropped():
    # Blix podaje "0,01 zł" zamiast ceny części ofert Kauflandu (cukier puder za grosz)
    assert not promotions.real_price("0,01 zł")
    assert promotions.real_price("0,66 zł")
    assert promotions.real_price("14,99 zł/kg")
    assert promotions.real_price("2 za 1")
    lines = ["Cukier puder Diamant", "0,01 zł", "Masło ekstra", "2,49 zł", "Sok Tymbark 0,01 zł"]
    assert promotions.priced_offers(lines) == ["Masło ekstra 2,49 zł"]
