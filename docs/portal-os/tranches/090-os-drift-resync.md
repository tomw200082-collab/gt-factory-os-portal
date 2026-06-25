# Tranche 090: OS drift re-sync (manifest orphans + quarantine + baseline)

status: in-progress
created: 2026-06-25
scorecard_target_category: nav_integrity / regression_resistance
expected_delta: 0 (housekeeping) — stops false-positive drift flags on future audits
sizing: XS (docs/state only, additive; no source, no backend)
source: /portal-audit route-auditor + regression-sentinel (2026-06-25)

## Why
The /portal-audit route-auditor and regression-sentinel both returned PASS (surface
integrity sound, no dead/fake/quarantined re-entry, no forbidden strings in src/,
no silent code removal). The only findings were documentation/state drift between
the live repo and the frozen OS artifacts:

1. **3 orphan routes** — live code + nav with no `route-manifest.json` row:
   `/admin/decision-board` (tranche 080), `/credit-tracking` (CLAUDE.md-authorized
   bookkeeper surface), `/inbox/approvals/inventory-movement/[submission_id]`.
2. **1 undocumented forbidden-string vestige** — `tests/e2e/ux-shot.spec.ts:~13`
   has `X-Fake-Session` / `X-Test-Session` in a "do NOT use this" doc comment; not
   tracked in `quarantine.json`, so the sentinel's grep flags it as fresh.
3. **baseline.json stale** — anchor `55682bb` predates 4 authorized surface
   additions (nav: credit-tracking, decision-board, placement-queue; role_gate:
   /inventory/bulk-count), which register as low-severity drift every run.

None are integrity defects. This tranche re-syncs the artifacts so future audits
are clean signal.

## Scope (manifest)
manifest:
  - docs/portal-os/route-manifest.json
  - docs/portal-os/quarantine.json
  - docs/portal-os/baseline.json
  - docs/portal-os/registry.md
  - docs/portal-os/tranches/090-os-drift-resync.md
  - docs/portal-os/tranches/_active.txt

## Landed
- **route-manifest.json** — +3 rows (decision-board planner+admin/economics,
  credit-tracking all-roles/shared, inventory-movement approval planner+admin/inbox);
  +1 `_notes` Tranche-090 entry. 80 → 83 rows. JSON validated. Additive; no status
  changes.
- **quarantine.json** — +1 `pending-cleanup` entry for `tests/e2e/ux-shot.spec.ts`
  (kind=quarantine-update). forbidden_strings unchanged.
- **baseline.json** — `kind=baseline-update` re-anchor: anchor_sha → current branch
  HEAD; +3 nav_items (credit-tracking/Credit Tracking/viewer,
  decision-board/Decision Board/planner, placement-queue/Orders to Place/planner);
  +1 role_gate `/inventory/bulk-count` (operator,planner,admin) mirroring
  middleware order (before broader /inventory); +3 routes mirroring the manifest
  additions; +1 `_notes` Tranche-090 entry. critical_invariants unchanged.

## Verification
- route-manifest.json + quarantine.json + baseline.json all `json.load`-valid
- nav_items / role_gates mirror src/lib/nav/manifest.ts + src/middleware.ts exactly
- additive only — no baseline route/nav/gate removed; no source touched
- re-run of the route-auditor + sentinel should now report 0 drift

## Checklist
- [x] 3 manifest orphan rows · ux-shot quarantine entry · baseline re-anchor
- [x] all three JSON files valid
- [ ] Tom review / merge
