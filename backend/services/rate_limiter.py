"""Thread-safe in-memory sliding-window rate limiter for KisanSathi services.

Tracks request timestamps per client identifier (such as IP address)
and enforces sliding-window rate limits with automatic memory cleanup.
Contains pure Python logic with no Flask dependencies.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, Optional


class SlidingWindowRateLimiter:
    """Thread-safe sliding-window rate limiter backed by deques of timestamps."""

    def __init__(self, max_tracked_keys: int = 1000) -> None:
        """Initialize the rate limiter with a mutex lock and storage dictionary.

        Args:
            max_tracked_keys: Threshold of tracked keys before global prune runs.
        """
        self._lock: threading.Lock = threading.Lock()
        self._requests: Dict[str, Deque[float]] = {}
        self._max_tracked_keys: int = max_tracked_keys

    def allow(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        """Check whether a request is permitted under the sliding-window limit.

        Args:
            key: Unique request identifier (e.g. client IP or user token).
            limit: Maximum allowed requests within the time window.
            window_seconds: Time window duration in seconds (default: 60).

        Returns:
            bool: True if the request is allowed, False if the limit is exceeded.
        """
        now: float = time.time()
        window_start: float = now - window_seconds

        with self._lock:
            # Retrieve or initialize deque for this key
            timestamps = self._requests.get(key)
            if timestamps is None:
                timestamps = deque()
                self._requests[key] = timestamps

            # Evict timestamps outside the active sliding window
            while timestamps and timestamps[0] <= window_start:
                timestamps.popleft()

            # Global periodic cleanup if tracked keys exceed limit
            if len(self._requests) > self._max_tracked_keys:
                self._prune_expired_locked(window_start)

            # Check capacity
            if len(timestamps) < limit:
                timestamps.append(now)
                return True

            return False

    def _prune_expired_locked(self, cutoff_time: float) -> None:
        """Remove keys whose timestamps have all expired beyond the cutoff.

        Must be called while self._lock is acquired.

        Args:
            cutoff_time: Timestamp before which entries are considered expired.
        """
        stale_keys = [
            k for k, dq in self._requests.items()
            if not dq or dq[-1] <= cutoff_time
        ]
        for k in stale_keys:
            self._requests.pop(k, None)

    def reset(self) -> None:
        """Clear all stored rate limit history. Useful for unit testing."""
        with self._lock:
            self._requests.clear()


# Default singleton rate limiter instance for application-wide use
default_limiter: SlidingWindowRateLimiter = SlidingWindowRateLimiter()


def allow(key: str, limit: int, window_seconds: int = 60) -> bool:
    """Convenience helper to check rate limits against the default limiter.

    Args:
        key: Unique request identifier (e.g. client IP).
        limit: Maximum allowed requests within the window.
        window_seconds: Duration of the sliding window in seconds (default: 60).

    Returns:
        bool: True if request is allowed, False if limit is exceeded.
    """
    return default_limiter.allow(key, limit, window_seconds)


def reset() -> None:
    """Reset the default application rate limiter state."""
    default_limiter.reset()


def reset_for_tests() -> None:
    """Reset the default application rate limiter state for tests."""
    default_limiter.reset()

