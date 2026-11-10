"""Regression tests for English-only integrity across KisanSathi.

Verifies:
    1. For EVERY seeded crop, the JSON from /api/crops, /api/crops/<id>,
       /api/options, POST /api/advisory, POST /api/advisory/explain (fallback mode),
       and POST /api/chat (fallback mode) contains NO Devanagari characters (U+0900 to U+097F).
    2. Requests including `"language": "hi"` (or any other language field) are accepted
       and silently ignored.
    3. Seed validation rejects any crop or state data containing a Devanagari character.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Generator

import pytest
from flask import Flask
from flask.testing import FlaskClient

# Ensure project root is present on sys.path
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.app import create_app
from backend.seed import seed_all, validate_crop_data, validate_states_data


def assert_no_devanagari(obj: Any, path: str = "$") -> None:
    """Recursively assert that no string in obj contains Devanagari (U+0900 to U+097F) characters."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            curr = f"{path}.{k}"
            for c in k:
                if "\u0900" <= c <= "\u097f":
                    pytest.fail(f"Devanagari character '{c}' found in key at {curr}: {k!r}")
            assert_no_devanagari(v, curr)
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            curr = f"{path}[{idx}]"
            assert_no_devanagari(item, curr)
    elif isinstance(obj, str):
        for c in obj:
            if "\u0900" <= c <= "\u097f":
                pytest.fail(f"Devanagari character '{c}' found in string value at {path}: {obj!r}")


@pytest.fixture(scope="module")
def seeded_db_path(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Create and seed an isolated temporary SQLite database for regression tests."""
    tmp_dir = tmp_path_factory.mktemp("regression_db")
    db_file = tmp_dir / "kisansathi_regression.db"
    db_path = str(db_file.resolve())
    seed_all(db_path=db_path)
    return db_path


@pytest.fixture
def app(seeded_db_path: str) -> Flask:
    """Create Flask test application configured for English-only regression verification."""
    return create_app(
        config_overrides={
            "DATABASE_PATH": seeded_db_path,
            "TESTING": True,
            "GEMINI_API_KEY": "",  # Ensures fallback mode for explain and chat
            "AI_RATE_LIMIT_PER_MINUTE": 1000,
            "ADVISORY_RATE_LIMIT_PER_MINUTE": 1000,
        }
    )


@pytest.fixture
def client(app: Flask) -> Generator[FlaskClient, None, None]:
    """Provide a fresh Flask test client."""
    with app.test_client() as test_client:
        yield test_client


# ==============================================================================
# 1. Regression Test: No Devanagari Across All Endpoints for All 18 Seeded Crops
# ==============================================================================

def test_devanagari_absence_across_all_endpoints(client: FlaskClient) -> None:
    """Verify that every endpoint and every seeded crop produces strictly English-only output."""
    # 1. GET /api/crops
    res_crops = client.get("/api/crops")
    assert res_crops.status_code == 200
    crops_payload = res_crops.get_json()
    assert_no_devanagari(crops_payload, "/api/crops")
    crops_list = crops_payload["crops"]
    assert len(crops_list) == 18

    # 2. GET /api/options
    res_opts = client.get("/api/options")
    assert res_opts.status_code == 200
    assert_no_devanagari(res_opts.get_json(), "/api/options")

    # 3. For EVERY seeded crop: detail, advisory, explain (fallback), chat (fallback)
    for crop in crops_list:
        crop_id: str = crop["id"]

        # Detail endpoint
        res_detail = client.get(f"/api/crops/{crop_id}")
        assert res_detail.status_code == 200, f"Failed GET /api/crops/{crop_id}"
        assert_no_devanagari(res_detail.get_json(), f"/api/crops/{crop_id}")

        # Construct field form using compatible season and soil
        soil = crop["soils"][0] if crop.get("soils") else "loamy"
        season = crop["seasons"][0] if crop.get("seasons") else "kharif"
        form = {
            "crop": crop_id,
            "soilType": soil,
            "season": season,
            "state": "Uttar Pradesh",
            "district": "Varanasi",
            "block": "Pindra",
            "landSize": 5.0,
            "landUnit": "acres",
            "waterSource": "canal",
        }

        # POST /api/advisory
        res_adv = client.post("/api/advisory", json=form)
        assert res_adv.status_code == 200, f"Advisory failed for crop '{crop_id}'"
        assert_no_devanagari(res_adv.get_json(), f"/api/advisory [{crop_id}]")

        # POST /api/advisory/explain (fallback mode without Gemini key)
        res_exp = client.post("/api/advisory/explain", json={"form": form})
        assert res_exp.status_code == 200, f"Explain failed for crop '{crop_id}'"
        exp_data = res_exp.get_json()
        assert exp_data["source"] == "fallback"
        assert_no_devanagari(exp_data, f"/api/advisory/explain [{crop_id}]")

        # POST /api/chat (fallback mode without Gemini key)
        res_chat = client.post(
            "/api/chat",
            json={"form": form, "question": "What is the recommended fertilizer schedule?"},
        )
        assert res_chat.status_code == 200, f"Chat failed for crop '{crop_id}'"
        chat_data = res_chat.get_json()
        assert chat_data["source"] == "fallback"
        assert_no_devanagari(chat_data, f"/api/chat [{crop_id}]")


# ==============================================================================
# 2. Regression Test: "language": "hi" is Accepted and Ignored
# ==============================================================================

def test_request_with_language_hi_is_accepted_and_ignored(client: FlaskClient) -> None:
    """Verify that requests including 'language': 'hi' succeed and return English-only output."""
    form = {
        "crop": "wheat",
        "soilType": "loamy",
        "season": "rabi",
        "state": "Uttar Pradesh",
        "district": "Varanasi",
        "block": "Pindra",
        "landSize": 5.0,
        "landUnit": "acres",
        "waterSource": "canal",
    }

    # 1. Advisory explain with "language": "hi"
    res_explain = client.post(
        "/api/advisory/explain",
        json={"form": form, "language": "hi"},
    )
    assert res_explain.status_code == 200
    explain_data = res_explain.get_json()
    assert "explanation" in explain_data
    assert_no_devanagari(explain_data, "/api/advisory/explain (language: hi)")

    # 2. Chat with "language": "hi"
    res_chat = client.post(
        "/api/chat",
        json={
            "form": form,
            "question": "When should I apply the second dose of urea?",
            "language": "hi",
        },
    )
    assert res_chat.status_code == 200
    chat_data = res_chat.get_json()
    assert "answer" in chat_data
    assert_no_devanagari(chat_data, "/api/chat (language: hi)")

    # 3. Advisory generation with "language": "hi" included in payload
    form_with_lang = dict(form, language="hi")
    res_advisory = client.post("/api/advisory", json=form_with_lang)
    assert res_advisory.status_code == 200
    adv_data = res_advisory.get_json()
    assert_no_devanagari(adv_data, "/api/advisory (language: hi)")


# ==============================================================================
# 3. Regression Test: Seed Validation Rejects Devanagari Characters
# ==============================================================================

def test_seed_validation_rejects_devanagari() -> None:
    """Verify that seed validation functions reject files containing Devanagari characters."""
    # 1. Crop data with Devanagari in nameEn
    bad_crop_1 = {
        "id": "wheat",
        "nameEn": "Wheat गेहूं",
        "seasons": ["rabi"],
        "soils": ["loamy"],
    }
    with pytest.raises(ValueError, match="Devanagari"):
        validate_crop_data(bad_crop_1, Path("wheat_test.json"))

    # 2. Crop data with Devanagari in a nested fertilizer stage
    bad_crop_2 = {
        "id": "wheat",
        "nameEn": "Wheat",
        "seasons": ["rabi"],
        "soils": ["loamy"],
        "fertilizerStages": [
            {"stageEn": "Basal Dose (बुवाई के समय)", "fertilizerEn": "DAP"}
        ],
    }
    with pytest.raises(ValueError, match="Devanagari"):
        validate_crop_data(bad_crop_2, Path("wheat_stage.json"))

    # 3. Crop data with Devanagari in a key name
    bad_crop_3 = {
        "id": "wheat",
        "nameEn": "Wheat",
        "seasons": ["rabi"],
        "soils": ["loamy"],
        "नाम": "Wheat",
    }
    with pytest.raises(ValueError, match="Devanagari"):
        validate_crop_data(bad_crop_3, Path("wheat_key.json"))

    # 4. States data with Devanagari in state name
    bad_states = [
        {"name": "उत्तर प्रदेश", "region": "North"}
    ]
    with pytest.raises(ValueError, match="Devanagari"):
        validate_states_data(bad_states, Path("states_bad.json"))


def test_seed_all_rejects_devanagari_seed_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify seed_all aborts and raises ValueError when a seed file contains Devanagari."""
    # Create a mock seed directory structure
    seed_root = tmp_path / "seed"
    crops_dir = seed_root / "crops"
    crops_dir.mkdir(parents=True)

    # Valid states.json
    states_file = seed_root / "states.json"
    with open(states_file, "w", encoding="utf-8") as f:
        json.dump([{"name": "Punjab", "region": "North"}], f)

    # Crop file with Devanagari character
    bad_crop_file = crops_dir / "bad_crop.json"
    with open(bad_crop_file, "w", encoding="utf-8") as f:
        json.dump({
            "id": "badcrop",
            "nameEn": "Wheat (गेहूं)",
            "seasons": ["rabi"],
            "soils": ["loamy"],
        }, f, ensure_ascii=False)

    monkeypatch.setattr("backend.seed.SEED_DIR", seed_root)
    monkeypatch.setattr("backend.seed.CROPS_DIR", crops_dir)
    monkeypatch.setattr("backend.seed.STATES_FILE", states_file)

    test_db = str((tmp_path / "abort_test.db").resolve())
    with pytest.raises(ValueError, match="Devanagari"):
        seed_all(db_path=test_db)
