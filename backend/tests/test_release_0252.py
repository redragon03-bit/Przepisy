"""0.25.2: wolne zapytania API trafiają do logu dodatku."""

import logging

from app import main


def test_slow_api_request_is_logged(client, monkeypatch, caplog):
    monkeypatch.setattr(main, "SLOW_REQUEST_SECONDS", 0)
    with caplog.at_level(logging.WARNING, logger="przepisy.http"):
        assert client.get("/api/health").status_code == 200
    assert "Wolne zapytanie: GET /api/health" in caplog.text


def test_fast_request_not_logged(client, caplog):
    with caplog.at_level(logging.WARNING, logger="przepisy.http"):
        client.get("/api/health")
    assert "Wolne zapytanie" not in caplog.text
