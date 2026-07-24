# Tranche 143 — Production picking cutover (old screen → /production)

**Status:** in progress
**Origin:** Production picking rollout plan (`gt-factory-os-production-brain/docs/plans/2026-07-24-production-picking-rollout.md`), Phase 2. Tom: "אני מאשר הכל. תמזג ותמשיך" (2026-07-24).
sizing: M
scorecard_target_category: ops_surface
expected_delta: retires the last legacy touch-points into `/production`; closes the picking rollout's portal side

## Why this tranche
Tranches 141+142 built the new `/production` picking flow (start-of-run pick + end-of-run report). This tranche cuts over every remaining link/nav entry that still points at the legacy `/stock/production-actual` report screen to `/production`, so the picking flow is the sole entry point for daily operator use. The old route stays reachable by direct URL for 30 days (rollback safety) but leaves primary nav and every in-app link.

## Goal
Seven exact touch-points repointed to `/production` (or removed where a `/production` equivalent already exists), plus `floor_name` displayed on pick rows (big Latin-script name with the Hebrew `component_name` as a small fallback/cross-check), matching the migration 0296 column shipped in Phase 1.

## Scope — the 7 cutover touch-points
1. `src/lib/nav/manifest.ts:241` — remove the old `/stock/production-actual` nav entry (the `/production` entry already exists at line 213).
2. `src/features/dashboard/quick-actions.ts:87` — repoint the quick action to `/production`.
3. `src/features/home/cockpit.ts:263` — remove the old home tile (the new `/production` tile already exists at line 254); fix the corresponding snapshot in `cockpit.test.ts:137`.
4. `src/app/(planning)/planning/production-plan/page.tsx:2295` — "Open Production Report" link → `/production`.
5. `src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx:99,100` — `?from_plan_id=` links → `/production`. Line 564's `?submission_id=` history-detail link **stays** on the old page (no new equivalent for historical detail view).
6. `src/app/(planning)/planning/runs/[run_id]/recommendations/[rec_id]/page.tsx:288` — link → `/production`.
7. `src/app/(planning)/planning/inventory-flow/_components/PlannedItemSection.tsx:138` — `?item_id=` link → `/production`.

The old route (`/stock/production-actual`), its `/api/production-actuals/*` proxies, and dashboard/today-board consumers are untouched (data layer unchanged; direct-URL access stays alive for 30 days).

## floor_name display
- `_lib/types.ts`: `PickListLine.floor_name?: string | null` (backend already returns it post-Phase-1).
- `PickRow.tsx`: render `line.floor_name ?? line.component_name` as the big primary name; when `floor_name` is present, show the Hebrew `component_name` small underneath in `<bdi>` (reuse the existing `name_he` slot pattern).

## Manifest (files that may be touched)
manifest:
- src/lib/nav/manifest.ts
- src/features/dashboard/quick-actions.ts
- src/features/home/cockpit.ts
- src/features/home/cockpit.test.ts
- src/app/(planning)/planning/production-plan/page.tsx
- src/app/(planning)/planning/production-plan/_components/ProductionJobCard.tsx
- src/app/(planning)/planning/production-plan/_components/card-report-link.test.tsx
- src/app/(planning)/planning/runs/[run_id]/recommendations/[rec_id]/page.tsx
- src/app/(planning)/planning/inventory-flow/_components/PlannedItemSection.tsx
- src/app/(production)/production/_lib/types.ts
- src/app/(production)/production/runs/[run_id]/_components/PickRow.tsx
- tests/unit/nav/manifest-visibility.test.ts
- tests/e2e/production-picking.spec.ts
- tests/e2e/lean-nav.spec.ts

## Out-of-scope
- Backend (migrations, handlers) — Phase 1, already merged.
- UX polish iterations (/ux-release-gate findings) — Phase 4/5, tranches 144/145.
- `globals.css` / `tailwind.config.ts` / UX-standard-doc edits.

## Tests / verification
- `npx tsc --noEmit` → 0.
- `npx eslint .` → 0 errors (pre-existing warnings baseline unaffected).
- `npx vitest run` → all green; update `cockpit.test.ts:137` and `manifest-visibility.test.ts` if snapshots break on the removed old tile/nav entry.
- `NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH=true npm run dev` + `npx playwright test --grep @mocked` → all green.

## Exit evidence
- tsc/eslint/vitest/@mocked-playwright green in `portal-pr-guard`.
- PR link (portal PR #183, stacked commit).

## Rollback
Revert the commit. All 7 changes are link/nav re-points + one column-display addition; old route stays live at its direct URL, so revert is clean with no data-layer impact.

## Operator approval
- [x] Tom approved this plan (autonomy + "אני מאשר הכל" 2026-07-24; rollout plan Phase 2).

## Actual evidence (filled in by the build run)
<pasted after execution>
