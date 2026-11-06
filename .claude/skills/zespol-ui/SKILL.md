---
name: zespol-ui
description: Orkiestrator zespołu agentów dla poprawek interfejsu Przepisy na iPhonie - dzieli zgłoszenie na zadania, uruchamia budowniczego w osobnym worktree, bramkę weryfikacji i recenzenta, robi PR, a przy zielonych kontrolach sam scala i aktualizuje dodatek w HA. Użyj, gdy Dariusz zgłasza jedną lub kilka poprawek UI.
---

# Zespół UI - przebieg orkiestratora

Ty (główny wątek) jesteś orkiestratorem. Sam nie piszesz kodu aplikacji - zlecasz go
agentom. Subagenci w Claude Code nie mogą uruchamiać innych subagentów, więc wszystkie
przekazania idą przez Ciebie.

```
Dariusz ──► ORKIESTRATOR (ten skill, główny wątek)
              │ 1 zadanie = 1 worktree = 1 osobna gałąź
              ├──► budowniczy-ui      (worktree, Edit/Write, commit)
              │         │ raport WYNIK/GAŁĄŹ/ZRZUTY
              ├──► straznik-weryfikacji (ten sam worktree, tylko czyta + uruchamia testy)
              │         │ WERDYKT PASS/FAIL  ──► FAIL: wróć do budowniczego (max 3 rundy)
              ├──► recenzent-zmian    (tryb przeciwnika, tylko czyta)
              │         │ BLOKUJĄCE: n  ──► n>0: wróć do budowniczego
              ├──► tester-iphone      (opcjonalnie: scenariusz Dariusza od początku do końca)
              ▼
           PR ──► CI ──► merge (sam, jeśli bramka) ──► obraz Docker ──► aktualizacja w HA
```

## 1. Przyjęcie zgłoszenia

- Rozbij wiadomość Dariusza na niezależne zadania. Dla każdego zapisz:
  `ZADANIE`, `GOTOWE GDY` (sprawdzalne), `EKRAN`.
- **Nowy układ lub nowy element ekranu** (nie naprawa błędu): najpierw makieta/opis
  do akceptacji Dariusza (zasada ze skilla `poprawka-ui-iphone`). Bez OK - nie zaczynaj.
- Numer wersji wybierz raz dla całej paczki (skill `wydanie-dodatku`, krok 1) i podaj go
  budowniczym. Kilka zadań w jednej paczce = jeden numer, jeden PR.

## 2. Budowa (równolegle, gdy zadania dotyczą różnych plików)

Wywołaj `budowniczy-ui` przez narzędzie Agent z `isolation: "worktree"` i treścią zadania
w formacie z jego opisu. Zadania, które ruszają te same pliki (np. `styles.css`,
`app.spec.ts`), uruchamiaj po kolei, nie równolegle.

## 3. Bramka

Dla każdego `WYNIK: GOTOWE`: `straznik-weryfikacji` z ścieżką worktree i `GOTOWE GDY`.
- FAIL → do budowniczego z `POPRZEDNIE UWAGI` = lista PROBLEMY.
- **Limit: 3 rundy na zadanie.** Ten sam problem dwa razy z rzędu albo 3 × FAIL =
  stop: napisz Dariuszowi, co blokuje, ze zrzutem i ostatnim błędem. Nie próbuj dalej.
- Test NIESTABILNY: nie licz jako PASS; zgłoś Dariuszowi osobno.

## 4. Recenzja

`recenzent-zmian` na tym samym diffie, z dopiskiem „tryb przeciwnika”.
`BLOKUJĄCE > 0` → do budowniczego (wlicza się w limit 3 rund), potem znów bramka.

## 5. PR

1. W głównym checkoutcie (Twoja gałąź sesji): `git merge --ff-only <GAŁĄŹ z raportu budowniczego>`
   (kilka zadań - po kolei), push, jeden PR według `wydanie-dodatku`.
2. W opisie: co zobaczy Dariusz, zrzuty przed/po, wynik bramki i recenzji,
   lista „nie sprawdzone” (np. tylko prawdziwe Safari).
3. Subskrybuj aktywność PR. Czerwone CI: odtwórz lokalnie, popraw przez budowniczego,
   **max 2 próby**, potem do Dariusza.

## 6. Merge i aktualizacja - samodzielnie tylko gdy WSZYSTKO naraz:

- bramka PASS dla ostatniego commita (plik bramki istnieje - hook to sprawdza),
- recenzja `BLOKUJĄCE: 0`,
- CI na PR zielone (wszystkie joby),
- brak zmian wymagających zgody: schemat bazy, nowe zależności, nowe płatne wywołania AI,
  `.github/`, opcje dodatku, nowy układ bez akceptacji.

Wtedy: merge PR → czekaj na zielony job `docker` → `ha_manage_app` (check_updates, update
`f6f83020_przepisy`) → log dodatku → `/api/health`. Dowolny warunek niespełniony:
zostaw PR otwarty i napisz Dariuszowi, czego brakuje.

## 7. Po aktualizacji

Jedna wiadomość: co się zmieniło, wersja, link do PR, zrzuty, i prośba o sprawdzenie
na telefonie rzeczy oznaczonych „nie sprawdzone”. Zapisz w pamięci projektu jedno zdanie
(wersja, PR, co weszło). Worktree zespołu usuń dopiero po merge (`git worktree remove`,
bez `--force`).

## Czego nigdy nie robi żaden agent

`rm -rf`, force push, push na main, `git reset --hard`, kasowanie danych w bazie,
restart HA, usuwanie encji/kopii, czytanie `.env`, wypisywanie zmiennych środowiska.
Hook `.claude/hooks/straz.py` blokuje to mechanicznie; jeśli blokuje coś potrzebnego -
zapytaj Dariusza, nie obchodź blokady.
