"""Acquisition worker placeholder — konzumuje ProvisioningJob frontu z Redis.

Skutečná implementace (MediaProvider plugins, transkódování, zápis
MediaAsset) přijde v implementační fázi; toto je jen spustitelná kostra
pro docker-compose sketch.
"""

import os
import time

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")


def main() -> None:
    client = redis.Redis.from_url(REDIS_URL)
    print(f"[worker] connected to {REDIS_URL}, waiting for jobs...")
    while True:
        time.sleep(5)


if __name__ == "__main__":
    main()
