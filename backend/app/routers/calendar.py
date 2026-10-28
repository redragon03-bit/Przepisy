"""Plan posiłków jako kalendarz .ics dla Home Assistant i innych kalendarzy.

Kalendarz pobiera plik sam, bez logowania, więc adres zawiera tajny token
(wyliczony z klucza aplikacji i hasła - zmiana hasła zmienia też adres).
"""

import hashlib
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..auth import _password_tag, require_auth
from ..config import get_settings
from ..database import get_db
from ..models import MealPlanEntry
from ..schemas import CalendarLink
from ..services import calendar_feed

router = APIRouter(prefix="/api", tags=["plan"])


def calendar_token() -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, f"calendar:{_password_tag()}".encode(), hashlib.sha256).hexdigest()[:32]


@router.get("/calendar/link", response_model=CalendarLink, dependencies=[Depends(require_auth)])
def calendar_link():
    """Ścieżka do kalendarza z tokenem - Ustawienia doklejają do niej adres aplikacji."""
    return CalendarLink(path=f"/api/calendar.ics?token={calendar_token()}")


@router.get("/calendar.ics")
def calendar_ics(request: Request, token: str = "", app: str = "", db: Session = Depends(get_db)):
    """`app` = adres aplikacji do linków w wydarzeniach (HA pobiera plik z innego adresu niż telefon)."""
    if not hmac.compare_digest(token, calendar_token()):
        raise HTTPException(404)
    start, end = calendar_feed.window()
    entries = (
        db.query(MealPlanEntry)
        .filter(MealPlanEntry.day.between(start, end))
        .order_by(MealPlanEntry.day, MealPlanEntry.id)
        .all()
    )
    base = app if app.startswith(("http://", "https://")) else str(request.base_url)
    body = calendar_feed.build(entries, base.rstrip("/"))
    return Response(body, media_type="text/calendar; charset=utf-8")
