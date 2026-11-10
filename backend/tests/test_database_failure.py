"""Database outage and fault tolerance tests for KisanSathi API.

Verifies that when database connectivity fails (raising sqlite3.Error):
    - Endpoints gracefully return HTTP 503 Service Unavailable in structured JSON.
    - /api/health reports degraded status without crashing or exposing stack traces.
    - /api/crops, /api/crops/<id>, and /api/options return 503 {"error": "Service temporarily unavailable"}.
    - POST /api/advisory, /api/advisory/explain, and /api/chat return 503 without leaking SQL errors.
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path
from typing import Generator

import pytest
from flask import Flask
from flask.testing import FlaskClient

_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.app import create_app
from backend.seed import seed_all


@pytest.fixture(scope="module")
def seeded_db_path(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Create and seed a temporary SQLite database."""
    tmp_dir = tmp_path_factory.mktemp("db_failure")
    db_file = tmp_dir / "kisansathi_fail.db"
    db_path = str(db_file.resolve())
    seed_all(db_path=db_path)
    return db_path


@pytest.fixture
def app(seeded_db_path: str) -> Flask:
    """Create test application."""
    return create_app(
        config_overrides={
            "DATABASE_PATH": seeded_db_path,
            "TESTING": True,
        }
    )


@pytest.fixture
def client(app: Flask) -> Generator[FlaskClient, None, None]:
    """Provide a Flask test client."""
    with app.test_client() as test_client:
        yield test_client


def _failing_connect(*args, **kwargs):
    """Mock connection function that raises sqlite3.OperationalError."""
    raise sqlite3.OperationalError("Simulated database disk failure / connection unavailable")


def _valid_advisory_payload() -> dict:
    """Return a baseline valid advisory request payload."""
    return {
        "crop": "wheat",
        "soilType": "loamy",
        "season": "rabi",
        "state": "Uttar Pradesh",
        "district": "Varanasi",
        "landSize": 5.0,
        "landUnit": "acres",
        "waterSource": "canal",
    }


def test_health_check_database_failure(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify /api/health returns 503 {"status": "degraded", "database": "unavailable"} when DB fails."""
    monkeypatch.setattr(sqlite3, "connect", _failing_connect)

    res = client.get("/api/health")
    assert res.status_code == 503
    data = res.get_json()
    assert data == {"status": "degraded", "database": "unavailable"}
    # No SQL trace leaked
    body_text = res.get_data(as_text=True)
    assert "Traceback" not in body_text
    assert "OperationalError" not in body_text


def test_crops_list_database_failure(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify /api/crops returns 503 on database failure."""
    monkeypatch.setattr(sqlite3, "connect", _failing_connect)

    res = client.get("/api/crops")
    assert res.status_code == 503
    data = res.get_json()
    assert data == {"error": "Service temporarily unavailable"}


def test_crop_detail_database_failure(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify /api/crops/<crop_id> returns 503 on database failure."""
    monkeypatch.setattr(sqlite3, "connect", _failing_connect)

    res = client.get("/api/crops/wheat")
    assert res.status_code == 503
    data = res.get_json()
    assert data == {"error": "Service temporarily unavailable"}


def test_options_database_failure(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify /api/options returns 503 on database failure."""
    monkeypatch.setattr(sqlite3, "connect", _failing_connect)

    res = client.get("/api/options")
    assert res.status_code == 503
    data = res.get_json()
    assert data == {"error": "Service temporarily unavailable"}


def test_advisory_database_failure(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify POST /api/advisory returns 503 on database failure."""
    monkeypatch.setattr(sqlite3, "connect", _failing_connect)

    res = client.post("/api/advisory", json=_valid_advisory_payload())
    assert res.status_code == 503
    data = res.get_json()
    assert data == {"error": "Service temporarily unavailable"}


def test_advisory_explain_database_failure(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify POST /api/advisory/explain returns 503 on database failure."""
    monkeypatch.setattr(sqlite3, "connect", _failing_connect)

    res = client.post("/api/advisory/explain", json={
        "form": _valid_advisory_payload(),
        "language": "en",
    })
    assert res.status_code == 503
    data = res.get_json()
    assert data == {"error": "Service temporarily unavailable"}


def test_chat_database_failure(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify POST /api/chat returns 503 on database failure."""
    monkeypatch.setattr(sqlite3, "connect", _failing_connect)

    res = client.post("/api/chat", json={
        "form": _valid_advisory_payload(),
        "language": "en",
        "question": "When should I irrigate?",
    })
    assert res.status_code == 503
    data = res.get_json()
    assert data == {"error": "Service temporarily unavailable"}
