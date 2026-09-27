"""Redis cache pro syrové odpovědi z externích metadatových API.

Cílem je hlavně respektovat rate limity (MusicBrainz/Deezer) — opakovaný
dotaz na stejného interpreta/album během TTL okna nesahá ven vůbec. Sdílí
Redis instanci s provisioning frontou (app/redis_bus.py), jen ve vlastním
klíčovém prostoru.
"""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from app.redis_bus import get_redis

CACHE_PREFIX = "vault:catalog:cache:"


async def cached_json(
    key: str, ttl_seconds: int, fetch: Callable[[], Awaitable[Any]]
) -> Any:
    r = get_redis()
    cache_key = CACHE_PREFIX + key
    cached = await r.get(cache_key)
    if cached is not None:
        return json.loads(cached)

    value = await fetch()
    await r.set(cache_key, json.dumps(value), ex=ttl_seconds)
    return value
