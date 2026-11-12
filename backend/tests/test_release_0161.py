"""0.16.1: ten sam produkt pod inną nazwą ('Kurczak piersi' / 'Pierś z kurczaka')."""

from app.services.ingredients import similar


def test_similar_ignores_word_order_and_fillers():
    assert similar("kurczak piersi", "pierś z kurczaka")
    assert similar("Mąka pszenna", "pszenna mąka")
    assert not similar("pierś z kurczaka", "udko z kurczaka")
    assert not similar("ser", "serek")
    assert not similar("masło", "masło orzechowe")
    assert not similar("z", "ze")


def test_pantry_add_reuses_similar_name(client):
    client.post("/api/pantry/add", json={"names": ["pierś z kurczaka"]})
    items = client.post("/api/pantry/add", json={"names": ["Kurczak piersi"]}).json()
    assert [i["name"] for i in items] == ["pierś z kurczaka"]


def test_adding_to_list_removes_similar_from_pantry(client):
    client.post("/api/pantry/add", json={"names": ["pierś z kurczaka"]})
    client.post("/api/shopping", json={"text": "Kurczak piersi 1 kg"})
    assert client.get("/api/pantry").json() == []
