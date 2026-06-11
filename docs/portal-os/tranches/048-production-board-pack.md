# Tranche 048 — Production board & reporting pack (Phase 6, portal-only tier)

status: executed 2026-06-11 — pending merge
phase: improvement-plan-2026-06 Phase 6 item 2 (portal-only items: C6, C7 Tier 1, D13 Tier 1, INTER-004/005/010/011/012)
approved_by: Tom (2026-06-11 full-run authorization)

## File manifest
- src/app/(ops)/stock/production-actual/page.tsx — C6 one-tap "Confirm: produced exactly as planned" fast path when from_plan_id present & qty untouched; C7 Tier 1: on under-production beyond the variance band offer "Close plan" vs "Close and re-plan remainder" (creates linked plan row for planned−output via existing POST, tomorrow default)
- src/app/(planning)/planning/production-plan/page.tsx — INTER-004 UoM select (known UoM list) + inline field errors in ManualAddModal; INTER-011 refetchInterval 60s + manual Refresh + last-updated; INTER-012 disabled recommendation rows get title= reason; D13 Tier 1: "Today" summary strip (produced X of Y, unreported count) + per-plan quick "Move to tomorrow" using existing date PATCH + compact tomorrow preview
- src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx — INTER-005/010: CancelModal confirm becomes filled btn-danger; edit/cancel icon buttons ≥32px touch targets
- src/app/(planning)/planning/production-plan/_lib/* — helpers as needed (additive)
- new unit tests for extracted pure helpers
- docs/portal-os/tranches/048-production-board-pack.md, registry.md

## Gates
tsc clean; vitest green; no regression to existing testids

## Checklist
- [x] Implemented  - [x] Typecheck (tsc --noEmit clean)  - [x] Vitest (465/465 green; 451 baseline + 14 new board-summary tests)  - [ ] Pushed

## Evidence (2026-06-11)
- New pure logic: `src/app/(planning)/planning/production-plan/_lib/board-summary.ts` (buildUomOptions, computeTodaySummary, groupFieldErrors, fmtUpdatedTime) + `board-summary.test.ts` (14 tests).
- `_lib/usePlans.ts` additive: `PlanMutationError` (status + raw validation_errors) thrown by useCreatePlan with unchanged message text; `refetchInterval: 60_000` on usePlans (INTER-011).
- C7 note: the success-panel variance row previously read the derived `linkedPlan`, which is nulled on success (fromPlanId is cleared) — the plan row is now captured at commit time as `done.committedPlan`, which both makes the variance row reachable and feeds the re-plan remainder action.
- Deviations: UoM option list uses the contract `UOMS` seed (src/lib/contracts/enums.ts) — "PC" does not exist in this codebase (PCS does); INTER-012 disabled-row reasons are feasibility-only because already-planned recommendations are filtered out server-side.
- No existing data-testids removed (git diff verified).
