"""Pytest global configuration and fixtures for KisanSathi backend tests."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Generator

import pytest

# Ensure project root is present on sys.path
_PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.services.ai_cache import reset_for_tests as reset_ai_cache_for_tests
from backend.services.rate_limiter import reset_for_tests as reset_rate_limiter_for_tests


@pytest.fixture(autouse=True, scope="function")
def autouse_reset_rate_limiter_and_cache() -> Generator[None, None, None]:
    """Function-scoped autouse fixture to isolate rate limiting and AI cache between tests."""
    reset_rate_limiter_for_tests()
    reset_ai_cache_for_tests()
    yield
    reset_rate_limiter_for_tests()
    reset_ai_cache_for_tests()
