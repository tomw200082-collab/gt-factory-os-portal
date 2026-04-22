#!/usr/bin/env bash
# SessionStart hook — Portal Improvement OS
#
# Prints a compact opening context: scorecard headline, active tranche, drift status.
# Never writes; never blocks.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [ ! -d "$REPO_ROOT/docs/portal-os" ]; then
  printf 'Portal OS not initialized (docs/portal-os/ missing). Run the bootstrap plan to scaffold.\n' >&2
  exit 0
fi

printf '=== GT Factory OS Portal — Improvement OS ===\n'

# Scorecard headline
if [ -f "$REPO_ROOT/docs/portal-os/scorecard.json" ]; then
  TOTAL="$(grep -o '"total"[[:space:]]*:[[:space:]]*[0-9]*' "$REPO_ROOT/docs/portal-os/scorecard.json" | head -n1 | sed -E 's/.*:[[:space:]]*([0-9]+).*/\1/')"
  DELTA="$(grep -o '"delta"[[:space:]]*:[[:space:]]*-\{0,1\}[0-9]*' "$REPO_ROOT/docs/portal-os/scorecard.json" | head -n1 | sed -E 's/.*:[[:space:]]*(-?[0-9]+).*/\1/')"
  printf 'Scorecard: %s/100 (delta: %s)\n' "${TOTAL:-?}" "${DELTA:-0}"
else
  printf 'Scorecard: not yet generated — run /portal-scorecard\n'
fi

# Active tranche
ACTIVE_FILE="$REPO_ROOT/docs/portal-os/tranches/_active.txt"
if [ -f "$ACTIVE_FILE" ] && [ -s "$ACTIVE_FILE" ]; then
  NNN="$(head -n1 "$ACTIVE_FILE" | tr -d '[:space:]')"
  TRANCHE_FILE="$(ls "$REPO_ROOT/docs/portal-os/tranches/$NNN"-*.md 2>/dev/null | head -n1 || true)"
  if [ -n "$TRANCHE_FILE" ]; then
    printf 'Active tranche: %s — %s\n' "$NNN" "$(basename "$TRANCHE_FILE")"
  else
    printf 'Active tranche: %s (plan file missing — investigate)\n' "$NNN"
  fi
else
  printf 'Active tranche: none\n'
fi

# Drift status — count latest drift findings if present
LATEST_DRIFT="$(ls -t "$REPO_ROOT/docs/portal-os/drift-reports/"*.md 2>/dev/null | head -n1 || true)"
if [ -n "$LATEST_DRIFT" ]; then
  CRITS="$(grep -c '^### critical' "$LATEST_DRIFT" 2>/dev/null || echo 0)"
  printf 'Latest drift: %s (critical sections: %s)\n' "$(basename "$LATEST_DRIFT")" "$CRITS"
else
  printf 'Latest drift: none recorded\n'
fi

# Pending audits newer than 7 days
NEW_AUDITS="$(find "$REPO_ROOT/docs/portal-os/audit-reports/" -name '*.md' -mtime -7 2>/dev/null | wc -l | tr -d '[:space:]')"
printf 'Audits in last 7 days: %s\n' "${NEW_AUDITS:-0}"

printf '=============================================\n'
exit 0