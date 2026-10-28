# Przepisy - dodatek Home Assistant

## Opcje

- **app_password** - hasło do aplikacji. Ustaw koniecznie, jeśli aplikacja będzie dostępna spoza domu.
- **ai_provider** - które AI pytać najpierw: `auto`, `gemini`, `groq`, `mistral` albo `anthropic`. Gdy ono zawiedzie
  (np. skończy się darmowy limit), aplikacja sama pyta kolejnych AI, do których podasz klucz.
- **gemini_api_key** - klucz z https://aistudio.google.com (ma darmowy limit).
- **gemini_model** - model Gemini. Domyślny `gemini-flash-latest`.
- **gemini_fallback_model** - model próbowany, gdy główny jest przeciążony. Domyślny `gemini-flash-lite-latest`.
- **groq_api_key** - darmowy klucz z https://console.groq.com (logowanie kontem Google, bez karty) → API Keys.
- **groq_model** - model Groq. Domyślny `openai/gpt-oss-120b`. Gdy Groq wycofa ustawiony model, aplikacja sama użyje domyślnego. Darmowe modele Groq nie czytają zdjęć - zdjęcia przepisów obsługują Gemini i Mistral.
- **mistral_api_key** - darmowy klucz z https://console.mistral.ai (plan „Experiment”, weryfikacja numerem telefonu) → API Keys.
- **mistral_model** - model Mistral. Domyślny `mistral-small-latest`.
- **anthropic_api_key** - klucz z https://console.anthropic.com (płatny za użycie).
- **claude_model** - model Claude. Domyślny `claude-sonnet-5-5`; tańszy: `claude-haiku-5-5`, najdokładniejszy (i najdroższy): `claude-opus-5-5`.

- **ha_todo_entity** - lista w HA, do której trafia lista zakupów po kliknięciu „Wyślij do HA”.
  Domyślnie `todo.shopping_list` - tworzy ją integracja **Lista zakupów** (Ustawienia →
  Urządzenia i usługi → Dodaj integrację → „Lista zakupów”). Możesz podać też inną listę `todo.*`.

- **ha_notify** - powiadomienie na telefon, gdy minutnik się skończy (nawet przy zgaszonym ekranie).
  Wpisz usługę z aplikacji Home Assistant na iPhonie, np. `mobile_app_iphone`
  (Narzędzia deweloperskie → Akcje → wpisz „notify.”). Kilka - po przecinku. Puste = wyłączone.
- **certfile**, **keyfile** - pliki certyfikatu HTTPS w folderze `/ssl` (domyślnie `tailscale.crt`
  i `tailscale.key` z dodatku Tailscale). Gdy ich nie ma, aplikacja działa tylko przez http.
  Jak włączyć HTTPS: README, rozdział „HTTPS”.

Bez żadnego klucza nie działa tłumaczenie, import ze zdjęć, czat ani liczenie kalorii.

## Plan na dziś w Home Assistant

Dodatek sam tworzy czujnik **sensor.przepisy_dzis** - stan to dzisiejsze dania z planu
(np. „Gulasz”), a atrybuty: `recipes` (tytuł, czas, składniki), `tomorrow` (plan na jutro).
Czujnik odświeża się co 15 minut i od razu po zmianie planu. Przykład automatyzacji:
o 16:00 powiadomienie „Dziś na obiad: {{ states('sensor.przepisy_dzis') }}”.

## Jak otworzyć

W przeglądarce telefonu: `http://<adres-HA>:8000`. Z HTTPS (usługa Tailscale, opis w README → „HTTPS”) adres to `https://przepisy.<sieć>.ts.net` – wtedy aplikacja otwiera się bez internetu, a ekran nie gaśnie w trybie gotowania. Dane (baza i zdjęcia) są w folderze dodatku i trafiają do kopii zapasowych HA. Aplikacja dodatkowo raz w tygodniu robi własną kopię (3 ostatnie, do pobrania w Ustawieniach).

Więcej w README repozytorium.

## Plan posiłków w kalendarzu HA

W aplikacji: Ustawienia → „Plan posiłków jako kalendarz” → kopiuj adres. W HA dodaj
integrację **Remote calendar** (Kalendarz zdalny) i wklej ten adres, zmieniając początek
na `http://127.0.0.1:8000` (HA pobiera plik bezpośrednio z dodatku). Zmiana hasła
aplikacji zmienia też adres kalendarza.

