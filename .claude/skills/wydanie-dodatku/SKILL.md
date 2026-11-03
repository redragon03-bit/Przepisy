---
name: wydanie-dodatku
description: Wydanie nowej wersji aplikacji Przepisy jako dodatku Home Assistant - podbicie wersji w ha-addon/config.yaml, PR, czekanie na obraz Docker i aktualizacja dodatku w HA. Użyj przy każdej zmianie kodu, która ma trafić do Dariusza.
---

# Wydanie nowej wersji dodatku HA

Dodatek HA nie zobaczy aktualizacji, jeśli numer w `ha-addon/config.yaml` się nie zmieni.
CI (job `version`) odrzuca PR, który zmienia `backend/app`, `frontend/src` albo `Dockerfile`
bez podbicia wersji.

## 1. Wybierz numer wersji

1. Sprawdź wersję na `main`: `git fetch origin main && git show origin/main:ha-addon/config.yaml | grep '^version:'`.
2. **Sprawdź otwarte PR-y** (`mcp__github__list_pull_requests`, state open) i ich `ha-addon/config.yaml`.
   Kilka wątków pracuje równolegle i już zdarzyło się, że dwa PR-y miały różne numery
   (0.8.4 i 0.8.5) albo kolidowały. Weź numer wyższy niż każdy zajęty.
3. Schemat: `0.MINOR.PATCH`. Poprawka błędu = PATCH. Nowe funkcje (np. cała sekcja z analizy) = MINOR.
4. Zmień tylko linię `version: "X.Y.Z"` (cudzysłowy zostają - job `docker` wycina numer po `"`).

## 2. Przed pushem

Uruchom skill `sprawdz-przed-pushem`. Jeśli zmieniłeś `backend/app/schemas.py`, wygeneruj
`frontend/src/api-types.ts`.

## 3. Commit i PR

- Opis commita po polsku, prostym językiem, z numerem wersji w nawiasie,
  np. `Spiżarnia: wybór innej daty działa na iPhonie (0.8.3)`.
- Gdy na tej samej gałęzi jest już otwarty PR, dopisz zmiany do niego i podbij wersję
  w nim, zamiast otwierać drugi PR z kolidującym numerem.
- W opisie PR napisz, co Dariusz zobaczy w aplikacji, nie tylko co zmieniło się w kodzie.
- Po utworzeniu PR subskrybuj jego aktywność i pilnuj CI (lint, pytest, e2e, version).

## 4. Po scaleniu do main

1. Job `docker` buduje obraz `ghcr.io/redragon03-bit/przepisy:<wersja>` (amd64 + arm64).
   Zwykle kilka minut, limit 30 minut. **Dopóki job nie skończy się na zielono, dodatek
   się nie zaktualizuje** (HA pobiera obraz o tym numerze). Gdy job wisi - anuluj i uruchom ponownie.
2. Dopiero potem aktualizacja w HA (narzędzia MCP Home Assistant, jeśli są dostępne):
   - `ha_manage_app` z `check_updates`, potem update dodatku `f6f83020_przepisy`.
   - Bez dostępu do MCP: powiedz Dariuszowi, żeby w HA wszedł w Ustawienia → Dodatki →
     Przepisy → Aktualizuj, **po** zakończeniu budowania obrazu.
3. Sprawdź log: `ha_get_logs` z `source=supervisor` dla dodatku. Szukaj startu uvicorn
   i błędów importu. Potem `https://przepisy.tail17212f.ts.net/api/health`.
4. Aplikacja na telefonie sama przechodzi na nową wersję (od 0.8.2) - nie trzeba
   prosić o usuwanie ikony z ekranu.

## 5. Zapisz w pamięci projektu

Jedno zdanie: numer wersji, numer PR, co weszło. Bez kopiowania historii gita.
