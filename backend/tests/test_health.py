"""Tests for health check, ping, and API error handling endpoints.

To run these tests from the project root directory:
    python -m pytest backend/tests
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Generator
import pytest
from flask import Flask
from flask.testing import FlaskClient

# Ensure project root is in sys.path when running tests
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.app import create_app


@pytest.fixture
def app() -> Generator[Flask, None, None]:
    """Create and configure a Flask application instance for testing.

    Yields:
        Flask: The application configured with TESTING=True.
    """
    application: Flask = create_app()
    application.config.update({
        "TESTING": True,
    })
    yield application


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    """Create a Flask test client for simulating HTTP requests.

    Args:
        app: The Flask application fixture.

    Returns:
        FlaskClient: The test client instance.
    """
    return app.test_client()


def test_health_check(client: FlaskClient) -> None:
    """Test that GET /api/health returns HTTP 200 and status == 'ok'."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    assert isinstance(data, dict)
    assert data.get("status") == "ok"
    assert data.get("service") == "kisansathi-api"
    assert data.get("version") == "0.1.0"
    assert "time" in data
    assert isinstance(data["time"], str)


def test_ping(client: FlaskClient) -> None:
    """Test that GET /api/ping returns HTTP 200 and message == 'pong'."""
    response = client.get("/api/ping")
    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    assert isinstance(data, dict)
    assert data == {"message": "pong"}


def test_api_not_found(client: FlaskClient) -> None:
    """Test that an unknown /api/does-not-exist path returns 404 as JSON with an 'error' key."""
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.is_json

    data = response.get_json()
    assert isinstance(data, dict)
    assert "error" in data
    assert isinstance(data["error"], str)


def test_frontend_fallback_unbuilt(client: FlaskClient) -> None:
    """Test that requesting root when frontend is not built returns 200 with guidance."""
    response = client.get("/")
    assert response.status_code == 200
