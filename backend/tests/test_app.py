"""Tests for application factory auto-seeding and Vercel configuration.

Covers:
    1. create_app() against an empty temp database seeds it automatically (crop count > 0).
    2. create_app() against a schema-initialized empty database seeds it automatically.
    3. create_app() seeding failure logs ERROR with logger.exception and keeps starting up.
    4. Config uses /tmp/kisansathi.db when VERCEL is set and DATABASE_PATH is not (monkeypatch + reload).
    5. Config preserves explicit DATABASE_PATH when VERCEL is set.
    6. Config local behavior is unchanged when VERCEL is not set.
"""
from __future__ import annotations

import importlib
import logging
import sys
from pathlib import Path
from typing import Any

import pytest
from flask import Flask

# Ensure project root is present on sys.path
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import backend.config
from backend.app import create_app
from backend.database import get_connection, init_db


def test_create_app_auto_seeds_empty_database(tmp_path: Path) -> None:
    """Test that create_app() against an empty temp database seeds it automatically (crop count > 0)."""
    db_file = tmp_path / "empty_kisansathi.db"
    db_path_str = str(db_file.resolve())

    # Ensure file does not exist initially
    assert not db_file.exists()

    # Create app with DATABASE_PATH pointing to empty temp db
    app = create_app(
        config_overrides={
            "DATABASE_PATH": db_path_str,
            "TESTING": True,
        }
    )

    # Verify that crops table was seeded and crop count > 0
    conn = get_connection(db_path_str)
    try:
        cursor = conn.execute("SELECT COUNT(*) AS cnt FROM crops;")
        row = cursor.fetchone()
        crop_count = row["cnt"] if row else 0
        assert crop_count > 0
        assert crop_count == 18

        # Also verify states were seeded
        cursor = conn.execute("SELECT COUNT(*) AS cnt FROM states;")
        row = cursor.fetchone()
        state_count = row["cnt"] if row else 0
        assert state_count == 36
    finally:
        conn.close()

    # Verify /api/health probe succeeds
    client = app.test_client()
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.is_json
    assert res.get_json()["database"] == "connected"


def test_create_app_seeds_pre_initialized_empty_database(tmp_path: Path) -> None:
    """Test that create_app() against an initialized database with empty crops table seeds it."""
    db_file = tmp_path / "preinit_empty.db"
    db_path_str = str(db_file.resolve())

    # Initialize tables only (crops table will have 0 rows)
    init_db(db_path_str)
    conn = get_connection(db_path_str)
    try:
        cursor = conn.execute("SELECT COUNT(*) AS cnt FROM crops;")
        assert cursor.fetchone()["cnt"] == 0
    finally:
        conn.close()

    # Calling create_app should detect 0 crops and auto-seed
    app = create_app(
        config_overrides={
            "DATABASE_PATH": db_path_str,
            "TESTING": True,
        }
    )

    conn = get_connection(db_path_str)
    try:
        cursor = conn.execute("SELECT COUNT(*) AS cnt FROM crops;")
        crop_count = cursor.fetchone()["cnt"]
        assert crop_count > 0
        assert crop_count == 18
    finally:
        conn.close()


def test_create_app_seeding_failure_logs_error_and_keeps_starting(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Test that if seeding fails, an ERROR is logged with logger.exception and app keeps starting up."""
    db_file = tmp_path / "fail_seed.db"
    db_path_str = str(db_file.resolve())

    def _mock_failing_seed(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("Simulated seed disk failure")

    monkeypatch.setattr("backend.app.seed_all", _mock_failing_seed)

    # create_app should not raise an unhandled exception
    with caplog.at_level(logging.ERROR):
        app = create_app(
            config_overrides={
                "DATABASE_PATH": db_path_str,
                "TESTING": True,
            }
        )

    # Verify that app started up and is a valid Flask instance
    assert isinstance(app, Flask)

    # Verify that an ERROR was logged with exception info
    error_records = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(error_records) >= 1
    assert any("seed" in r.message.lower() for r in error_records)
    assert any(r.exc_info is not None for r in error_records)


def test_config_uses_tmp_db_when_vercel_set_and_database_path_not(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that Config uses /tmp/kisansathi.db when VERCEL is set and DATABASE_PATH is not."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("DATABASE_PATH", raising=False)

    try:
        importlib.reload(backend.config)
        assert backend.config.Config.DATABASE_PATH == "/tmp/kisansathi.db"
    finally:
        # Restore environment and reload backend.config to original state
        monkeypatch.undo()
        importlib.reload(backend.config)


def test_config_preserves_explicit_database_path_when_vercel_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that Config uses explicit DATABASE_PATH even when VERCEL is set."""
    custom_db = "/custom/path/to/custom.db"
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("DATABASE_PATH", custom_db)

    try:
        importlib.reload(backend.config)
        assert backend.config.Config.DATABASE_PATH == custom_db
    finally:
        monkeypatch.undo()
        importlib.reload(backend.config)


def test_config_local_behavior_unchanged_when_vercel_not_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Test that local behavior defaults to local kisansathi.db when VERCEL is not set."""
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("DATABASE_PATH", raising=False)

    try:
        importlib.reload(backend.config)
        assert "/tmp/kisansathi.db" not in backend.config.Config.DATABASE_PATH
        assert backend.config.Config.DATABASE_PATH.endswith("kisansathi.db")
    finally:
        monkeypatch.undo()
        importlib.reload(backend.config)
