"""Punkt wejścia aplikacji.

Uruchomienie lokalne:  uvicorn app.main:app --reload
Dokumentacja API:      http://localhost:8000/docs
"""

import logging
import re
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse

from .auth import require_auth
from .config import get_settings
from .database import init_db
from .services import backup as backup_service
from .services.importer import remove_stale_uploads
from .routers import auth, backup, categories, chat, imports, ingredients, pantry, plan, recipes, shopping

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    remove_stale_uploads()
    backup_service.start_scheduler()
    yield


app = FastAPI(title="Przepisy", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(recipes.router)
app.include_router(ingredients.router)
app.include_router(categories.router)
app.include_router(shopping.router)
app.include_router(plan.router)
app.include_router(pantry.router)
app.include_router(chat.router)
app.include_router(imports.router)
app.include_router(backup.router)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/media/{filename}", dependencies=[Depends(require_auth)])
def media(filename: str):
    """Obrazki przepisów. Tylko dla zalogowanych."""
    # Nazwy plików tworzymy sami (uuid.jpg) - wszystko inne odrzucamy,
    # żeby nikt nie mógł odczytać pliku spoza folderu, np. "../przepisy.db"
    if not re.fullmatch(r"[0-9a-f]{32}\.jpg", filename):
        raise HTTPException(404)
    path = get_settings().images_dir / filename
    if not path.exists():
        raise HTTPException(404)
    return FileResponse(path, headers={"Cache-Control": "private, max-age=31536000, immutable"})


# Frontend (zbudowany React) serwujemy z tego samego serwera.
# Każdy adres, który nie jest API, dostaje index.html - routingiem zajmuje się React.
static_dir = get_settings().static_dir
if static_dir and static_dir.exists():

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        file = (static_dir / path).resolve()
        if path and file.is_file() and file.is_relative_to(static_dir.resolve()):
            return FileResponse(file)
        if path.startswith("api/"):
            raise HTTPException(404)
        return FileResponse(static_dir / "index.html", headers={"Cache-Control": "no-cache"})
