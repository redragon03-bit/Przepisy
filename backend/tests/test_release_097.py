"""0.9.7: zawieszony import - limit czasu, przerwanie po kwadransie, anulowanie."""

from datetime import timedelta

from app.database import SessionLocal
from app.models import ImportJob, Recipe
from app.services import ai, fetcher, importer
from app.services.ai import AiRecipe, AiStep


def _recipe(title):
    return AiRecipe(
        title=title, description="", servings="", prep_minutes=None, cook_minutes=None,
        total_minutes=None, original_language="pl", ingredients=[],
        steps=[AiStep(text="Wymieszaj.", image_index=None)], main_image_index=None, categories=[],
    )


def test_background_ai_request_has_timeout():
    """Bez limitu zapytanie do Gemini mogło wisieć w nieskończoność (import "czytam przepis…")."""
    assert ai._timeout() == ai.BACKGROUND_REQUEST_SECONDS


def test_stuck_job_is_marked_failed_and_can_be_retried(client):
    with SessionLocal() as db:
        job = ImportJob(kind="url", source="https://aniagotuje.pl/przepis/ciapkapusta", status="running",
                        started_at=importer.utc_now() - timedelta(minutes=importer.STUCK_MINUTES + 1))
        fresh = ImportJob(kind="url", source="https://example.com/swiezy", status="running",
                          started_at=importer.utc_now())
        db.add_all([job, fresh])
        db.commit()
        job_id, fresh_id = job.id, fresh.id
    jobs = {j["id"]: j for j in client.get("/api/imports").json()}
    assert jobs[job_id]["status"] == "failed"
    assert "spróbuj ponownie" in jobs[job_id]["error"]
    assert jobs[fresh_id]["status"] == "running"


def test_cancel_running_import_discards_result(client, monkeypatch):
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: ("<html><body>Kapusta</body></html>", url))
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")

    def slow_ai(page, categories):
        # Użytkownik anuluje import, kiedy AI jeszcze "czyta" przepis
        with SessionLocal() as db:
            running = db.query(ImportJob).one()
            assert running.status == "running"
            db.delete(running)
            db.commit()
        return [_recipe("Ciapkapusta")]

    monkeypatch.setattr(ai, "recipes_from_page", slow_ai)
    client.post("/api/imports/url", json={"url": "https://aniagotuje.pl/przepis/ciapkapusta"})
    assert client.get("/api/imports").json() == []
    with SessionLocal() as db:
        assert db.query(Recipe).count() == 0


def test_cancel_failed_and_retried_job(client, monkeypatch):
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: ("<html><body>Placki</body></html>", url))
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")

    def broken(page, categories):
        raise ai.AiError("Gemini nie odpowiedział na czas.")

    monkeypatch.setattr(ai, "recipes_from_page", broken)
    job = client.post("/api/imports/url", json={"url": "https://example.com/placki"}).json()
    assert client.get(f"/api/imports/{job['id']}").json()["status"] == "failed"
    assert client.delete(f"/api/imports/{job['id']}").status_code == 204
    assert client.get(f"/api/imports/{job['id']}").status_code == 404
    assert client.delete(f"/api/imports/{job['id']}").status_code == 404


def test_late_result_of_stuck_run_is_ignored(client, monkeypatch):
    """Stare, zawieszone uruchomienie skończyło się po "Ponów" - przepis zapisuje tylko nowe."""
    monkeypatch.setattr(fetcher, "fetch_html", lambda url: ("<html><body>Placki</body></html>", url))
    monkeypatch.setattr(importer.get_settings(), "anthropic_api_key", "test")

    def restarted(page, categories):
        with SessionLocal() as db:
            job = db.query(ImportJob).one()
            job.started_at = importer.utc_now() + timedelta(seconds=5)  # ktoś nacisnął "Ponów"
            db.commit()
        return [_recipe("Placki")]

    monkeypatch.setattr(ai, "recipes_from_page", restarted)
    client.post("/api/imports/url", json={"url": "https://example.com/placki"})
    with SessionLocal() as db:
        assert db.query(Recipe).count() == 0
