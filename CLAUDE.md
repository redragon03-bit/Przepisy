@GEMINI.md

## Praca zespołowa

Jesteś głównym agentem w tym repo. Po każdej zmianie kodu (nie tylko dokumentacji),
zanim zgłosisz Darkowi „gotowe”, zbierz dwie niezależne recenzje przez `hc` (Herdr Core,
manual: `hc --skill`). Raporty trafiają do `C:/Users/dariu/AppData/Local/Temp/przepisy-review/`
(najpierw `mkdir -p` tego folderu i usuń stare raporty).

1. **Przegląd w Antigravity (`agy`, Gemini).** Uruchom go w nowym terminalu w tle:
   ```sh
   hc run --bg --name review-agy --cwd C:/projekty/Przepisy agy -i "Przejrzyj wynik polecen 'git diff main...HEAD' oraz 'git diff' (niezatwierdzone zmiany). Szukaj: błędów logiki, problemów bezpieczeństwa (XSS, wstrzyknięcia, sekrety albo dane domu w publicznym repo) i problemów UI na iPhonie 13 w Safari/PWA (safe-area, czcionka pól poniżej 16 px, przewijanie, gesty, input type=date). Tylko odczyt: nie zmieniaj plików, nie commituj, nie uruchamiaj innych agentów. Raport zapisz do C:/Users/dariu/AppData/Local/Temp/przepisy-review/agy.md: każda uwaga z plikiem:linią, wagą (błąd/ryzyko/drobiazg) i uzasadnieniem."
   ```
2. **Testy i przypadki brzegowe w Copilot (`copilot`), równolegle z punktem 1**, jeśli Copilot
   ma dostępne modele:
   ```sh
   hc run --bg --name review-copilot --cwd C:/projekty/Przepisy copilot "--allow-tool=shell(git diff)" "--allow-tool=shell(git log)" "--allow-tool=read" "--deny-tool=write" -i "Sprawdź zmiany z 'git diff main...HEAD': czy testy (pytest, testy frontendu, e2e w frontend/e2e/app.spec.ts) pokrywają zmianę i jakich przypadków brzegowych brakuje (puste dane, brak sieci, długie teksty, polskie znaki, strefy czasowe, podwójne kliknięcie). Tylko odczyt: używaj wyłącznie git diff, git log i czytania plików. Nie zmieniaj ani nie twórz plików, nie uruchamiaj innych poleceń ani agentów. Raport podaj tu w odpowiedzi: każda uwaga z plikiem:linią, wagą (błąd/ryzyko/drobiazg) i uzasadnieniem."
   ```
   **Uprawnienia Copilota:** zawsze zwykły tryb (ręczne zatwierdzanie), nigdy `--allow-all`,
   `--yolo`, `--allow-all-tools` ani autopilot. Dozwolone bez pytania są tylko `git diff`,
   `git log` i odczyt plików, a zapis jest zabroniony (`--deny-tool=write`). Raport Copilot
   podaje na ekranie, odczytaj go przez `hc read review-copilot`. Gdy Copilot poprosi o
   cokolwiek więcej (inne polecenie, zapis, URL, MCP; status `blocked`), nie zatwierdzaj tego
   sam, tylko zapytaj Darka. Nie obchodź blokad hooka strażnika (`.claude/hooks/straz.py`):
   ani skryptami ustawiającymi zmienne, ani `-ExecutionPolicy Bypass`.
   W treści zadania nie używaj backticków: wewnątrz cudzysłowów bash wykona je jako polecenie.
   Po starcie zrób `hc read review-copilot`. Jeśli widać brak modeli, brak limitu albo brak
   logowania, zamknij go (`hc kill review-copilot; hc rm review-copilot`) i zapisz w
   podsumowaniu, że Copilot był niedostępny. Jeśli `first_message.sent` jest false, najpierw
   przeczytaj ekran (np. okno zaufania folderu) i dopiero wtedy wyślij zadanie, nie wysyłaj go
   w ciemno drugi raz.
   **Okno zaufania folderu** (pokazują je i `agy`, i `copilot` przy pierwszym starcie w repo):
   po zatwierdzeniu (`hc keys <nazwa> enter`) zawsze zrób `hc read <nazwa>` i sprawdź, czy
   treść zadania widać na ekranie i czy agent nad nim pracuje (status `working`). Sam status
   `idle` po oknie zaufania znaczy zwykle, że zadanie nie dotarło. Wtedy wyślij je przez
   `hc send <nazwa> "..."`. Sprawdź też na ekranie, czy narzędzia recenzenta nie są blokowane
   (np. „Denied by preToolUse hook”). Wtedy raport jest pusty, a recenzję trzeba uznać za
   niewykonaną i napisać to Darkowi.
3. **Czekaj i oceniaj krytycznie.** Czekaj przez `hc wait --children all` (timeout to tylko
   przypomnienie, czekaj dalej). Nie używaj `sleep`. Gdy terminal ma status `blocked`,
   przeczytaj jego ekran i zapytaj Darka, nie omijaj tego przez `--force`. Przeczytaj oba
   raporty i każdą uwagę sprawdź w kodzie. Popraw tylko to, co jest słuszne i mieści się w
   zakresie zmiany. Odrzuć uwagi błędne, czysto stylistyczne i takie, które wymagają nowych
   funkcji (te opisz jako propozycje). Po poprawkach uruchom ponownie kontrole z
   „Kontrole przed pushem” w GEMINI.md. Na koniec zamknij recenzentów: `hc kill <nazwa>; hc rm <nazwa>`.
4. **Dopiero potem zgłoś Darkowi „gotowe”**, z krótkim podsumowaniem:
   - co zmieniłeś,
   - **przyjęte** uwagi (kto zgłosił, co poprawiłeś),
   - **odrzucone** uwagi (kto zgłosił, dlaczego odrzuciłeś),
   - czy Copilot był dostępny i czy kontrole przeszły.
