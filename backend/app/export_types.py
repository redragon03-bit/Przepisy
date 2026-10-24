"""Typy TypeScript dla frontendu, generowane z modeli API (schemas.py).

Uruchomienie (z folderu backend):
    python -m app.export_types > ../frontend/src/api-types.ts

Dzięki temu frontend zawsze zna aktualny kształt danych z serwera - zmieniasz klasę
w schemas.py, uruchamiasz polecenie i TypeScript od razu pokaże miejsca do poprawy.
CI sprawdza, czy plik jest aktualny.
"""

import os
import tempfile

# Aplikacja przy imporcie zakłada foldery danych - tu wystarczą tymczasowe
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp())

from .main import app  # noqa: E402

HEADER = """// PLIK WYGENEROWANY - nie zmieniaj ręcznie.
// Źródło: backend/app/schemas.py. Odświeżenie (z folderu backend):
//   python -m app.export_types > ../frontend/src/api-types.ts
"""

# Klasy potrzebne tylko FastAPI (formularze plików, błędy walidacji) - frontend ich nie używa
SKIP_PREFIXES = ("Body_", "HTTPValidationError", "ValidationError")


def ts_name(name: str) -> str:
    """'IngredientLine-Output' -> 'IngredientLine' (odpowiedź), 'IngredientLine-Input' -> 'IngredientLineInput'."""
    return name.removesuffix("-Output").replace("-Input", "Input")


def ts_type(schema: dict) -> str:
    if "$ref" in schema:
        return ts_name(schema["$ref"].rsplit("/", 1)[1])
    if "anyOf" in schema:
        return " | ".join(dict.fromkeys(ts_type(s) for s in schema["anyOf"]))
    if "const" in schema:
        return repr(schema["const"]).replace("'", '"')
    if "enum" in schema:
        return " | ".join(f'"{v}"' for v in schema["enum"])
    kind = schema.get("type")
    if kind == "array":
        item = ts_type(schema.get("items", {}))
        return f"({item})[]" if "|" in item else f"{item}[]"
    if kind == "object":
        return f"Record<string, {ts_type(schema.get('additionalProperties', {}))}>"
    return {"string": "string", "integer": "number", "number": "number", "boolean": "boolean",
            "null": "null"}.get(kind, "unknown")


def comment(text: str, indent: str) -> list[str]:
    return [f"{indent}// {line}" for line in text.strip().splitlines()]


def interface(name: str, schema: dict) -> str:
    lines = comment(schema["description"], "") if schema.get("description") else []
    lines.append(f"export interface {ts_name(name)} {{")
    required = set(schema.get("required", []))
    for field, prop in schema.get("properties", {}).items():
        if prop.get("description"):
            lines += comment(prop["description"], "  ")
        optional = "" if field in required else "?"
        lines.append(f"  {field}{optional}: {ts_type(prop)};")
    lines.append("}")
    return "\n".join(lines)


def generate() -> str:
    schemas = app.openapi()["components"]["schemas"]
    parts = [interface(name, schema) for name, schema in schemas.items() if not name.startswith(SKIP_PREFIXES)]
    return HEADER + "\n" + "\n\n".join(parts) + "\n"


if __name__ == "__main__":
    print(generate(), end="")
