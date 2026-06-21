#!/usr/bin/env sh
# Auto-install the graphify skill (https://github.com/safishamsi/graphify) on
# every Claude Code session in this ephemeral web environment, so that the
# /graphify skill and the `graphify` / `graphify-mcp` CLIs are always available.
#
# Why a SessionStart hook: the web container is wiped and re-cloned each
# session, so anything installed at runtime disappears. Re-running install on
# boot is the only way to keep the tool available across sessions.
#
# Design: idempotent (skips if already present in this container) and non-fatal
# (always exits 0) so a slow network or registry hiccup never blocks a session.
set -u

LOG=/tmp/graphify-setup.log
exec >>"$LOG" 2>&1
echo "--- graphify setup $(date -u +%FT%TZ) ---"

# Fast path: already installed + skill registered in this container.
if command -v graphify >/dev/null 2>&1 && [ -f "$HOME/.claude/skills/graphify/SKILL.md" ]; then
  echo "graphify already present; skipping."
  exit 0
fi

# 1) Install the CLI into a directory that is on PATH. PyPI package is graphifyy;
#    it provides the `graphify` and `graphify-mcp` executables.
if ! command -v graphify >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    UV_TOOL_BIN_DIR=/usr/local/bin uv tool install --quiet graphifyy || echo "uv install failed"
  elif command -v pipx >/dev/null 2>&1; then
    pipx install graphifyy || echo "pipx install failed"
  else
    pip install --quiet --break-system-packages graphifyy 2>/dev/null || pip install --quiet graphifyy || echo "pip install failed"
  fi
fi

# 2) Register the /graphify skill for Claude Code (writes ~/.claude/skills/graphify).
if command -v graphify >/dev/null 2>&1; then
  graphify install --platform claude || echo "graphify install (skill) failed"
  echo "graphify ready: $(command -v graphify)"
else
  echo "graphify CLI not found after install; /graphify unavailable this session."
fi

exit 0
