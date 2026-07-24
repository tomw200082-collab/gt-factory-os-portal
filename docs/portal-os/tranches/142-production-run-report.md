# Tranche 142 — Production run end-of-run report (output + scrap + QC)

**Status:** in progress
**Origin:** Tom chat 2026-07-24 — "מעגל פקודת הייצור" S3 follow-up to tranche 141 (brain PR #62 merged 2026-07-24 = approval). Tom: "אני מאשר הכל. תמזג ותמשיך בעבודה."
sizing: M
scorecard_target_category: ops_surface
expected_delta: completes the picking cycle — the run's terminal step (report output/scrap/QC)

## Why this tranche
Tranche 141 built start-of-run picking (stock decrements at pick confirm). This adds the **end-of-run report**: after production, the operator reports output + scrap + optional QC (Brix/pH/sample/note); it posts OUTPUT rows only (consumption already happened at pick time) and moves the run to REPORTED. Also closes the tranche-141 UX finding INTER-006 (the pick-confirm success screen had no path to the report).

## Goal
`/production/runs/[run_id]/report` — a simple English, touch-first report form: output quantity + scrap quantity (big steppers), an optional QC block (Brix, pH, "sample taken", short note — all optional, never blocks), and a notes field. Submit → `POST /api/production-runs/:id/report` (existing backend endpoint) → success → back to today. The pick-confirm success screen (PickList) gains a primary "Report production" CTA to this route. Nothing mandatory except output_qty.

## Scope
- New report page + form + pure helper (validation/payload build) + api proxy.
- Add a "Report production" CTA on the tranche-141 pick-confirm success screen (PickList.tsx) and on IN_PRODUCTION run re-entry.
- New copy keys for the report surface (in the existing `_lib/copy.ts`).
- NOT the per-date cutover of `/stock/production-actual` or the `floor_name` master backfill — those are tranche 143.

## Manifest (files that may be touched)
manifest:
- src/app/(production)/production/runs/[run_id]/report/page.tsx
- src/app/(production)/production/runs/[run_id]/report/_components/ReportForm.tsx
- src/app/(production)/production/runs/[run_id]/report/_lib/report.ts
- src/app/(production)/production/runs/[run_id]/report/_lib/report.test.ts
- src/app/api/production-runs/[run_id]/report/route.ts
- src/app/(production)/production/runs/[run_id]/_components/PickList.tsx
- src/app/(production)/production/_lib/copy.ts
- src/app/(production)/production/_lib/copy.test.ts
- tests/e2e/production-picking.spec.ts

## Out-of-scope
- Per-date cutover of `/stock/production-actual` + double-consumption guard → tranche 143.
- `floor_name` master-data backfill / item photos → tranche 143 + phase 2.
- Any `globals.css` / `tailwind.config.ts` / UX-standard-doc change.

## Tests / verification
- typecheck clean; eslint clean.
- vitest: `report.test.ts` (payload build + optional-QC handling), `copy.test.ts` updated.
- playwright `@mocked`: extend `production-picking.spec.ts` — report form submits with only output; QC optional.

## Exit evidence
- tsc/eslint/vitest/@mocked-playwright green in `portal-pr-guard`.
- PR link (same portal PR #183, stacked commit).

## Rollback
Revert the commit. Additive new route + one CTA edit; no data-layer or token change; clean revert.

## Operator approval
- [x] Tom approved this plan (autonomy + "אני מאשר הכל" 2026-07-24).

## Actual evidence (filled in by the build run)
<pasted after execution>
