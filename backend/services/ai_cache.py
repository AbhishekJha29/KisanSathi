"""In-memory TTL cache with LRU eviction for KisanSathi AI responses.

Provides deterministic SHA-256 cache key generation and thread-safe
caching for synthesized crop advisory explanations. Chat responses are
intentionally not cached. Contains pure Python logic with no Flask dependencies.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional


class AICache:
    """Thread-safe in-memory cache supporting TTL expiry and LRU eviction."""

    def __init__(self, max_size: int = 200, default_ttl_seconds: int = 3600) -> None:
        """Initialize the cache with maximum capacity and default TTL.

        Args:
            max_size: Maximum number of entries before oldest entries are evicted.
            default_ttl_seconds: Default time-to-live in seconds (default: 3600).
        """
        self._max_size: int = max_size
        self._default_ttl: int = default_ttl_seconds
        self._lock: threading.Lock = threading.Lock()
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()

    def get(self, key: str) -> Optional[Any]:
        """Retrieve an unexpired value from the cache.

        Args:
            key: Unique cache key string.

        Returns:
            Optional[Any]: Stored value, or None if missing or expired.
        """
        now: float = time.time()
        with self._lock:
            item = self._cache.get(key)
            if item is None:
                return None

            # Check expiration
            if item["expires_at"] <= now:
                del self._cache[key]
                return None

            # Mark as recently used by moving to the end
            self._cache.move_to_end(key)
            return item["value"]

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        """Store a value in the cache with a specified or default TTL.

        Args:
            key: Unique cache key string.
            value: Arbitrary value to cache (e.g. explanation dictionary or string).
            ttl_seconds: Optional custom TTL in seconds.
        """
        ttl: int = ttl_seconds if ttl_seconds is not None else self._default_ttl
        now: float = time.time()

        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)

            self._cache[key] = {
                "value": value,
                "expires_at": now + ttl,
            }

            # Enforce capacity by evicting oldest item
            while len(self._cache) > self._max_size:
                self._cache.popitem(last=False)

    def clear(self) -> None:
        """Clear all cached entries. Useful for testing."""
        with self._lock:
            self._cache.clear()


# Default singleton cache instance for application-wide use
default_cache: AICache = AICache()


def make_explanation_cache_key(form: Dict[str, Any]) -> str:
    """Generate a deterministic SHA-256 cache key from sorted form data.

    Args:
        form: Validated farmer advisory field parameters dictionary.

    Returns:
        str: Hex-encoded SHA-256 hash digest.
    """
    serialized_form: str = json.dumps(
        form,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(serialized_form.encode("utf-8")).hexdigest()


def get(key: str) -> Optional[Any]:
    """Retrieve an item from the default application cache.

    Args:
        key: Cache key string.

    Returns:
        Optional[Any]: Cached value or None.
    """
    return default_cache.get(key)


def set(key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
    """Store an item in the default application cache.

    Args:
        key: Cache key string.
        value: Value to store.
        ttl_seconds: Optional time-to-live in seconds.
    """
    default_cache.set(key, value, ttl_seconds=ttl_seconds)


def clear() -> None:
    """Reset the default application cache."""
    default_cache.clear()
