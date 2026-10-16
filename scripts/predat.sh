#!/usr/bin/env bash
# Předání úkolu: volne | hotovo | blokovano
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(repo_root)"

f="${1:?Použití: scripts/predat.sh ukoly/<soubor>.md volne|hotovo|blokovano}"
novy="${2:?Chybí nový stav: volne|hotovo|blokovano}"
me="$(agent_name)"

case "$novy" in volne|hotovo|blokovano) ;; *) echo "Neplatný stav: $novy" >&2; exit 1 ;; esac
if [ "$(get_field "$f" vlastnik)" != "$me" ]; then
  echo "Úkol nevlastníš ($(get_field "$f" vlastnik))." >&2; exit 1
fi

set_field "$f" stav "$novy"
[ "$novy" = "volne" ] && set_field "$f" vlastnik ""
set_field "$f" aktualizovano "$(now_iso)"
git add -A
git commit -q -m "$novy: $(basename "$f" .md) ($me)"
push_with_retry && echo "✔ Úkol $f → $novy" || { echo "Push selhal – vyřeš konflikt ručně." >&2; exit 1; }
