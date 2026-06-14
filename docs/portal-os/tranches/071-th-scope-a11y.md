# Tranche 071 — `<th scope="col">` accessibility pass (A11Y-025)

status: implemented (branch `claude/admin-pages-uxui-testing-pyyurn`; Tom merges)
evidence: tsc --noEmit clean · vitest 673/673 (83 files) · next build OK ·
eslint 0 errors · every `<th>` in (admin) now carries scope="col" (22 files).
Playwright not runnable in this environment.
source: consolidated admin UX/UI audit (2026-06-13, `docs/ux/admin-pages-uxui-audit-2026-06-13.md`)
A11Y-025 (WCAG 1.3.1). Every admin data table's column headers gain
`scope="col"` so screen readers reliably associate header cells with data
cells. Verified: all `<th>` in `(admin)` live inside `<thead>` (none are row
headers in `<tbody>`), so `scope="col"` is correct for every one.

Mechanical, additive (one attribute), zero visual change. No DB/backend/copy.

## Approach
Per file: `<th className=` → `<th scope="col" className=`. Plus the 8 bare
`<th>` headers in cost-drafts (`<th>` → `<th scope="col">`), and the reusable
multiline `<th>` header component in supplier-items.

## File manifest (22 admin pages with data tables)
- `docs/portal-os/tranches/071-th-scope-a11y.md` · `_active.txt` · `registry.md`.
- `src/app/(admin)/admin/{components,users,supplier-items,sku-health,sku-aliases,
  planning-policy,sku-map,items,cost-drafts,holidays,products/new,suppliers,
  groups}/page.tsx`
- `src/app/(admin)/admin/purchase-orders/parity-check/page.tsx`
- `src/app/(admin)/admin/masters/{components/[component_id],items/[item_id],
  health,suppliers/[supplier_id],archive,boms,boms/[bom_head_id],
  boms/[bom_head_id]/[version_id]}/page.tsx`

## Verification gate
- `tsc --noEmit` clean · `vitest run` green · `next build` OK · `eslint` 0 errors.
- No `<th` left without `scope=` in `(admin)`.
