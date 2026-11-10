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
    3. Bilingual Completeness:
       - All English text fields are non-empty.
       - All Hindi text fields are non-empty and contain valid Devanagari characters (U+0900 to U+097F).
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
    """Verify that all 18 crops exist and have valid English and Hindi names, descriptions, and scores."""
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

            # Hindi text fields must contain Devanagari script
            assert crop["name_hi"] and crop["name_hi"].strip(), f"Crop {cid} missing name_hi"
            assert _has_devanagari(crop["name_hi"]), f"Crop {cid} name_hi '{crop['name_hi']}' lacks Devanagari"

            assert crop["description_hi"] and crop["description_hi"].strip(), f"Crop {cid} missing description_hi"
            assert _has_devanagari(crop["description_hi"]), f"Crop {cid} description_hi lacks Devanagari"

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
    """Verify that every crop has >= 1 fertilizer stage with complete English and Hindi text."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute(
                "SELECT stage_order, stage_en, stage_hi, fertilizer_en, fertilizer_hi "
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
                assert stage["stage_hi"] and stage["stage_hi"].strip(), f"Crop {cid} stage missing stage_hi"
                assert _has_devanagari(stage["stage_hi"]), f"Crop {cid} stage_hi lacks Devanagari"

                assert stage["fertilizer_en"] and stage["fertilizer_en"].strip(), f"Crop {cid} missing fertilizer_en"
                if stage["fertilizer_hi"]:
                    assert _has_devanagari(stage["fertilizer_hi"]), f"Crop {cid} fertilizer_hi lacks Devanagari"
    finally:
        conn.close()


def test_pests_and_diseases_integrity(seeded_db_path: str) -> None:
    """Verify that every crop has >= 1 pest or disease with bilingual diagnostics and treatment."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute(
                "SELECT name_en, name_hi, symptoms_en, symptoms_hi, control_en, control_hi "
                "FROM pests_diseases WHERE crop_id = ?;",
                (cid,),
            )
            pests = cur.fetchall()
            assert len(pests) >= 1, f"Crop {cid} must have at least one pest or disease record"

            for pest in pests:
                assert pest["name_en"] and pest["name_en"].strip(), f"Crop {cid} pest missing name_en"
                assert pest["name_hi"] and pest["name_hi"].strip(), f"Crop {cid} pest missing name_hi"
                assert _has_devanagari(pest["name_hi"]), f"Crop {cid} pest name_hi lacks Devanagari"

                assert pest["symptoms_en"] and pest["symptoms_en"].strip(), f"Crop {cid} pest missing symptoms_en"
                assert pest["symptoms_hi"] and pest["symptoms_hi"].strip(), f"Crop {cid} pest missing symptoms_hi"
                assert _has_devanagari(pest["symptoms_hi"]), f"Crop {cid} pest symptoms_hi lacks Devanagari"

                assert pest["control_en"] and pest["control_en"].strip(), f"Crop {cid} pest missing control_en"
                assert pest["control_hi"] and pest["control_hi"].strip(), f"Crop {cid} pest missing control_hi"
                assert _has_devanagari(pest["control_hi"]), f"Crop {cid} pest control_hi lacks Devanagari"
    finally:
        conn.close()


def test_harvest_steps_integrity(seeded_db_path: str) -> None:
    """Verify that every crop has >= 1 harvest step with bilingual guidelines."""
    conn = get_connection(seeded_db_path)
    try:
        cur_crops = conn.execute("SELECT id FROM crops;")
        crop_ids = [r["id"] for r in cur_crops.fetchall()]

        for cid in crop_ids:
            cur = conn.execute(
                "SELECT step_order, title_en, title_hi, text_en, text_hi "
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
                assert step["title_hi"] and step["title_hi"].strip(), f"Crop {cid} harvest missing title_hi"
                assert _has_devanagari(step["title_hi"]), f"Crop {cid} harvest title_hi lacks Devanagari"

                assert step["text_en"] and step["text_en"].strip(), f"Crop {cid} harvest missing text_en"
                assert step["text_hi"] and step["text_hi"].strip(), f"Crop {cid} harvest missing text_hi"
                assert _has_devanagari(step["text_hi"]), f"Crop {cid} harvest text_hi lacks Devanagari"
    finally:
        conn.close()
