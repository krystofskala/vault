#!/usr/bin/env bash
# Průběžné uložení: commit všech změn, obnovení času u vlastních úkolů, push.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(repo_root)"

msg="${1:-průběžné uložení}"
me="$(agent_name)"

shopt -s nullglob
for f in ukoly/*.md; do
  if [ "$(get_field "$f" stav)" = "pracuje" ] && [ "$(get_field "$f" vlastnik)" = "$me" ]; then
    set_field "$f" aktualizovano "$(now_iso)"
  fi
done

git add -A
if git diff --cached --quiet; then echo "Nic k uložení."; exit 0; fi
git commit -q -m "$msg ($me)"
push_with_retry && echo "✔ Uloženo a pushnuto." || { echo "Push selhal – vyřeš konflikt ručně." >&2; exit 1; }
