"""API logowania."""

from fastapi import APIRouter, HTTPException, Request, Response

from ..auth import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    client_address,
    is_authenticated,
    make_session_token,
    password_ok,
    record_login,
    seconds_locked,
)
from ..config import get_settings
from ..schemas import AuthStatus, LoginIn
from ..services import timer_notify

router = APIRouter(prefix="/api/auth", tags=["logowanie"])


@router.get("/status", response_model=AuthStatus)
def status(request: Request):
    settings = get_settings()
    return AuthStatus(
        authenticated=is_authenticated(request),
        auth_required=bool(settings.app_password),
        ai_enabled=settings.ai_enabled,
        ai_provider=settings.active_ai_provider,
        ai_providers=settings.ai_providers,
        ha_enabled=settings.home_assistant is not None,
        notify_enabled=timer_notify.enabled(),
    )


@router.post("/login", status_code=204)
def login(data: LoginIn, request: Request, response: Response):
    client = client_address(request)
    wait = seconds_locked(client)
    if wait:
        raise HTTPException(429, f"Za dużo prób - spróbuj za {wait} s.")
    ok = password_ok(data.password)
    record_login(client, ok)
    if not ok:
        raise HTTPException(401, "Złe hasło")
    response.set_cookie(
        COOKIE_NAME, make_session_token(), max_age=COOKIE_MAX_AGE, httponly=True,
        samesite="lax", secure=request.url.scheme == "https",
    )


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
