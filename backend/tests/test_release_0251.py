"""0.25.1: minutniki przeżywają restart, bezpieczny link do źródła, anulowanie minutnika tylko przez właściciela."""

import time
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import ActiveTimer
from app.services import timer_notify


@pytest.fixture
def brother(client):
    assert client.post("/api/auth/accounts", json={"name": "Naszman", "password": "brat123"}).status_code == 201
    other = TestClient(app)
    assert other.post("/api/auth/login", json={"name": "naszman", "password": "brat123"}).status_code == 204
    return other


def _notify_on(monkeypatch, sent):
    settings = timer_notify.get_settings()
    monkeypatch.setattr(settings, "ha_notify", "notify.mobile_app_iphone")
    monkeypatch.setattr(settings, "ha_url", "http://ha")
    monkeypatch.setattr(settings, "ha_token", "t")
    monkeypatch.setattr(timer_notify, "notify", sent.append)


def _saved():
    with SessionLocal() as db:
        return {t.id: t.label for t in db.query(ActiveTimer)}


def test_timer_saved_and_restored_after_restart(client, monkeypatch):
    sent = []
    _notify_on(monkeypatch, sent)
    client.post("/api/timers", json={"id": 1732540000000, "label": "Makaron", "seconds": 600})
    assert _saved() == {1732540000000: "Makaron"}
    # "Restart": minutniki w pamięci znikają, w bazie zostają
    for timer in timer_notify._timers.values():
        timer.cancel()
    timer_notify._timers.clear()
    with SessionLocal() as db:
        db.add(ActiveTimer(id=2, label="Jajka", ends_at=datetime.now() - timedelta(minutes=2)))
        db.add(ActiveTimer(id=3, label="Wczorajsze", ends_at=datetime.now() - timedelta(hours=5)))
        db.commit()
    assert timer_notify.restore() == 2
    assert 1732540000000 in timer_notify._timers
    deadline = time.monotonic() + 2  # spóźniony minutnik odpala od razu
    while not sent and time.monotonic() < deadline:
        time.sleep(0.01)
    assert sent and sent[0].startswith("Jajka (spóźnione")
    assert _saved() == {1732540000000: "Makaron"}
    client.delete("/api/timers/1732540000000")
    assert _saved() == {}
    assert timer_notify._timers == {}


def test_member_cannot_cancel_owner_timer(client, brother, monkeypatch):
    _notify_on(monkeypatch, [])
    client.post("/api/timers", json={"id": 7, "label": "Ryż", "seconds": 600})
    assert brother.delete("/api/timers/7").status_code == 204
    assert 7 in timer_notify._timers
    client.delete("/api/timers/7")


def test_source_url_only_http(client):
    def saved(url):
        body = {"title": "Zupa", "source_url": url, "ingredients": [], "steps": [{"text": "Gotuj."}]}
        return client.post("/api/recipes", json=body).json()["source_url"]

    assert saved("https://kwestiasmaku.com/zupa") == "https://kwestiasmaku.com/zupa"
    assert saved("www.kwestiasmaku.com/zupa") == "https://www.kwestiasmaku.com/zupa"
    assert saved("javascript:alert(1)") == ""
    assert saved("data:text/html,<b>x</b>") == ""
    assert saved("od babci") == ""
    assert saved("") == ""
