"""Testy strażnika: python3 -m pytest -q .claude/hooks"""

import importlib.util
import json
import os
import pathlib
import subprocess
import time

_spec = importlib.util.spec_from_file_location(
    "straz", pathlib.Path(__file__).with_name("straz.py")
)
straz = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(straz)


def bash(cmd):
    return straz.sprawdz({"tool_name": "Bash", "tool_input": {"command": cmd}})


def test_blokuje_niszczace():
    for cmd in [
        "rm -rf frontend/dist",
        "rm -r -f x",
        "git push --force origin claude/x",
        "git push -f",
        "git push origin main",
        "git push origin HEAD:main",
        "git reset --hard origin/main",
        "git clean -fd",
        "python -c 'cur.execute(\"DROP TABLE recipes\")'",
        "sqlite3 /data/przepisy.db 'delete from recipes'",
        "env | grep KEY",
        "cat .env",
        "git commit --no-verify -m x",
    ]:
        assert bash(cmd) and bash(cmd)[0] == "deny", cmd


def test_przepuszcza_zwykla_prace():
    for cmd in [
        "git push -u origin claude/project-thread-p4kf3v",
        "rm -f /tmp/x.png",
        "cat .env.example",
        "cd backend && pytest -q",
        "npm run build",
        "git diff origin/main...HEAD",
        "grep -rn 'DELETE FROM' backend/app",
    ]:
        assert bash(cmd) is None, cmd


def test_plik_env():
    assert (
        straz.sprawdz({"tool_name": "Read", "tool_input": {"file_path": "/x/.env"}})[0]
        == "deny"
    )
    assert (
        straz.sprawdz(
            {"tool_name": "Read", "tool_input": {"file_path": "/x/.env.example"}}
        )
        is None
    )


def test_ha():
    assert (
        straz.sprawdz(
            {"tool_name": "mcp__Home_Assistant_Ivellios__ha_restart", "tool_input": {}}
        )[0]
        == "ask"
    )
    assert (
        straz.sprawdz(
            {"tool_name": "mcp__Home_Assistant_Ivellios__ha_get_logs", "tool_input": {}}
        )
        is None
    )


def test_merge_wymaga_bramy(tmp_path, monkeypatch):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(tmp_path))
    merge = {"tool_name": "mcp__github__merge_pull_request", "tool_input": {}}
    assert straz.sprawdz(merge)[0] == "ask"
    straz.zapisz_brame("abc123")
    assert straz.sprawdz(merge) is None
    plik = tmp_path / ".git" / "brama.json"
    dane = json.loads(plik.read_text())
    dane["czas"] = int(time.time()) - 4 * 3600
    plik.write_text(json.dumps(dane))
    assert straz.sprawdz(merge)[0] == "ask"
    os.remove(plik)


def narzedzie(nazwa, wejscie):
    wynik = straz.sprawdz({"tool_name": nazwa, "tool_input": wejscie})
    return wynik[0] if wynik else None


def test_plik_env_sciezka_windows():
    assert narzedzie("Read", {"file_path": r"C:\projekty\Przepisy\.env"}) == "deny"
    assert narzedzie("Read", {"file_path": r"C:\projekty\Przepisy\.env.example"}) is None


def test_copilot_powloka_te_same_zakazy():
    for nazwa in ("powershell", "bash"):
        assert narzedzie(nazwa, {"command": "git push --force origin x"}) == "deny"
        assert narzedzie(nazwa, {"command": "cat backend/.env"}) == "deny"
        assert narzedzie(nazwa, {"command": "git diff main...HEAD"}) is None
    # Tekst wpisany do otwartej powłoki to też polecenie
    assert narzedzie("write_powershell", {"shellId": "1", "input": "git reset --hard"}) == "deny"


def test_powershell_odpowiedniki():
    for cmd in [
        "Get-Content .env",
        "gc backend\\.env",
        "type .env",
        "Select-String KEY .env",
        "Get-ChildItem env:",
        "dir env:",
        "Remove-Item -Recurse -Force frontend\\dist",
    ]:
        assert narzedzie("powershell", {"command": cmd}) == "deny", cmd
    assert narzedzie("powershell", {"command": "git status; type .env"}) == "deny"
    for cmd in [
        "Get-Content .env.example",
        "Get-ChildItem frontend",
        "Remove-Item x.png",
        # zwykłe słowa w opisach commitów i PR to nie polecenia
        'git commit -m "add more checks for .env files"',
        'gh pr create --body "type of .env rule"',
    ]:
        assert narzedzie("powershell", {"command": cmd}) is None, cmd


def test_copilot_pliki_env():
    assert narzedzie("view", {"path": r"C:\projekty\Przepisy\nie-ma-takiego\.env"}) == "deny"
    assert narzedzie("view", {"path": r"C:\projekty\Przepisy\.env.example"}) is None
    assert narzedzie("edit", {"path": "backend/.env", "old_str": "a", "new_str": "b"}) == "deny"
    assert narzedzie("create", {"path": ".env", "file_text": "X=1"}) == "deny"
    assert narzedzie("rg", {"pattern": "KEY", "paths": ["backend/.env"]}) == "deny"
    assert narzedzie("rg", {"pattern": ".env", "paths": ["backend/app"]}) is None
    assert narzedzie("glob", {"pattern": "**/.env"}) == "deny"


def test_copilot_apply_patch():
    latka = "*** Begin Patch\n*** Update File: backend/.env\n@@\n-A=1\n+A=2\n*** End Patch\n"
    assert narzedzie("apply_patch", latka) == "deny"
    assert narzedzie("apply_patch", {"input": latka}) == "deny"
    zwykla = latka.replace("backend/.env", "backend/app/main.py")
    assert narzedzie("apply_patch", zwykla) is None


def test_copilot_mcp_nazwy(tmp_path, monkeypatch):
    assert narzedzie("Home_Assistant_Ivellios-ha_restart", {}) == "ask"
    assert narzedzie("Home_Assistant_Ivellios-ha_get_logs", {}) is None
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(tmp_path))
    assert narzedzie("github-mcp-server-merge_pull_request", {}) == "ask"
    assert narzedzie("github-mcp-server-get_pull_request", {}) is None


def test_uwagi_z_recenzji():
    # argumenty jako tekst JSON, tool_input: null obok toolArgs
    assert narzedzie("view", '{"path": "x/.env"}') == "deny"
    assert narzedzie("powershell", '{"command": "git reset --hard"}') == "deny"
    assert straz.sprawdz({"tool_name": "view", "tool_input": None, "toolArgs": {"path": ".env"}})[0] == "deny"
    # spacja albo nowa linia przed aliasem
    for cmd in [" type .env -Raw", "cd backend\ngc .env -Raw"]:
        assert narzedzie("powershell", {"command": cmd}) == "deny", cmd
    # aliasy i skrócone flagi PowerShell
    for cmd in ["ri -Recurse frontend\\dist", "rd -r frontend\\dist", "Remove-Item -Rec dist",
                "Get-ChildItem -Path env:", "gi env:*"]:
        assert narzedzie("powershell", {"command": cmd}) == "deny", cmd
    # maski wyszukiwania
    assert narzedzie("rg", {"pattern": "KEY", "glob": "**/.env*"}) == "deny"
    assert narzedzie("glob", {"pattern": "*.env"}) == "deny"
    assert narzedzie("glob", {"pattern": "**/.env.example"}) is None
    assert narzedzie("glob", {"pattern": "**/*.py"}) is None
    # wielkość liter w nazwach MCP
    assert narzedzie("Home_Assistant_Ivellios-HA_RESTART", {}) == "ask"


def test_format_copilot_camelcase():
    dane = {"toolName": "view", "toolArgs": {"path": "x/.env"}}
    assert straz.sprawdz(dane)[0] == "deny"
