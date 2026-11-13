"""0.18.0: kilka kluczy Gemini, Grok (xAI) i własna kolejność AI."""

from types import SimpleNamespace

import httpx
from google.genai import errors as genai_errors

from app.config import DEFAULT_XAI_MODEL, Settings, get_settings
from app.services import ai
from app.services.ai import gemini, openai_style

RESULT = ai.AiResult(recipes=[ai.AiRecipe(
    title="Placki", description="", servings="", prep_minutes=None, cook_minutes=None,
    total_minutes=None, original_language="pl", ingredients=[], steps=[], main_image_index=None,
    categories=[],
)])


def _quota():
    return genai_errors.ClientError(429, {"error": {"message": "Quota exceeded GenerateRequestsPerDay",
                                                    "status": "RESOURCE_EXHAUSTED"}})


def test_gemini_keys_from_several_fields():
    settings = Settings(gemini_api_key="a, b", gemini_api_key_2="c", gemini_api_key_3="a")
    assert settings.gemini_keys == ["a", "b", "c"]
    assert settings.ai_providers == ["gemini"]


def test_custom_ai_order_with_aliases():
    settings = Settings(ai_order="gemini, grok, mistral", anthropic_api_key="a", gemini_api_key_2="g",
                        xai_api_key="x", groq_api_key="q", mistral_api_key="m")
    # AI spoza listy (z kluczem) idą na koniec, w kolejności domyślnej
    assert settings.ai_providers == ["gemini", "xai", "mistral", "anthropic", "groq"]
    # ai_provider (gdy nie "auto") jest zawsze pierwszy
    settings.ai_provider = "mistral"
    assert settings.ai_providers[0] == "mistral"
    assert Settings(ai_order="nieznane,claude", anthropic_api_key="a").ai_providers == ["anthropic"]


def test_next_gemini_key_after_quota(monkeypatch):
    settings = get_settings()
    for name, value in {"gemini_api_key": "k1", "gemini_api_key_2": "k2", "gemini_api_key_3": "",
                        "groq_api_key": "", "mistral_api_key": "", "anthropic_api_key": "", "xai_api_key": "",
                        "ai_provider": "auto", "ai_order": ""}.items():
        monkeypatch.setattr(settings, name, value)
    monkeypatch.setattr(gemini, "_key_exhausted_until", {})
    sleeps = []
    monkeypatch.setattr(gemini.time, "sleep", sleeps.append)
    calls = []

    def client(api_key):
        class Models:
            def generate_content(self, model, contents, config):
                calls.append((api_key, model))
                if api_key == "k1":
                    raise _quota()
                return SimpleNamespace(parsed=RESULT)
        return SimpleNamespace(models=Models())

    monkeypatch.setattr(gemini.genai, "Client", client)
    assert ai.recipes_from_text("Placki: mąka, mleko")[0].title == "Placki"
    # Pierwszy klucz: główny i zapasowy model raz (bez czekania), potem drugi klucz
    assert calls == [("k1", settings.gemini_model), ("k1", settings.gemini_fallback_model),
                     ("k2", settings.gemini_model)]
    assert sleeps == []
    # Wyczerpany klucz idzie na koniec przy następnym pytaniu
    calls.clear()
    ai.recipes_from_text("Placki: mąka, mleko")
    assert calls == [("k2", settings.gemini_model)]


def test_all_gemini_keys_exhausted_then_grok(monkeypatch):
    settings = get_settings()
    for name, value in {"gemini_api_key": "k1", "gemini_api_key_2": "k2", "gemini_api_key_3": "",
                        "groq_api_key": "", "mistral_api_key": "m", "anthropic_api_key": "", "xai_api_key": "x",
                        "ai_provider": "auto", "ai_order": "gemini,grok,mistral"}.items():
        monkeypatch.setattr(settings, name, value)
    monkeypatch.setattr(gemini, "_key_exhausted_until", {})
    monkeypatch.setattr(gemini.time, "sleep", lambda s: None)

    class Models:
        def generate_content(self, model, contents, config):
            raise _quota()

    monkeypatch.setattr(gemini.genai, "Client", lambda api_key: SimpleNamespace(models=Models()))
    asked = []
    monkeypatch.setattr(ai, "_ask_xai", lambda c, s, sc: asked.append("grok") or RESULT)
    monkeypatch.setattr(ai, "_ask_mistral", lambda c, s, sc: asked.append("mistral") or RESULT)
    assert ai.recipes_from_text("Placki")[0].title == "Placki"
    assert asked == ["grok"]


def test_grok_replaces_withdrawn_model(monkeypatch):
    sent = []

    def post(url, timeout, headers, json):
        sent.append(json["model"])
        assert url == "https://api.x.ai/v1/chat/completions"
        if json["model"] != "grok-9-fast-non-reasoning":
            return httpx.Response(404, json={"error": f"The model {json['model']} does not exist"})
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop",
                                                      "message": {"content": RESULT.model_dump_json()}}]})

    def get(url, timeout, headers):
        assert url == "https://api.x.ai/v1/models"
        return httpx.Response(200, json={"data": [{"id": "grok-9"}, {"id": "grok-9-fast-reasoning"},
                                                  {"id": "grok-9-fast-non-reasoning"}, {"id": "grok-imagine-image"}]})

    monkeypatch.setattr(openai_style.httpx, "post", post)
    monkeypatch.setattr(openai_style.httpx, "get", get)
    settings = get_settings()
    monkeypatch.setattr(settings, "xai_api_key", "x")
    monkeypatch.setattr(settings, "xai_model", "grok-stary")
    assert openai_style._ask_xai(["Placki"], "system", ai.AiResult).recipes[0].title == "Placki"
    # Najpierw domyślny model, a gdy i jego nie ma - aktualny szybki Grok z listy xAI
    assert sent == ["grok-stary", DEFAULT_XAI_MODEL, "grok-9-fast-non-reasoning"]
