#!/usr/bin/env bash
# Spustí testy OpenTify pro worktree v aktuální složce (nebo zadané jako $1).
# Patří na opentify-vm do /opt/orchestrace/test.sh.
#
# Podle runbooku (sekce Testy): kód backendu Z WORKTREE se zabalí, nakopíruje
# do běžícího kontejneru api do vlastní složky a pytest běží s testovací SQLite
# a Redis db 14. Nikdy produkční DB ani Redis db 0.
#
# Pozor: závislosti jsou z běžícího image api. Když worktree mění
# requirements, testy to nepoznají -- napsat to do zprávy úkolu.
set -euo pipefail
WT="${1:-$PWD}"
APP=/opt/opentify                       # tady je docker compose s kontejnerem api
LOCK=/var/lock/opentify-tests.lock      # Redis db 14 je jedna -- testy po jednom
RUN="be-$(date +%s)-$$"

[[ -d "$WT/backend/app" && -d "$WT/backend/tests" ]] || { echo "V $WT chybí backend/app nebo backend/tests" >&2; exit 2; }

exec 8>"$LOCK"
flock -w 900 8 || { echo "Jiné testy běží přes 15 min -- končím." >&2; exit 1; }

TGZ=$(mktemp --suffix=.tgz)
trap 'rm -f "$TGZ"; cd "$APP" && docker compose exec -T api rm -rf "/tmp/$RUN" "/tmp/$RUN.tgz" >/dev/null 2>&1 || true' EXIT
tar czf "$TGZ" -C "$WT/backend" app tests

cd "$APP"
docker compose cp "$TGZ" "api:/tmp/$RUN.tgz" >/dev/null
# pytest v image není (smaže se při každém nasazení) -- doinstalovat tiše.
docker compose exec -T api sh -c "
  set -e
  mkdir -p /tmp/$RUN && tar xzf /tmp/$RUN.tgz -C /tmp/$RUN
  python -c 'import pytest, pytest_asyncio, httpx' 2>/dev/null || pip install -q pytest pytest-asyncio httpx >/dev/null 2>&1
  cd /tmp/$RUN
  env -u TASTE_MODEL DATABASE_URL=sqlite:////tmp/$RUN/test.db NTFY_URL= OPENTIFY_PUBLIC_URL= \
      REDIS_URL=redis://redis:6379/14 python -m pytest -q -p no:warnings tests
"
