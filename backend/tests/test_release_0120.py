"""0.12.0: skala wyglądu - serwer zapamiętuje ustawienia i wypisuje je w logu."""

import logging


def test_appearance_is_saved_and_logged(client, caplog):
    with caplog.at_level(logging.INFO, logger="app.routers.appearance"):
        r = client.post("/api/appearance", json={
            "scales": {"title": 90, "list": 105, "space": 20, "nieznana": 120}, "device": "iPhone 428×926 @3",
        })
    assert r.status_code == 200
    body = r.json()
    # Nieznane grupy znikają, wartości są w granicach 50-200
    assert body["scales"] == {"title": 90, "list": 105, "space": 50}
    assert "title 90%" in caplog.text and "iPhone 428×926 @3" in caplog.text

    saved = client.get("/api/appearance").json()
    assert len(saved) == 1
    assert saved[0]["scales"]["list"] == 105
    assert saved[0]["device"] == "iPhone 428×926 @3"
