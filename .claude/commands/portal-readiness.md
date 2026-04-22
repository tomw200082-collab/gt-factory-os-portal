---
description: Produce a consolidated readiness report — scorecard + last audit summary + open tranches + active drift + remaining gaps to FULL PRODUCTION.
---

You are running `/portal-readiness` on the GT Factory OS portal.

## Read first
1. `docs/portal-os/scorecard.json` + `scorecard.md`
2. Newest 3 files under `docs/portal-os/audit-reports/`
3. All files under `docs/portal-os/tranches/` where `status:` is not `closed`
4. Newest 3 files under `docs/portal-os/drift-reports/`
5. `docs/portal-os/baseline.json` for anchor context
6. `CURRENT_STATE.md` in the PRODUCTION workspace if reachable (env var `$FACTORY_OS_STATE_DIR`); else skip

## Required steps

1. **Synthesize** a one-page readiness report. No subagent dispatch required — this is a read-and-summarize command.

2. **Write `docs/portal-os/readiness/YYYY-MM-DD.md`** with structure:
   ```
   # Portal Readiness — <date>

   ## Headline
   <total>/100 (delta since last readiness: <signed>)
   Estimated distance to FULL PRODUCTION: <S | M | L | XL tranches>

   ## Top blockers (3-5 items, severity-ranked)
   1. <blocker> — <why it's a blocker> — <suggested tranche>
   ...

   ## Open tranches
   - <NNN> — <slug> — status: <status> — expected delta: +<n>
   ...

   ## Drift status
   <pass | N findings since last review>

   ## What changed since last readiness
   <1-paragraph narrative>

   ## Phone-ready checklist for operator
   - [ ] Review top blocker 1
   - [ ] Approve/reject pending tranches
   - [ ] Comment next action

   ## Source artifacts
   - scorecard: docs/portal-os/scorecard.json
   - latest audit: <path>
   - latest drift: <path>
   ```

3. **If invoked from a PR or issue context** (detectable via `GITHUB_EVENT_PATH` or if the command was triggered from a thread), post the contents as a comment on that thread via `gh pr comment` or `gh issue comment`.

4. **Commit** the file on branch `portal-os/readiness-<date>`.

## This command MUST NOT
- edit `src/`, `tests/`, or any code file
- recompute the scorecard (use the existing one)
- dispatch subagents
- run any destructive bash

## Evidence requirement
Final message MUST include `Evidence: docs/portal-os/readiness/<date>.md` and `Next action: <one concrete operator step, e.g. approve tranche NNN>`.
