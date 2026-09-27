"""SQLModel entity pro provisioning jádro.

`Recording` je zde jen minimální placeholder (id + title) — plná verze
s vazbou na Artist/Release přijde spolu s Catalog Service. Provisioning
logika na jejím obsahu nezávisí, potřebuje jen existující `recording_id`.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.utils import utcnow


def new_uuid() -> str:
    return str(uuid.uuid4())


class MediaAssetStatus(str, enum.Enum):
    MISSING = "MISSING"
    QUEUED = "QUEUED"
    DOWNLOADING = "DOWNLOADING"
    TRANSCODING = "TRANSCODING"
    AVAILABLE = "AVAILABLE"
    FAILED = "FAILED"


class ProvisioningJobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Recording(SQLModel, table=True):
    id: str = Field(default_factory=new_uuid, primary_key=True)
    title: str


class MediaAsset(SQLModel, table=True):
    """1:1 s Recording — popisuje stav dat *na disku*, ne stav práce k nim vedoucí."""

    recording_id: str = Field(foreign_key="recording.id", primary_key=True)
    status: MediaAssetStatus = Field(default=MediaAssetStatus.MISSING)
    storage_path: str | None = None
    format: str | None = None
    bitrate_kbps: int | None = None
    filesize_bytes: int | None = None
    checksum_sha256: str | None = None
    source_provider: str | None = None
    last_error: str | None = None
    updated_at: datetime = Field(default_factory=utcnow)


class ProvisioningJob(SQLModel, table=True):
    """Popisuje stav *práce* vedoucí k obstarání — odděleně od MediaAsset,
    aby retry/attempts nekomplikovaly stav "je to přehratelné?"."""

    id: str = Field(default_factory=new_uuid, primary_key=True)
    recording_id: str = Field(foreign_key="recording.id", index=True)
    requested_by_user_id: str
    requested_by_device_id: str | None = None
    priority: int = 0
    status: ProvisioningJobStatus = Field(default=ProvisioningJobStatus.PENDING)
    attempts: int = 0
    max_attempts: int = 3
    created_at: datetime = Field(default_factory=utcnow, index=True)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None
