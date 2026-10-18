from types import SimpleNamespace

import pytest

from app.config import Settings
from app.services import ai

RECIPE = ai.AiRecipe(
    is_recipe=True, title="Placki", description="", servings="", prep_minutes=None,
    cook_minutes=None, total_minutes=None, original_language="pl", ingredients=[], steps=[],
    main_image_index=None,
)


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
            return SimpleNamespace(stop_reason="end_turn", parsed_output=RECIPE)

    monkeypatch.setattr(ai.anthropic, "Anthropic", lambda api_key: SimpleNamespace(messages=FakeMessages()))
    assert ai.recipe_from_images([b"jpeg"]).title == "Placki"
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
            return SimpleNamespace(parsed=RECIPE)

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=FakeModels()))
    assert ai.recipe_from_images([b"jpeg"]).title == "Placki"
    parts = sent["contents"]
    assert isinstance(parts[0], str)
    assert parts[1].inline_data.data == b"jpeg"
    assert sent["config"].response_schema is ai.AiRecipe


def test_not_a_recipe_is_an_error(monkeypatch):
    monkeypatch.setattr(ai.get_settings(), "ai_provider", "gemini")
    monkeypatch.setattr(ai.get_settings(), "gemini_api_key", "test")
    monkeypatch.setattr(ai, "_ask_gemini", lambda content: RECIPE.model_copy(update={"is_recipe": False}))
    with pytest.raises(ai.AiError, match="Nie znaleziono"):
        ai.recipe_from_images([b"jpeg"])
