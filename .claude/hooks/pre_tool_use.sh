#!/usr/bin/env bash
# PreToolUse hook — Portal Improvement OS
#
# Structural backstop. Blocks:
#   1. writes to secrets / env / vercel
#   2. destructive bash
#   3. edits to files outside the active tranche's manifest
#   4. edits to quarantined paths (unless tranche has revive: directive)
#   5. reintroduction of X-Fake-Session / X-Test-Session in cleaned files
#   6. writes to baseline.json / quarantine.json (those require human ritual)
#
# Semantic enforcement (is this agent authorized? is this form Mode-B?) lives
# in agent system prompts + command prompts. This hook is structural only.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

block() {
  printf '%s\n' "PreToolUse block: $1" >&2
  exit 2
}

PAYLOAD="$(cat || true)"

get_field() {
  local key="$1"
  printf '%s' "$PAYLOAD" | grep -o "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | head -n1 | sed -E "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/"
}

TOOL_NAME="$(get_field tool_name)"
TARGET_PATH=""
for key in file_path path filename target; do
  candidate="$(get_field "$key")"
  if [ -n "$candidate" ]; then
    TARGET_PATH="$candidate"
    break
  fi
done

TOOL_CMD="$(printf '%s' "$PAYLOAD" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -n1 | sed -E 's/.*"command"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"

# --- Rule 1: secrets / env / vercel -------------------------------------
case "$TARGET_PATH" in
  *.env|*.env.*|*/.env|*/.env.*|*/secrets/*|*/credentials/*|*/.ssh/*|*/.aws/*|*/.vercel/*)
    block "write to secret/env/vercel path denied: $TARGET_PATH"
    ;;
esac

# --- Rule 2: destructive bash -------------------------------------------
case "$TOOL_CMD" in
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf ."*|*"rm -fr /"*|*"rm -fr ~"*)
    block "destructive rm -rf pattern denied"
    ;;
  *"git push --force"*|*"git push -f"*)
    case "$TOOL_CMD" in
      *" main"*|*" master"*|*" origin main"*|*" origin master"*)
        block "force-push to main/master denied"
        ;;
    esac
    ;;
  *"git reset --hard"*)
    block "git reset --hard requires explicit operator escalation"
    ;;
  *"git clean -fd"*|*"git clean -fdx"*)
    block "git clean -fd(x) denied (would discard uncommitted work)"
    ;;
esac

# --- Rule 3: active-tranche manifest enforcement -------------------------
ACTIVE_FILE="$REPO_ROOT/docs/portal-os/tranches/_active.txt"
if [ -f "$ACTIVE_FILE" ] && [ -s "$ACTIVE_FILE" ]; then
  NNN="$(head -n1 "$ACTIVE_FILE" | tr -d '[:space:]')"
  TRANCHE_FILE="$(ls "$REPO_ROOT/docs/portal-os/tranches/$NNN"-*.md 2>/dev/null | head -n1 || true)"
  if [ -n "$TRANCHE_FILE" ]; then
    case "$TOOL_NAME" in
      Write|Edit|NotebookEdit)
        # Normalize target to repo-relative
        REL_PATH="${TARGET_PATH#$REPO_ROOT/}"
        REL_PATH="${REL_PATH#./}"
        # Always-allowed paths (portal OS artifacts; tranche plan itself; tests dir; docs)
        case "$REL_PATH" in
          docs/portal-os/*|.claude/*|.github/*|tests/e2e/*.spec.ts|tests/unit/*)
            : # allow
            ;;
          *)
            # Require the path to appear in the tranche manifest
            if ! awk '/^manifest:/{flag=1;next}/^[^[:space:]-]/{flag=0}flag{print}' "$TRANCHE_FILE" | grep -Fq -- "$REL_PATH"; then
              block "file not in active tranche $NNN manifest: $REL_PATH (see $TRANCHE_FILE)"
            fi
            ;;
        esac
        ;;
    esac
  fi
fi

# --- Rule 4: quarantine enforcement --------------------------------------
QUARANTINE="$REPO_ROOT/docs/portal-os/quarantine.json"
if [ -f "$QUARANTINE" ] && [ -n "$TARGET_PATH" ]; then
  REL_PATH="${TARGET_PATH#$REPO_ROOT/}"
  REL_PATH="${REL_PATH#./}"
  if grep -Fq "\"path\": \"$REL_PATH\"" "$QUARANTINE"; then
    # Allow only if active tranche has a revive: entry for this path
    if [ -f "$ACTIVE_FILE" ] && [ -s "$ACTIVE_FILE" ]; then
      NNN="$(head -n1 "$ACTIVE_FILE" | tr -d '[:space:]')"
      TRANCHE_FILE="$(ls "$REPO_ROOT/docs/portal-os/tranches/$NNN"-*.md 2>/dev/null | head -n1 || true)"
      if [ -n "$TRANCHE_FILE" ] && awk '/^revive:/{flag=1;next}/^[^[:space:]-]/{flag=0}flag{print}' "$TRANCHE_FILE" | grep -Fq -- "$REL_PATH"; then
        : # allow
      else
        block "edit to quarantined path $REL_PATH requires explicit revive: directive in active tranche plan"
      fi
    else
      block "edit to quarantined path $REL_PATH requires an active tranche with revive: directive"
    fi
  fi
fi

# --- Rule 5: forbidden strings (X-Fake-Session etc.) --------------------
case "$TOOL_NAME" in
  Write|Edit|NotebookEdit)
    # Best-effort: inspect the new content field if present
    NEW_CONTENT="$(printf '%s' "$PAYLOAD" | grep -o '"content"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 || true)"
    NEW_STRING="$(printf '%s' "$PAYLOAD" | grep -o '"new_string"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 || true)"
    BLOB="$NEW_CONTENT$NEW_STRING"
    if printf '%s' "$BLOB" | grep -Fq "X-Fake-Session" || printf '%s' "$BLOB" | grep -Fq "X-Test-Session"; then
      # Only allow if the target path is itself in quarantine.json as a known-pending-cleanup
      REL_PATH="${TARGET_PATH#$REPO_ROOT/}"
      REL_PATH="${REL_PATH#./}"
      if [ -f "$QUARANTINE" ] && grep -Fq "\"path\": \"$REL_PATH\"" "$QUARANTINE" && grep -Fq "pending-cleanup" "$QUARANTINE"; then
        : # allow explicit pending-cleanup files to stay until the tranche that removes them
      else
        block "reintroduction of X-Fake-Session/X-Test-Session to $REL_PATH denied — this portal has moved to Supabase Bearer auth"
      fi
    fi
    ;;
esac

# --- Rule 6: protected OS files -----------------------------------------
case "$TARGET_PATH" in
  */docs/portal-os/baseline.json|docs/portal-os/baseline.json)
    block "baseline.json requires a dedicated baseline-update ritual (human-authorized). Not editable through normal tool calls."
    ;;
  */docs/portal-os/quarantine.json|docs/portal-os/quarantine.json)
    block "quarantine.json requires a dedicated quarantine-update ritual (human-authorized). Not editable through normal tool calls."
    ;;
esac

exit 0