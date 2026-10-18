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
}


def _load_home_assistant_options() -> None:
    """Przepisuje opcje dodatku HA do zmiennych środowiskowych (jeśli plik istnieje)."""
    if not HA_OPTIONS_FILE.exists():
        return
    options = json.loads(HA_OPTIONS_FILE.read_text())
    for option, env_name in HA_OPTION_TO_ENV.items():
        value = options.get(option)
        if value:
            os.environ[env_name] = str(value)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Folder na bazę danych i obrazki. W Dockerze to /data.
    data_dir: Path = Path("./data")
    # Hasło do aplikacji. Puste = brak logowania (tylko do testów w domu!).
    app_password: str = ""
    # Klucz do podpisywania ciasteczka sesji. Puste = wygeneruj i zapisz w data_dir.
    secret_key: str = ""
    # Klucz API Anthropic. Puste = import działa bez AI (bez tłumaczenia i screenów).
    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5-5"
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
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


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
