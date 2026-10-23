from types import SimpleNamespace

import pytest

from google.genai import errors as genai_errors

from app.config import Settings
from app.services import ai

RECIPE = ai.AiRecipe(
    title="Placki", description="", servings="", prep_minutes=None,
    cook_minutes=None, total_minutes=None, original_language="pl", ingredients=[], steps=[],
    main_image_index=None, categories=["Śniadanie"],
)
RESULT = ai.AiResult(recipes=[RECIPE])


@pytest.mark.parametrize("provider, anthropic_key, gemini_key, expected", [
    ("auto", "", "", None),
    ("auto", "a", "", "anthropic"),
    ("auto", "", "g", "gemini"),
    ("auto", "a", "g", "anthropic"),
    ("gemini", "a", "g", "gemini"),
    # Wybrany AI bez klucza - bierzemy następny, do którego jest klucz
    ("gemini", "a", "", "anthropic"),
])
def test_active_provider(provider, anthropic_key, gemini_key, expected):
    settings = Settings(ai_provider=provider, anthropic_api_key=anthropic_key, gemini_api_key=gemini_key)
    assert settings.active_ai_provider == expected


def test_providers_order():
    settings = Settings(ai_provider="gemini", anthropic_api_key="a", gemini_api_key="g",
                        groq_api_key="q", mistral_api_key="m")
    assert settings.ai_providers == ["gemini", "anthropic", "groq", "mistral"]
    assert Settings(ai_provider="auto", groq_api_key="q", mistral_api_key="m").ai_providers == ["groq", "mistral"]


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
    monkeypatch.setattr(ai, "_ask_gemini", lambda content, system, schema: ai.AiResult(recipes=[]))
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


def test_categorize_maps_ids(monkeypatch):
    monkeypatch.setattr(ai.get_settings(), "ai_provider", "gemini")
    monkeypatch.setattr(ai.get_settings(), "gemini_api_key", "test")
    sent = {}

    def fake(content, system, schema):
        sent["text"] = content[0]
        return ai.AiCategorization(recipes=[ai.AiRecipeCategories(id=7, categories=["Deser"])])

    monkeypatch.setattr(ai, "_ask_gemini", fake)
    assert ai.categorize([(7, "Pudding chia", ["chia", "mleko"])], ["Deser", "Zupa"]) == {7: ["Deser"]}
    assert "7. Pudding chia" in sent["text"] and "Deser, Zupa" in sent["text"]


def _only(monkeypatch, **keys):
    """Ustawia klucze AI: tylko podane są niepuste."""
    settings = ai.get_settings()
    monkeypatch.setattr(settings, "ai_provider", "auto")
    monkeypatch.setattr(ai, "_failed_until", {})
    for name in ("anthropic", "gemini", "groq", "mistral"):
        monkeypatch.setattr(settings, f"{name}_api_key", keys.get(name, ""))


def test_groq_gets_json_schema_and_images(monkeypatch):
    _only(monkeypatch, groq="q")
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, body=json)
        content = '```json\n' + RESULT.model_dump_json() + '\n```'
        return SimpleNamespace(status_code=200, json=lambda: {"choices": [{"finish_reason": "stop", "message": {"content": content}}]})

    monkeypatch.setattr(ai.httpx, "post", fake_post)
    assert ai.recipes_from_images([b"jpeg"])[0].title == "Placki"
    assert sent["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert sent["headers"]["Authorization"] == "Bearer q"
    system, user = sent["body"]["messages"]
    assert '"recipes"' in system["content"]
    assert user["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert sent["body"]["response_format"] == {"type": "json_object"}


def test_next_ai_is_used_when_first_fails(monkeypatch):
    _only(monkeypatch, gemini="g", groq="q", mistral="m")
    asked = []

    def failing(name):
        def ask(content, system, schema):
            asked.append(name)
            raise ai.AiError("Wyczerpany limit")
        return ask

    monkeypatch.setattr(ai, "_ask_gemini", failing("gemini"))
    monkeypatch.setattr(ai, "_ask_groq", failing("groq"))
    monkeypatch.setattr(ai, "_ask_mistral", lambda content, system, schema: asked.append("mistral") or RESULT)
    assert ai.recipes_from_images([b"jpeg"])[0].title == "Placki"
    assert asked == ["gemini", "groq", "mistral"]


def test_all_ais_failing_shows_each_error(monkeypatch):
    _only(monkeypatch, gemini="g", mistral="m")
    monkeypatch.setattr(ai, "_ask_gemini", lambda c, s, sc: (_ for _ in ()).throw(ai.AiError("limit Gemini")))
    monkeypatch.setattr(ai, "_ask_mistral", lambda c, s, sc: (_ for _ in ()).throw(ai.AiError("zły klucz")))
    with pytest.raises(ai.AiError, match="Gemini: limit Gemini Mistral: zły klucz"):
        ai.recipes_from_images([b"jpeg"])


def test_bad_json_from_mistral_is_an_error(monkeypatch):
    _only(monkeypatch, mistral="m")
    monkeypatch.setattr(ai.httpx, "post", lambda url, headers, json, timeout: SimpleNamespace(
        status_code=200, json=lambda: {"choices": [{"finish_reason": "stop", "message": {"content": "{\"x\": 1}"}}]}))
    with pytest.raises(ai.AiError, match="Mistral nie zwróciło poprawnej"):
        ai.categorize([(1, "Placki", ["jajko"])], [])


def test_chat_skips_slow_ai(monkeypatch):
    """Gemini nie odpowiada na czas - czat pyta następne AI, zamiast wisieć."""
    _only(monkeypatch, gemini="g", groq="q")
    answer = ai.ChatAnswer(text="Placki!", recipe_ids=[], new_recipe=None)

    class SlowModels:
        def generate_content(self, model, contents, config):
            assert 0 < config.http_options.timeout <= ai.CHAT_PROVIDER_SECONDS * 1000
            assert config.thinking_config.thinking_budget == 0
            raise ai.httpx.ReadTimeout("timeout")

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=SlowModels()))
    timeouts = []
    monkeypatch.setattr(ai, "_ask_groq", lambda c, s, sc: timeouts.append(ai._timeout()) or answer)
    assert ai.chat("kontekst", "Użytkownik: coś słodkiego").text == "Placki!"
    assert 0 < timeouts[0] <= ai.CHAT_PROVIDER_SECONDS
    # Poza czatem (np. import) limitu nie ma
    assert ai._timeout() is None


def test_overloaded_gemini_leaves_time_for_next_ai(monkeypatch):
    """Gemini ciągle zwraca 503/504 - ponawia tylko w swoim kawałku czasu, potem pytamy Groq."""
    _only(monkeypatch, gemini="g", groq="q")
    clock = [1000.0]
    monkeypatch.setattr(ai.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(ai.time, "sleep", lambda seconds: pytest.fail("czat nie powinien czekać"))

    class BusyModels:
        def generate_content(self, model, contents, config):
            clock[0] += 8  # każda próba trwa 8 s
            raise _overloaded()

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=BusyModels()))
    timeouts = []
    answer = ai.ChatAnswer(text="Sałatka", recipe_ids=[], new_recipe=None)
    monkeypatch.setattr(ai, "_ask_groq", lambda c, s, sc: timeouts.append(ai._timeout()) or answer)
    assert ai.chat("kontekst", "Użytkownik: coś").text == "Sałatka"
    assert clock[0] <= 1000 + ai.CHAT_PROVIDER_SECONDS + 8
    assert timeouts[0] == ai.CHAT_PROVIDER_SECONDS


def test_chat_asks_recently_failed_ai_last(monkeypatch):
    _only(monkeypatch, gemini="g", groq="q")
    asked = []

    def gemini(c, s, sc):
        asked.append("gemini")
        raise ai.AiError("przeciążony")

    answer = ai.ChatAnswer(text="Zupa", recipe_ids=[], new_recipe=None)
    monkeypatch.setattr(ai, "_ask_gemini", gemini)
    monkeypatch.setattr(ai, "_ask_groq", lambda c, s, sc: asked.append("groq") or answer)
    ai.chat("kontekst", "Użytkownik: coś")
    ai.chat("kontekst", "Użytkownik: coś innego")
    assert asked == ["gemini", "groq", "groq"]


def test_chat_gemini_timeout_504_is_not_retried(monkeypatch):
    _only(monkeypatch, gemini="g")
    calls = []

    class SlowModels:
        def generate_content(self, model, contents, config):
            calls.append(model)
            raise genai_errors.ServerError(504, {"error": {"message": "deadline", "status": "DEADLINE_EXCEEDED"}})

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=SlowModels()))
    with pytest.raises(ai.AiError, match="na czas"):
        ai.chat("kontekst", "Użytkownik: coś")
    assert len(calls) == 1


def test_chat_retries_with_thinking_when_model_needs_it(monkeypatch):
    _only(monkeypatch, gemini="g")
    configs = []
    answer = ai.ChatAnswer(text="Omlet", recipe_ids=[], new_recipe=None)

    class Models:
        def generate_content(self, model, contents, config):
            configs.append(config.thinking_config)
            if config.thinking_config is not None:
                raise genai_errors.ClientError(400, {"error": {"message": "Thinking budget 0 is invalid", "status": "INVALID_ARGUMENT"}})
            return SimpleNamespace(parsed=answer)

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=Models()))
    assert ai.chat("kontekst", "Użytkownik: coś").text == "Omlet"
    assert configs[1] is None


def test_chat_gives_up_when_time_is_out(monkeypatch):
    _only(monkeypatch, groq="q")
    monkeypatch.setattr(ai, "CHAT_SECONDS", 0)
    with pytest.raises(ai.AiError, match="zbyt wolno"):
        ai.chat("kontekst", "Użytkownik: coś")


def test_withdrawn_groq_model_is_replaced_by_default(monkeypatch):
    _only(monkeypatch, groq="q")
    monkeypatch.setattr(ai.get_settings(), "groq_model", "meta-llama/llama-4-scout-17b-16e-instruct")
    models = []

    def fake_post(url, headers, json, timeout):
        models.append(json["model"])
        if json["model"] != ai.DEFAULT_GROQ_MODEL:
            return SimpleNamespace(status_code=404, text='{"error":{"message":"The model does not exist","code":"model_not_found"}}')
        assert json["reasoning_effort"] == "low"
        return SimpleNamespace(status_code=200, json=lambda: {"choices": [{"finish_reason": "stop", "message": {
            "content": '{"text": "Omlet", "recipe_ids": [], "new_recipe": null}'}}]})

    monkeypatch.setattr(ai.httpx, "post", fake_post)
    assert ai.chat("kontekst", "Użytkownik: coś").text == "Omlet"
    assert models == ["meta-llama/llama-4-scout-17b-16e-instruct", ai.DEFAULT_GROQ_MODEL]


def test_chat_asks_lighter_gemini_first(monkeypatch):
    _only(monkeypatch, gemini="g")
    monkeypatch.setattr(ai.get_settings(), "gemini_model", "main")
    monkeypatch.setattr(ai.get_settings(), "gemini_fallback_model", "lite")
    asked = []
    answer = ai.ChatAnswer(text="Zupa", recipe_ids=[], new_recipe=None)

    class Models:
        def generate_content(self, model, contents, config):
            asked.append(model)
            return SimpleNamespace(parsed=answer)

    monkeypatch.setattr(ai.genai, "Client", lambda api_key: SimpleNamespace(models=Models()))
    ai.chat("kontekst", "Użytkownik: coś")
    assert asked == ["lite"]
