# Sdílené funkce pro skripty harnessu. Načítá se přes `source`.

STALE_HOURS="${STALE_HOURS:-3}"

repo_root() { git rev-parse --show-toplevel; }

agent_name() {
  if [ -n "${TEAM_AGENT:-}" ]; then echo "$TEAM_AGENT"; return; fi
  local n; n="$(git config user.name || true)"
  if [ -n "$n" ]; then echo "$n"; else echo "neznamy-agent"; fi
}

now_iso() { date -u +%Y-%m-%dT%H:%MZ; }

# ISO čas (2026-10-16T17:40Z) -> epoch; funguje s GNU i BSD date.
to_epoch() {
  local t="$1"
  date -u -d "$t" +%s 2>/dev/null \
    || date -u -j -f "%Y-%m-%dT%H:%MZ" "$t" +%s 2>/dev/null \
    || echo 0
}

# get_field <soubor> <klíč> – hodnota z YAML frontmatteru
get_field() {
  awk -v k="$2" '
    NR==1 && $0=="---" {fm=1; next}
    fm && $0=="---" {exit}
    fm && index($0, k":")==1 {sub("^" k ":[ ]*", ""); print; exit}
  ' "$1"
}

# set_field <soubor> <klíč> <hodnota> – přepíše (nebo doplní) klíč ve frontmatteru
set_field() {
  local tmp; tmp="$(mktemp)"
  awk -v k="$2" -v v="$3" '
    NR==1 && $0=="---" {fm=1; print; next}
    fm && $0=="---" {if(!done) print k ": " v; fm=0; print; next}
    fm && index($0, k":")==1 {print k ": " v; done=1; next}
    {print}
  ' "$1" > "$tmp" && mv "$tmp" "$1"
}

is_stale() {
  local upd; upd="$(get_field "$1" aktualizovano)"
  [ -z "$upd" ] && return 0
  local age=$(( $(date -u +%s) - $(to_epoch "$upd") ))
  [ "$age" -gt $(( STALE_HOURS * 3600 )) ]
}

require_clean() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Nejdřív ulož rozpracované změny (scripts/ulozit.sh \"...\")." >&2
    exit 2
  fi
}

push_with_retry() {
  local i
  for i in 1 2 3 4; do
    git push -q 2>/dev/null && return 0
    git pull --rebase -q || return 1
  done
  return 1
}
