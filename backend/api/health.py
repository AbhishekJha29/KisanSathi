"""Health check and ping routes for KisanSathi API.

Exposes endpoints for service health verification and uptime probes.
"""
import logging
from datetime import datetime, timezone
from typing import Tuple, Union

from flask import current_app, jsonify, Response

from backend.api import api_bp
from backend.config import Config
from backend.database import get_connection

logger = logging.getLogger(__name__)


@api_bp.route("/health", methods=["GET"])
def health_check() -> Union[Response, Tuple[Response, int]]:
    """Return backend health status with database connectivity probe and UTC timestamp.

    Returns:
        JSON Response:
            200: {"status": "ok", "service": "kisansathi-api", "version": "0.1.0", "database": "connected", "time": ...}
            503: {"status": "degraded", "database": "unavailable"} when database check fails.
    """
    db_path: str = current_app.config.get("DATABASE_PATH", Config.DATABASE_PATH)
    try:
        conn = get_connection(db_path)
        try:
            cursor = conn.execute("SELECT 1;")
            cursor.fetchone()
        finally:
            conn.close()
    except Exception:
        logger.exception("Database connectivity check failed during /api/health probe.")
        return jsonify({"status": "degraded", "database": "unavailable"}), 503

    now_utc_iso: str = datetime.now(timezone.utc).isoformat()
    return jsonify({
        "status": "ok",
        "service": "kisansathi-api",
        "version": "0.1.0",
        "database": "connected",
        "time": now_utc_iso,
    }), 200


@api_bp.route("/ping", methods=["GET"])
def ping() -> Response:
    """Return simple ping probe response.

    Returns:
        Response: JSON payload containing {'message': 'pong'}.
    """
    return jsonify({"message": "pong"})
