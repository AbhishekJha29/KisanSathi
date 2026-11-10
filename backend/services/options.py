"""Form options and reference metadata services for KisanSathi.

Provides standard categorical options for soils, cropping cycles (seasons),
irrigation water sources, land measurement units, and Indian states/UTs.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.services.crop_repository import list_states

SOIL_OPTIONS: List[Dict[str, str]] = [
    {"id": "alluvial", "nameEn": "Alluvial Soil"},
    {"id": "black", "nameEn": "Black Soil / Regur"},
    {"id": "red", "nameEn": "Red Soil"},
    {"id": "laterite", "nameEn": "Laterite Soil"},
    {"id": "sandy", "nameEn": "Sandy / Desert Soil"},
    {"id": "loamy", "nameEn": "Loamy Soil"},
    {"id": "clay", "nameEn": "Clay Soil"},
    {"id": "mountain", "nameEn": "Mountain / Forest Soil"},
]

SEASON_OPTIONS: List[Dict[str, str]] = [
    {"id": "kharif", "nameEn": "Kharif"},
    {"id": "rabi", "nameEn": "Rabi"},
    {"id": "zaid", "nameEn": "Zaid / Summer"},
]

WATER_SOURCE_OPTIONS: List[Dict[str, str]] = [
    {"id": "rainfed", "nameEn": "Rainfed / Dryland"},
    {"id": "canal", "nameEn": "Canal Irrigation"},
    {"id": "borewell", "nameEn": "Borewell / Tubewell"},
    {"id": "drip", "nameEn": "Drip Irrigation"},
    {"id": "sprinkler", "nameEn": "Sprinkler Irrigation"},
    {"id": "pond_river", "nameEn": "Pond / River / Lift"},
]

UNIT_OPTIONS: List[Dict[str, str]] = [
    {"id": "acres", "nameEn": "Acres"},
    {"id": "hectares", "nameEn": "Hectares"},
    {"id": "bigha", "nameEn": "Bigha"},
]


def get_options(db_path: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve all categorical form options required for crop advisory selection.

    Aggregates static options for soils, seasons, irrigation sources, and measurement
    units with dynamic Indian states and regions queried from the SQLite database.

    Args:
        db_path: Optional path to SQLite database. Defaults to Config.DATABASE_PATH.

    Returns:
        Dict[str, Any]: Dictionary containing soils, seasons, waterSources, units, and states.
    """
    return {
        "soils": SOIL_OPTIONS,
        "seasons": SEASON_OPTIONS,
        "waterSources": WATER_SOURCE_OPTIONS,
        "units": UNIT_OPTIONS,
        "states": list_states(db_path),
    }
