"""Configuration module for KisanSathi backend application.

Loads environment variables using python-dotenv and defines the Config class
with sensible defaults for local development and production serving.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv

# Base paths calculated relative to this configuration file
_BACKEND_DIR: Path = Path(__file__).resolve().parent
_PROJECT_ROOT: Path = _BACKEND_DIR.parent

# Load environment variables at import time
# Root .env is loaded first, then backend/.env (if present)
load_dotenv(_PROJECT_ROOT / ".env")
load_dotenv(_BACKEND_DIR / ".env")


def _parse_bool(value: Optional[str], default: bool = False) -> bool:
    """Safely parse boolean values from environment variable strings.

    Args:
        value: The string representation of a boolean flag (e.g. 'true', 'false').
        default: Fallback boolean value when the input is None or empty.

    Returns:
        bool: Parsed boolean value.
    """
    if value is None:
        return default
    cleaned: str = value.strip().lower()
    if cleaned in ("true", "1", "yes", "t", "y"):
        return True
    if cleaned in ("false", "0", "no", "f", "n"):
        return False
    return default


class Config:
    """Application configuration settings loaded from environment variables."""

    # Server port (default: 8000)
    PORT: int = int(os.getenv("PORT", "8000"))

    # Debug mode flag (default: False for security when env var is omitted)
    DEBUG: bool = _parse_bool(os.getenv("DEBUG"), default=False)

    # Allowed CORS origins (default: http://localhost:3000)
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")

    # Request body size limit in bytes (default: 64 KB = 65,536 bytes)
    MAX_CONTENT_LENGTH: int = int(os.getenv("MAX_CONTENT_LENGTH", str(64 * 1024)))

    # Advisory generation rate limit per minute per IP (default: 60)
    ADVISORY_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("ADVISORY_RATE_LIMIT_PER_MINUTE", "60"))

    # Path to SQLite database file (default: backend/data/kisansathi.db computed relative to this file)
    _default_db: Path = (_BACKEND_DIR / "data" / "kisansathi.db").resolve()
    _env_db: Optional[str] = os.getenv("DATABASE_PATH")
    if _env_db:
        _db_path = Path(_env_db)
        DATABASE_PATH: str = str((_PROJECT_ROOT / _db_path).resolve() if not _db_path.is_absolute() else _db_path)
    else:
        DATABASE_PATH: str = str(_default_db)

    # Path to frontend dist folder, computed as an absolute path relative to this file
    # Default is the 'dist' directory at the project root.
    # If the root dist folder does not exist but frontend/dist exists, fall back to frontend/dist.
    _default_dist: Path = _PROJECT_ROOT / "dist"
    if not _default_dist.exists() and (_PROJECT_ROOT / "frontend" / "dist").exists():
        _default_dist = _PROJECT_ROOT / "frontend" / "dist"

    FRONTEND_DIST: str = os.getenv("FRONTEND_DIST", str(_default_dist.resolve()))

    # Gemini AI configuration settings
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    AI_TIMEOUT_SECONDS: int = int(os.getenv("AI_TIMEOUT_SECONDS", "15"))
    AI_RATE_LIMIT_PER_MINUTE: int = int(os.getenv("AI_RATE_LIMIT_PER_MINUTE", "10"))
    AI_CACHE_TTL_SECONDS: int = int(os.getenv("AI_CACHE_TTL_SECONDS", "3600"))

    @classmethod
    def get_allowed_origins(cls) -> List[str]:
        """Return CORS allowed origins as a parsed list of origin strings.

        Returns:
            List[str]: List of origin URLs allowed to make cross-origin requests.
        """
        return [origin.strip() for origin in cls.ALLOWED_ORIGINS.split(",") if origin.strip()]
