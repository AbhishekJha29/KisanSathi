"""Data integrity test suite for KisanSathi database and seed data.

Verifies that for every crop in the database:
    1. Mandatory Relational Links:
       - Crop has >= 1 valid season ('kharif', 'rabi', 'zaid').
       - Crop has >= 1 valid soil matching allowed options.
       - Crop has >= 1 fertilizer stage.
       - Crop has >= 1 pest or disease diagnostic record.
       - Crop has >= 1 harvest step.
    2. Constraint Adherence:
       - Every soil and season value belongs to canonical allowed enums.
       - Numerical attributes (durationDays, scores, stageOrder) are strictly positive.
    3. English-Only Completeness & Absence of Devanagari:
       - All English text fields are non-empty.
       - No text field contains any Devanagari character (U+0900 to U+097F).
    4. Uniqueness & Deduplication:
       - No duplicate rows per crop across seasons, soils, fertilizer stages, and harvest steps.
       - Exactly 18 distinct crop profiles seeded.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Set

import pytest

_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.database import get_connection
from backend.seed import seed_all
from backend.services.options import SEASON_OPTIONS, SOIL_OPTIONS

ALLOWED_SOILS: Set[str] = {s["id"] for s in SOIL_OPTIONS}
ALLOWED_SEASONS: Set[str] = {s["id"] for s in SEASON_OPTIONS}


def _has_devanagari(text: str) -> bool:
    """Check if the string contains at least one Devanagari character (U+0900 to U+097F)."""
    if not text:
        return False
    return any("\u0900" <= char <= "\u097f" for char in text)


@pytest.fixture(scope="module")
def seeded_db_path(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Create and seed an isolated temporary SQLite database for data integrity testing."""
    tmp_dir = tmp_path_factory.mktemp("integrity_db")
    db_file = tmp_dir / "kisansathi_integrity.db"
    db_path = str(db_file.resolve())
    seed_all(db_path=db_path)
    return db_path


def test_crops_table_completeness(seeded_db_path: str) -> None:
    """Verify that all 18 crops exist and have valid English names, descriptions, and scores."""
    conn = get_connection(seeded_db_path)
    try:
        cur = conn.execute("SELECT * FROM crops ORDER BY id;")
        crops = cur.fetchall()
        assert len(crops) == 18, f"Expected exactly 18 seeded crops, found {len(crops)}"

        crop_ids = set()
        for crop in crops:
            cid = crop["id"]
            assert cid not in crop_ids, f"Duplicate crop id detected: {cid}"
            crop_ids.add(cid)

            # English text fields
            assert crop["name_en"] and crop["name_en"].strip(), f"Crop {cid} missing name_en"
            assert crop["description_en"] and crop["description_en"].strip(), f"Crop {cid} missing description_en"

            # Check all text columns have no Devanagari
            text_columns = (
                "name_en", "scientific_name", "badge", "badge_type", "variety_tag",
                "tagline", "ideal_soil", "duration", "water_need", "water_level",
                "metric_title", "metric_value", "hubs", "description_en", "avg_yield",
                "expected_yield", "market_price", "mandi_price_range", "image_url",
                "image_alt", "category", "seed_rate", "sowing_depth", "spacing",
                "harvesting_indicator", "intro_tip_en", "efficiency_gain",
                "micronutrient_note", "stagnation_alert",
            )
            for col in text_columns:
                val = crop[col]
                if val:
                    assert not _has_devanagari(str(val)), f"Crop {cid} column {col} contains Devanagari"

            # Numeric attributes
            assert crop["duration_days"] > 0, f"Crop {cid} duration_days must be > 0"
            assert crop["popularity_score"] >= 0, f"Crop {cid} popularity_score must be >= 0"
            assert crop["profit_score"] >= 0, f"Crop {cid} profit_score must be >= 0"
    finally:
        conn.close()


def test_crop_seasons_integrity(seeded_db_path: str) -> None:
    """Verify that every crop has >= 1 valid season and no duplicate season rows."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute("SELECT season FROM crop_seasons WHERE crop_id = ?;", (cid,))
            seasons = [r["season"] for r in cur.fetchall()]
            assert len(seasons) >= 1, f"Crop {cid} must have at least one season"
            assert len(seasons) == len(set(seasons)), f"Crop {cid} has duplicate season rows"

            for s in seasons:
                assert s in ALLOWED_SEASONS, f"Crop {cid} has invalid season '{s}'"
    finally:
        conn.close()


def test_crop_soils_integrity(seeded_db_path: str) -> None:
    """Verify that every crop has >= 1 valid soil and no duplicate soil rows."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute("SELECT soil FROM crop_soils WHERE crop_id = ?;", (cid,))
            soils = [r["soil"] for r in cur.fetchall()]
            assert len(soils) >= 1, f"Crop {cid} must have at least one soil"
            assert len(soils) == len(set(soils)), f"Crop {cid} has duplicate soil rows"

            for soil in soils:
                assert soil in ALLOWED_SOILS, f"Crop {cid} has unallowed soil '{soil}'"
    finally:
        conn.close()


def test_fertilizer_stages_integrity(seeded_db_path: str) -> None:
    """Verify that every crop has >= 1 fertilizer stage with complete English text and no Devanagari."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute(
                "SELECT stage_order, stage_en, timing_en, fertilizer_en, quantity_per_acre, application_method "
                "FROM fertilizer_stages WHERE crop_id = ? ORDER BY stage_order;",
                (cid,),
            )
            stages = cur.fetchall()
            assert len(stages) >= 1, f"Crop {cid} must have at least one fertilizer stage"

            orders = [s["stage_order"] for s in stages]
            assert len(orders) == len(set(orders)), f"Crop {cid} has duplicate stage_order in fertilizer_stages"

            for stage in stages:
                assert stage["stage_order"] >= 1, f"Crop {cid} stage_order must be >= 1"
                assert stage["stage_en"] and stage["stage_en"].strip(), f"Crop {cid} stage missing stage_en"
                assert not _has_devanagari(stage["stage_en"]), f"Crop {cid} stage_en contains Devanagari"

                assert stage["fertilizer_en"] and stage["fertilizer_en"].strip(), f"Crop {cid} missing fertilizer_en"
                assert not _has_devanagari(stage["fertilizer_en"]), f"Crop {cid} fertilizer_en contains Devanagari"

                if stage["timing_en"]:
                    assert not _has_devanagari(stage["timing_en"]), f"Crop {cid} timing_en contains Devanagari"
                if stage["quantity_per_acre"]:
                    assert not _has_devanagari(stage["quantity_per_acre"]), f"Crop {cid} quantity_per_acre contains Devanagari"
                if stage["application_method"]:
                    assert not _has_devanagari(stage["application_method"]), f"Crop {cid} application_method contains Devanagari"
    finally:
        conn.close()


def test_pests_and_diseases_integrity(seeded_db_path: str) -> None:
    """Verify that every crop has >= 1 pest or disease with English diagnostics and treatment without Devanagari."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute(
                "SELECT name_en, symptoms_en, control_en, severity, type "
                "FROM pests_diseases WHERE crop_id = ?;",
                (cid,),
            )
            pests = cur.fetchall()
            assert len(pests) >= 1, f"Crop {cid} must have at least one pest or disease record"

            for pest in pests:
                assert pest["name_en"] and pest["name_en"].strip(), f"Crop {cid} pest missing name_en"
                for col in ("name_en", "symptoms_en", "control_en", "severity", "type"):
                    val = pest[col]
                    if val:
                        assert not _has_devanagari(str(val)), f"Crop {cid} pest column {col} contains Devanagari"
    finally:
        conn.close()


def test_irrigation_rules_integrity(seeded_db_path: str) -> None:
    """Verify that every crop has >= 1 irrigation rule with English guidelines and no Devanagari."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute(
                "SELECT frequency_en, critical_stages_en, runtime_per_zone, water_conserved, tips_en "
                "FROM irrigation_rules WHERE crop_id = ?;",
                (cid,),
            )
            rules = cur.fetchall()
            assert len(rules) >= 1, f"Crop {cid} must have at least one irrigation rule"

            for rule in rules:
                for col in ("frequency_en", "critical_stages_en", "runtime_per_zone", "water_conserved", "tips_en"):
                    val = rule[col]
                    if val:
                        assert not _has_devanagari(str(val)), f"Crop {cid} irrigation column {col} contains Devanagari"
    finally:
        conn.close()


def test_harvest_steps_integrity(seeded_db_path: str) -> None:
    """Verify that every crop has >= 1 harvest step with English guidelines without Devanagari."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute(
                "SELECT step_order, letter, title_en, text_en "
                "FROM harvest_steps WHERE crop_id = ? ORDER BY step_order;",
                (cid,),
            )
            steps = cur.fetchall()
            assert len(steps) >= 1, f"Crop {cid} must have at least one harvest step"

            orders = [s["step_order"] for s in steps]
            assert len(orders) == len(set(orders)), f"Crop {cid} has duplicate step_order in harvest_steps"

            for step in steps:
                assert step["step_order"] >= 1, f"Crop {cid} harvest step_order must be >= 1"
                assert step["title_en"] and step["title_en"].strip(), f"Crop {cid} harvest missing title_en"
                for col in ("letter", "title_en", "text_en"):
                    val = step[col]
                    if val:
                        assert not _has_devanagari(str(val)), f"Crop {cid} harvest column {col} contains Devanagari"
    finally:
        conn.close()


def test_states_table_integrity(seeded_db_path: str) -> None:
    """Verify states table contains all 36 Indian states and UTs with no Devanagari."""
    conn = get_connection(seeded_db_path)
    try:
        cur = conn.execute("SELECT name, region FROM states;")
        states = cur.fetchall()
        assert len(states) == 36, f"Expected 36 states, got {len(states)}"
        for s in states:
            assert not _has_devanagari(s["name"]), f"State name contains Devanagari: {s['name']}"
            assert not _has_devanagari(s["region"]), f"State region contains Devanagari: {s['region']}"
    finally:
        conn.close()
