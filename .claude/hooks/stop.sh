#!/usr/bin/env bash
# Stop hook — Portal Improvement OS
#
# Enforces the no-dead-air rule. Every session-ending assistant message must
# include a `Next action: ...` line so the operator always has one concrete step.

set -eu

block() {
  printf '%s\n' "Stop block: $1" >&2
  exit 2
}

PAYLOAD="$(cat || true)"

MESSAGE="$(printf '%s' "$PAYLOAD" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed -E 's/.*"message"[[:space:]]*:[[:space:]]*"(.*)"/\1/')"
if [ -z "$MESSAGE" ]; then
  MESSAGE="$(printf '%s' "$PAYLOAD" | grep -o '"final_output"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed -E 's/.*"final_output"[[:space:]]*:[[:space:]]*"(.*)"/\1/')"
fi
if [ -z "$MESSAGE" ]; then
  MESSAGE="$PAYLOAD"
fi

if ! printf '%s' "$MESSAGE" | grep -Eiq '(^|[[:space:]])Next action:[[:space:]]'; then
  block "no-dead-air violation: final message must include a 'Next action: <one concrete step>' line"
fi

exit 0