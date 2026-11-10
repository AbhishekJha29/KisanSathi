"""Repository layer providing plain database query functions for crops and states.

All queries use parameterized SQL (? placeholders) and return standard dictionaries
with camelCase keys matching the frontend TypeScript interfaces.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import get_connection


def _row_to_crop_summary(row: Any, seasons: List[str], soils: List[str]) -> Dict[str, Any]:
    """Convert a database row from the crops table into a summary dictionary.

    Args:
        row: sqlite3.Row containing crop columns.
        seasons: List of associated cropping cycles.
        soils: List of suitable soil types.

    Returns:
        Dict[str, Any]: Dictionary formatted with camelCase keys.
    """
    categories: List[str] = [c.strip() for c in (row["category"] or "").split(",") if c.strip()]
    return {
        "id": row["id"],
        "nameEn": row["name_en"],
        "scientificName": row["scientific_name"],
        "badge": row["badge"],
        "badgeType": row["badge_type"],
        "varietyTag": row["variety_tag"],
        "tagline": row["tagline"],
        "idealSoil": row["ideal_soil"],
        "duration": row["duration"],
        "waterNeed": row["water_need"],
        "waterLevel": row["water_level"],
        "metricTitle": row["metric_title"],
        "metricValue": row["metric_value"],
        "hubs": row["hubs"],
        "description": row["description_en"],
        "descriptionEn": row["description_en"],
        "avgYield": row["avg_yield"],
        "expectedYield": row["expected_yield"] if "expected_yield" in row.keys() and row["expected_yield"] else row["avg_yield"],
        "marketPrice": row["market_price"],
        "mandiPriceRange": row["mandi_price_range"] if "mandi_price_range" in row.keys() and row["mandi_price_range"] else row["market_price"],
        "imageUrl": row["image_url"],
        "imageAlt": row["image_alt"],
        "category": categories,
        "popularityScore": row["popularity_score"],
        "profitScore": row["profit_score"],
        "durationDays": row["duration_days"],
        "seasons": seasons,
        "soils": soils,
    }


def list_crops(
    season: Optional[str] = None,
    search: Optional[str] = None,
    db_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Query and return summary records for all matching crops.

    Supports filtering by agricultural season and case-insensitive search
    matching against English crop names using parameterized SQL.

    Args:
        season: Optional season filter ('kharif', 'rabi', or 'zaid').
        search: Optional search text to match against crop names.
        db_path: Optional path to SQLite database. Defaults to Config.DATABASE_PATH.

    Returns:
        List[Dict[str, Any]]: List of crop summary dictionaries.
    """
    conn = get_connection(db_path)
    try:
        query_parts: List[str] = ["SELECT DISTINCT c.* FROM crops c"]
        join_parts: List[str] = []
        where_parts: List[str] = []
        params: List[Any] = []

        if season:
            join_parts.append("JOIN crop_seasons cs ON c.id = cs.crop_id")
            where_parts.append("LOWER(cs.season) = LOWER(?)")
            params.append(season.strip())

        if search and search.strip():
            where_parts.append("LOWER(c.name_en) LIKE LOWER(?)")
            search_pattern = f"%{search.strip()}%"
            params.append(search_pattern)

        full_query: str = " ".join(query_parts + join_parts)
        if where_parts:
            full_query += " WHERE " + " AND ".join(where_parts)
        full_query += " ORDER BY c.popularity_score DESC, c.name_en ASC;"

        cursor = conn.execute(full_query, params)
        crop_rows = cursor.fetchall()

        # Efficiently fetch seasons and soils for returned crops
        results: List[Dict[str, Any]] = []
        for row in crop_rows:
            crop_id: str = row["id"]
            # Fetch seasons for this crop
            s_cursor = conn.execute(
                "SELECT season FROM crop_seasons WHERE crop_id = ? ORDER BY season ASC;",
                (crop_id,),
            )
            seasons = [s_row["season"] for s_row in s_cursor.fetchall()]

            # Fetch soils for this crop
            soil_cursor = conn.execute(
                "SELECT soil FROM crop_soils WHERE crop_id = ? ORDER BY soil ASC;",
                (crop_id,),
            )
            soils = [soil_row["soil"] for soil_row in soil_cursor.fetchall()]

            results.append(_row_to_crop_summary(row, seasons, soils))

        return results
    finally:
        conn.close()


def get_crop(crop_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieve full detail for a single crop by its unique identifier.

    Fetches the scalar attributes along with nested collections:
    seasons, soils, fertilizerStages, irrigation, pestsDiseases, and harvestSteps.

    Args:
        crop_id: Unique slug identifier of the crop (e.g. 'wheat').
        db_path: Optional path to SQLite database. Defaults to Config.DATABASE_PATH.

    Returns:
        Optional[Dict[str, Any]]: Full nested crop dictionary, or None if not found.
    """
    conn = get_connection(db_path)
    try:
        cursor = conn.execute("SELECT * FROM crops WHERE id = ?;", (crop_id.strip(),))
        crop_row = cursor.fetchone()
        if crop_row is None:
            return None

        # 1. Seasons
        s_cursor = conn.execute(
            "SELECT season FROM crop_seasons WHERE crop_id = ? ORDER BY season ASC;",
            (crop_id,),
        )
        seasons: List[str] = [r["season"] for r in s_cursor.fetchall()]

        # 2. Soils
        soil_cursor = conn.execute(
            "SELECT soil FROM crop_soils WHERE crop_id = ? ORDER BY soil ASC;",
            (crop_id,),
        )
        soils: List[str] = [r["soil"] for r in soil_cursor.fetchall()]

        # 3. Fertilizer Stages
        fert_cursor = conn.execute(
            """
            SELECT stage_order, stage_en, timing_en,
                   fertilizer_en, quantity_per_acre, application_method
            FROM fertilizer_stages
            WHERE crop_id = ?
            ORDER BY stage_order ASC;
            """,
            (crop_id,),
        )
        fertilizer_stages: List[Dict[str, Any]] = [
            {
                "stageOrder": fr["stage_order"],
                "stageEn": fr["stage_en"],
                "timingEn": fr["timing_en"],
                "fertilizerEn": fr["fertilizer_en"],
                "quantityPerAcre": fr["quantity_per_acre"],
                "applicationMethod": fr["application_method"],
            }
            for fr in fert_cursor.fetchall()
        ]

        # 4. Irrigation Rules
        irrig_cursor = conn.execute(
            """
            SELECT frequency_en, critical_stages_en,
                   runtime_per_zone, water_conserved, tips_en
            FROM irrigation_rules
            WHERE crop_id = ?;
            """,
            (crop_id,),
        )
        irrig_row = irrig_cursor.fetchone()
        irrigation: Optional[Dict[str, Any]] = None
        if irrig_row is not None:
            irrigation = {
                "frequencyEn": irrig_row["frequency_en"],
                "criticalStagesEn": irrig_row["critical_stages_en"],
                "runtimePerZone": irrig_row["runtime_per_zone"],
                "waterConserved": irrig_row["water_conserved"],
                "tipsEn": irrig_row["tips_en"],
            }

        # 5. Pests and Diseases
        pest_cursor = conn.execute(
            """
            SELECT id, name_en, symptoms_en,
                   control_en, severity, type
            FROM pests_diseases
            WHERE crop_id = ?
            ORDER BY id ASC;
            """,
            (crop_id,),
        )
        pests_diseases: List[Dict[str, Any]] = [
            {
                "id": pr["id"],
                "nameEn": pr["name_en"],
                "symptomsEn": pr["symptoms_en"],
                "controlEn": pr["control_en"],
                "severity": pr["severity"],
                "type": pr["type"],
            }
            for pr in pest_cursor.fetchall()
        ]

        # 6. Harvest Steps
        harvest_cursor = conn.execute(
            """
            SELECT step_order, letter, title_en, text_en
            FROM harvest_steps
            WHERE crop_id = ?
            ORDER BY step_order ASC;
            """,
            (crop_id,),
        )
        harvest_steps: List[Dict[str, Any]] = [
            {
                "stepOrder": hr["step_order"],
                "letter": hr["letter"],
                "titleEn": hr["title_en"],
                "textEn": hr["text_en"],
            }
            for hr in harvest_cursor.fetchall()
        ]

        # Build full composite dictionary
        summary = _row_to_crop_summary(crop_row, seasons, soils)
        summary.update(
            {
                "seedRate": crop_row["seed_rate"],
                "sowingDepth": crop_row["sowing_depth"],
                "spacing": crop_row["spacing"],
                "harvestingIndicator": crop_row["harvesting_indicator"],
                "introTipEn": crop_row["intro_tip_en"],
                "efficiencyGain": crop_row["efficiency_gain"],
                "micronutrientNote": crop_row["micronutrient_note"],
                "stagnationAlert": crop_row["stagnation_alert"],
                "fertilizerStages": fertilizer_stages,
                "irrigation": irrigation,
                "pestsDiseases": pests_diseases,
                "harvestSteps": harvest_steps,
            }
        )
        return summary
    finally:
        conn.close()


def list_states(db_path: Optional[str] = None) -> List[Dict[str, str]]:
    """Retrieve all Indian States and Union Territories with their agro-climatic regions.

    Args:
        db_path: Optional path to SQLite database. Defaults to Config.DATABASE_PATH.

    Returns:
        List[Dict[str, str]]: List of dictionaries containing 'name' and 'region'.
    """
    conn = get_connection(db_path)
    try:
        cursor = conn.execute("SELECT name, region FROM states ORDER BY name ASC;")
        rows = cursor.fetchall()
        return [{"name": r["name"], "region": r["region"]} for r in rows]
    finally:
        conn.close()
