"""Advisory API routes for KisanSathi smart crop advisory assistant.

Exposes the POST /api/advisory endpoint to validate farmer field parameters,
retrieve crop profiles from the database, and execute the agronomic advisory engine.

Example Request:
    POST /api/advisory
    Content-Type: application/json

    {
        "crop": "wheat",
        "soilType": "loamy",
        "season": "rabi",
        "state": "Uttar Pradesh",
        "district": "Varanasi",
        "block": "Pindra",
        "landSize": 5.0,
        "landUnit": "acres",
        "waterSource": "canal"
    }

Example Response (200 OK):
    {
        "fieldData": { ... },
        "generatedDate": "October 2026 / Rabi Season",
        "zoneName": "North Agro-Climatic Region (Uttar Pradesh)",
        "personalizedIntro": "Hello! For your 5.0 acres plot in ...",
        "fertilizerPlan": [ ... ],
        "irrigationFrequency": "Every 18–22 Days (4–5 irrigations)",
        "waterConserved": "~30% via furrow / sprinkler",
        "runtimePerZone": "2.5 hours per rotation",
        "moistureStages": [ ... ],
        "stagnationAlert": "Avoid stagnant water for more than 24 hours ...",
        "pests": [ ... ],
        "harvestSteps": [ ... ],
        "expectedYield": "18 - 24 Quintal / Acre (approx.)",
        "mandiRates": [ ... ]
    }
"""
from __future__ import annotations

import logging
import sqlite3
from typing import Any, Dict, Optional, Tuple, Union

from flask import current_app, jsonify, request, Response

from backend.api import api_bp
from backend.services.advisory_engine import generate_advisory
from backend.services.crop_repository import get_crop, list_states
from backend.services.rate_limiter import allow
from backend.services.validation import validate_advisory_request

logger = logging.getLogger(__name__)


@api_bp.route("/advisory", methods=["POST"])
def post_advisory() -> Union[Response, Tuple[Response, int]]:
    """Generate tailored crop advisory report from field parameters.

    Returns:
        JSON Response:
            200: Full advisory result dictionary matching AdvisoryResultData.
            400: {"error": "Validation failed", "fields": {...}} or invalid JSON syntax.
            415: {"error": "Unsupported Media Type. Content-Type must be application/json"} for non-JSON requests.
            429: {"error": "Too many requests. Please wait a moment."} if rate limit exceeded.
            503: {"error": "Service temporarily unavailable"} on database failures.
            500: {"error": "Could not generate advice"} on unexpected internal exceptions.
    """
    # 1. Enforce JSON content type with 415
    if not request.is_json:
        return (
            jsonify({"error": "Unsupported Media Type. Content-Type must be application/json"}),
            415,
        )

    # 2. Check rate limit
    client_ip: str = (request.headers.get("X-Forwarded-For") or request.remote_addr or "127.0.0.1").split(",")[0].strip()
    rate_limiter_key: str = f"advisory:{client_ip}"
    advisory_limit: int = int(current_app.config.get("ADVISORY_RATE_LIMIT_PER_MINUTE", 60))
    if not allow(rate_limiter_key, limit=advisory_limit, window_seconds=60):
        return jsonify({"error": "Too many requests. Please wait a moment."}), 429

    try:
        payload: Optional[Any] = request.get_json(silent=True)
    except Exception:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if payload is None or not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    db_path: Optional[str] = current_app.config.get("DATABASE_PATH")

    # 3. Schema and Reference Validation
    try:
        clean_data, errors = validate_advisory_request(payload, db_path=db_path)
    except sqlite3.Error:
        logger.exception("Database error during advisory payload validation.")
        return jsonify({"error": "Service temporarily unavailable"}), 503

    if errors:
        return (
            jsonify({
                "error": "Validation failed",
                "fields": errors,
            }),
            400,
        )

    # 4. Retrieve Crop Profile and State Region
    try:
        crop_id: str = clean_data["crop"]
        crop_record = get_crop(crop_id, db_path=db_path)
        if crop_record is None:
            return (
                jsonify({
                    "error": "Validation failed",
                    "fields": {"crop": f"Crop '{crop_id}' was not found in the database."},
                }),
                400,
            )

        # Look up state agro-climatic region
        states = list_states(db_path=db_path)
        state_map: Dict[str, str] = {s["name"].lower(): s["region"] for s in states}
        selected_state = clean_data["state"]
        region = state_map.get(selected_state.lower(), "National")

        # 5. Execute Advisory Engine Logic
        advisory_result = generate_advisory(clean_data, crop_record, region)
        return jsonify(advisory_result), 200

    except sqlite3.Error:
        logger.exception("Database error occurred while generating crop advisory.")
        return jsonify({"error": "Service temporarily unavailable"}), 503
    except Exception as exc:
        logger.exception("Unexpected error occurred while generating crop advisory: %s", exc)
        # Never leak internal SQL error details or stack traces to API clients
        return jsonify({"error": "Could not generate advice"}), 500
