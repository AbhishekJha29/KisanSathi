"""AI-powered advisory explanation and chat routes for KisanSathi.

Exposes endpoints for generating conversational summaries of rule-based crop
advisories and answering farmer follow-up questions using Google Gemini AI,
backed by in-memory rate limiting and TTL caching.

Endpoints:
    - POST /api/advisory/explain:
        Synthesizes a friendly, concise explanation of the generated advisory.
        Always regenerates the advisory from verified form parameters.
        Returns cached or newly generated AI synthesis, or fallback explanation.

        Example Request:
            POST /api/advisory/explain
            Content-Type: application/json

            {
                "form": {
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
            }

        Example Response (200 OK):
            {
                "explanation": "For your wheat crop in Varanasi, Uttar Pradesh...",
                "source": "ai"
            }

    - POST /api/chat:
        Answers farmer follow-up questions grounded in the agronomic advisory.

        Example Request:
            POST /api/chat
            Content-Type: application/json

            {
                "form": {
                    "crop": "wheat",
                    "soilType": "loamy",
                    "season": "rabi",
                    "state": "Uttar Pradesh",
                    "district": "Varanasi",
                    "landSize": 5.0,
                    "landUnit": "acres",
                    "waterSource": "canal"
                },
                "question": "When should I apply the second dose of urea?",
                "history": [
                    {"role": "user", "text": "Can I use drip?"},
                    {"role": "assistant", "text": "Yes, drip is suitable."}
                ]
            }

        Example Response (200 OK):
            {
                "answer": "Apply the second top dressing of urea at the booting stage...",
                "source": "ai"
            }
"""
from __future__ import annotations

import logging
import sqlite3
from typing import Any, Dict, List, Optional, Tuple, Union

from flask import current_app, jsonify, request, Response
from werkzeug.exceptions import HTTPException

from backend.api import api_bp
from backend.services.advisory_engine import generate_advisory
from backend.services.ai_cache import (
    get as get_cache,
    make_explanation_cache_key,
    set as set_cache,
)
from backend.services.ai_service import (
    AIServiceError,
    answer_question,
    explain_advisory,
    fallback_explanation,
    is_ai_configured,
)
from backend.services.crop_repository import get_crop, list_states
from backend.services.rate_limiter import allow
from backend.services.validation import validate_advisory_request

logger = logging.getLogger(__name__)


def _strip_control_characters(text: str) -> str:
    """Remove ASCII and Unicode control characters while preserving standard whitespace.

    Args:
        text: Input string potentially containing non-printable control characters.

    Returns:
        str: Cleaned string with control characters removed.
    """
    return "".join(
        c for c in text
        if c in ("\n", "\r", "\t") or (ord(c) >= 32 and not (127 <= ord(c) <= 159))
    )


def _get_client_ip() -> str:
    """Retrieve the client IP address for sliding-window rate limiting.

    Returns:
        str: Remote IP address or localhost fallback.
    """
    return (request.headers.get("X-Forwarded-For") or request.remote_addr or "127.0.0.1").split(",")[0].strip()


def _reconstruct_advisory(clean_form: Dict[str, Any], db_path: Optional[str]) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, str]]]:
    """Reconstruct verified rule-based advisory on the server.

    Ensures client-sent advisories are never trusted.

    Args:
        clean_form: Validated form dictionary.
        db_path: Path to database.

    Returns:
        Tuple[Optional[Dict[str, Any]], Optional[Dict[str, str]]]:
            (advisory_dict, error_fields) where error_fields is set if crop not found.
    """
    crop_id: str = clean_form["crop"]
    crop_record = get_crop(crop_id, db_path=db_path)
    if crop_record is None:
        return None, {"crop": f"Crop '{crop_id}' was not found in the database."}

    states = list_states(db_path=db_path)
    state_map: Dict[str, str] = {s["name"].lower(): s["region"] for s in states}
    selected_state: str = clean_form["state"]
    region: str = state_map.get(selected_state.lower(), "National")

    advisory = generate_advisory(clean_form, crop_record, region)
    return advisory, None


@api_bp.route("/advisory/explain", methods=["POST"])
def post_advisory_explain() -> Union[Response, Tuple[Response, int]]:
    """Synthesize a natural language advisory explanation in English.

    Validates field form parameters, checks rate limit by client IP, queries
    in-memory explanation cache, and invokes Gemini AI (or falls back gracefully).
    Any client-provided 'language' field is silently ignored.

    Returns:
        JSON Response:
            200: {"explanation": str, "source": "ai" | "fallback"}
            400: {"error": "Validation failed", "fields": {...}} or JSON error
            415: {"error": "Unsupported Media Type. Content-Type must be application/json"}
            429: {"error": "Too many requests, please wait a minute"}
            503: {"error": "Service temporarily unavailable"} on database failures
            500: {"error": "Something went wrong"}
    """
    if not request.is_json:
        return (
            jsonify({"error": "Unsupported Media Type. Content-Type must be application/json"}),
            415,
        )

    try:
        payload: Optional[Any] = request.get_json(silent=True)
    except HTTPException:
        raise
    except Exception:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if payload is None or not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    db_path: Optional[str] = current_app.config.get("DATABASE_PATH")

    # 1. Validate form (language parameter is ignored if present)
    raw_form = payload.get("form")
    if raw_form is None or not isinstance(raw_form, dict):
        return (
            jsonify({
                "error": "Validation failed",
                "fields": {"form": "Field 'form' is required and must be a JSON object."},
            }),
            400,
        )

    try:
        clean_form, form_errors = validate_advisory_request(raw_form, db_path=db_path)
    except sqlite3.Error:
        logger.exception("Database error while validating advisory explanation form.")
        return jsonify({"error": "Service temporarily unavailable"}), 503

    if form_errors:
        return (
            jsonify({
                "error": "Validation failed",
                "fields": form_errors,
            }),
            400,
        )

    # 2. Check client rate limit
    client_ip: str = _get_client_ip()
    rate_limit: int = int(current_app.config.get("AI_RATE_LIMIT_PER_MINUTE", 10))
    if not allow(client_ip, limit=rate_limit, window_seconds=60):
        return jsonify({"error": "Too many requests, please wait a minute"}), 429

    # 3. Check in-memory explanation cache
    cache_key: str = make_explanation_cache_key(clean_form)
    cached_explanation = get_cache(cache_key)
    if cached_explanation is not None:
        return jsonify({"explanation": cached_explanation, "source": "ai"}), 200

    # 4. Reconstruct advisory report
    try:
        advisory, recon_err = _reconstruct_advisory(clean_form, db_path=db_path)
        if recon_err:
            return jsonify({"error": "Validation failed", "fields": recon_err}), 400
        if advisory is None:
            return jsonify({"error": "Validation failed", "fields": {"form": "Advisory could not be built."}}), 400

        # 5. Call AI service or fallback
        if is_ai_configured(current_app.config):
            try:
                ai_text = explain_advisory(advisory, current_app.config)
                ttl = int(current_app.config.get("AI_CACHE_TTL_SECONDS", 3600))
                set_cache(cache_key, ai_text, ttl_seconds=ttl)
                return jsonify({"explanation": ai_text, "source": "ai"}), 200
            except AIServiceError as exc:
                # Log warning without leaking credentials or stack traces
                logger.warning("AI explanation service unavailable, falling back: %s", exc)

        # 6. Fallback deterministic template
        fallback_text = fallback_explanation(advisory)
        return jsonify({"explanation": fallback_text, "source": "fallback"}), 200

    except sqlite3.Error:
        logger.exception("Database error during advisory reconstruction in /api/advisory/explain")
        return jsonify({"error": "Service temporarily unavailable"}), 503
    except Exception as exc:
        logger.exception("Unexpected error in /api/advisory/explain: %s", exc)
        return jsonify({"error": "Something went wrong"}), 500


@api_bp.route("/chat", methods=["POST"])
def post_chat() -> Union[Response, Tuple[Response, int]]:
    """Answer a farmer's follow-up question regarding crop management.

    Validates field form parameters, question length, and history turns.
    Enforces rate limiting by client IP address.

    Returns:
        JSON Response:
            200: {"answer": str, "source": "ai" | "fallback"}
            400: {"error": "Validation failed", "fields": {...}} or JSON error
            415: {"error": "Unsupported Media Type. Content-Type must be application/json"}
            429: {"error": "Too many requests, please wait a minute"}
            503: {"error": "Service temporarily unavailable"} on database failures
            500: {"error": "Something went wrong"}
    """
    if not request.is_json:
        return (
            jsonify({"error": "Unsupported Media Type. Content-Type must be application/json"}),
            415,
        )

    try:
        payload: Optional[Any] = request.get_json(silent=True)
    except HTTPException:
        raise
    except Exception:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if payload is None or not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    db_path: Optional[str] = current_app.config.get("DATABASE_PATH")
    errors: Dict[str, str] = {}

    # 1. Validate question (strip control characters)
    raw_question = payload.get("question")
    clean_question = ""
    if raw_question is None:
        errors["question"] = "Question is required."
    elif not isinstance(raw_question, str):
        errors["question"] = "Question must be a string."
    else:
        clean_question = _strip_control_characters(raw_question).strip()
        if not clean_question:
            errors["question"] = "Question cannot be empty or only control characters."
        elif len(clean_question) > 500:
            errors["question"] = "Question cannot exceed 500 characters."

    # 2. Validate history (optional, max 6 items, strip control characters)
    raw_history = payload.get("history")
    clean_history: List[Dict[str, str]] = []
    if raw_history is not None:
        if not isinstance(raw_history, list):
            errors["history"] = "History must be an array of messages."
        elif len(raw_history) > 6:
            errors["history"] = "History cannot exceed 6 items."
        else:
            for idx, item in enumerate(raw_history):
                if not isinstance(item, dict):
                    errors["history"] = f"History item at index {idx} must be an object."
                    break
                role = item.get("role")
                if role not in ("user", "assistant"):
                    errors["history"] = f"History item at index {idx} must have role 'user' or 'assistant'."
                    break
                text = item.get("text")
                if text is None or not isinstance(text, str):
                    errors["history"] = f"History item at index {idx} text must be a string."
                    break
                trimmed_text = _strip_control_characters(text).strip()
                if not trimmed_text:
                    errors["history"] = f"History item at index {idx} text cannot be empty or only control characters."
                    break
                if len(trimmed_text) > 600:
                    errors["history"] = f"History item at index {idx} text cannot exceed 600 characters."
                    break
                clean_history.append({"role": role, "text": trimmed_text})

    # 3. Validate form (language parameter is ignored if present)
    raw_form = payload.get("form")
    clean_form: Dict[str, Any] = {}
    if raw_form is None or not isinstance(raw_form, dict):
        errors["form"] = "Field 'form' is required and must be a JSON object."
    else:
        try:
            clean_form, form_errors = validate_advisory_request(raw_form, db_path=db_path)
            if form_errors:
                errors.update(form_errors)
        except sqlite3.Error:
            logger.exception("Database error while validating chat form payload.")
            return jsonify({"error": "Service temporarily unavailable"}), 503

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    # 4. Check client rate limit
    client_ip: str = _get_client_ip()
    rate_limit: int = int(current_app.config.get("AI_RATE_LIMIT_PER_MINUTE", 10))
    if not allow(client_ip, limit=rate_limit, window_seconds=60):
        return jsonify({"error": "Too many requests, please wait a minute"}), 429

    # 5. Reconstruct advisory report
    try:
        advisory, recon_err = _reconstruct_advisory(clean_form, db_path=db_path)
        if recon_err:
            return jsonify({"error": "Validation failed", "fields": recon_err}), 400
        if advisory is None:
            return jsonify({"error": "Validation failed", "fields": {"form": "Advisory could not be built."}}), 400

        fallback_answer: str = (
            "The AI agricultural assistant is currently unavailable. Please refer to the recommended "
            "fertilizer, irrigation, pest control, and harvest advice sections above, or consult your "
            "local Krishi Vigyan Kendra (KVK) officer."
        )

        # 6. Call AI service or return fallback message
        if is_ai_configured(current_app.config):
            try:
                ai_answer = answer_question(
                    advisory, clean_question, clean_history, current_app.config
                )
                return jsonify({"answer": ai_answer, "source": "ai"}), 200
            except AIServiceError as exc:
                logger.warning("AI chat service unavailable, falling back: %s", exc)

        return jsonify({"answer": fallback_answer, "source": "fallback"}), 200

    except sqlite3.Error:
        logger.exception("Database error during advisory reconstruction in /api/chat")
        return jsonify({"error": "Service temporarily unavailable"}), 503
    except Exception as exc:
        logger.exception("Unexpected error in /api/chat: %s", exc)
        return jsonify({"error": "Something went wrong"}), 500
