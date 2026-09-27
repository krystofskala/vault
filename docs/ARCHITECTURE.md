# Vault — architektura osobního hudebního systému

Soukromý, multiplatformní hudební systém: Flutter klient (iOS/Android/Windows/Linux/Web) +
Dockerizovaný server. Jeden uživatel / malý okruh důvěryhodných zařízení, žádná veřejná registrace.

## 1. Principy

- **Hybridní katalog** — UI nerozlišuje "co mám" a "co existuje". Vše je `Track`/`Release`/`Artist`
  s příznakem dostupnosti; chybějící položka je jen jiný stav, ne jiná obrazovka.
- **Server je zdroj pravdy** pro stav přehrávání a frontu — klienti jsou tenké renderery stavu.
- **Asynchronní obstarávání** je oddělené od API vrstvy frontou úloh, aby request na "přehraj"
  nikdy neblokoval na síťovém stahování.
- **Pluggable providers** — externí zdroje metadat (MusicBrainz, Deezer) i zdroje médií jsou
  za rozhraním, aby šly zaměnit/rozšířit bez zásahu do zbytku systému.

## 2. Komponenty backendu

```
                        ┌─────────────────────┐
                        │   Flutter клиенти    │
                        └─────────┬───────────┘
                                  │ REST + WS (JWT)
                        ┌─────────▼───────────┐
                        │      API Gateway     │  (FastAPI/NestJS)
                        └───┬─────────┬───────┘
             ┌──────────────┘         └───────────────┐
   ┌─────────▼─────────┐                    ┌─────────▼─────────┐
   │  Catalog Service    │                    │ Realtime Hub (WS) │
   │ (local index +      │                    │  + Redis pub/sub  │
   │  MB/Deezer proxy)    │                    └─────────┬─────────┘
   └─────────┬─────────┘                                │
             │ enqueue                                  │ events
   ┌─────────▼─────────┐   jobs   ┌────────────────┐     │
   │ Provisioning        ├────────►  Queue (Redis   │     │
   │ Orchestrator         │        │  Streams/RQ)   │     │
   └─────────┬─────────┘   └───────┬────────┘     │
             │                             │              │
   ┌─────────▼─────────┐   ┌───────▼────────┐             │
   │ Acquisition Workers │   │ Recommendation │◄────────────┘
   │ (provider plugins)  │   │ Service (LB)   │
   └─────────┬─────────┘   └────────────────┘
             │
   ┌─────────▼─────────┐
   │  Storage (disk) +   │
   │  Postgres + Redis    │
   └────────────────────┘
```

| Služba | Zodpovědnost |
|---|---|
| **API Gateway** | AuthN/Z, REST endpoints, routing na interní služby |
| **Catalog Service** | Sjednocené vyhledávání: lokální index (Postgres) + MusicBrainz + Deezer, cache výsledků |
| **Provisioning Orchestrator** | Přijímá požadavky na chybějící média, vytváří `ProvisioningJob`, hlídá stavový automat |
| **Acquisition Workers** | Vykonávají job přes pluggable `MediaProvider` rozhraní, zapisují soubor + metadata |
| **Recommendation Service** | Klient k lokální instanci ListenBrainz, generuje/obnovuje doporučené playlisty |
| **Realtime Hub** | WebSocket server, drží playback-state a frontu, broadcast mezi zařízeními jednoho uživatele |
| **Storage** | Postgres (metadata, stav), Redis (cache, pub/sub, playback state), disk/NAS (audio soubory) |

## 3. Datový model

### 3.1 Katalogové entity (metadata — z MusicBrainz/Deezer, cachované lokálně)

```
Artist
  id (uuid, pk)
  mbid (musicbrainz id, unique, nullable)
  deezer_id (nullable)
  name
  sort_name
  images: jsonb            -- [{url, source, size}]
  external_refs: jsonb      -- {"musicbrainz": "...", "deezer": "..."}
  updated_at

Release            -- album/EP/single
  id (uuid, pk)
  mbid (nullable)
  artist_id -> Artist
  title
  release_date
  release_type          -- album|ep|single|compilation
  images: jsonb
  external_refs: jsonb

Recording          -- "track" jako abstraktní hudební dílo
  id (uuid, pk)
  mbid (nullable)
  release_id -> Release
  artist_id -> Artist       -- primární interpret (feat. řešeno přes join table)
  title
  duration_ms
  isrc (nullable)
  track_number
  external_refs: jsonb
```

### 3.2 Lokální dostupnost média

```
MediaAsset
  id (uuid, pk)
  recording_id -> Recording (1:1, i když technicky by šlo 1:N variant/bitrate)
  status: enum(MISSING, QUEUED, DOWNLOADING, TRANSCODING, AVAILABLE, FAILED)
  storage_path (nullable dokud not AVAILABLE)
  format (flac|mp3|opus...)
  bitrate_kbps
  filesize_bytes
  checksum_sha256
  source_provider (nullable) -- odkud bylo obstaráno
  last_error (nullable)
  updated_at

ProvisioningJob
  id (uuid, pk)
  recording_id -> Recording
  requested_by_user_id
  requested_by_device_id
  priority (int)
  status: enum(PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED)
  attempts (int)
  created_at / started_at / finished_at
  error_message (nullable)
```

`MediaAsset.status` a `ProvisioningJob.status` jsou záměrně oddělené: asset popisuje *stav dat na
disku*, job popisuje *stav práce, která k tomu vede*. Job může selhat a być retry created znovu,
zatímco asset zůstává jediným zdrojem pravdy o tom, co je opravdu přehratelné.

### 3.3 Playlisty a doporučení

```
Playlist
  id (uuid, pk)
  owner_user_id
  title
  kind: enum(USER, GENERATED_RECOMMENDATION, RADIO)
  source: nullable          -- "listenbrainz:daily-jams" apod. pro generated
  generated_at (nullable)
  is_pinned

PlaylistItem
  id (uuid, pk)
  playlist_id -> Playlist
  recording_id -> Recording   -- vždy odkaz do katalogu, i když MediaAsset chybí
  position
  added_at

ListenEvent (scrobble)
  id (uuid, pk)
  user_id
  device_id
  recording_id -> Recording
  played_at
  ms_played
  submitted_to_listenbrainz (bool)
```

### 3.4 Real-time stav přehrávání

```
PlaybackSession                      -- 1 na uživatele (ne na zařízení!)
  user_id (pk)
  active_device_id
  current_recording_id (nullable)
  position_ms
  is_playing (bool)
  repeat_mode / shuffle
  queue: [ { recording_id, position } ]
  version (monotonic int, pro konflikty)
  updated_at

Device
  id (uuid, pk)
  user_id
  name
  platform (ios|android|windows|linux|web)
  last_seen_at
  push_token (nullable, pro budoucí notifikace)
```

`PlaybackSession` žije primárně v Redis (rychlý read/write, TTL na `updated_at`) a periodicky/at
change se persistuje do Postgres, aby přežila restart serveru.

## 4. REST API

Base: `/api/v1`, auth: `Authorization: Bearer <JWT>` (device-scoped token).

### 4.1 Katalog

```
GET /catalog/search?q=&type=artist|release|recording&limit=
  -> unifikovaný výsledek, merguje lokální DB + MusicBrainz + Deezer
  -> každá položka nese { ...metadata, availability: "available"|"provisionable"|"unavailable" }

GET /catalog/artists/{artistId}
GET /catalog/artists/{artistId}/discography
  -> kompletní diskografie z MusicBrainz (cache-first, refresh on TTL expiry)

GET /catalog/releases/{releaseId}
GET /catalog/releases/{releaseId}/tracks
```

### 4.2 Skladby a provisioning

```
GET  /tracks/{recordingId}
  -> detail + MediaAsset.status

POST /tracks/{recordingId}/provision
  -> idempotentní: pokud MediaAsset.status == AVAILABLE, rovnou vrátí stream URL
  -> jinak vytvoří/najde existující ProvisioningJob a vrátí { jobId, status }
  -> klient dál poslouchá WS event `track.available`, REST je jen trigger + fallback polling

GET  /jobs/{jobId}
  -> status jobu (fallback pro klienty bez aktivního WS spojení)

GET  /tracks/{recordingId}/stream
  -> pouze pokud AVAILABLE; signed/expiring URL nebo range-request proxy na soubor
```

### 4.3 Playlisty a doporučení

```
GET    /playlists
POST   /playlists
GET    /playlists/{id}
POST   /playlists/{id}/items
DELETE /playlists/{id}/items/{itemId}

GET /recommendations/discover
GET /recommendations/daily-jams
  -> volá lokální ListenBrainz instanci, resolvuje doporučené recordings do katalogu
     (stejná availability logika jako všude jinde)

POST /scrobble
  -> zapíše ListenEvent, asynchronně přepošle do ListenBrainz
```

### 4.4 Playback (REST fallback k WS)

```
GET  /playback/state
POST /playback/state          -- celý replace (device claiming "active")
PATCH /playback/state         -- částečná změna (seek, play/pause)
```

## 5. Asynchronní Media Provisioning — flow

1. Klient zavolá `POST /tracks/{id}/provision`.
2. API zkontroluje `MediaAsset.status`:
   - `AVAILABLE` → rovnou vrátí stream info, konec.
   - `QUEUED`/`DOWNLOADING` → vrátí existující job, žádná duplicita.
   - `MISSING`/`FAILED` → vytvoří `ProvisioningJob(status=PENDING)`, publikne na frontu.
3. Worker z fronty vezme job, přes `MediaProvider` rozhraní (viz níže) sežene zdrojová data,
   transkóduje/normalizuje, zapíše na disk, spočítá checksum.
4. Worker atomicky nastaví `MediaAsset.status = AVAILABLE` + `storage_path`, `ProvisioningJob.status = SUCCEEDED`.
5. Worker publikne event `track.available` do Realtime Hubu → ten ho pošle všem WS klientům
   uživatele, kteří o daný `recordingId` projevili zájem (frontа/playlist ho obsahuje).
6. Klient dostane event, znovu zavolá `stream` endpoint (nebo dostane rovnou signed URL v eventu).

```python
class MediaProvider(Protocol):
    def resolve(self, recording: Recording) -> ProviderCandidate | None: ...
    def fetch(self, candidate: ProviderCandidate, dest_path: Path) -> FetchResult: ...
```

Konkrétní implementace providerů (lokální rip, vlastní NAS mirror, licencovaný zdroj apod.) jsou
záměrně mimo scope tohoto dokumentu — architektura na nich nezávisí, jen na rozhraní.

## 6. WebSocket protokol

`wss://.../ws?token=<device_jwt>` — jedno spojení na zařízení, kanál je vždy scoped na `user_id`.

**Server → klient:**

```jsonc
{ "type": "playback.state", "payload": { ...PlaybackSession } }
{ "type": "queue.updated", "payload": { "queue": [...] , "version": 42 } }
{ "type": "track.available", "payload": { "recordingId": "...", "streamUrl": "..." } }
{ "type": "job.progress", "payload": { "jobId": "...", "status": "DOWNLOADING", "pct": 40 } }
```

**Klient → server:**

```jsonc
{ "type": "playback.play", "payload": { "recordingId": "...", "positionMs": 0 } }
{ "type": "playback.pause" }
{ "type": "playback.seek", "payload": { "positionMs": 12345 } }
{ "type": "queue.set", "payload": { "queue": [...], "expectedVersion": 41 } }
{ "type": "device.claim_active" }
```

**Konflikty:** `PlaybackSession.version` je monotonic counter. Klient posílá `expectedVersion`;
server odmítne (a pošle aktuální stav) při mismatch — jednoduché optimistic locking místo CRDT,
dostatečné pro "pár zařízení jednoho člověka".

## 7. Nasazení (Docker Compose)

```
services:
  api:        # FastAPI/Nest — REST + WS
  worker:     # acquisition + transcoding, škáluje horizontálně
  postgres:
  redis:      # cache, pub/sub, playback state
  reverse-proxy:  # Caddy/Traefik, TLS, doporučeno jen přes VPN/Tailscale, ne veřejně
volumes:
  media-library: (bind mount na disk/NAS)
```

## 8. Otevřené otázky k další iteraci

1. OpenAPI schema (formální) — vygenerovat z výše uvedeného, jakmile se ustálí tvar odpovědí.
2. Transkódovací politika (uchovávat originál + streamovací kopie, nebo jen jednu kvalitu?).
3. Multi-user do budoucna, nebo natvrdo single-user (ovlivňuje, zda `PlaybackSession` klíčovat
   podle `user_id` nebo rovnou `device_id`).
4. Konkrétní `MediaProvider` implementace a jejich legální rámec — mimo scope architektury.
