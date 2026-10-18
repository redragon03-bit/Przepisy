# Przepisy - dodatek Home Assistant

## Opcje

- **app_password** - hasło do aplikacji. Ustaw koniecznie, jeśli aplikacja będzie dostępna spoza domu.
- **ai_provider** - które AI czyta przepisy: `auto` (to, do którego podasz klucz), `gemini` albo `anthropic`.
- **gemini_api_key** - klucz z https://aistudio.google.com (ma darmowy limit).
- **gemini_model** - model Gemini. Domyślny `gemini-flash-latest`.
- **gemini_fallback_model** - model próbowany, gdy główny jest przeciążony. Domyślny `gemini-flash-lite-latest`.
- **anthropic_api_key** - klucz z https://console.anthropic.com (płatny za użycie).
- **claude_model** - model Claude. Domyślny `claude-opus-5-5`; tańszy: `claude-haiku-5-5`.

- **ha_todo_entity** - lista w HA, do której trafia lista zakupów po kliknięciu „Wyślij do HA”.
  Domyślnie `todo.shopping_list` - tworzy ją integracja **Lista zakupów** (Ustawienia →
  Urządzenia i usługi → Dodaj integrację → „Lista zakupów”). Możesz podać też inną listę `todo.*`.

Bez żadnego klucza nie działa tłumaczenie, import ze zdjęć, czat ani liczenie kalorii.

## Jak otworzyć

W przeglądarce telefonu: `http://<adres-HA>:8000`. Dane (baza i zdjęcia) są w folderze dodatku i trafiają do kopii zapasowych HA. Aplikacja dodatkowo raz w tygodniu robi własną kopię (3 ostatnie, do pobrania w Ustawieniach).

Więcej w README repozytorium.
