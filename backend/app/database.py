"""Połączenie z bazą SQLite i sesje SQLAlchemy."""

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    """Klasa bazowa dla wszystkich tabel (patrz models.py)."""


engine = create_engine(
    get_settings().database_url,
    # SQLite domyślnie pozwala na użycie połączenia tylko w jednym wątku,
    # a FastAPI i zadania w tle używają wielu wątków.
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_connection, _record):
    # Bez tego SQLite ignoruje ON DELETE CASCADE
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Zależność FastAPI: daje sesję bazy na czas jednego zapytania HTTP."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Składniki, które prawie zawsze są w kuchni. Przy "co mogę ugotować"
# nie liczymy ich jako brakujących. Można to zmienić w Ustawieniach.
DEFAULT_STAPLES = [
    "sól", "pieprz", "pieprz czarny", "woda", "olej", "olej roślinny",
    "oliwa", "oliwa z oliwek", "cukier",
]


def init_db() -> None:
    """Tworzy tabele (jeśli ich nie ma) i dodaje podstawowe składniki."""
    from . import models  # noqa: F401  - rejestruje tabele w Base.metadata
    from .services.ingredients import get_or_create_ingredient

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        for name in DEFAULT_STAPLES:
            get_or_create_ingredient(db, name, is_staple=True)
        # Zadania importu przerwane restartem serwera oznaczamy jako nieudane
        db.query(models.ImportJob).filter(
            models.ImportJob.status.in_(["pending", "running"])
        ).update({"status": "failed", "error": "Import przerwany (restart serwera)"})
        db.commit()
