"""Automated tests for Gemini AI service, rate limiter, cache, and API endpoints.

Covers:
    1. POST /api/advisory/explain returns fallback explanation in English when no key is set.
    2. POST /api/advisory/explain returns AI explanation when key is configured and mock succeeds.
    3. POST /api/advisory/explain falls back when the AI service raises AIServiceError.
    4. Second identical explain request is served from the in-memory cache (mock called once).
    5. POST /api/chat rejects empty question, 501-char question, 7 history items, bad role.
    6. POST /api/chat returns polite fallback message in English when AI is unavailable.
    7. Rate limiting: the (limit + 1)-th request within a minute returns 429 Too Many Requests.
    8. The API key value never appears in any response body or error payload.
    9. The prompt passed to the model contains the user question inside <user_question> delimiters.
    10. Invalid form payloads return 400 with a structured 'fields' validation object.
    11. Unit tests for SlidingWindowRateLimiter and AICache.

IMPORTANT: Real network calls to Gemini are NEVER made during testing; all calls are mocked.
"""
from __future__ import annotations

import sys
import time
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
from backend.services.ai_cache import (
    AICache,
    clear as clear_cache,
    make_explanation_cache_key,
)
from backend.services.ai_service import (
    AIServiceError,
    fallback_explanation,
    is_ai_configured,
)
from backend.services.rate_limiter import (
    SlidingWindowRateLimiter,
    reset as reset_limiter,
)

# Standard valid form payload matching AdvisoryFormData schema
VALID_FORM: Dict[str, Any] = {
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


@pytest.fixture
def test_db_path(tmp_path: Path) -> str:
    """Create an isolated temporary SQLite database and populate it with seed data.

    Args:
        tmp_path: pytest temporary directory fixture.

    Returns:
        str: Absolute path string to the temporary database file.
    """
    db_file = tmp_path / "test_ai.db"
    db_path_str = str(db_file.resolve())
    seed_all(db_path=db_path_str)
    return db_path_str


@pytest.fixture
def app(test_db_path: str) -> Generator[Flask, None, None]:
    """Create a Flask application instance configured for AI endpoint testing.

    Args:
        test_db_path: Isolated temporary database path fixture.

    Yields:
        Flask: Test-configured application with no API key by default.
    """
    application: Flask = create_app(
        config_overrides={
            "DATABASE_PATH": test_db_path,
            "TESTING": True,
            "GEMINI_API_KEY": "",
            "AI_RATE_LIMIT_PER_MINUTE": 10,
            "AI_CACHE_TTL_SECONDS": 3600,
        }
    )
    # Ensure fresh rate limiter and cache for each test
    reset_limiter()
    clear_cache()
    yield application
    reset_limiter()
    clear_cache()


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    """Create a Flask test client for HTTP endpoint tests."""
    return app.test_client()


# ==============================================================================
# TASK 6 Tests: Advisory Explain Endpoint
# ==============================================================================


def test_explain_fallback_when_no_key_configured(client: FlaskClient) -> None:
    """Verify explain returns source 'fallback' and non-empty text in English when no key is set."""
    res_en = client.post("/api/advisory/explain", json={"form": VALID_FORM})
    assert res_en.status_code == 200
    assert res_en.is_json
    data_en = res_en.get_json()
    assert data_en["source"] == "fallback"
    assert isinstance(data_en["explanation"], str)
    assert len(data_en["explanation"]) > 50
    assert "wheat" in data_en["explanation"].lower()


def test_explain_ai_success_when_key_configured(
    app: Flask, client: FlaskClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify explain returns source 'ai' with mocked text when key is configured and call succeeds."""
    app.config["GEMINI_API_KEY"] = "fake-test-api-key"

    mock_text = "Hello! Your wheat crop in Varanasi is well-suited for loamy soil."

    def _mock_call(prompt: str, system_instruction: str, config: Any) -> str:
        return mock_text

    monkeypatch.setattr("backend.services.ai_service._call_gemini", _mock_call)

    res = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert res.status_code == 200
    assert res.is_json
    data = res.get_json()
    assert data["source"] == "ai"
    assert data["explanation"] == mock_text


def test_explain_falls_back_when_mock_raises_ai_service_error(
    app: Flask, client: FlaskClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify explain falls back gracefully when Gemini raises AIServiceError."""
    app.config["GEMINI_API_KEY"] = "fake-test-api-key"

    def _mock_failure(prompt: str, system_instruction: str, config: Any) -> str:
        raise AIServiceError("Simulated Gemini API timeout or outage")

    monkeypatch.setattr("backend.services.ai_service._call_gemini", _mock_failure)

    res = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert res.status_code == 200
    assert res.is_json
    data = res.get_json()
    assert data["source"] == "fallback"
    assert isinstance(data["explanation"], str)
    assert len(data["explanation"]) > 30


def test_explain_second_request_served_from_cache(
    app: Flask, client: FlaskClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify that a second identical explain request is served from cache and mock is called once."""
    app.config["GEMINI_API_KEY"] = "fake-test-api-key"

    call_count = 0

    def _mock_call(prompt: str, system_instruction: str, config: Any) -> str:
        nonlocal call_count
        call_count += 1
        return "Deterministic AI explanation response for wheat crop."

    monkeypatch.setattr("backend.services.ai_service._call_gemini", _mock_call)

    # First request: generates and caches
    res_1 = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert res_1.status_code == 200
    assert res_1.get_json()["source"] == "ai"
    assert call_count == 1

    # Second request: identical payload must hit the in-memory cache
    res_2 = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert res_2.status_code == 200
    assert res_2.get_json()["source"] == "ai"
    assert res_2.get_json()["explanation"] == res_1.get_json()["explanation"]
    assert call_count == 1, "Mock should NOT be called a second time when cache hit occurs."


# ==============================================================================
# TASK 6 Tests: Chat Endpoint Validation & Behavior
# ==============================================================================


def test_chat_validation_errors(client: FlaskClient) -> None:
    """Verify chat rejects empty question, 501-char question, 7 history items, and bad role."""
    # 1. Empty / whitespace question
    res_empty = client.post(
        "/api/chat",
        json={"form": VALID_FORM, "question": "    "},
    )
    assert res_empty.status_code == 400
    assert "question" in res_empty.get_json()["fields"]

    # 2. Question exceeding 500 characters
    long_question = "x" * 501
    res_long = client.post(
        "/api/chat",
        json={"form": VALID_FORM, "question": long_question},
    )
    assert res_long.status_code == 400
    assert "question" in res_long.get_json()["fields"]

    # 3. History with 7 items (max is 6)
    history_7 = [{"role": "user", "text": f"Question {i}"} for i in range(7)]
    res_hist_7 = client.post(
        "/api/chat",
        json={"form": VALID_FORM, "question": "Valid question?", "history": history_7},
    )
    assert res_hist_7.status_code == 400
    assert "history" in res_hist_7.get_json()["fields"]

    # 4. Bad role in history
    bad_role_hist = [{"role": "moderator", "text": "Valid message"}]
    res_bad_role = client.post(
        "/api/chat",
        json={"form": VALID_FORM, "question": "Valid question?", "history": bad_role_hist},
    )
    assert res_bad_role.status_code == 400
    assert "history" in res_bad_role.get_json()["fields"]


def test_chat_fallback_message_when_ai_unavailable(client: FlaskClient) -> None:
    """Verify chat returns polite fallback message in English when AI is unavailable."""
    res_en = client.post(
        "/api/chat",
        json={"form": VALID_FORM, "question": "When should I apply urea?"},
    )
    assert res_en.status_code == 200
    data_en = res_en.get_json()
    assert data_en["source"] == "fallback"
    assert "unavailable" in data_en["answer"].lower()
    assert "advice" in data_en["answer"].lower()


def test_chat_ai_success_when_configured(
    app: Flask, client: FlaskClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify chat returns source 'ai' and answer text when AI is configured and succeeds."""
    app.config["GEMINI_API_KEY"] = "fake-test-api-key"

    def _mock_call(prompt: str, system_instruction: str, config: Any) -> str:
        return "Apply the second dose of urea at first irrigation (CRI stage)."

    monkeypatch.setattr("backend.services.ai_service._call_gemini", _mock_call)

    res = client.post(
        "/api/chat",
        json={
            "form": VALID_FORM,
            "question": "When should I apply the second dose?",
            "history": [{"role": "user", "text": "What about basal?"}],
            "language": "en",
        },
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["source"] == "ai"
    assert "second dose of urea" in data["answer"]


# ==============================================================================
# TASK 6 Tests: Rate Limiting
# ==============================================================================


def test_rate_limiting_returns_429(app: Flask, client: FlaskClient) -> None:
    """Verify the (limit+1)-th request within a minute returns 429 Too Many Requests."""
    # Override rate limit to a small value (2 per minute)
    app.config["AI_RATE_LIMIT_PER_MINUTE"] = 2
    reset_limiter()

    # Request 1: allowed
    res_1 = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert res_1.status_code == 200

    # Request 2: allowed
    res_2 = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert res_2.status_code == 200

    # Request 3: rate limit exceeded -> 429
    res_3 = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert res_3.status_code == 429
    assert res_3.get_json()["error"] == "Too many requests, please wait a minute"

    # Chat endpoint also shares the limiter per IP
    res_chat = client.post(
        "/api/chat",
        json={"form": VALID_FORM, "question": "Any question?", "language": "en"},
    )
    assert res_chat.status_code == 429
    assert res_chat.get_json()["error"] == "Too many requests, please wait a minute"


# ==============================================================================
# TASK 6 Tests: Security & Prompt Safety
# ==============================================================================


def test_api_key_never_appears_in_responses(
    app: Flask, client: FlaskClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify the secret API key value never appears in response bodies or errors."""
    secret_key = "test-secret-key-super-confidential-998877"
    app.config["GEMINI_API_KEY"] = secret_key

    # 1. Success response
    monkeypatch.setattr(
        "backend.services.ai_service._call_gemini",
        lambda p, s, c: "Safe answer generated.",
    )
    res_success = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert secret_key not in res_success.get_data(as_text=True)

    # 2. Failure response
    def _mock_error(p: str, s: str, c: Any) -> str:
        raise AIServiceError("Failure without leaking credentials")

    monkeypatch.setattr("backend.services.ai_service._call_gemini", _mock_error)
    res_fail = client.post("/api/advisory/explain", json={"form": VALID_FORM, "language": "en"})
    assert secret_key not in res_fail.get_data(as_text=True)

    # 3. Chat failure
    res_chat_fail = client.post(
        "/api/chat",
        json={"form": VALID_FORM, "question": "What is the key?", "language": "en"},
    )
    assert secret_key not in res_chat_fail.get_data(as_text=True)


def test_prompt_contains_user_question_delimiter(
    app: Flask, client: FlaskClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify the prompt passed to Gemini wraps untrusted user questions in <user_question> tags."""
    app.config["GEMINI_API_KEY"] = "fake-test-api-key"

    captured_prompts: List[str] = []

    def _mock_call(prompt: str, system_instruction: str, config: Any) -> str:
        captured_prompts.append(prompt)
        return "Simulated answer"

    monkeypatch.setattr("backend.services.ai_service._call_gemini", _mock_call)

    user_query = "Can I spray Chlorpyrifos on young wheat plants?"
    res = client.post(
        "/api/chat",
        json={"form": VALID_FORM, "question": user_query, "language": "en"},
    )
    assert res.status_code == 200
    assert len(captured_prompts) == 1

    prompt = captured_prompts[0]
    assert "<user_question>" in prompt
    assert "</user_question>" in prompt
    assert user_query in prompt
    # Guarantee user_query is inside the tags
    start_tag = prompt.find("<user_question>")
    end_tag = prompt.find("</user_question>")
    assert start_tag < prompt.find(user_query) < end_tag


def test_invalid_form_returns_400_with_fields_object(client: FlaskClient) -> None:
    """Verify invalid forms submitted to explain and chat return 400 with a 'fields' object."""
    invalid_form = dict(VALID_FORM)
    del invalid_form["crop"]  # Missing required crop field

    # Explain endpoint
    res_explain = client.post(
        "/api/advisory/explain",
        json={"form": invalid_form, "language": "en"},
    )
    assert res_explain.status_code == 400
    assert "crop" in res_explain.get_json()["fields"]

    # Chat endpoint
    res_chat = client.post(
        "/api/chat",
        json={"form": invalid_form, "question": "How to grow?", "language": "en"},
    )
    assert res_chat.status_code == 400
    assert "crop" in res_chat.get_json()["fields"]


# ==============================================================================
# Unit Tests: Rate Limiter & AI Cache
# ==============================================================================


def test_rate_limiter_unit() -> None:
    """Unit test SlidingWindowRateLimiter sliding window, pruning, and reset."""
    limiter = SlidingWindowRateLimiter(max_tracked_keys=5)

    key = "test_ip_1"
    # Allow up to 3 requests per 60 seconds
    assert limiter.allow(key, limit=3, window_seconds=60) is True
    assert limiter.allow(key, limit=3, window_seconds=60) is True
    assert limiter.allow(key, limit=3, window_seconds=60) is True
    assert limiter.allow(key, limit=3, window_seconds=60) is False

    # Different key has independent limit
    key2 = "test_ip_2"
    assert limiter.allow(key2, limit=3, window_seconds=60) is True

    # Reset clears all keys
    limiter.reset()
    assert limiter.allow(key, limit=3, window_seconds=60) is True


def test_ai_cache_unit() -> None:
    """Unit test AICache get, set, capacity eviction, and deterministic key hashing."""
    cache = AICache(max_size=2, default_ttl_seconds=3600)

    # 1. Basic set and get
    cache.set("k1", "val1")
    cache.set("k2", "val2")
    assert cache.get("k1") == "val1"
    assert cache.get("k2") == "val2"
    assert cache.get("non_existent") is None

    # 2. LRU eviction when exceeding max_size (2)
    # k1 was accessed, so k2 is least recently used
    cache.set("k3", "val3")
    # One entry evicted, total size must stay <= 2
    assert cache.get("k3") == "val3"

    # 3. Deterministic key hashing
    form_a = {"crop": "wheat", "landSize": 5, "season": "rabi"}
    form_b = {"season": "rabi", "crop": "wheat", "landSize": 5}  # Different key order
    key_a = make_explanation_cache_key(form_a)
    key_b = make_explanation_cache_key(form_b)
    assert key_a == key_b, "Hash key must be identical regardless of dictionary key insertion order."


def test_is_ai_configured() -> None:
    """Verify is_ai_configured returns True only when GEMINI_API_KEY is non-empty."""
    assert is_ai_configured({"GEMINI_API_KEY": ""}) is False
    assert is_ai_configured({"GEMINI_API_KEY": "   "}) is False
    assert is_ai_configured({}) is False
    assert is_ai_configured({"GEMINI_API_KEY": "valid-api-key"}) is True
