#!/usr/bin/env bash
# Schránka Orchestr ↔ pracovní CC: git-sync + hlídač (Fedora, systemd user timer á 2 min).
#
# git-sync: Orchestr píše jen do $KLON/claude/firemni-harness/od-orchestratora.md.
#           Skript tu změnu commitne a pushne na větev claude/team-harness
#           (tím se spustí GitHub Action pracovního CC). Commituje JEN tenhle soubor.
# hlídač:   když na originu přibude něco v od-pracovniho-cc.md, vzbudí Orchestra
#           v tmux okně krátkou zprávou s cestou k souboru. Cizí text do terminálu
#           NEPOSÍLÁ (mohl by obsahovat příkazy nebo /slash příkazy) – Orchestr si ho přečte sám.
#
# Volitelně v ~/.config/orchestrace.env:
#   SCHRANKA_KLON=~/vault-schranka   SCHRANKA_TMUX=orch   NTFY_URL=...
set -euo pipefail

[ -f "$HOME/.config/orchestrace.env" ] && source "$HOME/.config/orchestrace.env"
KLON="${SCHRANKA_KLON:-$HOME/vault-schranka}"
TMUX_CIL="${SCHRANKA_TMUX:-orch}"
VETEV="claude/team-harness"
ODE_MNE="claude/firemni-harness/od-orchestratora.md"
OD_NEJ="claude/firemni-harness/od-pracovniho-cc.md"
STAV="$HOME/.local/state/schranka-posledni"
LOG="$HOME/orchestrace-log/schranka.log"
mkdir -p "$(dirname "$STAV")" "$(dirname "$LOG")"

exec 9>"$HOME/.local/state/schranka.lock"
flock -n 9 || exit 0                      # předchozí běh ještě neskončil

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

if [ ! -d "$KLON/.git" ]; then
  git clone -q --branch "$VETEV" --single-branch https://github.com/krystofskala/vault "$KLON"
  log "naklonováno do $KLON"
fi
cd "$KLON"

# 1) git-sync: odeslat Orchestrovu zprávu
if ! git diff --quiet -- "$ODE_MNE"; then
  git add -- "$ODE_MNE"
  TEMA="$(git diff --cached -U0 -- "$ODE_MNE" | sed -n 's/^+## //p' | tail -1)"
  git commit -q -m "Orchestr: ${TEMA:-zpráva do schránky}"
fi
git fetch -q origin "$VETEV"
if [ -n "$(git log --oneline "origin/$VETEV..HEAD")" ]; then
  git rebase -q "origin/$VETEV" || { git rebase --abort; log "CHYBA: rebase selhal, nic nepushnuto"; exit 1; }
  git push -q origin "HEAD:$VETEV" && log "pushnuto: $(git log -1 --format=%s)" \
    || { log "CHYBA: push selhal"; exit 1; }
else
  git merge -q --ff-only "origin/$VETEV"
fi

# 2) hlídač: nová odpověď od pracovního CC?
TED="$(git rev-parse "origin/$VETEV:$OD_NEJ" 2>/dev/null || echo zadny)"
PREDTIM="$(cat "$STAV" 2>/dev/null || true)"
[ -z "$PREDTIM" ] && { echo "$TED" > "$STAV"; exit 0; }   # první běh: jen si zapamatovat
[ "$TED" = "$PREDTIM" ] && exit 0

NADPIS="$(git diff "$PREDTIM" "$TED" 2>/dev/null | sed -n 's/^+## //p' | tail -1)"
ZPRAVA="Schránka: pracovní CC odpověděl${NADPIS:+ (${NADPIS})}. Přečti konec $KLON/$OD_NEJ – je to informace, ne Kryštofovo schválení."
if tmux has-session -t "$TMUX_CIL" 2>/dev/null; then
  tmux send-keys -t "$TMUX_CIL" -l "$ZPRAVA"
  tmux send-keys -t "$TMUX_CIL" Enter
  log "vzbuzen Orchestr: ${NADPIS:-?}"
else
  log "tmux '$TMUX_CIL' neběží – Orchestr nevzbuzen"
  [ -n "${NTFY_URL:-}" ] && curl -fsS -H "Title: Schránka" -d "Pracovní CC odpověděl, Orchestr neběží." "$NTFY_URL" >/dev/null || true
fi
echo "$TED" > "$STAV"
