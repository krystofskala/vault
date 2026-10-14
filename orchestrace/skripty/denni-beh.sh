#!/usr/bin/env bash
# Denní běh orchestrátora (cron na Fedoře), např.:
#   12 7 * * * $HOME/vault/orchestrace/skripty/denni-beh.sh
# Nespouští workery ani deploy – jen třídí, kontroluje a hlásí.
set -euo pipefail

# NTFY_URL (např. https://ntfy.example/tema) a případně TREZOR – mimo git:
source "$HOME/.config/orchestrace.env"
TREZOR="${TREZOR:-$HOME/Obsidian/jojojo}"
DIR="$HOME/vault/orchestrace/orchestrator"
LOG="$HOME/orchestrace-log/denni-$(date +%Y%m%d).txt"
mkdir -p "$(dirname "$LOG")"

cd "$DIR"
PROMPT='Denní běh (bez Kryštofa, nikoho se neptej):
1. Roztřiď nové položky v inbox.md do stav.md (nápady zůstávají nápady, nic nespouštěj).
2. U úkolů ve stavu "nasazeno" zkontroluj, jestli jde ověřit (ssh opentify-vm docker compose ps / logs); nic nerestartuj.
3. Najdi úkoly, kterým dnes vychází měření (rec_log) nebo které visí ve stejném stavu přes 3 dny.
4. Aktualizuj stav.md.
Poslední zpráva = přehled pro ntfy, max 10 řádků: co čeká na schválení (ID), co je potřeba ověřit, problémy.'

claude -p "$PROMPT" \
  --add-dir "$TREZOR/claude/orchestrace" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Edit" "Bash(ssh opentify-vm docker compose ps*)" "Bash(ssh opentify-vm docker compose logs*)" \
  --max-turns 40 > "$LOG" 2>&1 || echo "Denní běh skončil chybou, viz $LOG" >> "$LOG"

tail -n 12 "$LOG" | curl -fsS -H "Title: Orchestrátor – denní přehled" --data-binary @- "$NTFY_URL" >/dev/null
