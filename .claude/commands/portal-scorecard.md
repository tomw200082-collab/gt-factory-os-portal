---
description: Recompute the portal production-readiness scorecard from the latest audit report + live repo state. Diff against prior score. Commit the updated scorecard.
---

You are running `/portal-scorecard` on the GT Factory OS portal.

## Read first
1. `docs/portal-os/scorecard.json` (prior score)
2. Newest file under `docs/portal-os/audit-reports/` (latest audit)
3. `docs/portal-os/route-manifest.json`
4. `docs/portal-os/quarantine.json`

## The scorecard model
The scorecard is a single JSON object with fixed categories. Each category scores 0–10. Total = sum (max 100).

Categories (locked — do not add, rename, or remove without an explicit operator-approved schema change):
- `admin_superuser_depth` (0–10) — can admin actually control every domain?
- `nav_integrity` (0–10) — is navigation honest (no dead, no fake, no orphans)?
- `flow_continuity` (0–10) — do end-to-end journeys actually complete?
- `role_gate_correctness` (0–10) — do RoleGates match intended permissions?
- `data_truthfulness` (0–10) — no hard-coded fake data in user-facing surfaces?
- `planning_surface` (0–10) — is the planner loop (forecast → runs → review → approve → PO) walkable?
- `ops_surface` (0–10) — do operator forms have working submit, conflict, and idempotency UX?
- `dashboard_truth` (0–10) — does the dashboard reflect real read models?
- `technical_substrate` (0–10) — primitives, shadcn compliance, TanStack cache hygiene, typecheck clean?
- `regression_resistance` (0–10) — does the OS itself (baseline, quarantine, hooks) actually bind?

## Required steps

1. **Compute each category** using evidence from the latest audit + live repo. For each category, produce:
   - `score` (integer 0–10)
   - `evidence` (array of strings, each a short citation — file path and/or audit finding id)
   - `gap` (one-sentence description of what would take it to 10)

2. **Write `docs/portal-os/scorecard.json`** as:
   ```json
   {
     "generated_at": "<ISO8601>",
     "source_audit": "<latest audit report filename>",
     "previous_score": <integer>,
     "total": <integer 0-100>,
     "categories": {
       "admin_superuser_depth": { "score": <n>, "evidence": [...], "gap": "..." },
       ...
     },
     "delta": <integer, signed>,
     "delta_notes": "<one sentence>"
   }
   ```

3. **Write `docs/portal-os/scorecard.md`** — a human-readable mirror of the JSON with:
   - A big-number header: `Portal Readiness: <total>/100 (delta: <signed>)`
   - A table: category | score | gap-to-10
   - A short "what moved since last time" paragraph

4. **Commit both files** on a branch named `portal-os/scorecard-<date>` if running interactively.

## This command MUST NOT
- add, rename, or remove categories
- edit `src/`, `tests/`, or `middleware.ts`
- inflate scores beyond evidence
- run any destructive bash

## Evidence requirement
Final message MUST include `Evidence: docs/portal-os/scorecard.md` and `Next action: ...`.