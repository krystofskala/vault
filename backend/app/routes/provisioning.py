"""REST routy pro provisioning flow — implementace `/tracks/{id}/provision`,
`/jobs/{id}` a `/tracks/{id}/stream` z docs/openapi.yaml."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.auth import get_current_user
from app.db import get_session
from app.models import MediaAsset, MediaAssetStatus, ProvisioningJob
from app.provisioning_service import enqueue, get_or_create_job, stream_url_for

tracks_router = APIRouter(prefix="/tracks", tags=["provisioning"])
jobs_router = APIRouter(prefix="/jobs", tags=["provisioning"])


@tracks_router.post("/{recording_id}/provision")
async def provision_track(
    recording_id: str,
    response: Response,
    session: Session = Depends(get_session),
    current: tuple[str, str] = Depends(get_current_user),
):
    user_id, device_id = current
    try:
        asset, job, created = get_or_create_job(session, recording_id, user_id, device_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="recording nenalezen v katalogu")

    if job is None:
        # MediaAsset už AVAILABLE -> žádný job, rovnou stream (HTTP 200)
        response.status_code = 200
        return {
            "recordingId": recording_id,
            "status": asset.status.value,
            "streamUrl": stream_url_for(recording_id),
            "job": None,
        }

    if created:
        # Nově založený job -> publikuj na frontu. Při opakovaném volání
        # (created == False, job už PENDING/RUNNING) se nic nepublikuje
        # znovu — to je jádro idempotence tohoto endpointu.
        await enqueue(job)

    response.status_code = 202
    return {
        "recordingId": recording_id,
        "status": asset.status.value,
        "streamUrl": None,
        "job": job.model_dump(mode="json"),
    }


@jobs_router.get("/{job_id}")
def get_job(job_id: str, session: Session = Depends(get_session)):
    job = session.get(ProvisioningJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job nenalezen")
    return job.model_dump(mode="json")


@tracks_router.get("/{recording_id}/stream")
def stream_track(recording_id: str, session: Session = Depends(get_session)):
    asset = session.get(MediaAsset, recording_id)
    if asset is None or asset.status != MediaAssetStatus.AVAILABLE or not asset.storage_path:
        raise HTTPException(
            status_code=409,
            detail="skladba zatím není AVAILABLE, zavolej nejdřív POST /provision",
        )
    path = Path(asset.storage_path)
    if not path.exists():
        raise HTTPException(status_code=409, detail="soubor chybí na disku i přes AVAILABLE stav")
    return FileResponse(path)
