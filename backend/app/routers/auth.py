"""API logowania i kont (Ustawienia → Konta)."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..auth import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    OWNER_NAME_KEY,
    CurrentUser,
    check_password,
    client_address,
    current_user,
    find_member,
    forget_owner_name,
    hash_password,
    make_session_token,
    owner_name,
    password_ok,
    record_login,
    require_owner,
    seconds_locked,
    user_from_request,
)
from ..config import get_settings
from ..database import get_db
from ..models import (
    AppSetting,
    CookLogEntry,
    ImportJob,
    MealPlanEntry,
    MemberMark,
    MemberPantry,
    MemberPromoFavorite,
    Recipe,
    ShoppingItem,
    User,
)
from ..schemas import AccountIn, AccountOut, AccountPatch, AuthStatus, LoginIn, OwnPasswordIn
from ..services import images, timer_notify

router = APIRouter(prefix="/api/auth", tags=["logowanie"])


@router.get("/status", response_model=AuthStatus)
def status(request: Request):
    settings = get_settings()
    user = user_from_request(request)
    owner = user is None or user.is_owner
    return AuthStatus(
        authenticated=user is not None,
        auth_required=bool(settings.app_password),
        ai_enabled=settings.ai_enabled,
        ai_provider=settings.active_ai_provider,
        ai_providers=settings.ai_providers,
        # Lista w HA i powiadomienia to sprawy właściciela - domownik ich nie ma
        ha_enabled=settings.home_assistant is not None and owner,
        notify_enabled=timer_notify.enabled() and owner,
        user_name=user.name if user else "",
        is_owner=owner,
    )


def _set_cookie(request: Request, response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME, token, max_age=COOKIE_MAX_AGE, httponly=True,
        samesite="lax", secure=request.url.scheme == "https",
    )


@router.post("/login", status_code=204)
def login(data: LoginIn, request: Request, response: Response):
    client = client_address(request)
    wait = seconds_locked(client)
    if wait:
        raise HTTPException(429, f"Za dużo prób - spróbuj za {wait} s.")
    member = find_member(data.name)
    if member is not None:
        ok = check_password(data.password, member.password_hash)
        token = make_session_token(member.id, member.password_hash) if ok else ""
    else:
        # Bez nazwy (albo z nazwą właściciela) - hasło właściciela, jak przed kontami
        name = data.name.strip().casefold()
        ok = (not name or name == owner_name().casefold()) and password_ok(data.password)
        token = make_session_token() if ok else ""
    record_login(client, ok)
    if not ok:
        raise HTTPException(401, "Zła nazwa albo hasło")
    _set_cookie(request, response, token)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)


# --- Konta (tylko właściciel; domownik może zmienić własne hasło) ---

def _accounts(db: Session) -> list[AccountOut]:
    members = [AccountOut(id=u.id, name=u.name, is_owner=False) for u in db.query(User).order_by(User.name)]
    return [AccountOut(id=None, name=owner_name(), is_owner=True), *members]


def _check_name(db: Session, name: str, user_id: int | None) -> str:
    name = " ".join(name.split())
    if not name:
        raise HTTPException(400, "Podaj nazwę konta")
    taken = [owner_name()] if user_id is not None else []
    taken += [u.name for u in db.query(User) if u.id != user_id]
    if name.casefold() in {t.casefold() for t in taken}:
        raise HTTPException(400, "Konto o tej nazwie już jest")
    return name


@router.get("/accounts", response_model=list[AccountOut], dependencies=[Depends(require_owner)])
def list_accounts(db: Session = Depends(get_db)):
    return _accounts(db)


@router.post("/accounts", response_model=list[AccountOut], status_code=201, dependencies=[Depends(require_owner)])
def add_account(data: AccountIn, db: Session = Depends(get_db)):
    """Nowe konto domownika: wspólne przepisy, własny plan, zakupy, spiżarnia, ulubione i oceny."""
    if not get_settings().app_password:
        raise HTTPException(400, "Najpierw ustaw hasło aplikacji (opcja app_password w dodatku)")
    db.add(User(name=_check_name(db, data.name, -1), password_hash=hash_password(data.password)))
    db.commit()
    return _accounts(db)


@router.patch("/accounts/owner", response_model=list[AccountOut], dependencies=[Depends(require_owner)])
def rename_owner(data: AccountPatch, db: Session = Depends(get_db)):
    """Nazwa konta właściciela (hasło właściciela zmienia się w opcjach dodatku)."""
    if data.password:
        raise HTTPException(400, "Hasło właściciela zmienisz w opcjach dodatku (app_password)")
    if data.name is not None:
        name = _check_name(db, data.name, None)
        row = db.get(AppSetting, OWNER_NAME_KEY) or AppSetting(key=OWNER_NAME_KEY)
        row.value = name
        db.add(row)
        db.commit()
        forget_owner_name()
    return _accounts(db)


def _member(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Nie ma takiego konta")
    return user


@router.patch("/accounts/{user_id}", response_model=list[AccountOut], dependencies=[Depends(require_owner)])
def update_account(user_id: int, data: AccountPatch, db: Session = Depends(get_db)):
    """Zmiana nazwy albo hasła domownika (nowe hasło wylogowuje go na innych urządzeniach)."""
    user = _member(db, user_id)
    if data.name is not None:
        user.name = _check_name(db, data.name, user.id)
    if data.password:
        if len(data.password) < 4:
            raise HTTPException(400, "Hasło musi mieć co najmniej 4 znaki")
        user.password_hash = hash_password(data.password)
    db.commit()
    return _accounts(db)


@router.delete("/accounts/{user_id}", response_model=list[AccountOut], dependencies=[Depends(require_owner)])
def delete_account(user_id: int, db: Session = Depends(get_db)):
    """Usuwa konto i jego kuchnię (plan, zakupy, spiżarnię...). Jego przepisy zostają - jako twoje."""
    user = _member(db, user_id)
    files = [e.image for e in db.query(CookLogEntry).filter_by(user_id=user.id)]
    db.query(Recipe).filter_by(created_by=user.id).update({"created_by": None})
    for model in (CookLogEntry, ImportJob, MealPlanEntry, ShoppingItem, MemberMark, MemberPantry,
                  MemberPromoFavorite):
        db.query(model).filter_by(user_id=user.id).delete()
    db.delete(user)
    db.commit()
    for filename in files:
        images.delete_image(filename)
    return _accounts(db)


@router.post("/password", status_code=204)
def change_own_password(data: OwnPasswordIn, request: Request, response: Response,
                        db: Session = Depends(get_db), user: CurrentUser = Depends(current_user)):
    """Domownik zmienia swoje hasło (właściciel - w opcjach dodatku)."""
    if user.is_owner:
        raise HTTPException(400, "Hasło właściciela zmienisz w opcjach dodatku (app_password)")
    member = _member(db, user.id)
    if not check_password(data.old_password, member.password_hash):
        raise HTTPException(400, "Stare hasło się nie zgadza")
    member.password_hash = hash_password(data.new_password)
    db.commit()
    # Nowe ciasteczko - stare (z poprzednim hasłem) już nie działa
    _set_cookie(request, response, make_session_token(member.id, member.password_hash))
