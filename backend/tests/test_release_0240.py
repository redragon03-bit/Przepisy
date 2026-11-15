"""0.24.0: lepsze działy na liście zakupów (słowo-produkt przed przymiotnikiem) + podpowiedź AI dla "Inne"."""

from types import SimpleNamespace

import pytest

from app.services import aisle_guess, aisles


@pytest.mark.parametrize("text, expected", [
    ("Bagiety czosnkowe", "Pieczywo"),
    ("Mozarella galbani perlone/mini 2za1", "Nabiał i jajka"),
    ("Gorgonzola z lady", "Nabiał i jajka"),
    ("Pomelo żółte", "Warzywa i owoce"),
    ("Rurki waflowe 2+1", "Słodycze i bakalie"),
    ("Pasztet z lady", "Mięso i ryby"),
    ("mielony pieprz", "Przyprawy i sosy"),
    ("olej z pestek dyni", "Tłuszcze"),
    ("mieszanka warzyw mrożonych", "Mrożonki"),
    ("masło czosnkowe", "Nabiał i jajka"),
    ("paczka makaronu", "Sypkie i makarony"),
])
def test_dictionary(text, expected):
    assert aisles.aisle(text) == expected


def test_ai_guess_for_unknown(client, monkeypatch):
    asked = []

    def fake(names, shelves):
        asked.append(list(names))
        return {0: "Słodycze i bakalie"}

    monkeypatch.setattr(aisle_guess, "get_settings", lambda: SimpleNamespace(ai_providers=["gemini"]))
    monkeypatch.setattr(aisle_guess.ai, "aisles_for", fake)
    client.post("/api/shopping", json={"text": "Kinder Bueno 3 szt."})
    first = client.get("/api/shopping").json()  # odpowiedź od razu (słownik), AI w tle
    assert first[0]["aisle"] == "Inne"
    second = client.get("/api/shopping").json()
    assert second[0]["aisle"] == "Słodycze i bakalie"
    assert asked == [["Kinder Bueno 3 szt."]]  # o tę samą nazwę pytamy tylko raz
    # Odpowiedź jest w bazie - zostaje po restarcie
    aisles.learned.clear()
    from app.database import SessionLocal
    with SessionLocal() as db:
        aisle_guess.load(db)
    assert aisles.aisle("kinder bueno") == "Słodycze i bakalie"
