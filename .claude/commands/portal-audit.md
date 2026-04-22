---
description: Deep admin-perspective portal audit. Dispatches route, admin-surface, and flow-continuity auditors in parallel; collates findings into one dated report. Read-only.
argument-hint: "[admin|ops|planner|planning|po|nav|all]  (default: all)"
---

You are running `/portal-audit` on the GT Factory OS portal. Scope argument: `$ARGUMENTS` (if empty, assume `all`).

## Read first, in order
1. `docs/portal-os/registry.md`
2. `docs/portal-os/scorecard.json`
3. `docs/portal-os/route-manifest.json`
4. `docs/portal-os/quarantine.json`
5. `docs/portal-os/baseline.json` (for comparison)
6. `CLAUDE.md` at repo root

## Required steps

1. **Dispatch three subagents in parallel** (single message, three Agent tool calls):
   - `portal-route-auditor` — scope: full route/nav surface + quarantine check
   - `portal-admin-surface-auditor` — scope: `(admin)` route group + all referenced primitives (unless `$ARGUMENTS` narrows scope)
   - `portal-flow-continuity-auditor` — scope: top 5 operator journeys + top 3 planner journeys, OR just the scope named in `$ARGUMENTS`

2. **Wait for all three to return.** Do not start writing the report until every subagent has reported.

3. **Collate findings** into a single file:
   - Path: `docs/portal-os/audit-reports/YYYY-MM-DD-<scope>.md` (where `<scope>` = `$ARGUMENTS` or `all`)
   - Structure:
     ```
     # Portal Audit — <date> — scope: <scope>

     ## Scorecard delta context
     Previous score: <from scorecard.json>
     Categories flagged by this audit: <list>

     ## Route / nav findings (from route-auditor)
     ...

     ## Admin surface findings (from admin-surface-auditor)
     ...

     ## Flow continuity findings (from flow-continuity-auditor)
     ...

     ## Top 10 production-critical gaps (prioritized)
     1. <gap> — <severity> — <suggested tranche>
     ...

     ## Suggested next tranche focus
     <one or two freeform-text candidates for /portal-tranche-plan>

     ## Evidence
     - <file paths referenced>
     ```

4. **Do NOT edit any file under `src/`, `tests/`, `public/`, `middleware.ts`, or `package.json`.** This command is read-only. Only `docs/portal-os/audit-reports/` may be written.

5. **Commit** the audit report on a branch named `portal-os/audit-<date>` if running interactively (hooks enforce branch discipline). In GitHub Actions, the workflow handles branching.

6. **End with** a single line: `Next action: <one concrete operator step>`. Examples: "run `/portal-scorecard`", "review the top gap at `src/app/(admin)/admin/boms/page.tsx:42`".

## This command MUST NOT
- edit `src/`, `tests/`, `public/`, `middleware.ts`
- run any destructive bash
- invent gaps not observed in code
- skip any of the three subagents
- claim PASS without producing the report file

## Evidence requirement
The final assistant message MUST include a line `Evidence: docs/portal-os/audit-reports/<date>-<scope>.md` pointing to a file that exists.