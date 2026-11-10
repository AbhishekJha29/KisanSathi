"""Crop and form options API routes for KisanSathi backend.

Exposes endpoints for querying crop summaries, full crop details,
and form dropdown option lists.
"""
import logging
import sqlite3
from typing import Any, Dict, Optional, Tuple, Union

from flask import current_app, jsonify, request, Response

from backend.api import api_bp
from backend.services.crop_repository import get_crop, list_crops
from backend.services.options import get_options

logger = logging.getLogger(__name__)

ALLOWED_SEASONS = {"kharif", "rabi", "zaid"}


@api_bp.route("/crops", methods=["GET"])
def get_crops_list() -> Union[Response, Tuple[Response, int]]:
    """Retrieve summary list of crops with optional season filtering and name search.

    Query Parameters:
        season (str, optional): Filter by cropping season ('kharif', 'rabi', 'zaid').
        search (str, optional): Case-insensitive search query matching English crop names.

    Returns:
        JSON Response:
            200: {"count": <int>, "crops": [<crop_summary>, ...]}
            400: {"error": "<validation message>"} if season is invalid.
            503: {"error": "Service temporarily unavailable"} on database failures.
    """
    season_param: Optional[str] = request.args.get("season")
    search_param: Optional[str] = request.args.get("search")

    cleaned_season: Optional[str] = None
    if season_param is not None and season_param.strip():
        cleaned_season = season_param.strip().lower()
        if cleaned_season not in ALLOWED_SEASONS:
            return (
                jsonify(
                    {
                        "error": (
                            f"Invalid season '{season_param}'. "
                            f"Allowed values are: {', '.join(sorted(ALLOWED_SEASONS))}"
                        )
                    }
                ),
                400,
            )

    cleaned_search: Optional[str] = None
    if search_param is not None and search_param.strip():
        cleaned_search = search_param.strip()

    db_path: Optional[str] = current_app.config.get("DATABASE_PATH")
    try:
        crops = list_crops(season=cleaned_season, search=cleaned_search, db_path=db_path)
        return jsonify({"count": len(crops), "crops": crops}), 200
    except sqlite3.Error:
        logger.exception("Database error occurred while querying crops list.")
        return jsonify({"error": "Service temporarily unavailable"}), 503


@api_bp.route("/crops/<crop_id>", methods=["GET"])
def get_crop_detail(crop_id: str) -> Union[Response, Tuple[Response, int]]:
    """Retrieve complete nested detail for a specific crop by its unique identifier.

    Args:
        crop_id: Unique crop slug identifier (e.g., 'wheat', 'rice').

    Returns:
        JSON Response:
            200: Full crop detail dictionary.
            404: {"error": "Crop not found: <crop_id>"} if crop does not exist.
            503: {"error": "Service temporarily unavailable"} on database failures.
    """
    db_path: Optional[str] = current_app.config.get("DATABASE_PATH")
    try:
        crop = get_crop(crop_id, db_path=db_path)
    except sqlite3.Error:
        logger.exception("Database error occurred while fetching crop detail for '%s'.", crop_id)
        return jsonify({"error": "Service temporarily unavailable"}), 503

    if crop is None:
        return jsonify({"error": f"Crop not found: '{crop_id}'"}), 404

    return jsonify(crop), 200


@api_bp.route("/options", methods=["GET"])
def get_form_options() -> Union[Response, Tuple[Response, int]]:
    """Retrieve categorical options required for form dropdowns.

    Returns static options for soils, cropping seasons, irrigation water sources,
    and measurement units, combined with the database-driven list of Indian states/UTs.

    Returns:
        JSON Response:
            200: JSON payload containing soils, seasons, waterSources, units, and states.
            503: {"error": "Service temporarily unavailable"} on database failures.
    """
    db_path: Optional[str] = current_app.config.get("DATABASE_PATH")
    try:
        options = get_options(db_path=db_path)
        return jsonify(options), 200
    except sqlite3.Error:
        logger.exception("Database error occurred while retrieving form options.")
        return jsonify({"error": "Service temporarily unavailable"}), 503
