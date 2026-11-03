---
name: diagnoza-ha
description: Diagnoza problemów aplikacji Przepisy z Home Assistant - "Wyślij do HA" / lista zakupów, powiadomienia minutników, kalendarz planu posiłków, sensor przepisy_dzis, logi dodatku oraz dostęp przez Tailscale/HTTPS. Użyj, gdy coś między aplikacją a HA nie działa.
---

# Diagnoza integracji z Home Assistant

Najpierw ustal fakty (logi, stan encji), potem poprawka w kodzie. Nie zgaduj przyczyny.
Narzędzia MCP Home Assistant (`mcp__Home_Assistant_*`) przed użyciem przeczytaj ich
przewodnik `ha_get_skill_guide`.

## Stałe dane instalacji Dariusza

| Co | Wartość |
|---|---|
| Dodatek Przepisy | slug `f6f83020_przepisy` |
| Log dodatku | `ha_get_logs` z `source=supervisor` |
| Lista zakupów | `todo.shopping_list` (wbudowana; **bez opisów pozycji**) |
| Powiadomienia | opcja `ha_notify` = `mobile_app_ivellios_darek` (drugi telefon: `mobile_app_iphone_katarzyna`) |
| Plan dnia | `sensor.przepisy_dzis` (`backend/app/services/plan_sensor.py`) |
| Kalendarz planu | `calendar.plan_posilkow` z integracji „Remote calendar”, URL `http://127.0.0.1:8000/api/calendar.ics?token=…` |
| Adres aplikacji | `https://przepisy.tail17212f.ts.net` (Tailscale Service `svc:przepisy`); awaryjnie `http://100.111.105.7:8000` |

## Kolejność kroków

1. **Log dodatku** - szukaj odpowiedzi HA (kod HTTP i treść). Aplikacja od 0.8.5 dokleja
   odpowiedź HA do komunikatu błędu.
2. **Stan encji** - `ha_get_state` / `ha_get_todo` dla encji z tabeli. Sprawdź
   `supported_features`: lista może nie obsługiwać pól, które wysyłamy.
3. **Odtwórz wywołanie** usługą `ha_call_service` z tymi samymi danymi co aplikacja
   (np. `todo.add_item`). Na liście testowej, nie na prawdziwej liście zakupów, albo
   usuń pozycję testową od razu po sprawdzeniu.
4. **Poprawka w kodzie** z testem w `backend/tests`, który odtwarza odpowiedź HA. Znany
   wzór: gdy HA odrzuca opcjonalne pole (400), ponów bez niego.
5. Wydanie: skill `wydanie-dodatku`.

## Kalendarz

Token w URL pochodzi z `GET /api/calendar/link` (po zalogowaniu). Zmienia się, gdy
zmieni się `APP_PASSWORD` albo klucz aplikacji - wtedy integrację trzeba dodać ponownie.

## Tailscale i HTTPS - zasady bezpieczeństwa

Zmiany w Tailscale potrafią zatrzymać cały dodatek Tailscale, a z nim połączenie MCP z HA.

- **Nigdy** nie ustawiaj `advertise_tags` ani usług, zanim Dariusz potwierdzi zmianę ACL
  (tagOwners `tag:ha`, autoApprovers `svc:przepisy`).
- Każda zmiana tagów/ACL musi zachować `tag:ha` w `nodeAttrs` dla Funnel - bez tego
  znika połączenie MCP z HA.
- `share_homeassistant: serve` wymaga w HA (UI: Ustawienia → System → Sieć) zaufania
  X-Forwarded-For i proxy `127.0.0.1`. Blok `http:` w YAML jest ignorowany.
- Nazwa `.ts.net` po IPv6 nie działa do portów dodatku (Safari woli IPv6) - nie
  proponuj ponownie własnego https na :8443/:8444.
- Zmiana opcji dodatku Tailscale albo restart to krok, który robimy tylko po zgodzie Dariusza.

## Zapisz w pamięci projektu

Każdą nową osobliwość HA (pole nieobsługiwane, inna encja, nowy token) zapisz w pliku
pamięci o HA, żeby kolejny wątek nie szukał od zera.
