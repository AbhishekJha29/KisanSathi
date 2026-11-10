"""Seed script to populate KisanSathi SQLite database from JSON seed files.

Run as:
    python -m backend.seed
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Ensure project root is present on sys.path
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.database import db_session, init_db
from backend.services.options import SOIL_OPTIONS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backend.seed")

SEED_DIR: Path = Path(__file__).resolve().parent / "data" / "seed"
CROPS_DIR: Path = SEED_DIR / "crops"
STATES_FILE: Path = SEED_DIR / "states.json"

VALID_SEASONS = {"kharif", "rabi", "zaid"}
VALID_REGIONS = {"North", "South", "East", "West", "Central", "North-East", "Himalayan", "National"}
VALID_SOILS: Set[str] = {s["id"] for s in SOIL_OPTIONS}


def _contains_devanagari(obj: Any) -> bool:
    """Check if an object contains any character in the Devanagari Unicode block (U+0900 to U+097F)."""
    if isinstance(obj, dict):
        return any(_contains_devanagari(k) or _contains_devanagari(v) for k, v in obj.items())
    elif isinstance(obj, list):
        return any(_contains_devanagari(item) for item in obj)
    elif isinstance(obj, str):
        return any("\u0900" <= c <= "\u097f" for c in obj)
    return False


def validate_crop_data(data: Dict[str, Any], filepath: Path) -> None:
    """Validate structure and constraint values in a crop JSON file.

    Args:
        data: Parsed dictionary from JSON.
        filepath: Source file path for descriptive error messages.

    Raises:
        ValueError: If Devanagari characters are found, required keys are missing,
                    or values violate schema constraints.
    """
    if _contains_devanagari(data):
        raise ValueError(
            f"Seed file '{filepath.name}' contains Devanagari (Hindi) character(s). "
            f"Seed files must be English-only."
        )

    required_keys = ["id", "nameEn", "seasons"]
    for key in required_keys:
        if key not in data or data[key] is None or data[key] == "":
            raise ValueError(f"Seed file '{filepath.name}' is missing required key '{key}'")

    seasons = data.get("seasons", [])
    if not isinstance(seasons, list) or len(seasons) == 0:
        raise ValueError(f"Seed file '{filepath.name}' must have a non-empty list of seasons")

    for season in seasons:
        if season not in VALID_SEASONS:
            raise ValueError(
                f"Seed file '{filepath.name}' contains invalid season '{season}'. Must be one of {VALID_SEASONS}"
            )

    soils = data.get("soils", [])
    if not isinstance(soils, list):
        raise ValueError(f"Seed file '{filepath.name}' has invalid 'soils' field (must be a list)")

    for soil in soils:
        if not isinstance(soil, str) or soil.lower().strip() not in VALID_SOILS:
            raise ValueError(
                f"Seed file '{filepath.name}' contains invalid soil '{soil}'. Must be one of {sorted(VALID_SOILS)}"
            )


def validate_states_data(data: List[Dict[str, Any]], filepath: Path) -> None:
    """Validate the list of Indian states/UTs and their regions.

    Args:
        data: Parsed state records list.
        filepath: Source file path for descriptive errors.

    Raises:
        ValueError: If state record is malformed or contains Devanagari characters.
    """
    if _contains_devanagari(data):
        raise ValueError(
            f"States seed file '{filepath.name}' contains Devanagari (Hindi) character(s). "
            f"Seed files must be English-only."
        )

    if not isinstance(data, list) or len(data) == 0:
        raise ValueError(f"States seed file '{filepath.name}' is empty or not a list")

    for idx, item in enumerate(data):
        if "name" not in item or not item["name"]:
            raise ValueError(f"States seed file '{filepath.name}' record #{idx} missing 'name'")
        if "region" not in item or item["region"] not in VALID_REGIONS:
            raise ValueError(
                f"States seed file '{filepath.name}' record '{item.get('name')}' has invalid region '{item.get('region')}'"
            )


def seed_all(db_path: Optional[str] = None) -> Dict[str, int]:
    """Initialize database and seed all states and crops within a single transaction.

    The operation is completely idempotent: running it repeatedly produces
    identical and consistent results.

    Args:
        db_path: Path to target SQLite database file. Defaults to Config.DATABASE_PATH.

    Returns:
        Dict[str, int]: Summary counts of inserted entities.
    """
    # 1. First ensure tables and indexes exist
    init_db(db_path)

    # 2. Pre-load and validate states.json
    if not STATES_FILE.is_file():
        raise FileNotFoundError(f"States seed file not found: {STATES_FILE}")

    with open(STATES_FILE, "r", encoding="utf-8") as f:
        states_data: List[Dict[str, Any]] = json.load(f)
    validate_states_data(states_data, STATES_FILE)

    # 3. Pre-load and validate all crop JSON files
    if not CROPS_DIR.is_dir():
        raise FileNotFoundError(f"Crops seed directory not found: {CROPS_DIR}")

    crop_files: List[Path] = sorted(CROPS_DIR.glob("*.json"))
    if not crop_files:
        raise ValueError(f"No crop seed files found in {CROPS_DIR}")

    crops_payload: List[Dict[str, Any]] = []
    for cfile in crop_files:
        with open(cfile, "r", encoding="utf-8") as f:
            cdata: Dict[str, Any] = json.load(f)
        validate_crop_data(cdata, cfile)
        crops_payload.append(cdata)

    logger.info(
        "Validated %d states and %d crop seed files successfully. Beginning transaction...",
        len(states_data),
        len(crops_payload),
    )

    # 4. Atomic database population inside ONE transaction
    counts: Dict[str, int] = {
        "states": 0,
        "crops": 0,
        "seasons": 0,
        "soils": 0,
        "fertilizer_stages": 0,
        "irrigation_rules": 0,
        "pests_diseases": 0,
        "harvest_steps": 0,
    }

    with db_session(db_path) as conn:
        # Clear child and parent tables cleanly in dependency order
        conn.execute("DELETE FROM harvest_steps;")
        conn.execute("DELETE FROM pests_diseases;")
        conn.execute("DELETE FROM irrigation_rules;")
        conn.execute("DELETE FROM fertilizer_stages;")
        conn.execute("DELETE FROM crop_soils;")
        conn.execute("DELETE FROM crop_seasons;")
        conn.execute("DELETE FROM crops;")
        conn.execute("DELETE FROM states;")

        # Insert States
        state_rows = [(s["name"], s["region"]) for s in states_data]
        conn.executemany("INSERT INTO states (name, region) VALUES (?, ?);", state_rows)
        counts["states"] = len(state_rows)

        # Insert Crops and child relations
        for crop in crops_payload:
            crop_id: str = crop["id"]
            categories_str: Optional[str] = (
                ",".join(crop["category"]) if isinstance(crop.get("category"), list) else crop.get("category")
            )

            conn.execute(
                """
                INSERT INTO crops (
                    id, name_en, scientific_name, badge, badge_type,
                    variety_tag, tagline, ideal_soil, duration,
                    water_need, water_level, metric_title, metric_value, hubs,
                    description_en, avg_yield, expected_yield,
                    market_price, mandi_price_range, image_url, image_alt,
                    category, popularity_score, profit_score,
                    duration_days, seed_rate, sowing_depth, spacing,
                    harvesting_indicator, intro_tip_en,
                    efficiency_gain, micronutrient_note, stagnation_alert
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?,
                    ?, ?, ?
                );
                """,
                (
                    crop_id,
                    crop.get("nameEn"),
                    crop.get("scientificName"),
                    crop.get("badge"),
                    crop.get("badgeType"),
                    crop.get("varietyTag"),
                    crop.get("tagline"),
                    crop.get("idealSoil"),
                    crop.get("duration"),
                    crop.get("waterNeed"),
                    crop.get("waterLevel"),
                    crop.get("metricTitle"),
                    crop.get("metricValue"),
                    crop.get("hubs"),
                    crop.get("descriptionEn"),
                    crop.get("avgYield") or crop.get("expectedYield"),
                    crop.get("expectedYield") or crop.get("avgYield"),
                    crop.get("marketPrice") or crop.get("mandiPriceRange"),
                    crop.get("mandiPriceRange") or crop.get("marketPrice"),
                    crop.get("imageUrl"),
                    crop.get("imageAlt"),
                    categories_str,
                    crop.get("popularityScore", 0),
                    crop.get("profitScore", 0),
                    crop.get("durationDays", 0),
                    crop.get("seedRate"),
                    crop.get("sowingDepth"),
                    crop.get("spacing"),
                    crop.get("harvestingIndicator"),
                    crop.get("introTipEn"),
                    crop.get("efficiencyGain"),
                    crop.get("micronutrientNote"),
                    crop.get("stagnationAlert"),
                ),
            )
            counts["crops"] += 1

            # Insert crop_seasons
            for season in crop.get("seasons", []):
                conn.execute(
                    "INSERT INTO crop_seasons (crop_id, season) VALUES (?, ?);",
                    (crop_id, season),
                )
                counts["seasons"] += 1

            # Insert crop_soils
            for soil in crop.get("soils", []):
                conn.execute(
                    "INSERT INTO crop_soils (crop_id, soil) VALUES (?, ?);",
                    (crop_id, soil.lower().strip()),
                )
                counts["soils"] += 1

            # Insert fertilizer_stages
            for stage in crop.get("fertilizerStages", []):
                conn.execute(
                    """
                    INSERT INTO fertilizer_stages (
                        crop_id, stage_order, stage_en, timing_en,
                        fertilizer_en, quantity_per_acre, application_method
                    ) VALUES (?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        crop_id,
                        stage.get("stageOrder", 1),
                        stage.get("stageEn", ""),
                        stage.get("timingEn"),
                        stage.get("fertilizerEn", ""),
                        stage.get("quantityPerAcre"),
                        stage.get("applicationMethod"),
                    ),
                )
                counts["fertilizer_stages"] += 1

            # Insert irrigation_rules
            irrig = crop.get("irrigation")
            if irrig and isinstance(irrig, dict):
                conn.execute(
                    """
                    INSERT INTO irrigation_rules (
                        crop_id, frequency_en, critical_stages_en,
                        runtime_per_zone, water_conserved, tips_en
                    ) VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (
                        crop_id,
                        irrig.get("frequencyEn"),
                        irrig.get("criticalStagesEn"),
                        irrig.get("runtimePerZone"),
                        irrig.get("waterConserved"),
                        irrig.get("tipsEn"),
                    ),
                )
                counts["irrigation_rules"] += 1

            # Insert pests_diseases
            for pest in crop.get("pestsDiseases", []):
                conn.execute(
                    """
                    INSERT INTO pests_diseases (
                        crop_id, name_en, symptoms_en,
                        control_en, severity, type
                    ) VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (
                        crop_id,
                        pest.get("nameEn", ""),
                        pest.get("symptomsEn"),
                        pest.get("controlEn"),
                        pest.get("severity"),
                        pest.get("type", "pest"),
                    ),
                )
                counts["pests_diseases"] += 1

            # Insert harvest_steps
            for hstep in crop.get("harvestSteps", []):
                conn.execute(
                    """
                    INSERT INTO harvest_steps (
                        crop_id, step_order, letter, title_en, text_en
                    ) VALUES (?, ?, ?, ?, ?);
                    """,
                    (
                        crop_id,
                        hstep.get("stepOrder", 1),
                        hstep.get("letter"),
                        hstep.get("titleEn", ""),
                        hstep.get("textEn", ""),
                    ),
                )
                counts["harvest_steps"] += 1

    total_children = (
        counts["seasons"]
        + counts["soils"]
        + counts["fertilizer_stages"]
        + counts["irrigation_rules"]
        + counts["pests_diseases"]
        + counts["harvest_steps"]
    )
    logger.info(
        "Seeding complete! Inserted %d crops, %d states, and %d child rows.",
        counts["crops"],
        counts["states"],
        total_children,
    )
    print(
        f"Seeding complete! Inserted {counts['crops']} crops, {counts['states']} states, "
        f"and {total_children} child rows."
    )
    logger.info(
        "Child row breakdown: %d seasons, %d soils, %d fertilizer stages, %d irrigation rules, %d pests/diseases, %d harvest steps.",
        counts["seasons"],
        counts["soils"],
        counts["fertilizer_stages"],
        counts["irrigation_rules"],
        counts["pests_diseases"],
        counts["harvest_steps"],
    )
    return counts


if __name__ == "__main__":
    try:
        seed_all()
    except Exception as e:
        logger.error("Seeding failed: %s", e)
        sys.exit(1)
