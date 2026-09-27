"""API Gateway placeholder — endpoints se doplní podle docs/openapi.yaml."""

import os

from fastapi import FastAPI

app = FastAPI(title="Vault API", version="0.1.0")

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:////data/db/vault.db")
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "/data/media")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
