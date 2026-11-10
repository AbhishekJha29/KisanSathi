"""Edge-case input validation tests for KisanSathi API endpoints.

Tests all boundary and edge-case inputs through the live Flask test client:
    - Boolean values rejected where numbers are expected.
    - NaN, Infinity, tiny, and huge land sizes rejected.
    - Hex, exponent, and spaced numeric strings rejected.
    - Control characters and whitespace-only strings rejected for text fields.
    - Nested dicts, arrays, nulls, and strings exceeding max length rejected.
    - Valid Unicode text accepted in district and block fields.
    - Clean decimal strings accepted and converted for land size.
    - Extra unexpected JSON fields ignored gracefully.
    - Form validation inside /api/advisory/explain and /api/chat.
    - Chat question and history control character stripping and boundary lengths.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, Generator

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
    """Create and seed an isolated temporary SQLite database for the module."""
    tmp_dir = tmp_path_factory.mktemp("validation_db")
    db_file = tmp_dir / "kisansathi_validation.db"
    db_path = str(db_file.resolve())
    seed_all(db_path=db_path)
    return db_path


@pytest.fixture
def client(seeded_db_path: str) -> Generator[FlaskClient, None, None]:
    """Provide a Flask test client configured with the seeded test database."""
    app: Flask = create_app(
        config_overrides={
            "DATABASE_PATH": seeded_db_path,
            "TESTING": True,
        }
    )
    with app.test_client() as test_client:
        yield test_client


def _valid_advisory_payload() -> Dict[str, Any]:
    """Return a baseline valid advisory request payload."""
    return {
        "crop": "wheat",
        "soilType": "loamy",
        "season": "rabi",
        "state": "Uttar Pradesh",
        "district": "Varanasi",
        "block": "Pindra",
        "landSize": 5.0,
        "landUnit": "acres",
        "waterSource": "canal",
        "farmerName": "Ramesh Kumar",
    }


# ==============================================================================
# 1. Tests for Numeric Validation Edge Cases (landSize)
# ==============================================================================

@pytest.mark.parametrize("bad_land_size", [
    True,
    False,
    float("nan"),
    float("inf"),
    float("-inf"),
    -1.0,
    0.0,
    0.0001,
    10000.01,
    50000.0,
    " 5.0",
    "5.0 ",
    "5 0",
    "0x10",
    "1e5",
    "2.5e2",
    "abc",
    [],
    {},
])
def test_advisory_rejects_invalid_land_size(client: FlaskClient, bad_land_size: Any) -> None:
    """Verify that POST /api/advisory rejects invalid land sizes with 400 Bad Request."""
    payload = _valid_advisory_payload()
    payload["landSize"] = bad_land_size

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 400
    data = res.get_json()
    assert "error" in data
    assert "fields" in data
    assert "landSize" in data["fields"]


@pytest.mark.parametrize("valid_land_size,expected_val", [
    (0.01, 0.01),
    (1, 1.0),
    (5.0, 5.0),
    (10000.0, 10000.0),
    ("2.5", 2.5),
    ("10", 10.0),
])
def test_advisory_accepts_valid_land_size(client: FlaskClient, valid_land_size: Any, expected_val: float) -> None:
    """Verify that POST /api/advisory accepts valid float, int, and clean decimal strings."""
    payload = _valid_advisory_payload()
    payload["landSize"] = valid_land_size

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data["fieldData"]["landSize"] == expected_val


# ==============================================================================
# 2. Tests for String Validation Edge Cases (district, block, farmerName)
# ==============================================================================

@pytest.mark.parametrize("bad_district", [
    "",
    "   ",
    "\t",
    "\n",
    "Varanasi\x00",
    "Varanasi\x07Alert",
    "Varanasi\x1bEsc",
    "Varanasi\x7fDel",
    "Varanasi\x80Ctrl",
    "A" * 101,
    123,
    True,
    ["Varanasi"],
    {"name": "Varanasi"},
])
def test_advisory_rejects_invalid_district(client: FlaskClient, bad_district: Any) -> None:
    """Verify that POST /api/advisory rejects invalid district inputs with 400 Bad Request."""
    payload = _valid_advisory_payload()
    payload["district"] = bad_district

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 400
    data = res.get_json()
    assert "fields" in data
    assert "district" in data["fields"]


@pytest.mark.parametrize("bad_block", [
    "   ",
    "\t",
    "Pindra\x00",
    "Pindra\x07Alert",
    "Pindra\x1b",
    "B" * 101,
    123,
    True,
    ["Pindra"],
    {"block": "Pindra"},
])
def test_advisory_rejects_invalid_block(client: FlaskClient, bad_block: Any) -> None:
    """Verify that POST /api/advisory rejects malformed block inputs with 400 Bad Request."""
    payload = _valid_advisory_payload()
    payload["block"] = bad_block

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 400
    data = res.get_json()
    assert "fields" in data
    assert "block" in data["fields"]


@pytest.mark.parametrize("valid_district,valid_block", [
    ("Kāñcīpuram", "Sriperumbudur"),
    ("Prayagraj", "Phulpur"),
    ("South 24 Parganas", "Diamond Harbour-I"),
])
def test_advisory_accepts_valid_unicode_text(
    client: FlaskClient,
    valid_district: str,
    valid_block: str,
) -> None:
    """Verify that POST /api/advisory accepts valid Unicode string text in district and block."""
    payload = _valid_advisory_payload()
    payload["district"] = valid_district
    payload["block"] = valid_block

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data["fieldData"]["district"] == valid_district
    assert data["fieldData"]["block"] == valid_block


def test_advisory_accepts_empty_optional_fields(client: FlaskClient) -> None:
    """Verify that empty strings or omissions for optional fields (block, farmerName) are accepted."""
    payload = _valid_advisory_payload()
    payload["block"] = ""
    payload["farmerName"] = ""

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data["fieldData"]["block"] is None
    assert data["fieldData"]["farmerName"] is None


def test_advisory_ignores_unknown_extra_fields(client: FlaskClient) -> None:
    """Verify that unexpected extra properties in the JSON payload are safely ignored."""
    payload = _valid_advisory_payload()
    payload["maliciousField"] = "'; DROP TABLE crops;--"
    payload["extraNumbers"] = [1, 2, 3]
    payload["debug"] = True

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert "maliciousField" not in data["fieldData"]
    assert "extraNumbers" not in data["fieldData"]


# ==============================================================================
# 3. Tests for Null Rejection Across All Fields
# ==============================================================================

@pytest.mark.parametrize("field_name", [
    "crop",
    "soilType",
    "season",
    "state",
    "district",
    "landSize",
    "landUnit",
    "waterSource",
    "block",
    "farmerName",
])
def test_advisory_rejects_null_in_fields(client: FlaskClient, field_name: str) -> None:
    """Verify that explicit null values are rejected for both required and optional fields."""
    payload = _valid_advisory_payload()
    payload[field_name] = None

    res = client.post("/api/advisory", json=payload)
    assert res.status_code == 400
    data = res.get_json()
    assert "fields" in data
    assert field_name in data["fields"]


# ==============================================================================
# 4. Tests for /api/advisory/explain Form Validation
# ==============================================================================

def test_explain_accepts_and_ignores_language_field(client: FlaskClient) -> None:
    """Verify /api/advisory/explain accepts and silently ignores the language field."""
    for lang in ("hi", "es", "en", "unknown"):
        res = client.post("/api/advisory/explain", json={
            "form": _valid_advisory_payload(),
            "language": lang,
        })
        assert res.status_code == 200
        data = res.get_json()
        assert "explanation" in data
        assert data["source"] in ("ai", "fallback")


def test_explain_rejects_invalid_form_fields(client: FlaskClient) -> None:
    """Verify /api/advisory/explain applies identical validation to the inner form object."""
    bad_form = _valid_advisory_payload()
    bad_form["landSize"] = True  # Boolean rejected

    res = client.post("/api/advisory/explain", json={
        "form": bad_form,
        "language": "en",
    })
    assert res.status_code == 400
    data = res.get_json()
    assert "landSize" in data.get("fields", {})


def test_explain_accepts_valid_form_and_returns_explanation(client: FlaskClient) -> None:
    """Verify /api/advisory/explain succeeds with valid form and en/hi language."""
    for lang in ("en", "hi"):
        res = client.post("/api/advisory/explain", json={
            "form": _valid_advisory_payload(),
            "language": lang,
        })
        assert res.status_code == 200
        data = res.get_json()
        assert "explanation" in data
        assert isinstance(data["explanation"], str)
        assert len(data["explanation"]) > 20
        assert data["source"] in ("ai", "fallback")


# ==============================================================================
# 5. Tests for /api/chat Validation and Control Character Stripping
# ==============================================================================

def test_chat_strips_control_characters_in_question(client: FlaskClient) -> None:
    """Verify /api/chat strips non-printable control characters from question and processes."""
    res = client.post("/api/chat", json={
        "form": _valid_advisory_payload(),
        "language": "en",
        "question": "When should I irrigate?\x00\x07\x1b",
    })
    assert res.status_code == 200
    data = res.get_json()
    assert "answer" in data
    assert data["source"] in ("ai", "fallback")


def test_chat_rejects_whitespace_or_only_control_chars_in_question(client: FlaskClient) -> None:
    """Verify /api/chat rejects empty, whitespace, or pure control character questions with 400."""
    for bad_q in ("", "   ", "\t\n", "\x00\x07\x1b"):
        res = client.post("/api/chat", json={
            "form": _valid_advisory_payload(),
            "language": "en",
            "question": bad_q,
        })
        assert res.status_code == 400
        data = res.get_json()
        assert "question" in data.get("fields", {})


def test_chat_rejects_question_over_500_chars(client: FlaskClient) -> None:
    """Verify /api/chat rejects questions exceeding 500 characters with 400."""
    res = client.post("/api/chat", json={
        "form": _valid_advisory_payload(),
        "language": "en",
        "question": "A" * 501,
    })
    assert res.status_code == 400
    data = res.get_json()
    assert "question" in data.get("fields", {})


def test_chat_rejects_history_over_6_items(client: FlaskClient) -> None:
    """Verify /api/chat rejects conversation history with more than 6 turns."""
    res = client.post("/api/chat", json={
        "form": _valid_advisory_payload(),
        "language": "en",
        "question": "How about fertilizer?",
        "history": [{"role": "user", "text": f"Msg {i}"} for i in range(7)],
    })
    assert res.status_code == 400
    data = res.get_json()
    assert "history" in data.get("fields", {})
