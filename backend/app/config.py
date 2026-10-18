"""Konfiguracja aplikacji.

Wartości czytamy ze zmiennych środowiskowych (albo z pliku `.env`).
Gdy aplikacja działa jako dodatek Home Assistant, HA zapisuje opcje
z interfejsu do pliku `/data/options.json` - wtedy bierzemy je stamtąd.
"""

import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Opcje z Home Assistant -> nazwy zmiennych środowiskowych
HA_OPTIONS_FILE = Path("/data/options.json")
HA_OPTION_TO_ENV = {
    "app_password": "APP_PASSWORD",
    "anthropic_api_key": "ANTHROPIC_API_KEY",
    "claude_model": "CLAUDE_MODEL",
    "ai_provider": "AI_PROVIDER",
    "gemini_api_key": "GEMINI_API_KEY",
    "gemini_model": "GEMINI_MODEL",
    "gemini_fallback_model": "GEMINI_FALLBACK_MODEL",
    "ha_todo_entity": "HA_TODO_ENTITY",
}


def _load_home_assistant_options() -> None:
    """Przepisuje opcje dodatku HA do zmiennych środowiskowych (jeśli plik istnieje)."""
    if not HA_OPTIONS_FILE.exists():
        return
    options = json.loads(HA_OPTIONS_FILE.read_text())
    for option, env_name in HA_OPTION_TO_ENV.items():
        value = options.get(option)
        # "-" to "puste" - starsze wersje dodatku wymagały wpisania czegoś w każde pole
        if value and value != "-":
            os.environ[env_name] = str(value)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Folder na bazę danych i obrazki. W Dockerze to /data.
    data_dir: Path = Path("./data")
    # Hasło do aplikacji. Puste = brak logowania (tylko do testów w domu!).
    app_password: str = ""
    # Klucz do podpisywania ciasteczka sesji. Puste = wygeneruj i zapisz w data_dir.
    secret_key: str = ""
    # Który AI używać: "anthropic" (Claude), "gemini" (Google) albo "auto"
    # (auto = ten, do którego podano klucz; gdy oba, to Claude).
    # Bez żadnego klucza import działa bez AI (bez tłumaczenia i screenów).
    ai_provider: str = "auto"
    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5-5"
    # Klucz z https://aistudio.google.com (ma darmowy limit zapytań)
    gemini_api_key: str = ""
    # "-latest" = zawsze aktualny model Flash, nie trzeba zmieniać po premierach
    gemini_model: str = "gemini-flash-latest"
    # Model próbowany, gdy główny jest przeciążony. Puste = bez zapasowego.
    gemini_fallback_model: str = "gemini-flash-lite-latest"
    # Wysyłanie listy zakupów do Home Assistant (lista "Do zrobienia").
    # Jako dodatek HA adres i token są ustawiane automatycznie (SUPERVISOR_TOKEN).
    # Poza HA: adres, np. http://homeassistant.local:8123, i token długoterminowy
    # (profil użytkownika HA -> Bezpieczeństwo -> Tokeny długoterminowe).
    ha_url: str = ""
    ha_token: str = ""
    ha_todo_entity: str = "todo.shopping_list"
    # Folder ze zbudowanym frontendem (frontend/dist). Puste = nie serwujemy frontendu.
    static_dir: Path | None = None

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'przepisy.db'}"

    @property
    def images_dir(self) -> Path:
        return self.data_dir / "images"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def active_ai_provider(self) -> str | None:
        """'anthropic', 'gemini' albo None, gdy brakuje klucza do wybranego AI."""
        keys = {"anthropic": self.anthropic_api_key, "gemini": self.gemini_api_key}
        if self.ai_provider in keys:
            return self.ai_provider if keys[self.ai_provider] else None
        return next((name for name, key in keys.items() if key), None)

    @property
    def ai_enabled(self) -> bool:
        return self.active_ai_provider is not None

    @property
    def home_assistant(self) -> tuple[str, str] | None:
        """(adres API HA, token) albo None, gdy wysyłka do HA nie jest skonfigurowana."""
        supervisor_token = os.environ.get("SUPERVISOR_TOKEN")
        if supervisor_token:
            return "http://supervisor/core", supervisor_token
        if self.ha_url and self.ha_token:
            return self.ha_url.rstrip("/"), self.ha_token
        return None


@lru_cache
def get_settings() -> Settings:
    _load_home_assistant_options()
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.images_dir.mkdir(exist_ok=True)
    settings.uploads_dir.mkdir(exist_ok=True)
    if not settings.secret_key:
        key_file = settings.data_dir / "secret.key"
        if not key_file.exists():
            key_file.write_text(os.urandom(32).hex())
        settings.secret_key = key_file.read_text().strip()
    return settings
