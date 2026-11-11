"""Security and hardening test suite for KisanSathi Flask backend.

Verifies:
    1. HTTP Security Headers:
       - X-Content-Type-Options: nosniff
       - X-Frame-Options: DENY
       - Referrer-Policy: strict-origin-when-cross-origin
       - Cache-Control: no-store on all /api/* routes
    2. Content-Type Enforcement:
       - 415 Unsupported Media Type for non-JSON requests on POST endpoints
    3. Payload Limit Enforcement:
       - 413 Request Entity Too Large for payloads exceeding 64 KB
    4. HTTP Method Enforcement:
       - 405 Method Not Allowed with JSON error on disallowed methods
    5. Route Not Found Handling:
       - 404 Resource not found with JSON error on unmatched /api/* paths
    6. Path Traversal Protection:
       - Traversal attempts against static routes do not escape dist directory
    7. SQL Injection Immunity:
       - Injection payloads in crop, season, search, and district never alter tables or trigger 500
    8. Information Shielding:
       - Error responses never contain 'Traceback', 'sqlite', or server file paths
    9. Advisory Rate Limiting:
       - Returns HTTP 429 once request threshold per IP is reached
"""
from __future__ import annotations

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
from backend.database import get_connection
from backend.seed import seed_all
from backend.services.rate_limiter import reset_for_tests


@pytest.fixture(scope="module")
def seeded_db_path(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Create and seed an isolated temporary SQLite database for security tests."""
    tmp_dir = tmp_path_factory.mktemp("security_db")
    db_file = tmp_dir / "kisansathi_sec.db"
    db_path = str(db_file.resolve())
    seed_all(db_path=db_path)
    return db_path


@pytest.fixture
def app(seeded_db_path: str) -> Flask:
    """Create a Flask test application instance with security settings configured."""
    return create_app(
        config_overrides={
            "DATABASE_PATH": seeded_db_path,
            "TESTING": True,
            "MAX_CONTENT_LENGTH": 64 * 1024,
            "ADVISORY_RATE_LIMIT_PER_MINUTE": 60,
        }
    )


@pytest.fixture
def client(app: Flask) -> Generator[FlaskClient, None, None]:
    """Provide a fresh Flask test client."""
    with app.test_client() as test_client:
        yield test_client


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


# ==============================================================================
# 1. Security Headers Verification
# ==============================================================================

def test_security_headers_on_api_routes(client: FlaskClient) -> None:
    """Verify that all required security headers and Cache-Control: no-store are present on API responses."""
    endpoints = ["/api/health", "/api/crops", "/api/options"]
    for path in endpoints:
        res = client.get(path)
        assert res.headers.get("X-Content-Type-Options") == "nosniff"
        assert res.headers.get("X-Frame-Options") == "DENY"
        assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert res.headers.get("Cache-Control") == "no-store"


# ==============================================================================
# 2. Content-Type Enforcement (415)
# ==============================================================================

def test_unsupported_media_type_returns_415(client: FlaskClient) -> None:
    """Verify that POST routes reject non-JSON content types with HTTP 415 and JSON error."""
    bad_content_types = [
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
        "application/xml",
    ]
    for ctype in bad_content_types:
        res = client.post(
            "/api/advisory",
            data="crop=wheat&season=rabi",
            content_type=ctype,
        )
        assert res.status_code == 415
        data = res.get_json()
        assert "error" in data
        assert "application/json" in data["error"]


# ==============================================================================
# 3. Payload Limit Enforcement (413)
# ==============================================================================

def test_oversized_payload_returns_413(client: FlaskClient) -> None:
    """Verify that request bodies exceeding MAX_CONTENT_LENGTH (64 KB) return 413 JSON."""
    huge_padding = "x" * (70 * 1024)
    huge_payload = _valid_advisory_payload()
    huge_payload["padding"] = huge_padding

    res = client.post("/api/advisory", json=huge_payload)
    assert res.status_code == 413
    data = res.get_json()
    assert "error" in data
    assert "payload too large" in data["error"].lower()


# ==============================================================================
# 4. HTTP Method Enforcement (405)
# ==============================================================================

def test_disallowed_http_method_returns_405_json(client: FlaskClient) -> None:
    """Verify that calling an endpoint with an unallowed method returns 405 JSON."""
    # POST to GET-only route
    res_health = client.post("/api/health", json={})
    assert res_health.status_code == 405
    data_health = res_health.get_json()
    assert "error" in data_health
    assert data_health["error"] == "Method not allowed"

    # GET to POST-only route
    res_advisory = client.get("/api/advisory")
    assert res_advisory.status_code == 405
    data_advisory = res_advisory.get_json()
    assert "error" in data_advisory
    assert data_advisory["error"] == "Method not allowed"


# ==============================================================================
# 5. Route Not Found Handling (404)
# ==============================================================================

def test_unknown_api_route_returns_404_json(client: FlaskClient) -> None:
    """Verify that requests to unknown /api/* paths return a clean 404 JSON response."""
    for method in ("get", "post", "put", "delete"):
        caller = getattr(client, method)
        res = caller("/api/nonexistent_endpoint")
        assert res.status_code == 404
        data = res.get_json()
        assert "error" in data
        assert data["error"] == "Resource not found"


# ==============================================================================
# 6. Path Traversal Protection on Static Files
# ==============================================================================

def test_static_route_path_traversal_blocked(client: FlaskClient) -> None:
    """Verify that path traversal attempts against static routes never leak file contents."""
    traversal_paths = [
        "/../backend/config.py",
        "/../../backend/app.py",
        "/%2e%2e/backend/config.py",
        "/%2e%2e%2fbackend%2fconfig.py",
        "/assets/../../backend/database.py",
        "/..\\backend\\config.py",
        "/C:/Windows/win.ini",
        "//etc/passwd",
    ]
    for path in traversal_paths:
        res = client.get(path)
        assert res.status_code in (200, 400, 404, 405)
        # Verify sensitive file content was NOT returned
        body = res.get_data(as_text=True)
        assert "class Config" not in body
        assert "GEMINI_API_KEY" not in body
        assert "create_app" not in body
        assert "[fonts]" not in body
        assert "root:" not in body


def test_static_route_with_real_dist_folder(tmp_path: Path, seeded_db_path: str) -> None:
    """Verify static route serving, SPA routing, and traversal protection with a real dist folder."""
    dist_dir = tmp_path / "test_dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    index_file = dist_dir / "index.html"
    index_content = "<!DOCTYPE html><html><body><h1>KisanSathi SPA</h1></body></html>"
    index_file.write_text(index_content, encoding="utf-8")

    js_file = assets_dir / "app.js"
    js_content = "console.log('KisanSathi bundle loaded');"
    js_file.write_text(js_content, encoding="utf-8")

    app = create_app(
        config_overrides={
            "DATABASE_PATH": seeded_db_path,
            "TESTING": True,
            "FRONTEND_DIST": str(dist_dir.resolve()),
        }
    )

    with app.test_client() as dist_client:
        # 1. GET / returns the index.html content
        res_root = dist_client.get("/")
        assert res_root.status_code == 200
        assert "KisanSathi SPA" in res_root.get_data(as_text=True)

        # 2. GET /assets/app.js returns the file
        res_js = dist_client.get("/assets/app.js")
        assert res_js.status_code == 200
        assert "KisanSathi bundle loaded" in res_js.get_data(as_text=True)

        # 3. GET /some/spa/route returns index.html
        res_spa = dist_client.get("/some/spa/route")
        assert res_spa.status_code == 200
        assert "KisanSathi SPA" in res_spa.get_data(as_text=True)

        # 4. Traversal paths never return config.py contents
        traversal_paths = [
            "/../backend/config.py",
            "/../../backend/app.py",
            "/%2e%2e/backend/config.py",
            "/%2e%2e%2fbackend%2fconfig.py",
            "/assets/../../backend/database.py",
            "/..\\backend\\config.py",
            "/C:/Windows/win.ini",
            "//etc/passwd",
        ]
        for path in traversal_paths:
            res_trav = dist_client.get(path)
            assert res_trav.status_code in (200, 400, 404, 405)
            body = res_trav.get_data(as_text=True)
            assert "class Config" not in body
            assert "GEMINI_API_KEY" not in body
            assert "create_app" not in body
            assert "[fonts]" not in body
            assert "root:" not in body


# ==============================================================================
# 7. SQL Injection Immunity
# ==============================================================================

def test_sql_injection_attempts_do_not_alter_data_or_crash(
    client: FlaskClient,
    seeded_db_path: str,
) -> None:
    """Verify that SQL injection strings never cause 500 errors and never modify database data."""
    sqli_payloads = [
        "'; DROP TABLE crops;--",
        "' OR '1'='1",
        "1; DELETE FROM states;--",
        "' UNION SELECT id, name, NULL, NULL, NULL, NULL, NULL, NULL, NULL FROM crops--",
    ]

    for sqli in sqli_payloads:
        # Test 1: crops query param search
        res1 = client.get(f"/api/crops?search={sqli}")
        assert res1.status_code == 200

        # Test 2: crops query param season
        res2 = client.get(f"/api/crops?season={sqli}")
        assert res2.status_code == 400  # Season validation catches non-season

        # Test 3: advisory district parameter
        payload = _valid_advisory_payload()
        payload["district"] = sqli
        res3 = client.post("/api/advisory", json=payload)
        assert res3.status_code in (200, 400)
        assert res3.status_code != 500

        # Test 4: advisory crop parameter
        payload_crop = _valid_advisory_payload()
        payload_crop["crop"] = sqli
        res4 = client.post("/api/advisory", json=payload_crop)
        assert res4.status_code == 400
        assert res4.status_code != 500

    # Verify that the crops table was NOT dropped or modified
    conn = get_connection(seeded_db_path)
    try:
        cur = conn.execute("SELECT COUNT(*) AS cnt FROM crops;")
        assert cur.fetchone()["cnt"] == 18

        cur_states = conn.execute("SELECT COUNT(*) AS cnt FROM states;")
        assert cur_states.fetchone()["cnt"] > 0
    finally:
        conn.close()


# ==============================================================================
# 8. Information Leakage Shielding
# ==============================================================================

def test_error_responses_never_leak_traces_or_paths(client: FlaskClient) -> None:
    """Verify that error responses never contain stack trace signatures or file paths."""
    malformed_bodies = [
        b"{invalid json",
        b"",
        b'{"crop": 12345}',
    ]
    for body in malformed_bodies:
        res = client.post("/api/advisory", data=body, content_type="application/json")
        body_text = res.get_data(as_text=True)
        assert "Traceback" not in body_text
        assert "sqlite" not in body_text.lower()
        assert "File \"" not in body_text
        assert "backend/" not in body_text


# ==============================================================================
# 9. Advisory Rate Limiting
# ==============================================================================

def test_advisory_rate_limit_enforced(seeded_db_path: str) -> None:
    """Verify that POST /api/advisory enforces sliding-window rate limit returning 429."""
    reset_for_tests()
    rate_limited_app = create_app(
        config_overrides={
            "DATABASE_PATH": seeded_db_path,
            "TESTING": True,
            "ADVISORY_RATE_LIMIT_PER_MINUTE": 3,
        }
    )
    with rate_limited_app.test_client() as rl_client:
        payload = _valid_advisory_payload()
        # Requests 1 to 3 should succeed
        for _ in range(3):
            res = rl_client.post("/api/advisory", json=payload)
            assert res.status_code == 200

        # 4th request must be rejected with 429
        res4 = rl_client.post("/api/advisory", json=payload)
        assert res4.status_code == 429
        data4 = res4.get_json()
        assert "error" in data4
        assert "too many requests" in data4["error"].lower()
    reset_for_tests()
