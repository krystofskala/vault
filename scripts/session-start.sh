#!/usr/bin/env bash
# SessionStart hook: stáhne novinky a ukáže nástěnku.
cd "$(dirname "$0")/.." || exit 0
git pull --rebase -q 2>/dev/null || echo "(git pull se nepodařil – pracuješ možná se starými daty)"
scripts/nastenka.sh
echo
echo "Pravidla spolupráce jsou v CLAUDE.md. Úkol vždy nejdřív převezmi: scripts/prevzit.sh"
exit 0
