"""Database initialization, connection management, and schema definition for KisanSathi.

Uses the Python standard library sqlite3 with foreign key enforcement and row_factory Row.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional

from backend.config import Config

# Complete relational database schema for KisanSathi
SCHEMA_SQL = """
-- 1. Main Crops Table
-- Stores scalar agronomic metadata and descriptions in English.
CREATE TABLE IF NOT EXISTS crops (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    scientific_name TEXT,
    badge TEXT,
    badge_type TEXT,
    variety_tag TEXT,
    tagline TEXT,
    ideal_soil TEXT,
    duration TEXT,
    water_need TEXT,
    water_level TEXT,
    metric_title TEXT,
    metric_value TEXT,
    hubs TEXT,
    description_en TEXT,
    avg_yield TEXT,
    expected_yield TEXT,
    market_price TEXT,
    mandi_price_range TEXT,
    image_url TEXT,
    image_alt TEXT,
    category TEXT,
    popularity_score INTEGER DEFAULT 0,
    profit_score INTEGER DEFAULT 0,
    duration_days INTEGER DEFAULT 0,
    seed_rate TEXT,
    sowing_depth TEXT,
    spacing TEXT,
    harvesting_indicator TEXT,
    intro_tip_en TEXT,
    efficiency_gain TEXT,
    micronutrient_note TEXT,
    stagnation_alert TEXT
);

-- 2. Crop Seasons Junction Table
-- Relates each crop to one or more suitable cropping cycles ('kharif', 'rabi', 'zaid').
CREATE TABLE IF NOT EXISTS crop_seasons (
    crop_id TEXT NOT NULL,
    season TEXT NOT NULL CHECK(season IN ('kharif', 'rabi', 'zaid')),
    PRIMARY KEY (crop_id, season),
    FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
);

-- 3. Crop Soils Junction Table
-- Relates each crop to suitable soil types (e.g. 'loamy', 'alluvial', 'black', etc.).
CREATE TABLE IF NOT EXISTS crop_soils (
    crop_id TEXT NOT NULL,
    soil TEXT NOT NULL,
    PRIMARY KEY (crop_id, soil),
    FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
);

-- 4. Fertilizer Stages Table
-- Nutritional split-dose recommendations across crop growth milestones.
CREATE TABLE IF NOT EXISTS fertilizer_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_id TEXT NOT NULL,
    stage_order INTEGER NOT NULL,
    stage_en TEXT NOT NULL,
    timing_en TEXT,
    fertilizer_en TEXT NOT NULL,
    quantity_per_acre TEXT,
    application_method TEXT,
    FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
);

-- 5. Irrigation Rules Table
-- Stage-by-stage water requirement and micro-irrigation advice.
CREATE TABLE IF NOT EXISTS irrigation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_id TEXT NOT NULL,
    frequency_en TEXT,
    critical_stages_en TEXT,
    runtime_per_zone TEXT,
    water_conserved TEXT,
    tips_en TEXT,
    FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
);

-- 6. Pests and Diseases Table
-- Diagnostic symptoms and mitigation remedies for crop ailments.
CREATE TABLE IF NOT EXISTS pests_diseases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_id TEXT NOT NULL,
    name_en TEXT NOT NULL,
    symptoms_en TEXT,
    control_en TEXT,
    severity TEXT,
    type TEXT CHECK(type IN ('pest', 'disease')),
    FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
);

-- 7. Harvest Steps Table
-- Post-maturity handling, grain conditioning, and yield recovery instructions.
CREATE TABLE IF NOT EXISTS harvest_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crop_id TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    letter TEXT,
    title_en TEXT NOT NULL,
    text_en TEXT NOT NULL,
    FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
);

-- 8. States and Agro-Climatic Regions Table
-- Maps Indian States and Union Territories to national agro-climatic zones.
CREATE TABLE IF NOT EXISTS states (
    name TEXT PRIMARY KEY,
    region TEXT NOT NULL CHECK(region IN ('North', 'South', 'East', 'West', 'Central', 'North-East', 'Himalayan', 'National'))
);

-- Indexes on foreign key columns for fast relational lookups
CREATE INDEX IF NOT EXISTS idx_crop_seasons_crop_id ON crop_seasons(crop_id);
CREATE INDEX IF NOT EXISTS idx_crop_soils_crop_id ON crop_soils(crop_id);
CREATE INDEX IF NOT EXISTS idx_fertilizer_stages_crop_id ON fertilizer_stages(crop_id);
CREATE INDEX IF NOT EXISTS idx_irrigation_rules_crop_id ON irrigation_rules(crop_id);
CREATE INDEX IF NOT EXISTS idx_pests_diseases_crop_id ON pests_diseases(crop_id);
CREATE INDEX IF NOT EXISTS idx_harvest_steps_crop_id ON harvest_steps(crop_id);
"""


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Open and return a configured SQLite database connection.

    Ensures the parent directory exists, row_factory is set to sqlite3.Row for
    column access by name, and foreign key constraints are enforced.

    Args:
        db_path: Path to SQLite database file. Defaults to Config.DATABASE_PATH.

    Returns:
        sqlite3.Connection: Active database connection.
    """
    path_str: str = db_path if db_path is not None else Config.DATABASE_PATH
    db_file: Path = Path(path_str)

    # Ensure target directory exists
    db_file.parent.mkdir(parents=True, exist_ok=True)

    conn: sqlite3.Connection = sqlite3.connect(str(db_file))
    conn.row_factory = sqlite3.Row
    # Foreign keys must be explicitly enabled per connection in SQLite
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def db_session(db_path: Optional[str] = None) -> Generator[sqlite3.Connection, None, None]:
    """Context manager for atomic transactional database operations.

    Commits on successful block execution, rolls back upon any uncaught exception,
    and guarantees connection closure in all scenarios.

    Args:
        db_path: Path to database file. Defaults to Config.DATABASE_PATH.

    Yields:
        sqlite3.Connection: Active transactional connection.
    """
    conn: sqlite3.Connection = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize database tables and indexes using SCHEMA_SQL.

    Idempotent operation using CREATE TABLE IF NOT EXISTS.

    Args:
        db_path: Path to database file. Defaults to Config.DATABASE_PATH.
    """
    with db_session(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
