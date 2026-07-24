# Tranche 141 — Production order picking (Denis's start-of-run materials collection)

**Status:** in progress
**Origin:** Tom chat 2026-07-24 — "מעגל פקודת הייצור" (adopted-in-principle in factory mapping 2026-07-22). Grilled to 9 locked decisions; design spec + locked-decision v2 amendment in `gt-factory-os-production-brain` PR #62. Tom: "תעבוד בצורה אוטונומית תוך כדי בנייה מהממת ויפה ובדיקות שותפות של uxui" + `/ux-release-gate` `/ui-ux-pro-max` `/frontend-design`.
sizing: L+ (foundational new operator surface — a coherent multi-screen flow; larger than the S guideline by design, single feature)
scorecard_target_category: ops_surface
expected_delta: net-new operator flow (start-of-run picking); ops_surface stays ≥ 9, adds the missing consumption-at-start path

## Why this tranche
Today stock decrements are back-computed at production-report time; there is no start-of-run materials collection. This tranche adds `/production` — the operator (Denis) opens today's runs from the plan, picks BOM-exploded materials with prefilled editable quantities, and confirms → stock decrements at pick time. Closes the "recipe ↔ Denis's actual execution" gap Tom named in the mapping.

## Goal
`/production` becomes the operator-role landing = today's runs, ordered "make tank → fill product A → fill product B". Tapping a run opens a stage-aware picking screen (TANK = liquids, PACK = packaging, SINGLE = both): tap-per-row confirms the prefilled BOM quantity, tapping the number edits it, liquids grouped above packaging, a large "Done collecting" button enables only when every row is resolved (✓ / edited / "Not taken"). Confirm → `PICK_CONSUMPTION` ledger rows (physical truth wins: shortage/excess never block, each flags). Simple English only, word-poor, touch-first (≥44px, `.btn-lg`/`h-14` on the touch path), `floor_name ?? item_name` with a small Hebrew secondary line.

## Scope
- New route group `(production)` with a `stock:execute` `RoleGate` layout; `/production` list is the operator landing.
- Stage-aware picking screen with tap-per-row + inline edit + resolve-gate "Done collecting".
- Unplanned-run creation (tag + immediate flag, never blocks).
- Active-run corrections: "+ Add material" / "Return" (append-only deltas).
- API proxy one-liners over `proxyRequest` to the new backend `production-runs` endpoints.
- Nav manifest entry + operator cockpit `primaryHref` → `/production` + middleware prefix.
- Single English dict file (`_lib/copy.ts`, `en` field; `ru` slot reserved, not built).
- NOT the end-of-run report reshape / QC / per-date cutover / floor-name backfill — those are tranche 142.

## Manifest (files that may be touched)
manifest:
- src/app/(production)/layout.tsx
- src/app/(production)/production/page.tsx
- src/app/(production)/production/_lib/copy.ts
- src/app/(production)/production/_lib/copy.test.ts
- src/app/(production)/production/_lib/runs.ts
- src/app/(production)/production/_lib/runs.test.ts
- src/app/(production)/production/_lib/types.ts
- src/app/(production)/production/_components/RunList.tsx
- src/app/(production)/production/_components/RunCard.tsx
- src/app/(production)/production/_components/UnplannedRunDialog.tsx
- src/app/(production)/production/runs/[run_id]/page.tsx
- src/app/(production)/production/runs/[run_id]/_lib/pick.ts
- src/app/(production)/production/runs/[run_id]/_lib/pick.test.ts
- src/app/(production)/production/runs/[run_id]/_components/PickList.tsx
- src/app/(production)/production/runs/[run_id]/_components/PickRow.tsx
- src/app/(production)/production/runs/[run_id]/_components/EditQtySheet.tsx
- src/app/(production)/production/runs/[run_id]/_components/DoneBar.tsx
- src/app/(production)/production/runs/[run_id]/_components/AddMaterialControl.tsx
- src/app/api/production-runs/today/route.ts
- src/app/api/production-runs/route.ts
- src/app/api/production-runs/[run_id]/pick-list/route.ts
- src/app/api/production-runs/[run_id]/pick-confirm/route.ts
- src/app/api/production-runs/[run_id]/material-delta/route.ts
- src/lib/nav/manifest.ts
- src/features/home/cockpit.ts
- src/features/home/cockpit.test.ts
- src/middleware.ts
- tests/e2e/production-picking.spec.ts

## Out-of-scope
- End-of-run report reshape (output + scrap + QC) → tranche 142.
- Per-date cutover of `/stock/production-actual` + double-consumption guard → tranche 142.
- `floor_name` master-data backfill / item photos → tranche 142 + phase 2.
- Any change to `tailwind.config.ts` / `globals.css` / UX-standard docs (forbidden for the portal executor — compose existing tokens/classes only).
- Russian language (dict slot reserved, not populated).

## Tests / verification
- typecheck clean (`npx tsc --noEmit`).
- eslint clean.
- vitest: `_lib/copy.test.ts`, `_lib/runs.test.ts`, `runs/[run_id]/_lib/pick.test.ts`, `cockpit.test.ts` (updated).
- playwright `@mocked`: `tests/e2e/production-picking.spec.ts` (list renders ordered; open run → pick rows; tap-confirm + edit; Done gate disabled until resolved; unplanned dialog).
- regression-sentinel: no baseline regressions; nav/cockpit change re-anchors baseline if needed.

## Exit evidence
- Playwright screenshots (both themes, mobile + desktop) attached to PR.
- tsc/eslint/vitest/@mocked-playwright green in `portal-pr-guard`.
- PR link.

## Rollback
Revert the PR on main. Purely additive new route group + one nav/cockpit/middleware entry each; no data-layer or token change, so revert is clean. Backend endpoints are additive and independently revertible.

## Operator approval
- [ ] Tom approves this plan (autonomy granted in chat 2026-07-24; PR merge = approval, paired with brain PR #62).

## Actual evidence (filled in by the build run)
<pasted after execution: typecheck summary, test pass count, PR URL>
