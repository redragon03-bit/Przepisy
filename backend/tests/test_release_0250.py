"""0.25.0: „W domu” - wpisana nazwa zostaje, gdy w bazie jest ten sam produkt w innej odmianie."""

from app.services.ingredients import only_inflection


def names(items):
    return [i["name"] for i in items]


def test_only_inflection():
    assert only_inflection("mleko", "mleka")
    assert only_inflection("pomidory", "pomidor")
    assert not only_inflection("kurczak piersi", "pierś z kurczaka")
    assert not only_inflection("masło", "masło orzechowe")


def test_typed_name_wins_over_other_form(client):
    # Składnik "mleka" powstał z linijki listy zakupów ("2 l mleka") bez AI
    item = client.post("/api/shopping", json={"text": "2 l mleka"}).json()
    client.patch(f"/api/shopping/{item['id']}", json={"checked": True})
    client.post("/api/pantry/remove", json={"names": ["mleka"]})
    assert names(client.post("/api/pantry/add", json={"names": ["Mleko"]}).json()) == ["mleko"]


def test_other_word_order_still_reuses_existing(client):
    client.post("/api/pantry/add", json={"names": ["pierś z kurczaka"]})
    client.post("/api/pantry/remove", json={"names": ["pierś z kurczaka"]})
    assert names(client.post("/api/pantry/add", json={"names": ["kurczak piersi"]}).json()) == ["pierś z kurczaka"]
