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

## Agenci (osobne „okna” do zadań pobocznych)

| Agent | Co robi |
|---|---|
| `recenzent-zmian` | sprawdza diff względem zasad projektu (wersja, typy API, limity czasu AI, HA, UI) |
| `tester-iphone` | uruchamia aplikację i przechodzi scenariusz w widoku iPhone 13, robi zrzuty |
| `diagnosta-ha` | tylko czyta logi i stan HA, zwraca diagnozę |
