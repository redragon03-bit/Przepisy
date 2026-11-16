"""0.24.3: produkt w domu pasuje do składnika mimo odmiany i dodatkowych słów, "sól i pieprz" rozbite."""

from app.services.matching import covers, in_stock
from tests.test_features import make_recipe


def test_odmiana_i_przymiotnik():
    assert covers("karkówka", "karkówki wieprzowej")
    assert covers("karkówka", "karkówka wieprzowa")
    assert covers("ser", "ser żółty")
    assert covers("jajko", "jajka")
    assert covers("pomidory", "pomidorów")


def test_rozne_produkty():
    for have, needed in [("ser", "serek"), ("pomidor", "koncentrat pomidorowy"), ("pomidor", "pomidorowy"),
                         ("jogurt grecki", "jogurt naturalny"), ("czosnek", "bagiety czosnkowe"),
                         ("oliwa", "oliwki zielone"), ("olej", "olejek waniliowy"), ("cukier", "cukierki"),
                         ("kasza gryczana", "kaszanka"), ("fasola", "fasolka szparagowa"),
                         ("papryka słodka", "papryka"), ("mleko kokosowe", "mleko"),
                         ("masło orzechowe", "masło")]:
        assert not covers(have, needed), (have, needed)


def test_kilka_skladnikow_w_jednym():
    assert in_stock(["sól", "pieprz"], "sól i pieprz")
    assert not in_stock(["sól"], "sól i pieprz")
    assert in_stock([], "sól i pieprz", ["sól", "pieprz"])
    assert in_stock(["margaryna"], "masło lub margaryna")
    assert in_stock(["chleb"], "chleb (np. bagietka, ciabatta)")


def test_zawsze_w_domu_tylko_dokladnie():
    staples = ["cukier", "olej", "oliwa", "sól"]
    assert in_stock([], "cukier", staples)
    for needed in ("cukier puder", "olej kokosowy", "oliwki", "sól morska", "olejek waniliowy"):
        assert not in_stock([], needed, staples), needed


def _staples(client, *names):
    for name in names:
        client.post("/api/ingredients/staples", json={"name": name})


def test_co_ugotuje_i_zakupy_z_zawsze_w_domu(client):
    _staples(client, "sól", "pieprz", "cukier")
    r = make_recipe(client, "Karkówka", [("sól i pieprz", "sól i pieprz", 0, ""),
                                         ("karkówka wieprzowa", "karkówka wieprzowa", 1, "kg"),
                                         ("cukier puder", "cukier puder", 50, "g"),
                                         ("cebula", "cebula", 1, "szt")])
    res = client.post("/api/cook", json={"ingredients": ["karkówka"], "max_missing": 2}).json()
    assert res and "sól i pieprz" in res[0]["have"] and "karkówka wieprzowa" in res[0]["have"]
    assert sorted(res[0]["missing"]) == ["cebula", "cukier puder"]
    assert client.put("/api/pantry", json={"names": ["karkówka"]}).status_code < 300
    out = client.post("/api/shopping/from-recipe", json={"recipe_id": r["id"]}).json()
    assert "sól i pieprz" in out["skipped"] and "karkówka wieprzowa" in out["skipped"]
    texts = " ".join(i["text"] for i in client.get("/api/shopping").json())
    assert "cukier puder" in texts and "cebula" in texts and "karkówka" not in texts


def test_co_ugotuje_nie_z_samych_zawsze_w_domu(client):
    _staples(client, "sól", "pieprz")
    make_recipe(client, "Ciasto", [("sól i pieprz", "sól i pieprz", 0, ""), ("mąka", "mąka", 1, "kg")])
    res = client.post("/api/cook", json={"ingredients": ["kurczak"], "max_missing": 2}).json()
    assert [m for m in res if m["recipe"]["title"] == "Ciasto"] == []
