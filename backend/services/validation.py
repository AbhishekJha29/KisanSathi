"""Request validation services for KisanSathi crop advisory endpoint.

Validates and sanitizes incoming advisory form payloads against the
frontend AdvisoryFormData schema and database reference tables.
Contains pure functions with no Flask imports.
"""
from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.services.crop_repository import get_crop, list_states
from backend.services.options import (
    SEASON_OPTIONS,
    SOIL_OPTIONS,
    UNIT_OPTIONS,
    WATER_SOURCE_OPTIONS,
)

# Canonical allowed enum values derived from options definitions
_ALLOWED_SOILS: Set[str] = {item["id"] for item in SOIL_OPTIONS}
_ALLOWED_SEASONS: Set[str] = {item["id"] for item in SEASON_OPTIONS}
_ALLOWED_WATER_SOURCES: Set[str] = {item["id"] for item in WATER_SOURCE_OPTIONS}
_ALLOWED_UNITS: Set[str] = {item["id"] for item in UNIT_OPTIONS}


def _has_control_characters(text: str) -> bool:
    """Check if text contains ASCII or Unicode control characters.

    Args:
        text: String to inspect.

    Returns:
        bool: True if any control characters (< 32 or 127-159) exist.
    """
    return any(ord(c) < 32 or (127 <= ord(c) <= 159) for c in text)


def _validate_string(
    value: Any,
    field_name: str,
    max_length: int = 100,
    required: bool = True,
) -> Tuple[Optional[str], Optional[str]]:
    """Validate and sanitize a string field.

    Accepts standard English text as well as Unicode characters.
    Rejects:
        - null when required
        - booleans, integers, floats, nested objects, or arrays
        - strings containing non-printable control characters
        - whitespace-only strings
        - strings exceeding max_length

    Args:
        value: Input value to validate.
        field_name: Field name for error reporting.
        max_length: Maximum allowed character length after trimming.
        required: Whether the field must be present and non-empty.

    Returns:
        Tuple[Optional[str], Optional[str]]: (cleaned_string, error_message).
    """
    if value is None:
        if required:
            return None, f"Field '{field_name}' is required."
        return None, None

    if isinstance(value, bool) or not isinstance(value, str):
        return None, f"Field '{field_name}' must be a string."

    if _has_control_characters(value):
        return None, f"Field '{field_name}' must not contain control characters."

    trimmed = value.strip()
    if not trimmed:
        if required:
            return None, f"Field '{field_name}' cannot be empty or only whitespace."
        return None, None

    if len(trimmed) > max_length:
        return None, f"Field '{field_name}' cannot exceed {max_length} characters."

    return trimmed, None


def _validate_numeric(
    value: Any,
    field_name: str,
    min_val: float = 0.01,
    max_val: float = 10000.0,
) -> Tuple[Optional[float], Optional[str]]:
    """Safely parse and validate a numeric field.

    Rejects:
        - null values
        - booleans (e.g. True/False)
        - nested objects, arrays, or unrecognized data types
        - NaN, Infinity (-inf, +inf)
        - numeric strings with spaces, hex (0x...), or exponent notation (1e5)
        - values <= 0 or < min_val (extremely tiny numbers)
        - values > max_val (extremely large numbers)

    Args:
        value: Input value to validate (float, int, or clean decimal string).
        field_name: Field name for error reporting.
        min_val: Minimum allowed value (inclusive).
        max_val: Maximum allowed value (inclusive).

    Returns:
        Tuple[Optional[float], Optional[str]]: (cleaned_float, error_message).
    """
    if value is None:
        return None, f"Field '{field_name}' is required."

    if isinstance(value, bool):
        return None, f"Field '{field_name}' must be a valid number, not a boolean."

    if not isinstance(value, (int, float, str)):
        return None, f"Field '{field_name}' must be a valid number."

    if isinstance(value, str):
        # Reject any whitespace (leading, trailing, or internal)
        if any(c.isspace() for c in value):
            return None, f"Field '{field_name}' must not contain whitespace."
        # Strict decimal or integer format only: reject hex, exponent, or special chars
        if not re.match(r"^-?\d+(\.\d+)?$", value):
            return None, f"Field '{field_name}' must be a valid decimal number without exponents, hex, or spaces."

    try:
        parsed: float = float(value)
    except (ValueError, TypeError):
        return None, f"Field '{field_name}' must be a valid number."

    if math.isnan(parsed) or math.isinf(parsed):
        return None, f"Field '{field_name}' must be a finite number."

    if parsed <= 0.0 or parsed < min_val:
        return None, f"Field '{field_name}' must be at least {min_val}."

    if parsed > max_val:
        return None, f"Field '{field_name}' cannot exceed {max_val:,.0f}."

    return parsed, None


def validate_advisory_request(
    payload: object,
    db_path: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, str]]:
    """Validate advisory request payload against schema and reference tables.

    Checks required fields: crop, soil (or soilType), season, state, district,
    landSize, landUnit, waterSource, and optional fields block and farmerName.

    Args:
        payload: Arbitrary object received as request body.
        db_path: Optional path to SQLite database for test isolation.

    Returns:
        Tuple[Dict[str, Any], Dict[str, str]]:
            (clean_data, errors) where errors maps field names to failure messages.
    """
    if not isinstance(payload, dict):
        return {}, {"body": "Request payload must be a JSON object."}

    clean_data: Dict[str, Any] = {}
    errors: Dict[str, str] = {}

    # 1. Validate Crop (must exist in SQLite database)
    raw_crop = payload.get("crop")
    clean_crop, crop_err = _validate_string(raw_crop, "crop", max_length=50, required=True)
    if crop_err:
        errors["crop"] = crop_err
    else:
        # Check existence in crops table via repository
        crop_id_normalized = clean_crop.lower()
        crop_record = get_crop(crop_id_normalized, db_path=db_path)
        if crop_record is None:
            errors["crop"] = f"Crop '{clean_crop}' is not recognized or not available in the library."
        else:
            clean_data["crop"] = crop_id_normalized

    # 2. Validate Soil Type (accepts 'soilType' or 'soil')
    raw_soil = payload.get("soilType") if "soilType" in payload else payload.get("soil")
    clean_soil, soil_err = _validate_string(raw_soil, "soilType", max_length=50, required=True)
    if soil_err:
        errors["soilType"] = soil_err
    else:
        soil_normalized = clean_soil.lower()
        if soil_normalized not in _ALLOWED_SOILS:
            errors["soilType"] = (
                f"Invalid soil type '{clean_soil}'. Allowed values: {', '.join(sorted(_ALLOWED_SOILS))}."
            )
        else:
            clean_data["soilType"] = soil_normalized
            clean_data["soil"] = soil_normalized

    # 3. Validate Season
    raw_season = payload.get("season")
    clean_season, season_err = _validate_string(raw_season, "season", max_length=20, required=True)
    if season_err:
        errors["season"] = season_err
    else:
        season_normalized = clean_season.lower()
        if season_normalized not in _ALLOWED_SEASONS:
            errors["season"] = (
                f"Invalid season '{clean_season}'. Allowed values: {', '.join(sorted(_ALLOWED_SEASONS))}."
            )
        else:
            clean_data["season"] = season_normalized

    # 4. Validate State (must exist in states table)
    raw_state = payload.get("state")
    clean_state, state_err = _validate_string(raw_state, "state", max_length=100, required=True)
    if state_err:
        errors["state"] = state_err
    else:
        # Match against states database table
        states_list = list_states(db_path=db_path)
        valid_states_map = {s["name"].lower(): s["name"] for s in states_list}
        if clean_state.lower() not in valid_states_map:
            errors["state"] = (
                f"State '{clean_state}' is not a recognized Indian State or Union Territory."
            )
        else:
            clean_data["state"] = valid_states_map[clean_state.lower()]

    # 5. Validate District
    raw_district = payload.get("district")
    clean_district, district_err = _validate_string(raw_district, "district", max_length=100, required=True)
    if district_err:
        errors["district"] = district_err
    else:
        clean_data["district"] = clean_district

    # 6. Validate Optional Block
    if "block" in payload:
        raw_block = payload["block"]
        if raw_block is None:
            errors["block"] = "Field 'block' cannot be null."
        elif isinstance(raw_block, bool) or not isinstance(raw_block, str):
            errors["block"] = "Field 'block' must be a string."
        elif _has_control_characters(raw_block):
            errors["block"] = "Field 'block' must not contain control characters."
        elif raw_block != "" and raw_block.strip() == "":
            errors["block"] = "Field 'block' cannot be empty or only whitespace."
        elif len(raw_block.strip()) > 100:
            errors["block"] = "Field 'block' cannot exceed 100 characters."
        elif raw_block.strip() == "":
            clean_data["block"] = None
        else:
            clean_data["block"] = raw_block.strip()
    else:
        clean_data["block"] = None

    # 7. Validate Land Size (0 < landSize <= 10000)
    raw_land_size = payload.get("landSize")
    clean_land_size, land_size_err = _validate_numeric(
        raw_land_size, "landSize", min_val=0.01, max_val=10000.0
    )
    if land_size_err:
        errors["landSize"] = land_size_err
    else:
        clean_data["landSize"] = clean_land_size

    # 8. Validate Land Unit
    raw_land_unit = payload.get("landUnit")
    clean_land_unit, land_unit_err = _validate_string(raw_land_unit, "landUnit", max_length=20, required=True)
    if land_unit_err:
        errors["landUnit"] = land_unit_err
    else:
        unit_normalized = clean_land_unit.lower()
        if unit_normalized not in _ALLOWED_UNITS:
            errors["landUnit"] = (
                f"Invalid land unit '{clean_land_unit}'. Allowed values: {', '.join(sorted(_ALLOWED_UNITS))}."
            )
        else:
            clean_data["landUnit"] = unit_normalized

    # 9. Validate Water Source
    raw_water_source = payload.get("waterSource")
    clean_water_source, water_source_err = _validate_string(
        raw_water_source, "waterSource", max_length=50, required=True
    )
    if water_source_err:
        errors["waterSource"] = water_source_err
    else:
        ws_normalized = clean_water_source.lower()
        if ws_normalized not in _ALLOWED_WATER_SOURCES:
            errors["waterSource"] = (
                f"Invalid water source '{clean_water_source}'. "
                f"Allowed values: {', '.join(sorted(_ALLOWED_WATER_SOURCES))}."
            )
        else:
            clean_data["waterSource"] = ws_normalized

    # 10. Validate Optional Farmer Name
    if "farmerName" in payload:
        raw_farmer_name = payload["farmerName"]
        if raw_farmer_name is None:
            errors["farmerName"] = "Field 'farmerName' cannot be null."
        elif isinstance(raw_farmer_name, bool) or not isinstance(raw_farmer_name, str):
            errors["farmerName"] = "Field 'farmerName' must be a string."
        elif _has_control_characters(raw_farmer_name):
            errors["farmerName"] = "Field 'farmerName' must not contain control characters."
        elif raw_farmer_name != "" and raw_farmer_name.strip() == "":
            errors["farmerName"] = "Field 'farmerName' cannot be empty or only whitespace."
        elif len(raw_farmer_name.strip()) > 100:
            errors["farmerName"] = "Field 'farmerName' cannot exceed 100 characters."
        elif raw_farmer_name.strip() == "":
            clean_data["farmerName"] = None
        else:
            clean_data["farmerName"] = raw_farmer_name.strip()
    else:
        clean_data["farmerName"] = None

    return clean_data, errors
