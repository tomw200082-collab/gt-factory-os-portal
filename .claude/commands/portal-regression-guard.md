---
description: Dispatch regression-sentinel. Fail the command (and CI) if any dead/quarantined/fake surface has re-entered primary nav or any prior tranche has been silently reverted.
---

You are running `/portal-regression-guard` on the GT Factory OS portal.

## Read first
1. `docs/portal-os/baseline.json`
2. `docs/portal-os/quarantine.json`
3. `docs/portal-os/route-manifest.json`
4. Current repo state via `git diff <baseline sha>..HEAD` (the baseline sha is recorded in `baseline.json` under `.anchor_sha`)

## Required steps

1. **Dispatch `portal-regression-sentinel`** with the scope "full baseline + quarantine check".

2. **Parse its report.** The subagent returns a structured finding list. Any finding of severity `critical` or `high` fails the guard.

3. **Write `docs/portal-os/drift-reports/YYYY-MM-DD-guard.md`** with:
   - Baseline anchor SHA compared against
   - HEAD SHA
   - Findings table (path | severity | kind | evidence)
   - Pass/fail verdict

4. **If in CI**:
   - Exit 0 on pass, exit 1 on fail.
   - Post the drift report as a PR comment (via `gh pr comment` if available).
5. **If in interactive session**:
   - If fail: open a GitHub issue titled `portal-drift: <date>` with label `drift`, pointing to the drift report. Do NOT commit to `main`.
   - If pass: no further action.

## This command MUST NOT
- edit `src/`, `tests/`, or any code file
- silently update baseline or quarantine
- mark a finding as false-positive without a documented reason

## Evidence requirement
Final message MUST include `Evidence: docs/portal-os/drift-reports/<date>-guard.md` and `Next action: <specific step based on pass/fail>`.