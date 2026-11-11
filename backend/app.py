"""Entry point and application factory for KisanSathi Flask backend.

Starting the server:
    Run from the project root using module execution:
        python -m backend.app

    Or run directly:
        python backend/app.py

Testing:
    Run pytest from the project root:
        python -m pytest backend/tests
"""
from __future__ import annotations

import logging
import os
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

# Ensure project root is present on sys.path so that 'backend' package imports resolve
# seamlessly whether launched via `python -m backend.app` or `python backend/app.py`.
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from flask import Flask, abort, g, jsonify, request, send_from_directory, Response
from flask_cors import CORS
from werkzeug.routing import PathConverter

from backend.config import Config
from backend.database import get_connection, init_db
from backend.api import api_bp


class NonApiPathConverter(PathConverter):
    """Path converter that matches any path NOT starting with 'api/' or equal to 'api'."""

    regex = r"(?!api(?:\/|$)).*"


def create_app(config_overrides: Optional[Dict[str, Any]] = None) -> Flask:
    """Application factory that initializes and configures the Flask application.

    Performs the following setup:
        1. Configures INFO-level logging with structured timestamp output.
        2. Loads configuration settings from the Config class, with optional test overrides.
        3. Initializes the SQLite database schema if tables do not exist.
        4. Verifies database data and logs a warning if the crops table is unseeded.
        5. Configures CORS restricted strictly to /api/* and ALLOWED_ORIGINS.
        6. Registers the API Blueprint (serving /api/health, /api/crops, /api/options, etc.).
        7. Registers JSON error handlers for 400, 404, 405, 413, 415, and 500 errors on API routes.
        8. Applies security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Cache-Control)
           and access logging via before/after request hooks.
        9. Serves the production React build (SPA) from FRONTEND_DIST with safe
           file lookups and path traversal protection via send_from_directory.

    Args:
        config_overrides: Optional dictionary of configuration overrides (useful for tests).

    Returns:
        Flask: The fully configured Flask application instance.
    """
    # 1. Logging setup
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    app: Flask = Flask(__name__)
    app.url_map.converters["non_api_path"] = NonApiPathConverter
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    # Enforce request payload size limit (default: 64 KB)
    app.config["MAX_CONTENT_LENGTH"] = app.config.get("MAX_CONTENT_LENGTH", Config.MAX_CONTENT_LENGTH)

    # 2. Database initialization and crop count health check
    db_path: str = app.config.get("DATABASE_PATH", Config.DATABASE_PATH)
    try:
        init_db(db_path)
        conn = get_connection(db_path)
        try:
            cursor = conn.execute("SELECT COUNT(*) AS cnt FROM crops;")
            row = cursor.fetchone()
            crop_count: int = row["cnt"] if row else 0
            if crop_count == 0:
                app.logger.warning("No crop data found. Run: python -m backend.seed")
            else:
                app.logger.info("Database initialized successfully with %d crops.", crop_count)
        finally:
            conn.close()
    except Exception as exc:
        app.logger.warning("Database check encountered an error: %s", exc)

    # 3. CORS configuration (ONLY for /api/* and ONLY for ALLOWED_ORIGINS)
    raw_origins = app.config.get("ALLOWED_ORIGINS", Config.ALLOWED_ORIGINS)
    allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})
    app.logger.info("CORS enabled for routes matching /api/* for origins: %s", allowed_origins)

    # 4. Request lifecycle hooks for timing, security headers, and safe logging
    @app.before_request
    def before_request_hook() -> Optional[Response]:
        """Record request start time and reject non-JSON POST requests on API routes."""
        g.start_time = time.perf_counter()

        # Reject non-JSON POST/PUT/PATCH requests on /api routes with 415 only when a real route matched
        if request.url_rule is not None and (request.path.startswith("/api/") or request.path == "/api"):
            if request.method in ("POST", "PUT", "PATCH"):
                content_type = request.content_type or ""
                if not content_type.lower().startswith("application/json"):
                    return (
                        jsonify({"error": "Unsupported Media Type. Content-Type must be application/json"}),
                        415,
                    )
        return None

    @app.after_request
    def after_request_hook(response: Response) -> Response:
        """Inject security headers, no-store cache headers on /api/*, and log request duration."""
        # Baseline security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Prevent browser caching of dynamic API responses
        if request.path.startswith("/api/") or request.path == "/api":
            response.headers["Cache-Control"] = "no-store"

        # Log request summary: method, path, status code, duration (NO headers, bodies, or tokens)
        start = getattr(g, "start_time", None)
        duration_ms = (time.perf_counter() - start) * 1000.0 if start is not None else 0.0
        app.logger.info("%s %s %d %.2fms", request.method, request.path, response.status_code, duration_ms)

        return response

    # 5. Register API Blueprint
    app.register_blueprint(api_bp)

    # 6. JSON Error Handlers for API routes (400, 404, 405, 413, 415, 500)
    @app.errorhandler(400)
    def handle_bad_request(error: Any) -> Union[Response, Tuple[str, int]]:
        """Return structured JSON error for 400 Bad Request on /api routes."""
        if request.path.startswith("/api/") or request.path == "/api":
            msg = getattr(error, "description", "Bad request")
            return jsonify({"error": str(msg)}), 400
        return "Bad request", 400

    @app.errorhandler(404)
    def handle_not_found(error: Any) -> Union[Response, Tuple[str, int]]:
        """Return structured JSON error for unmatched /api routes or 404 for static files."""
        if request.path.startswith("/api/") or request.path == "/api":
            return jsonify({"error": "Resource not found"}), 404
        return "Resource not found", 404

    @app.errorhandler(405)
    def handle_method_not_allowed(error: Any) -> Union[Response, Tuple[str, int]]:
        """Return structured JSON error for 405 Method Not Allowed on /api routes."""
        if request.path.startswith("/api/") or request.path == "/api":
            resp = jsonify({"error": "Method not allowed"})
            resp.status_code = 405
            if hasattr(error, "valid_methods") and error.valid_methods:
                resp.headers["Allow"] = ", ".join(sorted(error.valid_methods))
            elif hasattr(error, "get_headers"):
                for k, v in error.get_headers():
                    if k.lower() == "allow":
                        resp.headers["Allow"] = v
            return resp
        return "Method not allowed", 405

    @app.errorhandler(413)
    def handle_payload_too_large(error: Any) -> Union[Response, Tuple[str, int]]:
        """Return structured JSON error for 413 Request Entity Too Large."""
        if request.path.startswith("/api/") or request.path == "/api":
            return jsonify({"error": "Request payload too large. Maximum allowed size is 64 KB."}), 413
        return "Payload too large", 413

    @app.errorhandler(415)
    def handle_unsupported_media_type(error: Any) -> Union[Response, Tuple[str, int]]:
        """Return structured JSON error for 415 Unsupported Media Type."""
        if request.path.startswith("/api/") or request.path == "/api":
            return jsonify({"error": "Unsupported Media Type. Content-Type must be application/json"}), 415
        return "Unsupported Media Type", 415

    @app.errorhandler(500)
    def handle_internal_error(error: Any) -> Union[Response, Tuple[str, int]]:
        """Return a structured JSON error response for internal server errors on /api."""
        app.logger.error("Internal Server Error on %s: %s", request.path, error, exc_info=True)
        if request.path.startswith("/api/") or request.path == "/api":
            return jsonify({"error": "Internal server error"}), 500
        return "Internal server error", 500

    # 7. Helper function for serving frontend files safely
    def _serve_dist_file(relative_path: str) -> Union[Response, Tuple[str, int, dict]]:
        """Safely serve built frontend static assets or index.html for SPA routing.

        Guards against path traversal attacks (encoded .., backslashes, absolute paths).

        Args:
            relative_path: Relative URL path requested by the client.

        Returns:
            Flask Response serving the requested asset, index.html, or setup guidance.
        """
        dist_dir: Path = Path(app.config.get("FRONTEND_DIST", Config.FRONTEND_DIST)).resolve()
        index_file: Path = dist_dir / "index.html"

        # If dist folder or index.html is missing, return a helpful friendly message
        if not dist_dir.exists() or not index_file.is_file():
            return (
                "Frontend not built yet. Run `npm run build` in the project root.",
                200,
                {"Content-Type": "text/plain; charset=utf-8"},
            )

        # If specific existing file requested (e.g. assets/index.js), serve it directly
        if relative_path:
            unquoted: str = urllib.parse.unquote(relative_path)
            # Null bytes or invalid characters check
            if "\0" in unquoted:
                abort(404)
            # Normalize slashes and remove leading slashes
            clean_path = unquoted.replace("\\", "/").lstrip("/")
            # Guard against Windows drive letters like C: or leading slash
            if (len(clean_path) >= 2 and clean_path[1] == ":") or clean_path.startswith("/"):
                abort(404)
            try:
                target_file = (dist_dir / clean_path).resolve()
                # Verify that resolved file path is strictly within the dist directory
                rel = target_file.relative_to(dist_dir)
                if target_file.is_file():
                    return send_from_directory(str(dist_dir), str(rel).replace("\\", "/"))
                # If the requested path has a file extension (e.g. .js, .css, .py) and was not found,
                # do not fall back to index.html; abort with 404.
                if target_file.suffix:
                    abort(404)
            except (ValueError, RuntimeError):
                # Path traversal attempt outside dist_dir raises ValueError in relative_to
                abort(404)
            except Exception:
                abort(404)

        # Otherwise fallback to index.html for React SPA client-side routing
        return send_from_directory(str(dist_dir), "index.html")

    # 8. Single-Page Application (SPA) catch-all route
    @app.route("/", defaults={"path": ""})
    @app.route("/<non_api_path:path>", methods=["GET", "HEAD"])
    def catch_all_routes(path: str) -> Union[Response, Tuple[str, int, dict]]:
        """Catch-all route handling root requests, static files, and SPA client routing."""
        return _serve_dist_file(path)

    return app


if __name__ == "__main__":
    app_instance: Flask = create_app()
    debug_mode: bool = bool(app_instance.config.get("DEBUG", False))
    app_instance.logger.info(
        "KisanSathi API server starting on 0.0.0.0:%d (debug=%s)",
        Config.PORT,
        debug_mode,
    )
    app_instance.run(
        host="0.0.0.0",
        port=Config.PORT,
        debug=debug_mode,
    )
