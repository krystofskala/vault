#!/usr/bin/env bash
# Spustí testy OpenTify pro worktree v aktuální složce (nebo zadané jako $1).
# Patří na opentify-vm do /opt/orchestrace/test.sh.
#
# TODO (doplní session, která zná runbook): přesný postup z runbook.md, sekce Testy –
# pytest v kontejneru api, kopie kódu do /tmp/be, testovací DATABASE_URL, REDIS db 14.
# Důležité: testy musí běžet nad KÓDEM Z WORKTREE, ne nad /opt/opentify,
# a nikdy proti produkční DB / Redis db 0.
set -euo pipefail
WT="${1:-$PWD}"

echo "test.sh ještě není vyplněný podle runbooku (worktree: $WT)" >&2
exit 2
