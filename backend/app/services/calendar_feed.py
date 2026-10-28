"""Plan posiłków jako kalendarz (plik .ics).

Kalendarz w Home Assistant (integracja "Remote calendar"), w telefonie albo w Google
może subskrybować ten adres i sam pobierać zmiany. Każdy zaplanowany przepis to
wydarzenie na cały dzień, z linkiem do przepisu w aplikacji.
"""

from datetime import UTC, date, datetime, timedelta

from ..models import MealPlanEntry


def _escape(text: str) -> str:
    """Znaki specjalne w treści wydarzenia (RFC 5545)."""
    return text.replace("\\", "\\\\").replace(";", r"\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> str:
    """Linie dłuższe niż 75 bajtów dzielimy - kolejna część zaczyna się od spacji."""
    parts: list[str] = []
    current = ""
    for char in line:
        if len((current + char).encode()) > 75:
            parts.append(current)
            current = " "
        current += char
    parts.append(current)
    return "\r\n".join(parts)


def _event(entry: MealPlanEntry, base_url: str, stamp: str) -> list[str]:
    title = entry.recipe.title + (f" ({entry.servings} por.)" if entry.servings else "")
    link = f"{base_url}/przepis/{entry.recipe.id}"
    return [
        "BEGIN:VEVENT",
        f"UID:plan-{entry.id}@przepisy",
        f"DTSTAMP:{stamp}",
        f"DTSTART;VALUE=DATE:{entry.day:%Y%m%d}",
        f"DTEND;VALUE=DATE:{entry.day + timedelta(days=1):%Y%m%d}",
        f"SUMMARY:{_escape(title)}",
        f"DESCRIPTION:{_escape(link)}",
        f"URL:{link}",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
    ]


def build(entries: list[MealPlanEntry], base_url: str) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Przepisy//Plan posilkow//PL",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:Plan posiłków"]
    for entry in entries:
        lines += _event(entry, base_url, stamp)
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def window(today: date | None = None) -> tuple[date, date]:
    """Miesiąc wstecz i dwa do przodu - wystarczy, a plik zostaje mały."""
    today = today or date.today()
    return today - timedelta(days=31), today + timedelta(days=62)
