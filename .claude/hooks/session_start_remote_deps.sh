#!/bin/bash
# SessionStart hook (remote only) — installs npm dependencies so lint,
# typecheck, and vitest work in Claude Code on the web sessions.
# Local sessions exit immediately; the read-only context hook
# (session_start.sh) is unchanged and runs separately.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
