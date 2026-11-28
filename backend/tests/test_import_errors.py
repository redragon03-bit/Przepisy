"""Błąd importu po ludzku: bez nazwy wyjątku (np. ProxyError) w komunikacie - szczegóły w logu."""

import logging

import httpx
import pytest

from app.services import fetcher


def _proxy_error(self, url, **kwargs):
    raise httpx.ProxyError("407 Proxy Authentication Required")


def test_connection_error_is_readable(monkeypatch, caplog):
    monkeypatch.setattr(httpx.Client, "get", _proxy_error)
    with caplog.at_level(logging.WARNING, logger="app.services.fetcher"), pytest.raises(fetcher.FetchError) as err:
        fetcher.fetch_html("https://example.com/przepis")
    assert str(err.value) == "Strona nie odpowiada – spróbuj później."
    assert "ProxyError" in caplog.text  # szczegóły zostają w logu dodatku


def test_failed_import_job_has_readable_error(client, monkeypatch):
    monkeypatch.setattr(httpx.Client, "get", _proxy_error)
    job = client.post("/api/imports/url", json={"url": "https://example.com/przepis"}).json()
    job = client.get(f"/api/imports/{job['id']}").json()
    assert job["status"] == "failed"
    assert job["error"] == "Strona nie odpowiada – spróbuj później."


def test_unexpected_import_error_hides_exception(client, monkeypatch):
    def boom(url):
        raise KeyError("ld+json")

    monkeypatch.setattr(fetcher, "fetch_html", boom)
    job = client.post("/api/imports/url", json={"url": "https://example.com/x"}).json()
    job = client.get(f"/api/imports/{job['id']}").json()
    assert job["status"] == "failed"
    assert "KeyError" not in job["error"] and "ld+json" not in job["error"]
