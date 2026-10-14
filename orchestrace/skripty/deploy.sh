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
VETEV=$(git rev-parse --abbrev-ref HEAD)
echo "== $(date -Is) deploy $CIL, větev $VETEV"
# Naživo jen main (na dev je K1, který na živou verzi nesmí).
[[ "$VETEV" == "main" ]] || { echo "/opt/opentify není na main ($VETEV) -- končím." >&2; exit 1; }

case "$CIL" in
  api)
    PRED=$(git rev-parse HEAD)
    # Testy nad novým main v dočasném worktree, NE po pullu: když selžou,
    # produkční checkout zůstane netknutý a nesouhlasil by s běžícím image.
    git fetch -q origin main
    TESTWT=$(mktemp -d)
    git worktree add -q --detach "$TESTWT" origin/main
    /opt/orchestrace/test.sh "$TESTWT" || { git worktree remove --force "$TESTWT"; echo "Testy selhaly – nic se nenasadilo." >&2; exit 1; }
    git worktree remove --force "$TESTWT"
    git merge --ff-only -q origin/main
    echo "commity: $PRED..$(git rev-parse HEAD)"
    docker compose exec -T api python -m app.tools.activity || true   # jen informace, kdo poslouchá
    docker compose build -q api worker
    docker compose run --rm --no-deps -T api python -m app.tools.announce_restart
    docker compose up -d api worker
    # Healthcheck: API na hostiteli 127.0.0.1:8000, do 60 s.
    for _ in $(seq 1 30); do
      curl -fsS -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1 && break
      sleep 2
    done
    curl -fsS -m 3 http://127.0.0.1:8000/health >/dev/null || {
      echo "API po nasazení neodpovídá na /health. Návrat: git checkout $PRED && docker compose build -q api worker && docker compose up -d api worker" >&2
      exit 1
    }
    docker compose ps api worker
    echo "Návrat při potížích: git checkout $PRED, build, up (pak zpět na main)."
    ;;
  web)
    # Pilot P1: artefakt z GitHub Actions (build webu z main). Vyžaduje gh na VM.
    RUN_ID="${2:?Pro web zadej run-id workflow s buildem}"
    TMP=$(mktemp -d)
    gh run download "$RUN_ID" -n web-build -D "$TMP"
    [[ -f "$TMP/index.html" ]] || { echo "Artefakt neobsahuje index.html" >&2; exit 1; }
    # Web se servíruje i předkomprimovaný (gzip_static): workflow musí udělat
    # gzip -kf9 na js/json/wasm/html/css/otf/ttf a vynechat *.map. Pojistka:
    [[ -f "$TMP/main.dart.js.gz" ]] || find "$TMP" -type f \( -name "*.js" -o -name "*.json" -o -name "*.wasm" -o -name "*.html" -o -name "*.css" -o -name "*.otf" -o -name "*.ttf" \) ! -name "*.gz" -exec gzip -kf9 {} \;
    find "$TMP" -name "*.map" -delete
    BACKUP="client/build/web.prev-$(date +%Y%m%d-%H%M)"
    [[ -d client/build/web ]] && cp -a client/build/web "$BACKUP"
    rsync -a --delete "$TMP"/ client/build/web/
    rm -rf "$TMP"
    echo "Předchozí verze webu: $APP/$BACKUP (návrat: rsync -a --delete $BACKUP/ client/build/web/)"
    ;;
  *) echo "Neznámý cíl: $CIL" >&2; exit 1 ;;
esac

echo "== hotovo – teď ověřit (healthcheck/tester) a teprve pak stav 'ověřeno'"
