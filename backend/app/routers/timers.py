"""API minutników: serwer wysyła powiadomienie przez Home Assistant, gdy minutnik się skończy."""

from fastapi import APIRouter, Depends

from ..auth import CurrentUser, current_user, require_auth
from ..schemas import TimerIn
from ..services import timer_notify

router = APIRouter(prefix="/api/timers", tags=["minutniki"], dependencies=[Depends(require_auth)])


@router.post("", status_code=204)
def start_timer(data: TimerIn, user: CurrentUser = Depends(current_user)):
    """Minutnik wystartował na telefonie - o czasie przyjdzie powiadomienie (jeśli ustawiono ha_notify).

    Powiadomienia idą na telefon właściciela, więc minutniki domownika ich nie wysyłają.
    """
    if user.is_owner:
        timer_notify.start(data.id, data.label, data.seconds)


@router.delete("/{timer_id}", status_code=204)
def cancel_timer(timer_id: int):
    """Minutnik usunięty przed czasem - bez powiadomienia."""
    timer_notify.cancel(timer_id)
