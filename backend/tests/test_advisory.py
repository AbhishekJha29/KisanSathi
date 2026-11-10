"""Integration tests for KisanSathi Advisory API endpoint (POST /api/advisory).

Tests:
    1. Result for each of the 18 seeded crops with a valid form returns 200 and
       contains every top-level key the frontend ResultsPage reads.
    2. Comprehensive validation error coverage (missing crop, unknown crop id,
       negative landSize, non-numeric landSize, invalid season, non-JSON body, empty body).
    3. Error shielding on unexpected server exceptions (never leaks 'Traceback' or 'sqlite').
    4. Deterministic response verification for identical requests.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, Generator, List

import pytest
from flask import Flask
from flask.testing import FlaskClient

# Ensure project root is present on sys.path
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.app import create_app
from backend.seed import seed_all


@pytest.fixture
def test_db_path(tmp_path: Path) -> str:
    """Create an isolated temporary SQLite database and populate it with seed data.

    Args:
        tmp_path: pytest temporary directory fixture.

    Returns:
        str: Absolute path string to the temporary database file.
    """
    db_file = tmp_path / "test_advisory.db"
    db_path_str = str(db_file.resolve())
    seed_all(db_path=db_path_str)
    return db_path_str


@pytest.fixture
def app(test_db_path: str) -> Generator[Flask, None, None]:
    """Create and configure a Flask application instance pointing to the test database.

    Args:
        test_db_path: Isolated temporary database path fixture.

    Yields:
        Flask: Test-configured application.
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


def test_advisory_all_18_crops(client: FlaskClient) -> None:
    """Verify that POST /api/advisory succeeds for all 18 seeded crops and returns all ResultsPage keys."""
    # 1. Fetch all seeded crops from the API
    crops_res = client.get("/api/crops")
    assert crops_res.status_code == 200
    crops_list = crops_res.get_json()["crops"]
    assert len(crops_list) == 18

    # All top-level keys read by ResultsPage.tsx
    expected_keys = {
        "fieldData",
        "generatedDate",
        "zoneName",
        "personalizedIntro",
        "efficiencyGain",
        "fertilizerPlan",
        "micronutrientNote",
        "irrigationFrequency",
        "waterConserved",
        "runtimePerZone",
        "moistureStages",
        "stagnationAlert",
        "pests",
        "harvestSteps",
        "expectedYield",
        "mandiRates",
    }

    # 2. Test advisory generation for every single crop in the database
    for crop_summary in crops_list:
        crop_id: str = crop_summary["id"]
        # Use first compatible season and soil
        season: str = crop_summary["seasons"][0] if crop_summary["seasons"] else "kharif"
        soil: str = crop_summary["soils"][0] if crop_summary["soils"] else "loamy"

        payload = {
            "crop": crop_id,
            "soilType": soil,
            "season": season,
            "state": "Uttar Pradesh",
            "district": "Varanasi",
            "block": "Pindra",
            "landSize": 4.5,
            "landUnit": "acres",
            "waterSource": "canal",
        }

        res = client.post("/api/advisory", json=payload)
        assert res.status_code == 200, f"Advisory failed for crop '{crop_id}': {res.get_data(as_text=True)}"
        assert res.is_json

        data = res.get_json()
        assert isinstance(data, dict)

        # Confirm all required keys exist
        missing_keys = expected_keys - set(data.keys())
        assert not missing_keys, f"Crop '{crop_id}' missing keys: {missing_keys}"
        assert "personalizedIntroHi" not in data

        # Confirm nested plans have non-empty elements
        assert len(data["fertilizerPlan"]) > 0, f"Crop '{crop_id}' fertilizer plan is empty"
        assert len(data["moistureStages"]) > 0, f"Crop '{crop_id}' moisture stages are empty"
        assert len(data["pests"]) > 0, f"Crop '{crop_id}' pests are empty"
        assert len(data["harvestSteps"]) > 0, f"Crop '{crop_id}' harvest steps are empty"
        assert len(data["mandiRates"]) > 0, f"Crop '{crop_id}' mandi rates are empty"


def test_validation_errors(client: FlaskClient) -> None:
    """Verify robust 400 validation error responses for malformed and invalid inputs."""
    valid_base = {
        "crop": "wheat",
        "soilType": "loamy",
        "season": "rabi",
        "state": "Punjab",
        "district": "Ludhiana",
        "landSize": 5.0,
        "landUnit": "acres",
        "waterSource": "canal",
    }

    # 1. Missing crop
    missing_crop = dict(valid_base)
    del missing_crop["crop"]
    res = client.post("/api/advisory", json=missing_crop)
    assert res.status_code == 400
    assert "crop" in res.get_json()["fields"]

    # 2. Unknown crop id
    unknown_crop = dict(valid_base, crop="unknown_dragonfruit_crop")
    res = client.post("/api/advisory", json=unknown_crop)
    assert res.status_code == 400
    assert "crop" in res.get_json()["fields"]

    # 3. Negative landSize
    neg_size = dict(valid_base, landSize=-2.5)
    res = client.post("/api/advisory", json=neg_size)
    assert res.status_code == 400
    assert "landSize" in res.get_json()["fields"]

    # 4. Non-numeric landSize
    str_size = dict(valid_base, landSize="three_acres")
    res = client.post("/api/advisory", json=str_size)
    assert res.status_code == 400
    assert "landSize" in res.get_json()["fields"]

    # 5. Invalid season
    invalid_season = dict(valid_base, season="monsoon_winter")
    res = client.post("/api/advisory", json=invalid_season)
    assert res.status_code == 400
    assert "season" in res.get_json()["fields"]

    # 6. Non-JSON content type (HTTP 415)
    res = client.post("/api/advisory", data="not json", content_type="text/plain")
    assert res.status_code == 415
    assert "Content-Type" in res.get_json()["error"] or "Unsupported" in res.get_json()["error"]

    # 6b. Malformed JSON syntax (HTTP 400)
    res = client.post("/api/advisory", data="invalid{json", content_type="application/json")
    assert res.status_code == 400

    # 7. Empty JSON body
    res = client.post("/api/advisory", json={})
    assert res.status_code == 400
    assert res.get_json()["error"] == "Validation failed"


def test_server_error_shielding(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify that internal unexpected errors return 500 without leaking stack traces or SQL."""
    # Force generate_advisory to raise an exception containing sensitive internal names
    def _mock_failure(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("Simulated internal error in sqlite3 table crops at line 42")

    monkeypatch.setattr("backend.api.advisory.generate_advisory", _mock_failure)

    payload = {
        "crop": "wheat",
        "soilType": "loamy",
        "season": "rabi",
        "state": "Punjab",
        "district": "Patiala",
        "landSize": 2.0,
        "landUnit": "acres",
        "waterSource": "borewell",
    }

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 500
    assert res.is_json

    data = res.get_json()
    assert data == {"error": "Could not generate advice"}

    # Guarantee no leak of internal tracebacks or SQL keywords in HTTP response
    body_text = res.get_data(as_text=True)
    assert "Traceback" not in body_text
    assert "sqlite" not in body_text.lower()


def test_advisory_deterministic_request(client: FlaskClient) -> None:
    """Verify that repeated requests with identical parameters produce deterministic outputs."""
    payload = {
        "crop": "rice",
        "soilType": "clay",
        "season": "kharif",
        "state": "West Bengal",
        "district": "Burdwan",
        "landSize": 3.0,
        "landUnit": "acres",
        "waterSource": "canal",
    }

    res_1 = client.post("/api/advisory", json=payload)
    res_2 = client.post("/api/advisory", json=payload)

    assert res_1.status_code == 200
    assert res_2.status_code == 200
    assert res_1.get_json() == res_2.get_json()
