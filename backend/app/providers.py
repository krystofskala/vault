"""MediaProvider rozhraní — jediné místo, kde by měla sedět znalost o tom,
odkud se soubor fyzicky bere. Worker (app/worker.py) na konkrétním
provideru nezávisí, jen na tomto protokolu.

`PlaceholderProvider` je čistě vývojová náhrada: nesahá nikam ven, jen
simuluje zpoždění a zapíše syntetická data, aby šel celý pipeline
(PENDING -> RUNNING -> AVAILABLE, progress eventy, checksum) end-to-end
odzkoušet bez závislosti na reálném zdroji. Konkrétní produkční
implementace (vlastní mirror, licencovaný zdroj apod.) je mimo scope
tohoto sketche.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable, Protocol

ProgressCallback = Callable[[int], Awaitable[None]]


@dataclass
class ProviderCandidate:
    source_provider: str
    source_ref: str


class MediaProvider(Protocol):
    async def resolve(self, recording_id: str, title: str) -> ProviderCandidate | None: ...

    async def fetch(
        self,
        candidate: ProviderCandidate,
        dest_path: Path,
        on_progress: ProgressCallback,
    ) -> None: ...


class PlaceholderProvider:
    async def resolve(self, recording_id: str, title: str) -> ProviderCandidate | None:
        return ProviderCandidate(source_provider="placeholder", source_ref=recording_id)

    async def fetch(
        self,
        candidate: ProviderCandidate,
        dest_path: Path,
        on_progress: ProgressCallback,
    ) -> None:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        steps = 5
        tmp_path = dest_path.with_suffix(dest_path.suffix + ".part")
        with open(tmp_path, "wb") as f:
            for i in range(steps):
                await asyncio.sleep(0.2)
                f.write(b"\x00" * 4096)  # syntetická data, ne validní audio
                await on_progress(int((i + 1) / steps * 100))
        tmp_path.replace(dest_path)
