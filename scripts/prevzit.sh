#!/usr/bin/env bash
# Převezme úkol: atomicky přes git push. Exit 1 = úkol má někdo jiný.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(repo_root)"

f="${1:?Použití: scripts/prevzit.sh ukoly/<soubor>.md}"
me="$(agent_name)"
require_clean

for attempt in 1 2 3 4 5; do
  git pull --rebase -q
  [ -f "$f" ] || { echo "Úkol $f neexistuje." >&2; exit 1; }

  stav="$(get_field "$f" stav)"
  owner="$(get_field "$f" vlastnik)"
  case "$stav" in
    volne) ;;
    pracuje)
      if [ "$owner" != "$me" ] && ! is_stale "$f"; then
        echo "Úkol právě zpracovává $owner. Vyber si jiný." >&2; exit 1
      fi ;;
    *) echo "Úkol je ve stavu '$stav' – nelze převzít." >&2; exit 1 ;;
  esac

  set_field "$f" stav pracuje
  set_field "$f" vlastnik "$me"
  set_field "$f" aktualizovano "$(now_iso)"
  git add "$f"
  git commit -q -m "převzetí: $(basename "$f" .md) ($me)"

  if git push -q 2>/dev/null; then
    echo "✔ Převzato: $f"
    [ -n "$owner" ] && [ "$owner" != "$me" ] && \
      echo "Předchozí vlastník: $owner – projdi si 'git log -p -- $f'."
    exit 0
  fi
  # Někdo pushnul dřív – zahodit vlastní commit převzetí a zkusit znovu.
  git fetch -q
  git reset -q --hard '@{u}'
  sleep $((attempt * 2))
done
echo "Nepodařilo se převzít (opakované konflikty)." >&2
exit 1
