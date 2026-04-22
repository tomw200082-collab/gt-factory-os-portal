#!/usr/bin/env bash
# SubagentStop hook — Portal Improvement OS
#
# Refuses "done/complete/PASS" claims without an `Evidence: <path>` line pointing
# to a file that exists on disk. Prevents PASS-without-evidence drift.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

block() {
  printf '%s\n' "SubagentStop block: $1" >&2
  exit 2
}

PAYLOAD="$(cat || true)"

# Extract the subagent's final message. Try common field names.
MESSAGE="$(printf '%s' "$PAYLOAD" | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed -E 's/.*"message"[[:space:]]*:[[:space:]]*"(.*)"/\1/')"
if [ -z "$MESSAGE" ]; then
  MESSAGE="$(printf '%s' "$PAYLOAD" | grep -o '"final_output"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed -E 's/.*"final_output"[[:space:]]*:[[:space:]]*"(.*)"/\1/')"
fi
if [ -z "$MESSAGE" ]; then
  # Fallback: whole payload as text
  MESSAGE="$PAYLOAD"
fi

# Only enforce evidence when the message claims completion
if printf '%s' "$MESSAGE" | grep -Eq '(Status[[:space:]]*:[[:space:]]*PASS|\bPASS\b|\bcomplete\b|\bdone\b)'; then
  EVIDENCE_PATH="$(printf '%s' "$MESSAGE" | grep -Eo 'Evidence:[[:space:]]*[^[:space:]"]+' | head -n1 | sed -E 's/Evidence:[[:space:]]*//')"
  if [ -z "$EVIDENCE_PATH" ]; then
    block "subagent claimed PASS/complete/done without an Evidence: <path> line"
  fi
  # Resolve relative to repo root if needed
  if [ "${EVIDENCE_PATH#/}" = "$EVIDENCE_PATH" ]; then
    FULL_PATH="$REPO_ROOT/$EVIDENCE_PATH"
  else
    FULL_PATH="$EVIDENCE_PATH"
  fi
  if [ ! -e "$FULL_PATH" ]; then
    block "subagent cited Evidence: $EVIDENCE_PATH but no such file exists at $FULL_PATH"
  fi
fi

exit 0