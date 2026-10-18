"""Połączenie z bazą SQLite i sesje SQLAlchemy."""

from collections.abc import Iterator

from sqlalchemy import create_engine, event, inspect, text
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


# Kolumny dodane po pierwszym wydaniu: (tabela, kolumna, definicja SQL).
# create_all tworzy tylko brakujące tabele, więc nowe kolumny w istniejącej
# bazie dodajemy sami. Nową kolumnę w models.py dopisz też tutaj.
ADDED_COLUMNS = [
    ("import_jobs", "recipe_count", "INTEGER NOT NULL DEFAULT 0"),
    ("recipes", "favorite", "BOOLEAN NOT NULL DEFAULT 0"),
    ("recipes", "rating", "INTEGER"),
    ("recipes", "cooked_count", "INTEGER NOT NULL DEFAULT 0"),
    ("recipes", "last_cooked_at", "DATETIME"),
    ("recipes", "kcal", "INTEGER"),
    ("recipes", "protein", "INTEGER"),
    ("recipes", "fat", "INTEGER"),
    ("recipes", "carbs", "INTEGER"),
    ("ingredients", "in_pantry", "BOOLEAN NOT NULL DEFAULT 0"),
]


def _add_missing_columns() -> None:
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table, column, definition in ADDED_COLUMNS:
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


def init_db() -> None:
    """Tworzy tabele (jeśli ich nie ma) i dodaje podstawowe składniki."""
    from . import models  # noqa: F401  - rejestruje tabele w Base.metadata
    from .services.categories import DEFAULT_CATEGORIES, get_or_create_category
    from .services.ingredients import get_or_create_ingredient

    Base.metadata.create_all(engine)
    _add_missing_columns()
    with SessionLocal() as db:
        for name in DEFAULT_STAPLES:
            get_or_create_ingredient(db, name, is_staple=True)
        # Domyślne kategorie dodajemy tylko do pustej tabeli, żeby usunięte nie wracały
        if db.query(models.Category).count() == 0:
            for name in DEFAULT_CATEGORIES:
                get_or_create_category(db, name)
        # Zadania importu przerwane restartem serwera oznaczamy jako nieudane
        db.query(models.ImportJob).filter(
            models.ImportJob.status.in_(["pending", "running"])
        ).update({"status": "failed", "error": "Import przerwany (restart serwera)"})
        db.commit()
