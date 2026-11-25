# GEMINI.md: Przepisy

Aplikacja z przepisami (PWA na telefon), uruchamiana jako dodatek Home Assistant
„Smocza strawa” (slug `f6f83020_przepisy`). Backend w `backend/`, frontend w `frontend/`,
dodatek w `ha-addon/`. Użytkownik: Darek. Główne urządzenie: iPhone 13, Safari, aplikacja
dodana do ekranu głównego.

## Zasady pracy
- Gałąź `feature/<krótka-nazwa>` i pull request. Nigdy nie pushuj na `main`.
- Opisy commitów po polsku, prostym językiem, z numerem wersji w nawiasie, np.
  `Spiżarnia: wybór innej daty działa na iPhonie (0.8.3)`.
- W opisie PR napisz, co Darek zobaczy w aplikacji, a nie tylko co zmieniło się w kodzie.
- Teksty w aplikacji po polsku, krótkie i zrozumiałe.
- Do pull requestów i sprawdzania CI używaj `gh` (np. `gh pr list --state open`,
  `gh pr create`, `gh pr checks`).
- Git przez sieć (fetch, pull, push) rób z prefiksem, bo powłoka Gemini ignoruje konfigurację
  gita: `git -C <ścieżka> -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin <gałąź>`.
  Repo ma remote `https://`. Nie przełączaj na SSH i nie wpisuj tokenów. Lokalne `add`, `commit`,
  `status`, `diff`, `log` działają bez prefiksu. To repo jest publiczne: nie wpisuj do plików ani
  commitów adresów, tokenów, haseł ani danych domu.
- Ścieżka repo na laptopie: `C:\projekty\Przepisy`. Adresy aplikacji, encje i inne dane domu są w
  prywatnym repo `C:\projekty\home-assistant-bibice`. Jeśli nie masz do niego dostępu, poproś Darka.

## Poprawki interfejsu na iPhonie
- Mało przycisków. Darek nie lubi zagraconego ekranu. Preferuj gesty (przesunięcie, długie
  przytrzymanie), panele (`components/Sheet.tsx`) i menu zamiast nowych przycisków.
- Nowa funkcja w UI: najpierw propozycja (opis albo makieta) i poczekaj na OK. Przy
  oczywistej naprawie błędu po prostu napraw.
- Przebieg: odtwórz problem w widoku iPhone 13 (Playwright `devices["iPhone 13"]`), zrób
  zrzut przed, znajdź komponent (`frontend/src/pages/*Page.tsx`, `components/`, `lib/`),
  popraw (style tylko w `src/styles.css`, kolory w zmiennych na górze), dopisz test e2e w
  `frontend/e2e/app.spec.ts`, zrób zrzut po i pokaż Darkowi przed/po.
- Pułapki Safari:
  - `fetch` dłuższy niż ok. 60 s kończy się „Load failed”. Synchroniczne endpointy AI
    trzymaj poniżej ok. 50 s, dłuższe zadania jako praca w tle.
  - `<input type="date">`: wybór daty nie zawsze daje `change` z fokusem, zapisuj od razu
    po zmianie wartości. Chromium bez okna nie wysyła `blur`, w testach używaj `focusout`.
  - Service worker, Wake Lock, Web Push i offline działają tylko po https
    (adres Tailscale aplikacji, podany w prywatnym repo `home-assistant-bibice`), nie po zwykłym `http://`.
  - Bezpieczne strefy: `env(safe-area-inset-*)`.
  - Pole tekstowe z czcionką mniejszą niż 16 px powiększa ekran przy fokusie.
  - Testy e2e działają w Chromium, nie w prawdziwym WebKit. Przy błędach specyficznych dla
    Safari napisz wprost, że test tego nie potwierdza, i poproś Darka o sprawdzenie na telefonie
    po aktualizacji.

## Kontrole przed pushem (jak w `.github/workflows/ci.yml`)
Uruchamiaj od góry i zatrzymaj się na pierwszym błędzie.

Backend:
```
cd backend
pip install -r requirements-dev.txt
ruff check .          # wersja ruff przypięta, nie podbijaj jej przy okazji
pytest -q
python -m app.export_types > ../frontend/src/api-types.ts
git diff --exit-code -- ../frontend/src/api-types.ts   # ma być pusto
```
Frontend:
```
cd frontend
npm ci
npm run lint          # oxlint (nie wracaj do ESLint)
npm test
npm run build
```
E2E (Playwright, widok iPhone 13): w tym środowisku zainstaluj przeglądarkę
(`npx playwright install chromium`), potem `npm run build` i `npm run test:e2e` z `PYTHON`
wskazującym Pythona z zainstalowanym `backend/requirements.txt`. Jeśli e2e nie da się tu
uruchomić, napisz to wprost i polegaj na CI (ślady w artefakcie `e2e-test-results`).

Naprawa czerwonego CI: odtwórz ten sam błąd lokalnie, popraw tylko to, czego dotyczy, pokaż,
że ta sama kontrola przechodzi. Nigdy nie wyłączaj ani nie pomijaj testu, żeby było zielono.
AI i internet są w testach podmienione (`backend/tests/conftest.py`).

## Wydanie nowej wersji dodatku
Dodatek HA nie zobaczy aktualizacji, jeśli numer w `ha-addon/config.yaml` się nie zmieni.
CI (job `version`) odrzuca PR zmieniający `backend/app`, `frontend/src` albo `Dockerfile`
bez podbicia wersji.
1. Sprawdź wersję na `main`:
   `git fetch origin main && git show origin/main:ha-addon/config.yaml | grep '^version:'`.
2. Sprawdź otwarte PR-y (`gh pr list --state open`) i ich `ha-addon/config.yaml`. Dwa PR-y z
   różnymi lub kolidującymi numerami już się zdarzyły. Weź numer wyższy niż każdy zajęty.
3. Schemat `0.MINOR.PATCH`. Poprawka błędu = PATCH, nowa funkcja = MINOR. Zmieniaj tylko linię
   `version: "X.Y.Z"` (cudzysłowy zostają, job `docker` wycina numer po `"`).
4. Gdy na tej samej gałęzi jest już otwarty PR, dopisz zmiany do niego i podbij wersję w nim.
5. Po scaleniu job `docker` buduje obraz `ghcr.io/redragon03-bit/przepisy:<wersja>` (amd64 i
   arm64), zwykle kilka minut, limit 30 minut. Dopóki nie skończy się na zielono, dodatek się
   nie zaktualizuje. Gdy wisi, anuluj i uruchom ponownie.
6. Dopiero potem aktualizacja w HA przez serwer MCP Home Assistant (w Gemini `home-assistant`): `ha_manage_app` z
   `check_updates`, potem update dodatku `f6f83020_przepisy`. Przed użyciem narzędzi HA
   wywołaj `ha_get_skill_guide`.
7. Sprawdź log (`ha_get_logs`, `source=supervisor`): start uvicorn i błędy importu. Potem
   `<adres-aplikacji>/api/health` (adres w prywatnym repo `home-assistant-bibice`).
8. Napisz Darkowi jednym zdaniem: numer wersji, numer PR, co weszło.

## Diagnoza integracji z Home Assistant
Najpierw fakty (logi, stan encji), potem poprawka. Nie zgaduj przyczyny.
- Log dodatku: `ha_get_logs` z `source=supervisor`. Od 0.8.5 aplikacja dokleja odpowiedź HA do
  komunikatu błędu.
- Stan encji: `ha_get_state`, `ha_get_todo`. Sprawdź `supported_features` (lista zakupów może
  nie obsługiwać pól, które wysyłamy; znany wzór: gdy HA odrzuca opcjonalne pole (400), ponów
  bez niego).
- Odtwórz wywołanie przez `ha_call_service` z tymi samymi danymi co aplikacja, na liście
  testowej albo z natychmiastowym usunięciem pozycji testowej.
- Stałe: powiadomienia z opcji `ha_notify` (encja w prywatnym repo); lista zakupów
  `todo.shopping_list`; plan dnia `sensor.przepisy_dzis`; kalendarz `calendar.plan_posilkow`
  z integracji „Remote calendar” (URL `http://127.0.0.1:8000/api/calendar.ics?token=…`, token z
  `GET /api/calendar/link`, zmienia się razem z `APP_PASSWORD` lub kluczem aplikacji).
- Tailscale: nie ustawiaj `advertise_tags` ani usług bez potwierdzenia ACL przez Darka
  (tagOwners `tag:ha`, autoApprovers `svc:przepisy`). Każda zmiana ACL musi zachować `tag:ha` w
  `nodeAttrs` dla Funnel. Zmiana opcji dodatku Tailscale lub restart tylko po zgodzie Darka.
  Nie proponuj własnego https na :8443/:8444.
- Każdą nową osobliwość HA zapisz w pamięci projektu (np. w `docs/`), żeby kolejna sesja nie
  szukała od zera.