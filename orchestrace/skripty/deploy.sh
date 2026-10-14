#!/usr/bin/env bash
# Nasazení OpenTify. Patří na opentify-vm do /opt/orchestrace/deploy.sh.
# Spouští JEN orchestrátor a JEN po Kryštofově schválení:
#   ssh opentify-vm /opt/orchestrace/deploy.sh api
#   ssh opentify-vm /opt/orchestrace/deploy.sh web <run-id>
# Zámek zajistí, že dva deploye nepoběží naráz (API restart odpojí všechny posluchače).
set -euo pipefail

CIL="${1:?Použití: deploy.sh api|web [run-id]}"
APP=/opt/opentify
LOCK=/var/lock/opentify-deploy.lock

exec 9>"$LOCK"
flock -n 9 || { echo "Jiný deploy právě běží – končím." >&2; exit 1; }

cd "$APP"
echo "== $(date -Is) deploy $CIL, větev $(git rev-parse --abbrev-ref HEAD)"

case "$CIL" in
  api)
    git pull --ff-only
    /opt/orchestrace/test.sh "$APP"          # testy musí projít před nasazením
    docker compose build -q api worker
    docker compose run --rm --no-deps -T api python -m app.tools.announce_restart
    docker compose up -d api worker
    sleep 10
    docker compose ps api worker
    ;;
  web)
    # Pilot P1: artefakt z GitHub Actions (build webu z main). Vyžaduje gh na VM.
    RUN_ID="${2:?Pro web zadej run-id workflow s buildem}"
    TMP=$(mktemp -d)
    gh run download "$RUN_ID" -n web-build -D "$TMP"
    [[ -f "$TMP/index.html" ]] || { echo "Artefakt neobsahuje index.html" >&2; exit 1; }
    BACKUP="client/build/web.prev-$(date +%Y%m%d-%H%M)"
    [[ -d client/build/web ]] && cp -a client/build/web "$BACKUP"
    rsync -a --delete "$TMP"/ client/build/web/
    rm -rf "$TMP"
    echo "Předchozí verze webu: $APP/$BACKUP (návrat: rsync -a --delete $BACKUP/ client/build/web/)"
    ;;
  *) echo "Neznámý cíl: $CIL" >&2; exit 1 ;;
esac

echo "== hotovo – teď ověřit (healthcheck/tester) a teprve pak stav 'ověřeno'"
