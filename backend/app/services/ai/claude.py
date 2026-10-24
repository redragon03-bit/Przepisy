"""Claude (Anthropic): przepisy w ścisłym formacie i wyszukiwanie stron."""

import base64

import anthropic
from pydantic import BaseModel

from ...config import get_settings
from .base import _URL, SEARCH_PROMPT, AiError, Content, _timeout


def _ask_claude(content: Content, system: str, schema: type[BaseModel]) -> BaseModel:
    settings = get_settings()
    blocks = [
        {"type": "text", "text": item} if isinstance(item, str) else {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg",
                       "data": base64.standard_b64encode(item).decode("ascii")},
        }
        for item in content
    ]
    timeout = _timeout()
    extra = {"timeout": timeout} if timeout else {}
    try:
        response = anthropic.Anthropic(api_key=settings.anthropic_api_key).messages.parse(
            **extra,
            model=settings.claude_model,
            max_tokens=16000,
            system=system,
            # Przepisanie przepisu nie wymaga długiego myślenia - "low" jest szybsze i tańsze
            output_config={"effort": "low"},
            messages=[{"role": "user", "content": blocks}],
            output_format=schema,
        )
    except anthropic.AuthenticationError as exc:
        raise AiError("Nieprawidłowy klucz API Anthropic.") from exc
    except anthropic.RateLimitError as exc:
        raise AiError("Za dużo zapytań do AI - spróbuj za chwilę.") from exc
    except anthropic.APITimeoutError as exc:
        raise AiError("Claude nie odpowiedział na czas.") from exc
    except anthropic.APIConnectionError as exc:
        raise AiError("Brak połączenia z AI.") from exc
    except anthropic.APIStatusError as exc:
        raise AiError(f"Błąd AI: {exc.message}") from exc

    if response.stop_reason == "refusal":
        raise AiError("AI odmówiło przetworzenia tego materiału.")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise AiError("AI nie dokończyło odpowiedzi - przepis jest za długi.")
    return response.parsed_output



def _search_claude(query: str) -> list[str]:
    settings = get_settings()
    timeout = _timeout()
    extra = {"timeout": timeout} if timeout else {}
    try:
        response = anthropic.Anthropic(api_key=settings.anthropic_api_key).messages.create(
            **extra,
            model=settings.claude_model,
            max_tokens=4000,
            system=SEARCH_PROMPT,
            output_config={"effort": "low"},
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 2}],
            messages=[{"role": "user", "content": query}],
        )
    except anthropic.APIError as exc:
        raise AiError(f"Błąd wyszukiwania: {exc}") from exc
    urls: list[str] = []
    for block in response.content:
        if block.type == "text":
            urls += _URL.findall(block.text)
        elif block.type == "web_search_tool_result" and isinstance(block.content, list):
            # Wyniki wyszukiwania (lista); przy błędzie content jest obiektem, nie listą
            urls += [result.url for result in block.content]
    return urls

