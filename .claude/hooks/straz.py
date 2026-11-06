#!/usr/bin/env python3
"""Strażnik zespołu agentów (hook PreToolUse Claude Code).

Dostaje na stdin JSON z nazwą narzędzia i jego argumentami. Odpowiada:
- deny  - polecenie niszczące albo wyciek sekretów; agent musi zapytać Dariusza,
- ask   - krok wymagający zielonej bramki, a bramki nie ma (Claude Code pyta człowieka),
- nic   - zwykła praca, przepuszczamy.

Zielona bramka to plik <git-common-dir>/brama.json zapisany przez agenta
`straznik-weryfikacji` (`python3 .claude/hooks/straz.py zapisz-brame <sha>`) po tym, jak
przeszły wszystkie kontrole z CI i recenzja nie ma uwag blokujących. Plik leży w
katalogu .git, więc widzą go wszystkie worktree i nie trafia do repozytorium.
"""

import json
import os
import re
import subprocess
import sys
import time

# Ile godzin zielona bramka jest ważna
BRAMA_WAZNA_H = 3

# Polecenia, których agent nigdy nie uruchamia sam
ZAKAZANE_BASH = [
    (r"\brm\s+(-\S+\s+)*-[a-zA-Z]*r", "rm -r usuwa całe katalogi bez kosza"),
    (
        r"\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b|\s\+\S)",
        "force push nadpisuje historię",
    ),
    (
        r"\bgit\s+push\b.*\b(origin\s+)?(HEAD:)?(refs/heads/)?main\b",
        "push prosto na main - zmiany idą przez PR",
    ),
    (r"\bgit\s+reset\s+--hard\b", "reset --hard kasuje niezapisaną pracę"),
    (r"\bgit\s+clean\s+-[a-zA-Z]*f", "git clean -f usuwa pliki"),
    (r"\bgit\s+branch\s+-D\b", "usuwanie gałęzi bez sprawdzenia scalenia"),
    (r"\bgit\s+worktree\s+remove\b.*--force", "usuwanie worktree z niezapisaną pracą"),
    (r"\b(drop|truncate)\s+table\b", "kasowanie tabeli w bazie"),
    (r"\bsqlite3\b.*\b(delete|update|drop|alter)\b", "zmiana danych w bazie z palca"),
    (r"\bsqlite3\b.*\bdata/", "bezpośrednia zmiana prawdziwej bazy"),
    (r"\b(printenv|env)\s*($|\|)", "wypisywanie zmiennych środowiska (sekrety)"),
    (
        r"\b(cat|less|head|tail)\b[^|;&]*\.env\b(?!\.example)",
        "czytanie pliku .env (sekrety)",
    ),
    (r"--no-verify\b", "pomijanie kontroli gita"),
]

# Narzędzia Home Assistant, które zawsze wymagają zgody Dariusza
HA_ZAKAZANE = re.compile(
    r"__ha_(restart|reload_core|remove_\w+|config_remove_\w+|config_delete_\w+|manage_backup)$"
)
# Narzędzia, które wolno użyć samodzielnie tylko przy zielonej bramce
WYMAGA_BRAMY = re.compile(
    r"(mcp__github__merge_pull_request|__ha_manage_app|__ha_manage_updates)$"
)


def katalog_git():
    """Wspólny katalog .git (ten sam dla repo i wszystkich worktree)."""
    cwd = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        return out
    except (OSError, subprocess.CalledProcessError):
        return None


def brama_zielona():
    d = katalog_git()
    if not d:
        return False, "nie znaleziono repozytorium"
    try:
        with open(os.path.join(d, "brama.json"), encoding="utf-8") as f:
            b = json.load(f)
    except (OSError, ValueError):
        return (
            False,
            "brak zielonej bramki (agent straznik-weryfikacji jej nie zapisał)",
        )
    if b.get("wynik") != "PASS":
        return False, "ostatnia bramka nie przeszła"
    if time.time() - b.get("czas", 0) > BRAMA_WAZNA_H * 3600:
        return False, f"zielona bramka starsza niż {BRAMA_WAZNA_H} h"
    return True, f"bramka PASS dla {b.get('sha', '?')[:8]}"


def odpowiedz(decyzja, powod):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": decyzja,
                    "permissionDecisionReason": powod,
                }
            },
            ensure_ascii=False,
        )
    )


def sprawdz(dane):
    """Zwraca (decyzja, powód) albo None, gdy przepuszczamy."""
    narzedzie = dane.get("tool_name", "")
    wejscie = dane.get("tool_input", {}) or {}

    if narzedzie == "Bash":
        polecenie = wejscie.get("command", "")
        for wzor, powod in ZAKAZANE_BASH:
            if re.search(wzor, polecenie, re.IGNORECASE):
                return (
                    "deny",
                    f"Zablokowane: {powod}. Zapytaj Dariusza albo zrób to inaczej.",
                )
        return None

    if narzedzie in ("Read", "Edit", "Write"):
        sciezka = wejscie.get("file_path", "")
        if re.search(r"(^|/)\.env$", sciezka):
            return "deny", "Plik .env zawiera sekrety - nie czytamy go i nie zmieniamy."
        return None

    if HA_ZAKAZANE.search(narzedzie):
        return "ask", "Ta zmiana w Home Assistant wymaga zgody Dariusza."

    if WYMAGA_BRAMY.search(narzedzie):
        ok, powod = brama_zielona()
        if ok:
            return None
        return "ask", f"Merge/aktualizacja bez zielonej bramki: {powod}."

    return None


def zapisz_brame(sha):
    d = katalog_git()
    if not d:
        sys.exit("Nie znaleziono repozytorium")
    with open(os.path.join(d, "brama.json"), "w", encoding="utf-8") as f:
        json.dump({"wynik": "PASS", "sha": sha, "czas": int(time.time())}, f)
    print(f"Bramka PASS zapisana dla {sha}")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "zapisz-brame":
        zapisz_brame(sys.argv[2])
        return
    try:
        dane = json.load(sys.stdin)
    except ValueError:
        return
    wynik = sprawdz(dane)
    if wynik:
        odpowiedz(*wynik)


if __name__ == "__main__":
    main()
