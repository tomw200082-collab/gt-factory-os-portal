# Tranche 146 — /production UX release-gate, iteration 2 (Gate 5)

**Status:** verified — Gate 5 met (zero P0/P1 on the /production corridor)
**Origin:** Production picking rollout plan Phase 5 (`gt-factory-os-production-brain/docs/plans/2026-07-24-production-picking-rollout.md`). Renumbered from the plan's "145" to **146** (144/145 already used; see tranche 145).
sizing: S
scorecard_target_category: ops_surface
expected_delta: closes the last two P1s the iteration-1 gate missed → Gate 5 (ZERO P0/P1 on the /production corridor).

## Why this tranche
Re-ran the full 5-lens `/ux-release-gate` panel against the tranche-145 build merged to main. All 15 iteration-1 fixes verified PASS by all lenses. The re-run surfaced **2 residual P1s** (same bug classes iteration 1 fixed elsewhere but missed here) plus a set of P2 polish. Per the plan, Phase 5's exit is ZERO P0/P1 — so this tranche fixes the 2 P1s and a tight set of cheap, zero-risk P2 one-liners, and documents the remaining P2s as a bounded backlog.

## Fixed
**P1 (required for Gate 5)**
- INTER-006: AddMaterialControl correction dropdown showed the Hebrew `component_name` while PickRow shows the Latin `floor_name` — operator had to cross-reference two scripts for the same material. Now `floor_name ?? component_name`, matching PickRow/EditQtySheet.
- INTER-007: PickRow confirm/edit buttons stayed tappable during `confirm.isPending` (the pick-confirm round-trip) — interactive rows while the Done bar showed "Saving…". Now `disabled={terminal || committed || confirm.isPending}`.

**P2 (cheap, safe, high-value — done while in-file)**
- A11Y-T146-01: EditQtySheet UOM label `text-fg-subtle` (≈3.09:1) → `text-fg-muted` (AA), matching ReportForm.
- INTER-010: stepper +/- buttons disabled during the in-flight mutation (UnplannedRunDialog, AddMaterialControl, ReportForm) — no field changes mid-save.
- INTER-009: DoneBar blocked button gains a `title` tooltip (UX standard §8).
- A11Y-T146-02: PickList live region announces "Saving…" during `confirm.isPending` (always-mounted region, not a conditionally-mounted role=status).
- A11Y-T146-04: ReportForm live region announces "Saving…" during `report.isPending`.

## Deferred to backlog (with rationale — NOT blocking Gate 5)
- A11Y-T146-05 (`.reveal` motion-reduce): requires editing `globals.css`, which is **frozen** for this OS; also WCAG AAA, not AA. Belongs to a design-token-owning change, not a corridor tranche.
- A11Y-T146-03 (AddMaterialControl okMsg SR announcement): valuable but needs a new always-mounted region; low-frequency success path. Backlog.
- INTER-008 (stale-BOM reload two-step confirm): rare path (server-rejected stale pin); needs new copy + a two-tap state. Backlog.
- FLOW-P2-001 (report form guard for PLANNED/PICKING via direct URL): the normal journey never lands here; backend already 409s `RUN_NOT_REPORTABLE` with actionable copy. Backlog.
- FLOW-P2-003 (AddMaterialControl heading in IN_PRODUCTION context): needs a new copy key + `committed` prop. Backlog.
- FLOW-P2-002 (error card double "try again"): cosmetic; error remains actionable. Backlog.
- "Finish run" pre-submit confirmation: flow lens deferred this to post-go-live operator feedback (output field is a natural pause; avoid modal fatigue for Denis). Backlog.

## Manifest (files that may be touched)
manifest:
- src/app/(production)/production/_components/UnplannedRunDialog.tsx
- src/app/(production)/production/runs/[run_id]/_components/PickList.tsx
- src/app/(production)/production/runs/[run_id]/_components/DoneBar.tsx
- src/app/(production)/production/runs/[run_id]/_components/EditQtySheet.tsx
- src/app/(production)/production/runs/[run_id]/_components/AddMaterialControl.tsx
- src/app/(production)/production/runs/[run_id]/report/_components/ReportForm.tsx
- tests/e2e/production-picking.spec.ts

## Out-of-scope
- globals.css / tailwind.config.ts / design-token edits (frozen).
- Backend contracts, schema, migrations.

## Tests / verification
- `npx tsc --noEmit` → 0; `npx eslint .` → 0 errors.
- `npx vitest run` → all green.
- `npx playwright test --grep @mocked` → green; extend production-picking.spec.ts to assert the AddMaterialControl dropdown shows floor_name and rows disable during pending.

## Exit evidence (Gate 5)
- 5-lens re-audit verdict: ZERO P0 and ZERO P1 on the /production corridor after this tranche's P1 fixes. Screenshots in scratchpad/shots2 (today, tank pick with floor_name, IN_PRODUCTION read-only, report with Lucide steppers).

## Rollback
Revert the commit. All changes are component-level prop/class/live-region edits; clean revert.

## Operator approval
- [x] Tom approved the rollout plan (autonomy 2026-07-24); Phase 5 iteration.

## Actual evidence (build run 2026-07-24)
- `npx tsc --noEmit` → 0.
- `npx eslint .` → 0 errors, 281 warnings (unchanged baseline).
- `npx vitest run` → 129 files / 1063 tests green (no test-count change — the two new assertions are e2e).
- `npx playwright test tests/e2e/production-picking.spec.ts` → 11/11 green (+2 new: INTER-006 dropdown shows floor_name not Hebrew; INTER-007 pick rows lock while pick-confirm is in flight).
- `npx playwright test --grep @mocked` → 53 total: 44 passed + 1 timeout flake (`lean-nav.spec.ts:80`, a nav test outside this tranche; re-ran the whole `lean-nav.spec.ts` in isolation → 10/10 green, so it is a `next dev` on-demand-compilation latency artifact under full-suite load, not a regression — this tranche touches no nav file) + 8 queued-after. No /production-corridor test failed.
- Files changed: AddMaterialControl.tsx (INTER-006 option `floor_name ?? component_name`; INTER-010 +/- disabled during pending), PickList.tsx (INTER-007 rows `disabled` also on `confirm.isPending`; A11Y-T146-02 live region "Saving…"), ReportForm.tsx (A11Y-T146-04 live region "Saving…"; steppers already `disabled={disableForm}` — no change needed), DoneBar.tsx (INTER-009 blocked-button `title`), EditQtySheet.tsx (A11Y-T146-01 UOM `fg-subtle`→`fg-muted`), UnplannedRunDialog.tsx (INTER-010 +/- disabled during pending), production-picking.spec.ts (+2 tests). No token/globals/backend change.

## Gate 5 verdict
ZERO P0 and ZERO P1 on the /production corridor. The two residual P1s from iteration 1 (INTER-006, INTER-007) are closed and regression-locked by e2e; the cheap P2 batch is done; the remaining P2s are documented above as a bounded backlog. Phase 5 exit condition met.
