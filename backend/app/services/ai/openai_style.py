"""Groq i Mistral - API w stylu OpenAI, wspólna obsługa."""

import base64
import json
import logging
import re

import httpx
from pydantic import BaseModel, ValidationError

from ...config import DEFAULT_GROQ_MODEL, DEFAULT_MISTRAL_MODEL, get_settings
from .base import AiError, Content, _limit, _timeout

log = logging.getLogger(__name__)


def _ask_openai_style(name: str, url: str, api_key: str, model: str, default_model: str,
                      content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    """Groq i Mistral: proszą o JSON, a my sprawdzamy, czy pasuje do klasy `schema`.

    Nie każdy ich model obsługuje ścisły format odpowiedzi, więc schemat JSON
    dopisujemy do instrukcji, a odpowiedź sprawdza Pydantic.
    """
    instructions = (
        f"{system}\n\nOdpowiedz wyłącznie jednym obiektem JSON zgodnym z tym schematem JSON "
        f"(bez komentarzy i bez bloku ```):\n{json.dumps(schema.model_json_schema(), ensure_ascii=False)}"
    )
    if all(isinstance(item, str) for item in content):
        user: str | list = "\n\n".join(content)
    else:
        user = [
            {"type": "text", "text": item} if isinstance(item, str) else {
                "type": "image_url",
                "image_url": {"url": "data:image/jpeg;base64," + base64.standard_b64encode(item).decode("ascii")},
            }
            for item in content
        ]
    chat = _limit.get() is not None
    body = {
        "model": model,
        "messages": [{"role": "system", "content": instructions}, {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        # Darmowe limity liczą też zarezerwowaną długość odpowiedzi - w czacie wystarczy krótsza
        "max_tokens": 2000 if chat else 8000,
    }
    if model.startswith("openai/gpt-oss"):
        # Model "myśli" przed odpowiedzią; do przepisów wystarczy krótko
        body["reasoning_effort"] = "low"
    try:
        response = httpx.post(url, timeout=_timeout() or 180, headers={"Authorization": f"Bearer {api_key}"}, json=body)
    except httpx.TimeoutException as exc:
        raise AiError(f"{name} nie odpowiedział na czas.") from exc
    except httpx.HTTPError as exc:
        raise AiError(f"Brak połączenia z {name}.") from exc
    if response.status_code in (401, 403):
        raise AiError(f"Nieprawidłowy klucz API {name}.")
    if response.status_code in (400, 404) and "model" in response.text and (
            "not_found" in response.text or "does not exist" in response.text or "decommissioned" in response.text):
        # Dostawca wycofał model ustawiony w dodatku - używamy aktualnego domyślnego
        if model != default_model:
            log.warning("%s: model %s niedostępny - używam %s", name, model, default_model)
            return _ask_openai_style(name, url, api_key, default_model, default_model, content, system, schema)
        raise AiError(f"{name} nie ma już modelu {model} - zmień model w ustawieniach dodatku.")
    if response.status_code == 413:
        raise AiError(f"Zapytanie jest za duże dla darmowego limitu {name}.")
    if response.status_code == 429:
        raise AiError(f"Wyczerpany limit zapytań do {name} - spróbuj za chwilę.")
    if response.status_code >= 500:
        raise AiError(f"{name} jest teraz przeciążony - spróbuj za kilka minut.")
    if response.status_code >= 400:
        raise AiError(f"Błąd AI {name}: {response.text[:300]}")
    choice = response.json()["choices"][0]
    if choice.get("finish_reason") == "length":
        raise AiError("AI nie dokończyło odpowiedzi - przepis jest za długi.")
    text = (choice["message"].get("content") or "").strip()
    # Na wszelki wypadek usuwamy ```json ... ```, gdyby model je dodał
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return schema.model_validate_json(text)
    except ValidationError as exc:
        raise AiError(f"{name} nie zwróciło poprawnej odpowiedzi - spróbuj jeszcze raz.") from exc


def _ask_groq(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    settings = get_settings()
    return _ask_openai_style("Groq", "https://api.groq.com/openai/v1/chat/completions",
                             settings.groq_api_key, settings.groq_model, DEFAULT_GROQ_MODEL, content, system, schema)


def _ask_mistral(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    settings = get_settings()
    return _ask_openai_style("Mistral", "https://api.mistral.ai/v1/chat/completions",
                             settings.mistral_api_key, settings.mistral_model, DEFAULT_MISTRAL_MODEL,
                             content, system, schema)

