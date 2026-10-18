from types import SimpleNamespace

import pytest

from google.genai import errors as genai_errors

from app.config import Settings
from app.services import ai

RECIPE = ai.AiRecipe(
    title="Placki", description="", servings="", prep_minutes=None,
    cook_minutes=None, total_minutes=None, original_language="pl", ingredients=[], steps=[],
    main_image_index=None,
)
RESULT = ai.AiResult(recipes=[RECIPE])


@pytest.mark.parametrize("provider, anthropic_key, gemini_key, expected", [
    ("auto", "", "", None),
    ("auto", "a", "", "anthropic"),
    ("auto", "", "g", "gemini"),
    ("auto", "a", "g", "anthropic"),
    ("gemini", "a", "g", "gemini"),
    ("gemini", "a", "", None),
])
def test_active_provider(provider, anthropic_key, gemini_key, expected):
    settings = Settings(ai_provider=provider, anthropic_api_key=anthropic_key, gemini_api_key=gemini_key)
    assert settings.active_ai_provider == expected


def test_claude_gets_text_and_image_blocks(monkeypatch):
    monkeypatch.setattr(ai.get_settings(), "ai_provider", "anthropic")
    monkeypatch.setattr(ai.get_settings(), "anthropic_api_key", "test")
    sent = {}

    class FakeMessages:
        def parse(self, **kwargs):
            sent.update(kwargs)
            return SimpleNamespace(stop_reason="end_turn", parsed_output=RESULT)

    monkeypatch.setattr(ai.anthropic, "Anthropic", lambda api_key: SimpleNamespace(messages=FakeMessages()))
    assert ai.recipes_from_images([b"jpeg"])[0].title == "Placki"
    blocks = sent["messages"][0]["content"]
    assert [b["type"] for b in blocks] == ["text", "image", "text"]
    assert blocks[1]["source"] == {"type": "base64", "media_type": "image/jpeg", "data": "anBlZw=="}


def test_gemini_gets_text_and_image_parts(monkeypatch):
    monkeypatch.setattr(ai.get_settings(), "ai_provider", "gemini")
    monkeypatch.setattr(ai.get_settings(), "gemini_api_key", "test")
    sent = {}

    class FakeModels:
        def generate_content(self, **kwargs):
            sent.update(kwargs)
            return SimpleNamespace(parsed=RESULT)

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=FakeModels()))
    assert ai.recipes_from_images([b"jpeg"])[0].title == "Placki"
    parts = sent["contents"]
    assert isinstance(parts[0], str)
    assert parts[1].inline_data.data == b"jpeg"
    assert sent["config"].response_schema is ai.AiResult


def test_not_a_recipe_is_an_error(monkeypatch):
    monkeypatch.setattr(ai.get_settings(), "ai_provider", "gemini")
    monkeypatch.setattr(ai.get_settings(), "gemini_api_key", "test")
    monkeypatch.setattr(ai, "_ask_gemini", lambda content: ai.AiResult(recipes=[]))
    with pytest.raises(ai.AiError, match="Nie znaleziono"):
        ai.recipes_from_images([b"jpeg"])


def _gemini_answers(monkeypatch, answers):
    """Fałszywy Gemini: kolejne odpowiedzi z listy (wyjątek albo wynik). Zwraca użyte modele."""
    monkeypatch.setattr(ai.get_settings(), "ai_provider", "gemini")
    monkeypatch.setattr(ai.get_settings(), "gemini_api_key", "test")
    monkeypatch.setattr(ai.get_settings(), "gemini_model", "main")
    monkeypatch.setattr(ai.get_settings(), "gemini_fallback_model", "lite")
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: None)
    models = []

    class FakeModels:
        def generate_content(self, model, **kwargs):
            models.append(model)
            answer = answers.pop(0)
            if isinstance(answer, Exception):
                raise answer
            return SimpleNamespace(parsed=answer)

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=FakeModels()))
    return models


def _overloaded():
    return genai_errors.ServerError(503, {"error": {"message": "high demand", "status": "UNAVAILABLE"}})


def test_gemini_retries_when_overloaded(monkeypatch):
    models = _gemini_answers(monkeypatch, [_overloaded(), RESULT])
    assert ai.recipes_from_images([b"jpeg"])[0].title == "Placki"
    assert models == ["main", "main"]


def test_gemini_falls_back_to_lite_model(monkeypatch):
    models = _gemini_answers(monkeypatch, [_overloaded(), _overloaded(), _overloaded(), RESULT])
    ai.recipes_from_images([b"jpeg"])
    assert models == ["main", "main", "main", "lite"]


def test_gemini_gives_up_with_clear_message(monkeypatch):
    _gemini_answers(monkeypatch, [_overloaded() for _ in range(4)])
    with pytest.raises(ai.AiError, match="przeciążony"):
        ai.recipes_from_images([b"jpeg"])


def test_gemini_bad_key_is_not_retried(monkeypatch):
    error = genai_errors.ClientError(400, {"error": {"message": "API key not valid", "status": "INVALID_ARGUMENT"}})
    models = _gemini_answers(monkeypatch, [error])
    with pytest.raises(ai.AiError, match="klucz"):
        ai.recipes_from_images([b"jpeg"])
    assert models == ["main"]
