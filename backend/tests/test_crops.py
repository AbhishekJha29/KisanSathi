"""Integration tests for crop library and form options endpoints.

Tests:
    1. GET /api/crops returns 200 and all seeded crops.
    2. GET /api/crops?season=rabi filters correctly.
    3. GET /api/crops?search=wheat matches in English.
    4. GET /api/crops?season=invalid returns 400 with an 'error' key.
    5. GET /api/crops/wheat returns 200 with full nested details.
    6. GET /api/crops/does-not-exist returns 404 with an 'error' key.
    7. SQL injection attempt in search query returns 200 and count == 0.
    8. GET /api/options returns 200 with soils, seasons, waterSources, units, and 36 states.
    9. For every crop returned by /api/crops, all soils are in allowed options and seasons in {kharif, rabi, zaid}.

To run these tests from the project root:
    python -m pytest backend/tests/test_crops.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, Generator, List

import pytest
from flask import Flask
from flask.testing import FlaskClient

# Ensure project root is in sys.path when running pytest
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.app import create_app
from backend.seed import seed_all


@pytest.fixture
def test_db_path(tmp_path: Path) -> str:
    """Create an isolated SQLite database file and seed it with test agronomy data.

    Args:
        tmp_path: pytest temporary directory fixture for isolated test execution.

    Returns:
        str: Absolute path string to the temporary SQLite database file.
    """
    db_file = tmp_path / "test_kisansathi.db"
    db_path_str = str(db_file.resolve())
    seed_all(db_path=db_path_str)
    return db_path_str


@pytest.fixture
def app(test_db_path: str) -> Generator[Flask, None, None]:
    """Create and configure a Flask application instance pointing to the test database.

    Args:
        test_db_path: Isolated temporary database path fixture.

    Yields:
        Flask: The application configured with TESTING=True and test DATABASE_PATH.
    """
    application: Flask = create_app(
        config_overrides={
            "DATABASE_PATH": test_db_path,
            "TESTING": True,
        }
    )
    yield application


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    """Create a Flask test client for HTTP endpoint tests.

    Args:
        app: Flask test application fixture.

    Returns:
        FlaskClient: Flask test client instance.
    """
    return app.test_client()


def test_get_crops_returns_all_crops(client: FlaskClient) -> None:
    """Test that GET /api/crops returns HTTP 200 and all 18 seeded crops."""
    response = client.get("/api/crops")
    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    assert isinstance(data, dict)
    assert "count" in data
    assert "crops" in data
    assert data["count"] == 18
    assert len(data["crops"]) == 18

    # Verify summary fields on first crop
    first_crop = data["crops"][0]
    for required_key in ["id", "nameEn", "seasons", "soils", "category"]:
        assert required_key in first_crop, f"Missing key '{required_key}' in crop summary"
    assert "nameHi" not in first_crop


def test_get_crops_filter_by_season(client: FlaskClient) -> None:
    """Test that GET /api/crops?season=rabi returns only crops associated with the rabi season."""
    response = client.get("/api/crops?season=rabi")
    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    assert data["count"] > 0
    assert len(data["crops"]) == data["count"]

    # Every returned crop must include 'rabi' in its seasons list
    for crop in data["crops"]:
        assert "rabi" in [s.lower() for s in crop["seasons"]], (
            f"Crop {crop['id']} does not have 'rabi' season: {crop['seasons']}"
        )

    # Test case insensitivity (RABI)
    case_response = client.get("/api/crops?season=RABI")
    assert case_response.status_code == 200
    assert case_response.get_json()["count"] == data["count"]


def test_get_crops_search_english(client: FlaskClient) -> None:
    """Test that GET /api/crops?search=wheat finds Wheat in English."""
    response = client.get("/api/crops?search=wheat")
    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    assert data["count"] >= 1

    crop_ids = [c["id"] for c in data["crops"]]
    assert "wheat" in crop_ids

    # Case insensitive search
    response_caps = client.get("/api/crops?search=WHEAT")
    assert response_caps.status_code == 200
    caps_data = response_caps.get_json()
    assert "wheat" in [c["id"] for c in caps_data["crops"]]


def test_get_crops_invalid_season(client: FlaskClient) -> None:
    """Test that GET /api/crops?season=invalid returns HTTP 400 with an 'error' key."""
    response = client.get("/api/crops?season=autumn_invalid")
    assert response.status_code == 400
    assert response.is_json

    data = response.get_json()
    assert "error" in data
    assert "autumn_invalid" in data["error"]


def test_get_crop_detail_success(client: FlaskClient) -> None:
    """Test that GET /api/crops/wheat returns HTTP 200 with complete nested detail."""
    response = client.get("/api/crops/wheat")
    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    assert data["id"] == "wheat"
    assert data["nameEn"] == "Wheat"
    assert "nameHi" not in data

    # Verify nested structures
    assert isinstance(data.get("seasons"), list)
    assert "rabi" in data["seasons"]

    assert isinstance(data.get("soils"), list)
    assert len(data["soils"]) > 0

    assert isinstance(data.get("fertilizerStages"), list)
    assert len(data["fertilizerStages"]) > 0
    first_stage = data["fertilizerStages"][0]
    assert "stageEn" in first_stage
    assert "stageHi" not in first_stage
    assert "fertilizerEn" in first_stage

    assert isinstance(data.get("irrigation"), dict)
    assert "frequencyEn" in data["irrigation"]
    assert "frequencyHi" not in data["irrigation"]

    assert isinstance(data.get("pestsDiseases"), list)
    assert len(data["pestsDiseases"]) > 0
    first_pest = data["pestsDiseases"][0]
    assert "nameEn" in first_pest
    assert "symptomsEn" in first_pest

    assert isinstance(data.get("harvestSteps"), list)
    assert len(data["harvestSteps"]) > 0
    first_step = data["harvestSteps"][0]
    assert "titleEn" in first_step
    assert "textEn" in first_step


def test_get_crop_detail_not_found(client: FlaskClient) -> None:
    """Test that GET /api/crops/does-not-exist returns HTTP 404 with an 'error' key."""
    response = client.get("/api/crops/does-not-exist")
    assert response.status_code == 404
    assert response.is_json

    data = response.get_json()
    assert "error" in data
    assert "does-not-exist" in data["error"]


def test_crops_sql_injection_safe(client: FlaskClient) -> None:
    """Test that SQL injection attempt in search parameter is safely treated as a literal."""
    injection_payload = "' OR 1=1 --"
    response = client.get(f"/api/crops?search={injection_payload}")
    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    # Safe parameterized query matches literally, so count must be 0
    assert data["count"] == 0
    assert len(data["crops"]) == 0


def test_get_options(client: FlaskClient) -> None:
    """Test that GET /api/options returns HTTP 200 and all expected form dropdown categories."""
    response = client.get("/api/options")
    assert response.status_code == 200
    assert response.is_json

    data = response.get_json()
    for category in ["soils", "seasons", "waterSources", "units", "states"]:
        assert category in data, f"Missing category '{category}' in options payload"

    # Check soils
    assert len(data["soils"]) >= 8
    assert any(s["id"] == "alluvial" for s in data["soils"])

    # Check seasons
    assert len(data["seasons"]) == 3
    assert {s["id"] for s in data["seasons"]} == {"kharif", "rabi", "zaid"}

    # Check water sources
    assert len(data["waterSources"]) >= 5
    assert any(w["id"] == "canal" for w in data["waterSources"])

    # Check measurement units
    assert len(data["units"]) >= 3
    assert any(u["id"] == "acres" for u in data["units"])

    # Check states: exactly 36 Indian states & UTs
    assert len(data["states"]) == 36
    state_names = [st["name"] for st in data["states"]]
    assert "Uttar Pradesh" in state_names
    assert "Punjab" in state_names
    assert "Maharashtra" in state_names


def test_crops_soils_and_seasons_valid(client: FlaskClient) -> None:
    """Verify that all crops have soils matching allowed options and valid seasons."""
    # 1. Fetch allowed soils from /api/options
    options_res = client.get("/api/options")
    assert options_res.status_code == 200
    options_data = options_res.get_json()
    allowed_soils = {soil["id"] for soil in options_data["soils"]}
    valid_seasons = {"kharif", "rabi", "zaid"}

    # 2. Fetch all crops from /api/crops
    crops_res = client.get("/api/crops")
    assert crops_res.status_code == 200
    crops = crops_res.get_json()["crops"]
    assert len(crops) == 18

    # 3. Assert soils and seasons validity on each crop
    for crop in crops:
        crop_id = crop["id"]
        soils = crop.get("soils", [])
        assert len(soils) > 0, f"Crop '{crop_id}' must have at least one soil type"
        for s in soils:
            assert s in allowed_soils, f"Crop '{crop_id}' contains invalid soil '{s}'. Allowed: {allowed_soils}"

        seasons = crop.get("seasons", [])
        assert len(seasons) > 0, f"Crop '{crop_id}' must have at least one season"
        for season in seasons:
            assert season in valid_seasons, f"Crop '{crop_id}' contains invalid season '{season}'. Must be one of {valid_seasons}"

