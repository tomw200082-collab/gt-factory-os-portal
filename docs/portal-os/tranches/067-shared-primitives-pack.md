# Tranche 067 — shared-primitives pack (admin UX/UI audit, cross-cutting themes)

status: implemented (branch `claude/admin-pages-uxui-testing-pyyurn`; Tom merges)
evidence: tsc --noEmit clean · vitest 673/673 (83 files; +2 new files / +10 tests:
ConfirmDialog 5, QueryCountChip 5) · next build OK · eslint 0 errors (268 warnings,
−1 vs baseline) · zero `window.confirm(` left in (admin)/(economics); zero
`bg-bg-card` left in src/. Playwright not runnable in this environment.
source: consolidated admin UX/UI audit (2026-06-13, `docs/ux/admin-pages-uxui-audit-2026-06-13.md`).
Clears the highest-leverage cross-cutting themes in one bounded pack:
  - THEME A — `window.confirm()` everywhere → one accessible `ConfirmDialog`
    (Radix Dialog, role=alertdialog, focus-managed, danger tone, named entity).
  - THEME B — count chips show "0 items" during load → `QueryCountChip` gated on
    data availability (UX-Standard §3).
  - THEME D — feedback banners missing `aria-live` → role/aria-live added.
  - THEME F — `bg-bg-card` undeclared token → `bg-bg-raised` (transparent surfaces).

language: English-first (no corridor surfaces touched).
token files NOT edited (tailwind.config.ts / globals.css untouched — THEME F is a
component-level class swap to the already-defined `bg-bg-raised`).

## File manifest

New primitives (+ tests):
- `docs/portal-os/tranches/067-shared-primitives-pack.md` — this plan.
- `docs/portal-os/tranches/_active.txt` — 067 while active; cleared at close.
- `docs/portal-os/registry.md` — register this tranche.
- `src/components/overlays/ConfirmDialog.tsx` — NEW `useConfirm()` hook + dialog.
- `src/components/overlays/ConfirmDialog.test.tsx` — NEW unit tests.
- `src/components/feedback/QueryCountChip.tsx` — NEW load/error-gated count chip.
- `src/components/feedback/QueryCountChip.test.tsx` — NEW unit tests.

THEME A — replace window.confirm (8 admin/economics sites):
- `src/app/(admin)/admin/items/page.tsx` — status toggle → ConfirmDialog (names item_name).
- `src/app/(admin)/admin/suppliers/page.tsx` — status toggle (names supplier_name_official).
- `src/app/(admin)/admin/components/page.tsx` — status toggle (names component_name).
- `src/app/(admin)/admin/cost-drafts/page.tsx` — reject (danger tone, named target).
- `src/app/(admin)/admin/masters/components/[component_id]/page.tsx` — promote primary.
- `src/app/(admin)/admin/supplier-items/page.tsx` — set as primary (names component/item).
- `src/app/(admin)/admin/users/page.tsx` — role change (named user, danger tone).
- `src/app/(economics)/admin/economics/page.tsx` — clear sale price (danger tone).

THEME B — QueryCountChip on list headers:
- `src/app/(admin)/admin/items/page.tsx`, `suppliers/page.tsx`, `components/page.tsx`,
  `users/page.tsx` — count chips gated on `!isLoading && data !== undefined`.

THEME D — aria-live on feedback banners:
- `src/app/(admin)/admin/items/page.tsx`, `suppliers/page.tsx`, `components/page.tsx`
  — banner container gets role=alert/status + aria-live + aria-atomic.

THEME F — bg-bg-card → bg-bg-raised:
- `src/components/patterns/DetailPage.tsx` (sticky tab strip, ×2),
  `src/components/admin/ClassWEditDrawer.tsx`, `src/components/admin/MasterSummaryCard.tsx`,
  `src/app/(admin)/admin/jobs/page.tsx`.

## Verification gate
- `tsc --noEmit` clean.
- `vitest run` green (incl. new ConfirmDialog + QueryCountChip tests).
- `next build` succeeds.
- No `window.confirm(` remaining in `src/app/(admin)/**` or the economics admin page.
