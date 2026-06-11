# Tranche 046 — OS truthfulness + role-gate reconciliation (Phase 5)

status: active
kind: quarantine-update + baseline-update (ritual tranche)
phase: improvement-plan-2026-06 Phase 5
approved_by: Tom (2026-06-11; T6 = users/jobs/integrations are LIVE; full-run authorization)

## Goal
The OS files describe reality; the three role-gate layers agree; admin pages stop implying
telemetry they don't have.

## File manifest
- docs/portal-os/route-manifest.json — T6 reclassify users/jobs/integrations → live; add ALL
  code routes missing from the manifest (audit found 34) with group/roles per actual layouts;
  refresh stale role columns to match layouts; add redirect rows (/dashboard/v2, /stock/submissions, /exceptions note)
- docs/portal-os/baseline.json — populate routes[]/nav_items[]/role_gates{} anchors from current
  truth; correct stale critical_invariants 15-17
- docs/portal-os/quarantine.json — seed pending-cleanup entry for tests/e2e/forecast-planner-real.spec.ts:198
  forbidden-string comment vestige (kind=quarantine-update ritual)
- src/middleware.ts — reconcile ROLE_GATES with layouts/lattice: /stock → operator+planner+admin;
  /stock/movement-log carve-out → all roles; /planning → all roles (layout planning:read);
  /admin/economics carve-out planner+admin (before /admin); /purchase-orders → all roles
  (po layout viewer:read); /exceptions → all roles
- src/app/(admin)/admin/integrations/page.tsx — honesty labels: non-Shopify cards state
  "derived from exception activity — not sync telemetry"; "last event" relabeled accordingly
- src/app/(admin)/admin/jobs/page.tsx — interval column labeled "estimated (from name)" until registry exposes cron
- src/app/(admin)/admin/masters/boms/[bom_head_id]/[version_id]/edit (locate exact editor file) —
  "Discard changes" relabeled "Close editor" + copy stops claiming changes are discarded
- docs/portal-os/tranches/046-os-truthfulness-role-gates.md, _active.txt, registry.md

## Verification gates
- tsc clean; vitest green (451); route-manifest valid JSON, every src/app page.tsx has a row;
  middleware gates superset-consistent with layout minimums

## Checklist
- [ ] Implemented
- [ ] Typecheck clean
- [ ] Vitest green
- [ ] Pushed
