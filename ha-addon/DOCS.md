# Smocza strawa - dodatek Home Assistant

## Opcje

- **app_password** - hasło do aplikacji (konto właściciela). Ustaw koniecznie, jeśli aplikacja będzie dostępna spoza domu.
  Konta dla domowników (wspólne przepisy, własny plan, zakupy i spiżarnia) dodasz w aplikacji: Ustawienia → Konta.
- **ai_order** - kolejność AI, po przecinku. Domyślnie `gemini,grok,groq,mistral,anthropic`. Gdy AI zawiedzie
  (skończy się limit, przeciążenie, brak odpowiedzi na czas), aplikacja pyta następnego, do którego podasz klucz.
  AI bez klucza są pomijane. Nazwy: `gemini`, `grok`, `groq`, `mistral`, `claude`. W logu dodatku widać,
  które AI odpowiedziało, gdy pierwsze zawiodło.
- **ai_provider** - `auto` (kolejność z `ai_order`) albo AI, które ma być zawsze pierwsze (przed `ai_order`).
- **gemini_api_key**, **gemini_api_key_2**, **gemini_api_key_3** - klucze z https://aistudio.google.com
  (ma darmowy limit). Gdy pierwszy klucz wyczerpie limit, aplikacja od razu pyta drugim, potem trzecim;
  wyczerpany klucz jest odkładany na koniec (na godzinę przy limicie dziennym, na minutę przy minutowym).
  W jednym polu możesz też wpisać kilka kluczy po przecinku.
- **gemini_model** - model Gemini. Domyślny `gemini-flash-latest`.
- **gemini_fallback_model** - model próbowany, gdy główny jest przeciążony. Domyślny `gemini-flash-lite-latest`.
- **xai_api_key** - klucz Grok z https://console.x.ai → API Keys (xAI nalicza opłaty za użycie, czasem daje darmowe kredyty).
- **xai_model** - model Grok. Domyślny `grok-4-1-fast-non-reasoning`. Gdy xAI wycofa ustawiony model, aplikacja sama wybierze aktualny szybki model Grok.
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
- **promo_stores** - sieci, z których gazetek aplikacja czyta promocje (ekran „Promocje”), po przecinku,
  np. `lidl,biedronka,kaufland`. Nazwy jak w adresie `blix.pl/sklep/<nazwa>` (np. `auchan`, `dino`,
  `netto`, `carrefour`). Lidl jest czytany z jego strony, pozostałe z Blixa. Puste = bez promocji.
  Nocą (1:00–6:00) AI czyta też obrazki stron głównych gazetek z Blixa (do 50 stron na noc), żeby dopisać ceny.
  Aplikacja sprawdza nowe gazetki co 12 godzin; AI czyta tylko tekst nowych gazetek (bez obrazków).
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

