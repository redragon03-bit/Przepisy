---
name: sprawdz-przed-pushem
description: Uruchamia lokalnie te same kontrole co CI projektu Przepisy (ruff, pytest, typy API, oxlint, testy frontendu, build, e2e w widoku iPhone 13). Użyj przed każdym pushem i przy naprawie czerwonego CI.
---

# Kontrole przed pushem (jak w .github/workflows/ci.yml)

Uruchamiaj od góry; zatrzymaj się na pierwszym błędzie i napraw go, zanim pójdziesz dalej.

## Backend (`backend/`)

```bash
cd backend
pip install -r requirements-dev.txt        # raz
ruff check .                               # wersja ruff jest przypięta - nie podbijaj jej przy okazji
pytest -q
python -m app.export_types > ../frontend/src/api-types.ts
git diff --exit-code -- ../frontend/src/api-types.ts   # musi być pusto, inaczej commituj nowe typy
```

AI i internet są w testach podmienione (`tests/conftest.py`). Nowy test do wydania
dopisz do istniejącego pliku albo `tests/test_release_<wersja>.py`.

## Frontend (`frontend/`)

```bash
cd frontend
npm ci
npm run lint          # oxlint (ESLint nie obsługuje TS 7 - nie wracaj do ESLint)
npm test              # testy jednostkowe src/lib/*.test.ts
npm run build         # tsc --noEmit + vite build
```

## E2E (Playwright, widok iPhone 13 w Chromium)

```bash
cd frontend
npm run build
PYTHON=python CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

- W kontenerze Claude Code Chromium jest już zainstalowany: **nie** uruchamiaj
  `playwright install`, tylko podaj `CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- `PYTHON` musi wskazywać Pythona z zainstalowanym `backend/requirements.txt`.
- Chromium bez okna nie wysyła `blur` - w testach używaj zdarzenia `focusout`.
- Service worker jest w testach zablokowany (`serviceWorkers: "block"`).
- Przy błędzie w CI ślady i zrzuty są w artefakcie `e2e-test-results` w zakładce Actions.

## Wersja

Zmiana w `backend/app`, `frontend/src` lub `Dockerfile` wymaga podbicia
`version:` w `ha-addon/config.yaml` - patrz skill `wydanie-dodatku`.

## Naprawa czerwonego CI

Najpierw odtwórz ten sam błąd lokalnie, popraw tylko to, czego dotyczy błąd, pokaż, że
ta sama kontrola przechodzi. Nigdy nie wyłączaj ani nie pomijaj testu, żeby było zielono.
