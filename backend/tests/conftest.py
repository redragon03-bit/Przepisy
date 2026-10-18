"""Wspólne przygotowanie testów: osobny folder danych na każdy test."""

import os
import tempfile

import pytest

# Ustawiamy zmienne ZANIM zaimportujemy aplikację - config czyta je przy imporcie
os.environ["DATA_DIR"] = tempfile.mkdtemp()
os.environ["APP_PASSWORD"] = "tajne"
os.environ["ANTHROPIC_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    init_db()
    with TestClient(app) as test_client:
        test_client.post("/api/auth/login", json={"password": "tajne"})
        yield test_client
