"""Minimální realtime hub: WS endpoint + Redis pub/sub listener.

Předává eventy publikované workerem (`job.progress`, `track.available`,
viz app/events.py) na WS spojení daného uživatele. Plný WS protokol
(playback.state, queue.set/queue.conflict...) je popsaný v
docs/asyncapi.yaml — sem patří zatím jen tolik, kolik je potřeba k
end-to-end odzkoušení provisioning flow; zpracování klientských zpráv
(playback.*, queue.set) je další krok.
"""

from __future__ import annotations

import logging

from fastapi import WebSocket, WebSocketDisconnect

from app.redis_bus import get_redis

logger = logging.getLogger("vault.realtime")


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        conns = self._connections.get(user_id)
        if conns:
            conns.discard(ws)
            if not conns:
                self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, message: str) -> None:
        for ws in list(self._connections.get(user_id, ())):
            try:
                await ws.send_text(message)
            except Exception:
                logger.exception("odeslání na WS selhalo, odpojuji klienta")
                self.disconnect(user_id, ws)


manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket, user_id: str) -> None:
    await manager.connect(user_id, websocket)
    try:
        while True:
            # TODO: parsovat playback.play/pause/seek a queue.set podle
            # docs/asyncapi.yaml; zatím jen držíme spojení otevřené.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)


async def redis_listener() -> None:
    r = get_redis()
    pubsub = r.pubsub()
    await pubsub.psubscribe("vault:events:user:*")
    logger.info("realtime hub poslouchá Redis pub/sub")
    async for message in pubsub.listen():
        if message["type"] != "pmessage":
            continue
        channel: str = message["channel"]
        user_id = channel.rsplit(":", 1)[-1]
        await manager.send_to_user(user_id, message["data"])
