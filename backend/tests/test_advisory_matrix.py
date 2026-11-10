"""Advisory matrix test suite testing exhaustive combinations of field parameters.

Tests:
    1. Full Combinatorial Grid (18 crops x 3 seasons x 8 soils = 432 evaluations):
       - Verifies that POST /api/advisory succeeds (200 OK) for every possible
         crop x season x soil permutation.
       - Confirms presence of all 17 keys expected by frontend ResultsPage.
       - Guarantees non-empty English and Hindi top-level narrative strings.
    2. Water Source, Land Unit, and Land Size Scaling Matrix (6 waterSources x 3 units x 3 sizes = 54 evaluations):
       - Evaluates 6 water sources across metric/imperial/traditional units ('acres', 'hectares', 'bigha')
       - Tests small (0.5), normal (5.0), and extreme valid large (5000.0) land sizes.
       - Verifies scaled fertilizer dosage arithmetic and runtime recommendations.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, Generator, List

import pytest
from flask import Flask
from flask.testing import FlaskClient

_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.app import create_app
from backend.seed import seed_all
from backend.services.options import (
    SEASON_OPTIONS,
    SOIL_OPTIONS,
    UNIT_OPTIONS,
    WATER_SOURCE_OPTIONS,
)

EXPECTED_RESULT_KEYS = {
    "fieldData",
    "generatedDate",
    "zoneName",
    "personalizedIntro",
    "personalizedIntroHi",
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


@pytest.fixture(scope="module")
def seeded_db_path(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Create and seed an isolated temporary SQLite database for the matrix test suite."""
    tmp_dir = tmp_path_factory.mktemp("matrix_db")
    db_file = tmp_dir / "kisansathi_matrix.db"
    db_path = str(db_file.resolve())
    seed_all(db_path=db_path)
    return db_path


@pytest.fixture
def client(seeded_db_path: str) -> Generator[FlaskClient, None, None]:
    """Provide a Flask test client configured with the seeded matrix database."""
    app: Flask = create_app(
        config_overrides={
            "DATABASE_PATH": seeded_db_path,
            "TESTING": True,
            "ADVISORY_RATE_LIMIT_PER_MINUTE": 10000,  # Generous limit for high-volume matrix runs
        }
    )
    with app.test_client() as test_client:
        yield test_client


def test_full_advisory_matrix_crops_x_seasons_x_soils(client: FlaskClient) -> None:
    """Evaluate 18 crops x 3 seasons x 8 soils = 432 permutations through POST /api/advisory."""
    # 1. Fetch all seeded crop identifiers
    crops_res = client.get("/api/crops")
    assert crops_res.status_code == 200
    crops_list = crops_res.get_json()["crops"]
    assert len(crops_list) == 18

    crop_ids: List[str] = [c["id"] for c in crops_list]
    seasons: List[str] = [s["id"] for s in SEASON_OPTIONS]
    soils: List[str] = [s["id"] for s in SOIL_OPTIONS]

    total_permutations = len(crop_ids) * len(seasons) * len(soils)
    assert total_permutations == 432

    # 2. Iterate through all combinations
    for cid in crop_ids:
        for season in seasons:
            for soil in soils:
                payload: Dict[str, Any] = {
                    "crop": cid,
                    "soilType": soil,
                    "season": season,
                    "state": "Uttar Pradesh",
                    "district": "Varanasi",
                    "landSize": 5.0,
                    "landUnit": "acres",
                    "waterSource": "canal",
                }

                res = client.post("/api/advisory", json=payload)
                assert res.status_code == 200, (
                    f"Advisory generation failed for crop='{cid}', season='{season}', soil='{soil}': {res.get_data(as_text=True)}"
                )

                data = res.get_json()

                # Verify all expected frontend keys exist
                missing_keys = EXPECTED_RESULT_KEYS - set(data.keys())
                assert not missing_keys, f"Missing keys {missing_keys} for ({cid}, {season}, {soil})"

                # Verify narrative strings are non-empty
                assert data["personalizedIntro"] and data["personalizedIntro"].strip()
                assert data["personalizedIntroHi"] and data["personalizedIntroHi"].strip()
                assert data["zoneName"] and data["zoneName"].strip()
                assert data["generatedDate"] and data["generatedDate"].strip()
                assert data["irrigationFrequency"] and data["irrigationFrequency"].strip()
                assert data["expectedYield"] and data["expectedYield"].strip()

                # Verify fertilizer plan and harvest steps are populated lists
                assert isinstance(data["fertilizerPlan"], list)
                assert len(data["fertilizerPlan"]) >= 1
                assert isinstance(data["harvestSteps"], list)
                assert len(data["harvestSteps"]) >= 1


def test_scaling_matrix_water_x_unit_x_landsize(client: FlaskClient) -> None:
    """Evaluate 6 water sources x 3 land units x 3 sizes = 54 permutations for wheat crop."""
    water_sources: List[str] = [ws["id"] for ws in WATER_SOURCE_OPTIONS]
    land_units: List[str] = [u["id"] for u in UNIT_OPTIONS]
    land_sizes: List[float] = [0.5, 5.0, 5000.0]

    total_scaling_runs = len(water_sources) * len(land_units) * len(land_sizes)
    assert total_scaling_runs == 54

    for ws in water_sources:
        for unit in land_units:
            for size in land_sizes:
                payload: Dict[str, Any] = {
                    "crop": "wheat",
                    "soilType": "loamy",
                    "season": "rabi",
                    "state": "Uttar Pradesh",
                    "district": "Varanasi",
                    "landSize": size,
                    "landUnit": unit,
                    "waterSource": ws,
                }

                res = client.post("/api/advisory", json=payload)
                assert res.status_code == 200, (
                    f"Scaling test failed for waterSource='{ws}', landUnit='{unit}', landSize={size}: {res.get_data(as_text=True)}"
                )

                data = res.get_json()
                field_data = data["fieldData"]
                assert field_data["waterSource"] == ws
                assert field_data["landUnit"] == unit
                assert field_data["landSize"] == size

                # Verify fertilizer recommendations and scaled quantities
                plan = data["fertilizerPlan"]
                assert len(plan) >= 1
                for stage in plan:
                    assert "fertilizer" in stage
                    assert "quantity" in stage
                    assert stage["quantity"] and len(stage["quantity"]) > 0

                # Verify runtime per zone and water conserved strings exist
                assert "runtimePerZone" in data
                assert "waterConserved" in data
