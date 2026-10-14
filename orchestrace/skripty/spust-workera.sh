#!/usr/bin/env bash
# Spustí workera pro jeden úkol na opentify-vm. Volá orchestrátor na Fedoře:
#   skripty/spust-workera.sh 8i
# Worker dostane čistý kontext, vlastní worktree a větev ukol/<ID> z origin/dev.
set -euo pipefail

ID="${1:?Použití: spust-workera.sh <ID>}"
TREZOR="${TREZOR:-$HOME/Obsidian/jojojo}"
UKOLY="$TREZOR/claude/orchestrace/ukoly"
VM="${VM:-opentify-vm}"
DEV_REPO="${DEV_REPO:-/srv/opentify-dev}"      # vývojový klon na VM, NE produkční /opt/opentify
WT_ROOT="${WT_ROOT:-/srv/opentify-wt}"
LOGDIR="$HOME/orchestrace-log"
mkdir -p "$LOGDIR"

shopt -s nullglob
soubory=("$UKOLY/$ID"-*.md)
[[ ${#soubory[@]} -eq 1 ]] || { echo "Nenašel jsem jednoznačně úkol $ID v $UKOLY" >&2; exit 1; }
UKOL="${soubory[0]}"

stav=$(sed -n 's/^stav:[[:space:]]*\([^ #]*\).*/\1/p' "$UKOL" | head -1)
model=$(sed -n 's/^model:[[:space:]]*\([^ #]*\).*/\1/p' "$UKOL" | head -1)
model="${model:-opus}"
case "$stav" in
  schváleno|rozpracováno|návrh) ;;
  *) echo "Úkol $ID je ve stavu '$stav' – worker se spouští jen pro návrh/schváleno/rozpracováno." >&2; exit 1 ;;
esac

LOG="$LOGDIR/$ID-$(date +%Y%m%d-%H%M).txt"

# Připrav worktree (opakované spuštění pokračuje na stejné větvi).
ssh "$VM" bash -s -- "$ID" "$DEV_REPO" "$WT_ROOT" <<'EOF'
set -euo pipefail
ID="$1"; DEV_REPO="$2"; WT_ROOT="$3"; WT="$WT_ROOT/$ID"
git -C "$DEV_REPO" fetch -q origin
if [[ ! -d "$WT" ]]; then
  if git -C "$DEV_REPO" show-ref -q --verify "refs/remotes/origin/ukol/$ID"; then
    git -C "$DEV_REPO" worktree add -q "$WT" -B "ukol/$ID" "origin/ukol/$ID"
  else
    git -C "$DEV_REPO" worktree add -q "$WT" -B "ukol/$ID" origin/dev
  fi
fi
EOF

# Zadání = celý soubor úkolu (stav, cíl, zadání, změny). Pravidla přes system prompt.
{
  echo "Úkol $ID (stav: $stav). Celý soubor úkolu:"
  echo
  cat "$UKOL"
} | ssh "$VM" "cd '$WT_ROOT/$ID' && timeout 45m claude -p \
      --model '$model' \
      --max-turns 80 \
      --settings /opt/orchestrace/worker-settings.json \
      --append-system-prompt \"\$(cat /opt/orchestrace/worker-pravidla.md)\"" \
  | tee "$LOG"

echo
echo "Log: $LOG"
