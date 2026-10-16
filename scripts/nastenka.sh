#!/usr/bin/env bash
# Přehled úkolů podle stavu.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$(repo_root)"

shopt -s nullglob
files=(ukoly/*.md)
me="$(agent_name)"

print_group() {
  local want="$1" label="$2" f stav line any=0
  for f in "${files[@]}"; do
    [ "$(basename "$f")" = "_SABLONA.md" ] && continue
    stav="$(get_field "$f" stav)"
    [ "$want" = "opusteno" ] && { [ "$stav" = "pracuje" ] && is_stale "$f" || continue; }
    [ "$want" = "pracuje" ] && is_stale "$f" && continue
    [ "$want" != "opusteno" ] && [ "$stav" != "$want" ] && continue
    [ $any -eq 0 ] && echo "$label" && any=1
    line="  - $f  [priorita: $(get_field "$f" priorita)]"
    [ -n "$(get_field "$f" vlastnik)" ] && line="$line  vlastník: $(get_field "$f" vlastnik)"
    line="$line  ($(get_field "$f" aktualizovano))"
    echo "$line"
  done
}

echo "== Nástěnka oddělení – jsi: $me =="
print_group volne      "🟡 Volné k převzetí:"
print_group opusteno   "🟠 Opuštěné (lze převzít, déle než ${STALE_HOURS} h bez aktivity):"
print_group pracuje    "🔵 Rozpracované:"
print_group blokovano  "🔴 Blokované (čeká na člověka):"
print_group hotovo     "✅ Hotové:"
[ ${#files[@]} -le 1 ] && echo "(zatím žádné úkoly)"
exit 0
