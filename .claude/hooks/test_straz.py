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
