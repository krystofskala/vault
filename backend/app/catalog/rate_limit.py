"""Jednoduchý async rate limiter — serializuje volání na jedno externí API na
max. 1 request / `min_interval` napříč celým procesem (ne per-request lock),
protože limity jako MusicBrainz (1 req/s pro anonymní přístup, jinak dočasný
ban IP) platí globálně na proces, ne na jednotlivé handlery.
"""

from __future__ import annotations

import asyncio
import time


class AsyncRateLimiter:
    def __init__(self, min_interval_seconds: float) -> None:
        self._min_interval = min_interval_seconds
        self._lock = asyncio.Lock()
        self._last_call = 0.0

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_call
            if elapsed < self._min_interval:
                await asyncio.sleep(self._min_interval - elapsed)
            self._last_call = time.monotonic()
