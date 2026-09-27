"""REST routy pro globální katalog — `/catalog/*` z docs/openapi.yaml.

Tenká vrstva: veškerá logika (MB/Deezer, cache, upsert, availability) žije
v `app.catalog.service.CatalogService`, routy jen validují vstup a mapují
`None`/prázdný výsledek na 404.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.auth import get_current_user
from app.catalog.deezer import DeezerClient, get_deezer_client
from app.catalog.musicbrainz import MusicBrainzClient, get_musicbrainz_client
from app.catalog.service import CatalogService
from app.db import get_session

catalog_router = APIRouter(prefix="/catalog", tags=["catalog"])


def get_catalog_service(
    session: Session = Depends(get_session),
    mb_client: MusicBrainzClient = Depends(get_musicbrainz_client),
    dz_client: DeezerClient = Depends(get_deezer_client),
) -> CatalogService:
    return CatalogService(session, mb_client, dz_client)


@catalog_router.get("/search")
async def search_catalog(
    q: str = Query(..., min_length=1),
    type: str | None = Query(default=None, alias="type", pattern="^(artist|release|recording)$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    service: CatalogService = Depends(get_catalog_service),
    _current=Depends(get_current_user),
):
    return await service.search(q, type, limit, offset)


@catalog_router.get("/artists/{artist_id}")
async def get_artist(
    artist_id: str,
    service: CatalogService = Depends(get_catalog_service),
    _current=Depends(get_current_user),
):
    artist = await service.get_artist(artist_id)
    if artist is None:
        raise HTTPException(status_code=404, detail="interpret nenalezen")
    return artist.model_dump(by_alias=True)


@catalog_router.get("/artists/{artist_id}/discography")
async def get_discography(
    artist_id: str,
    release_type: str | None = Query(
        default=None, alias="releaseType", pattern="^(album|ep|single|compilation)$"
    ),
    service: CatalogService = Depends(get_catalog_service),
    _current=Depends(get_current_user),
):
    discography = await service.get_discography(artist_id, release_type)
    if discography is None:
        raise HTTPException(status_code=404, detail="interpret nenalezen")
    return discography.model_dump(by_alias=True)


@catalog_router.get("/releases/{release_id}")
async def get_release(
    release_id: str,
    service: CatalogService = Depends(get_catalog_service),
    _current=Depends(get_current_user),
):
    release = await service.get_release(release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="album nenalezen")
    return release.model_dump(by_alias=True)


@catalog_router.get("/releases/{release_id}/tracks")
async def get_release_tracks(
    release_id: str,
    service: CatalogService = Depends(get_catalog_service),
    _current=Depends(get_current_user),
):
    tracks = await service.get_release_tracks(release_id)
    if tracks is None:
        raise HTTPException(status_code=404, detail="album nenalezen")
    return [t.model_dump(by_alias=True) for t in tracks]
