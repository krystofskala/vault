from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def sha256_file(path: Path, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()
