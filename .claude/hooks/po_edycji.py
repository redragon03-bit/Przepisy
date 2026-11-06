#!/usr/bin/env python3
"""Hook PostToolUse: po każdej edycji pliku .py w backendzie od razu uruchamia ruff.

Błąd lintera wraca do agenta (kod wyjścia 2), więc poprawia go od razu, a nie dopiero
w CI. Testów tu nie uruchamiamy - to robi agent straznik-weryfikacji.
"""

import json
import pathlib
import subprocess
import sys


def main():
    try:
        dane = json.load(sys.stdin)
    except ValueError:
        return
    sciezka = (dane.get("tool_input") or {}).get("file_path", "")
    if not sciezka.endswith(".py") or "/backend/" not in sciezka.replace("\\", "/"):
        return
    backend = pathlib.Path(sciezka).resolve()
    while backend.name != "backend" and backend != backend.parent:
        backend = backend.parent
    try:
        wynik = subprocess.run(
            ["ruff", "check", "--quiet", sciezka],
            cwd=backend,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return  # ruff niezainstalowany - nie blokujemy pracy
    if wynik.returncode != 0:
        print(f"ruff znalazł problemy w {sciezka}:\n{wynik.stdout}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
