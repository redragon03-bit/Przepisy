---
name: poprawka-ui-iphone
description: Poprawki i nowe elementy interfejsu aplikacji Przepisy na iPhonie (Safari, PWA z ekranu głównego) - nawigacja, przewijanie, formularze, daty, lista zakupów, gesty. Użyj, gdy Dariusz zgłasza, że coś źle wygląda lub nie działa na telefonie, albo prosi o nowy element ekranu.
---

# Poprawka interfejsu na iPhonie

Główne urządzenie: iPhone 13, Safari, aplikacja dodana do ekranu głównego.

## Zasady Dariusza

- **Mało przycisków.** Nie lubi zagraconego ekranu. Wolimy gesty (przesunięcie,
  długie przytrzymanie), panele (`components/Sheet.tsx`) i menu zamiast nowych przycisków.
- **Nowy układ najpierw do akceptacji.** Przy nowej funkcji w UI pokaż propozycję (opis
  albo zrzut makiety) i poczekaj na OK. Przy oczywistej naprawie błędu po prostu napraw.
- Teksty w aplikacji po polsku, krótkie i zrozumiałe.

## Przebieg

1. **Odtwórz problem** w widoku iPhone 13 (Playwright, `devices["iPhone 13"]`):
   zbuduj frontend, uruchom backend na pustej bazie i zrób zrzut przed zmianą
   (`deviceScaleFactor` z urządzenia; zrzut dla Dariusza zapisz w `/mnt/project-files/`).
   Jeśli Dariusz przysłał zrzut, porównaj z nim.
2. Znajdź komponent: `frontend/src/pages/*Page.tsx`, wspólne części w `components/`,
   logika w `lib/` (np. `navigation.ts`, `useEdgeSwipeBack.ts`, `offlineShopping.ts`).
3. Popraw. Style tylko w `src/styles.css` (kolory w zmiennych na górze).
4. Dopisz test e2e w `frontend/e2e/app.spec.ts`, który by ten błąd wyłapał.
5. Zrzut po zmianie, kontrole (`sprawdz-przed-pushem`) i wydanie (`wydanie-dodatku`).
6. Pokaż Dariuszowi zrzuty przed/po.

## Znane pułapki Safari na iPhonie

- `fetch` dłuższy niż ok. 60 s kończy się „Load failed”. Synchroniczne endpointy AI
  trzymaj poniżej ~50 s, dłuższe zadania jako praca w tle.
- `<input type="date">`: wybór daty nie zawsze daje `change` z fokusem - zapisuj od razu
  po zmianie wartości (0.8.3). Chromium bez okna nie wysyła `blur`; w testach `focusout`.
- Service worker, Wake Lock, Web Push i offline z ikony działają tylko po **https**
  (`https://przepisy.tail17212f.ts.net`), nie po `http://100.111.105.7:8000`.
- Bezpieczne strefy (notch, dolny pasek): `env(safe-area-inset-*)`.
- Pole tekstowe z czcionką mniejszą niż 16 px powoduje powiększanie ekranu przy fokusie.
- Testy e2e działają w Chromium, nie w prawdziwym WebKit - przy błędach specyficznych
  dla Safari powiedz wprost, że test tego nie potwierdza, i poproś Dariusza o sprawdzenie
  na telefonie po aktualizacji.
