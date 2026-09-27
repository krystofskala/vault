"""Acquisition worker — konzumuje ProvisioningJob frontu z Redis Streams
a pohání stavový automat: PENDING -> RUNNING -> AVAILABLE | FAILED.

Proč čisté asyncio + Redis Streams a ne Celery: jediná externí závislost,
kterou stejně potřebujeme (Redis, kvůli pub/sub do WS vrstvy), a Streams
s consumer groups dávají at-least-once delivery, ACK a crash recovery
(XAUTOCLAIM) bez dalšího message brokeru. Horizontální škálování je
`docker compose up --scale worker=N` — každý proces má vlastní
CONSUMER_NAME, takže si zprávy nekonkurují.

DB operace jsou schválně sync (SQLModel/SQLite) a volané přes
`asyncio.to_thread`, aby neblokovaly event loop, ve kterém běží zbytek
smyčky (čekání na Redis, publikování eventů).
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
from pathlib import Path

from sqlmodel import Session

from app.db import engine, init_db
from app.events import publish_job_progress, publish_track_available
from app.models import (
    MediaAsset,
    MediaAssetStatus,
    ProvisioningJob,
    ProvisioningJobStatus,
    Recording,
)
from app.providers import PlaceholderProvider
from app.redis_bus import PROVISIONING_GROUP, PROVISIONING_STREAM, get_redis
from app.utils import sha256_file, utcnow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vault.worker")

MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", "/data/media"))
CONSUMER_NAME = f"worker-{socket.gethostname()}-{os.getpid()}"
CLAIM_IDLE_MS = 60_000  # zprávy visící > 60s u mrtvého konzumenta se přeberou
BLOCK_MS = 5_000

provider = PlaceholderProvider()


# ---------------------------------------------------------------------
# Sync DB pomocníci (volané přes asyncio.to_thread)
# ---------------------------------------------------------------------


def _start_job(job_id: str) -> dict | None:
    with Session(engine) as session:
        job = session.get(ProvisioningJob, job_id)
        if job is None:
            return None
        if job.status in (ProvisioningJobStatus.SUCCEEDED, ProvisioningJobStatus.CANCELLED):
            return {"skip": True}

        asset = session.get(MediaAsset, job.recording_id)
        recording = session.get(Recording, job.recording_id)

        job.status = ProvisioningJobStatus.RUNNING
        job.attempts += 1
        job.started_at = utcnow()
        asset.status = MediaAssetStatus.DOWNLOADING
        session.add(job)
        session.add(asset)
        session.commit()

        return {
            "skip": False,
            "user_id": job.requested_by_user_id,
            "recording_id": job.recording_id,
            "recording_title": recording.title if recording else "",
            "attempts": job.attempts,
            "max_attempts": job.max_attempts,
        }


def _finish_success(
    job_id: str, storage_path: str, checksum: str, size: int, source_provider: str
) -> str:
    with Session(engine) as session:
        job = session.get(ProvisioningJob, job_id)
        asset = session.get(MediaAsset, job.recording_id)

        job.status = ProvisioningJobStatus.SUCCEEDED
        job.finished_at = utcnow()

        asset.status = MediaAssetStatus.AVAILABLE
        asset.storage_path = storage_path
        asset.checksum_sha256 = checksum
        asset.filesize_bytes = size
        asset.source_provider = source_provider
        asset.last_error = None
        asset.updated_at = utcnow()

        session.add(job)
        session.add(asset)
        session.commit()
        return f"/api/v1/tracks/{job.recording_id}/stream"


def _finish_failure(job_id: str, error_message: str, attempts: int, max_attempts: int) -> bool:
    """Vrátí True = job se má zopakovat (zpět na PENDING + requeue),
    False = definitivně FAILED (attempts vyčerpány)."""
    with Session(engine) as session:
        job = session.get(ProvisioningJob, job_id)
        asset = session.get(MediaAsset, job.recording_id)

        job.error_message = error_message[:2000]
        job.finished_at = utcnow()

        if attempts < max_attempts:
            job.status = ProvisioningJobStatus.PENDING
            asset.status = MediaAssetStatus.QUEUED
            retry = True
        else:
            job.status = ProvisioningJobStatus.FAILED
            asset.status = MediaAssetStatus.FAILED
            asset.last_error = error_message[:2000]
            retry = False

        session.add(job)
        session.add(asset)
        session.commit()
        return retry


# ---------------------------------------------------------------------
# Async zpracování zpráv z streamu
# ---------------------------------------------------------------------


async def ensure_group(r) -> None:
    try:
        await r.xgroup_create(PROVISIONING_STREAM, PROVISIONING_GROUP, id="0", mkstream=True)
    except Exception as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def handle_message(r, message_id: str, fields: dict) -> None:
    job_id = fields.get("job_id")
    if not job_id:
        logger.warning("zpráva %s bez job_id, ACKnuto a zahozeno", message_id)
        await r.xack(PROVISIONING_STREAM, PROVISIONING_GROUP, message_id)
        return

    try:
        ctx = await asyncio.to_thread(_start_job, job_id)
        if ctx is None:
            logger.warning("job %s nenalezen v DB, ACKnuto a zahozeno", job_id)
            return
        if ctx["skip"]:
            return  # už vyřešeno dřívějším pokusem / duplicitní doručení

        await publish_job_progress(ctx["user_id"], job_id, ProvisioningJobStatus.RUNNING.value, pct=0)

        dest_path = MEDIA_ROOT / f"{ctx['recording_id']}.audio"

        async def on_progress(pct: int) -> None:
            await publish_job_progress(
                ctx["user_id"], job_id, ProvisioningJobStatus.RUNNING.value, pct=pct
            )

        try:
            candidate = await provider.resolve(ctx["recording_id"], ctx["recording_title"])
            if candidate is None:
                raise RuntimeError("žádný provider nenašel zdroj pro tuto skladbu")

            await provider.fetch(candidate, dest_path, on_progress)
            checksum = await asyncio.to_thread(sha256_file, dest_path)
            size = dest_path.stat().st_size

            stream_url = await asyncio.to_thread(
                _finish_success, job_id, str(dest_path), checksum, size, candidate.source_provider
            )
            await publish_job_progress(
                ctx["user_id"], job_id, ProvisioningJobStatus.SUCCEEDED.value, pct=100
            )
            await publish_track_available(ctx["user_id"], ctx["recording_id"], stream_url)

        except Exception as exc:  # noqa: BLE001 - chceme zachytit *cokoliv* z providera
            logger.exception(
                "provisioning jobu %s selhalo (pokus %s/%s)", job_id, ctx["attempts"], ctx["max_attempts"]
            )
            should_retry = await asyncio.to_thread(
                _finish_failure, job_id, str(exc), ctx["attempts"], ctx["max_attempts"]
            )
            final_status = (
                ProvisioningJobStatus.PENDING.value if should_retry else ProvisioningJobStatus.FAILED.value
            )
            await publish_job_progress(ctx["user_id"], job_id, final_status, pct=None)
            if should_retry:
                await r.xadd(PROVISIONING_STREAM, {"job_id": job_id})
    finally:
        # ACKujeme vždy — úspěch, definitivní FAILED i retry (ten dostal
        # nové message id přes XADD výše), aby stejná zpráva nebyla
        # doručena znovu.
        await r.xack(PROVISIONING_STREAM, PROVISIONING_GROUP, message_id)


async def reclaim_stale(r) -> None:
    try:
        _cursor, claimed, _deleted = await r.xautoclaim(
            PROVISIONING_STREAM,
            PROVISIONING_GROUP,
            CONSUMER_NAME,
            min_idle_time=CLAIM_IDLE_MS,
            start_id="0-0",
            count=10,
        )
    except Exception:
        logger.exception("xautoclaim selhal")
        return
    for message_id, fields in claimed:
        await handle_message(r, message_id, fields)


async def main() -> None:
    init_db()
    r = get_redis()
    await ensure_group(r)
    logger.info("worker %s startuje, poslouchá stream %s", CONSUMER_NAME, PROVISIONING_STREAM)

    await reclaim_stale(r)

    while True:
        resp = await r.xreadgroup(
            PROVISIONING_GROUP,
            CONSUMER_NAME,
            {PROVISIONING_STREAM: ">"},
            count=10,
            block=BLOCK_MS,
        )
        if not resp:
            await reclaim_stale(r)
            continue
        for _stream_name, messages in resp:
            for message_id, fields in messages:
                await handle_message(r, message_id, fields)


if __name__ == "__main__":
    asyncio.run(main())
