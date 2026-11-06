# Skille i agenci Claude Code dla projektu Przepisy

Claude Code wczytuje je automatycznie, gdy pracuje w tym repozytorium.

## Skille (`/nazwa` albo Claude sam je wybiera)

| Skill | Kiedy |
|---|---|
| `wydanie-dodatku` | każda zmiana, która ma trafić do HA: wersja, PR, obraz Docker, aktualizacja dodatku |
| `sprawdz-przed-pushem` | przed pushem i przy czerwonym CI |
| `diagnoza-ha` | coś nie działa między aplikacją a Home Assistant / Tailscale |
| `poprawka-ui-iphone` | błąd lub nowy element ekranu na iPhonie |
| `analiza-aplikacji` | analiza luk i plan zmian z priorytetami P1-P3 |
| `zespol-ui` | orkiestrator: poprawki UI przez zespół agentów, od zgłoszenia do aktualizacji w HA |

## Agenci (osobne „okna” do zadań pobocznych)

| Agent | Co robi |
|---|---|
| `recenzent-zmian` | sprawdza diff względem zasad projektu (wersja, typy API, limity czasu AI, HA, UI) |
| `tester-iphone` | uruchamia aplikację i przechodzi scenariusz w widoku iPhone 13, robi zrzuty |
| `diagnosta-ha` | tylko czyta logi i stan HA, zwraca diagnozę |
| `budowniczy-ui` | robi jedno zadanie UI w osobnym worktree: test e2e, zmiana, zrzuty, commit |
| `straznik-weryfikacji` | bramka: wszystkie kontrole z CI + analiza diffu, PASS/FAIL, niczego nie poprawia |

## Hooki (`.claude/settings.json`)

| Hook | Co robi |
|---|---|
| `hooks/straz.py` (przed narzędziem) | blokuje `rm -r`, force push, push na main, `reset --hard`, kasowanie danych w bazie, `.env`; zmiany w HA wymagają zgody; merge i aktualizacja dodatku tylko przy zielonej bramce (`.git/brama.json`, ważna 3 h) |
| `hooks/po_edycji.py` (po edycji) | po zmianie pliku `.py` w backendzie od razu uruchamia ruff |

Testy strażnika: `python3 -m pytest -q .claude/hooks`.
