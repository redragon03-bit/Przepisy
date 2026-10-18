# Przepisy - dodatek Home Assistant

## Opcje

- **app_password** - hasło do aplikacji. Ustaw koniecznie, jeśli aplikacja będzie dostępna spoza domu.
- **ai_provider** - które AI czyta przepisy: `auto` (to, do którego podasz klucz), `gemini` albo `anthropic`.
- **gemini_api_key** - klucz z https://aistudio.google.com (ma darmowy limit).
- **gemini_model** - model Gemini. Domyślny `gemini-flash-latest`.
- **gemini_fallback_model** - model próbowany, gdy główny jest przeciążony. Domyślny `gemini-flash-lite-latest`.
- **anthropic_api_key** - klucz z https://console.anthropic.com (płatny za użycie).
- **claude_model** - model Claude. Domyślny `claude-opus-5-5`; tańszy: `claude-haiku-5-5`.

Bez żadnego klucza nie działa tłumaczenie ani import ze zdjęć.

## Jak otworzyć

W przeglądarce telefonu: `http://<adres-HA>:8000`. Dane (baza i zdjęcia) są w folderze dodatku i trafiają do kopii zapasowych HA.

Więcej w README repozytorium.
