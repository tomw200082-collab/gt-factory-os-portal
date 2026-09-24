# Tranche 178 — dead code out

**Status:** built — see the PR for CI.
**Origin:** Tom, 2026-09-23, in writing: *"אני רוצה להריץ simplification רציני מאוד לכל הקוד במערכת"*,
then *"תריץ הכל"*. The portal half of a system-wide simplification pass; the backend half ships in
`gt-factory-os` on the same branch name.
sizing: L
scorecard_target_category: technical_substrate
expected_delta: 35 files and 70 exports that nothing uses stop being type-checked, linted and read;
no screen, route or behaviour changes.

## What was found

knip, configured for the app router with `tests/**` and `scripts/**` as entry points, reported:

- **34 source files no module imports** (3,548 lines).
- **70 exports and types no module uses** — not even the file that declares them — in 29 files.
  Vendored shadcn primitives under `src/components/ui/` are excluded on purpose.
- **3 dependencies nothing imports:** `@tanstack/react-table`, `pg`, `@types/pg`. The `"pg"` strings in
  `inventory/bulk-count` are the product-group vocabulary, not the driver.

Each of the 34 files was then checked against the other ways a file stays alive:

- its import specifier (`@/…` alias and relative forms) across `src/`, `tests/`, `scripts/` and the
  Next, Vitest and Playwright configs: zero hits. Four raw hits were same-named files in other folders
  (`./QuantityInput`, `./types`, `./recommendations`, `../_lib/api`);
- `docs/portal-os/baseline.json`, `quarantine.json`, `route-manifest.json`: none listed;
- route conventions: no page, layout, route, loading, error, template or middleware file is in the set;
- docs and skills in all three repos: the mentions are historical audit notes, not consumers.

`src/lib/env.ts` (tranche 011) is in the set. Its `requireEnv` was never wired, so it guarded nothing;
deleting it removes no protection.

## The change

- **S1** — delete the 34 files.
- **S2** — delete the 70 dead declarations in 29 files, then the helpers, props types and imports only
  they used. `users-repo.ts` held nothing but `usersRepo`; its one importer was the re-export in
  `repositories/index.ts`, removed with it, so the file is deleted too — 35 files, 3,588 lines in all.
  `StatusBadge.tsx` keeps only the `Badge` re-export shim its ~55 callers use.
- **S3** — `npm uninstall @tanstack/react-table pg @types/pg`; npm regenerates the lockfile.

**S4** — comments and portal-os docs that named removed code are corrected: `report.ts`, `TrendChart.tsx`,
`format.ts`, `repositories/types.ts`, the purchase-calendar redirect (whose "KEEP the sibling _lib/"
note was tranche 045 scope, not a consumer), `EntityPickerPlus.tsx`, `ui/Badge.tsx`, the meeting page,
`scorecard.json` / `scorecard.md` (the tranche 011 env fail-fast evidence was never in effect: its
helper was never called) and `design-readiness/primitives.md`. Scores are not changed here; that is
`/portal-scorecard`'s job. The `HeroBar` mention in `globals.css` is left alone.

Numbered 178: `main` took 176 the same day (#227, which also fixed the expired date in
`outcome-sheet.test.tsx`), and #229 took 177.

Kept on purpose: `eslint-config-next` (loaded through `FlatCompat` in `eslint.config.mjs`, which knip
cannot follow), `@vitest/expect` (the module jest-dom's matcher types augment), and the code under
`src/components/ui/` (only one stale comment in `ui/Badge.tsx` changes).

## Sizing

This exceeds the 12-file planning guide on purpose. Every change removes code that has zero importers;
splitting it into six tranches of the same kind would add process, not safety.

## Manifest (files that may be touched)

manifest:
  - package-lock.json
  - package.json
  - src/app/(planning)/planning/blockers/_components/DevTicketModal.tsx
  - src/app/(planning)/planning/blockers/_lib/devTicketContent.ts
  - src/app/(planning)/planning/blockers/_lib/types.ts
  - src/app/(planning)/planning/forecast/[version_id]/_lib/format.ts
  - src/app/(planning)/planning/inventory-flow/_components/HeroBar.tsx
  - src/app/(planning)/planning/meeting/page.tsx
  - src/app/(planning)/planning/purchase-calendar/page.tsx
  - src/app/(planning)/planning/production-plan/_lib/recipe-types.ts
  - src/app/(planning)/planning/purchase-calendar/_lib/api.ts
  - src/app/(production)/production/_lib/types.ts
  - src/app/(production)/production/runs/[run_id]/report/_lib/report.ts
  - src/app/(sales)/_lib/labels.ts
  - src/app/(shared)/dashboard/_components/TrendChart.tsx
  - src/components/badges/ReadinessBadge.tsx
  - src/components/badges/StatusBadge.tsx
  - src/components/dashboard/KpiTiles.tsx
  - src/components/data/AuditSnippet.tsx
  - src/components/data/SearchFilterBar.tsx
  - src/components/feedback/states.tsx
  - src/components/fields/DateTimeInput.tsx
  - src/components/fields/EntityPickerPlus.tsx
  - src/components/fields/EntitySearchSelect.tsx
  - src/components/fields/QuantityInput.tsx
  - src/components/fields/UomDisplay.tsx
  - src/components/line-editor/LineEditorTable.tsx
  - src/components/patterns/DetailPage.tsx
  - src/components/patterns/FormPage.tsx
  - src/components/patterns/ListPage.tsx
  - src/components/system/QuarantinedPage.tsx
  - src/components/tables/InlineEditSelectCell.tsx
  - src/components/ui/Badge.tsx
  - src/components/workflow/ApprovalBanner.tsx
  - src/components/workflow/DiffNotice.tsx
  - src/components/workflow/FieldGrid.tsx
  - src/features/dashboard/client.ts
  - src/features/dashboard/types.ts
  - src/features/inbox/meta.ts
  - src/features/master-data/SplitListLayout.tsx
  - src/features/ops/StatePreviewChip.tsx
  - src/features/ops/goods-receipt-schema.ts
  - src/features/ops/goods-receipt-submit.ts
  - src/features/ops/physical-count-submit.ts
  - src/features/ops/waste-adjustment-schema.ts
  - src/features/ops/waste-adjustment-submit.ts
  - src/lib/api/client.ts
  - src/lib/auth/authorize.ts
  - src/lib/auth/role-gate.tsx
  - src/lib/contracts/dto.ts
  - src/lib/contracts/goods-receipts.ts
  - src/lib/contracts/physical-count.ts
  - src/lib/contracts/waste-adjustments.ts
  - src/lib/display.ts
  - src/lib/env.ts
  - src/lib/fixtures/approvals.ts
  - src/lib/fixtures/dashboard.ts
  - src/lib/fixtures/exceptions.ts
  - src/lib/fixtures/forecast.ts
  - src/lib/fixtures/jobs.ts
  - src/lib/fixtures/recommendations.ts
  - src/lib/fixtures/submissions.ts
  - src/lib/obs/report.ts
  - src/lib/policy/recipe-readiness.ts
  - src/lib/repositories/idb.ts
  - src/lib/repositories/index.ts
  - src/lib/repositories/types.ts
  - src/lib/repositories/users-repo.ts
  - src/lib/review-mode/use-forced-state.ts

## Revive directives

revive: []

## Out-of-scope

- Route files, even unlinked ones: bookmarks and emailed links are consumers the code cannot see.
- Restructuring the large pages (`stock/production-actual` 5,046 lines, `admin/economics` 3,496,
  `planning/production-plan` 3,000). Moving code between files deletes none of it.
- `baseline.json` and `quarantine.json`: no entry is touched.

## Tests / verification

- typecheck clean
- eslint: 0 errors
- vitest: same result as `main` (1437/1438; `tests/unit/sales/outcome-sheet.test.tsx` fails on `main` too)
- `next build` succeeds
- playwright `@mocked`: CI

## Rollback

Revert the PR. It only deletes.
