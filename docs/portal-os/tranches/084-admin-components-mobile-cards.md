# Tranche 084: admin-components-mobile-cards

status: landed-pending-review
created: 2026-06-19
landed: 2026-06-19
verification: tsc --noEmit → 0 · eslint (page) → 0 errors (4 pre-existing warnings, line 319, unrelated)
scorecard_target_category: technical_substrate / mobile
expected_delta: +0 (mobile-quality polish; list-page mobile-card program)
sizing: S (1 page, additive responsive block; no backend change)

## Why this tranche
Third page in the list-page mobile-card program (audit
`docs/portal-os/audit-reports/2026-06-19-ux-mobile-audit.md`; T082/T083 pattern).
The components (RM/PKG master) list was horizontal-scroll-only on a phone.

## Scope (additive, in place — no backend change)
- **Edit** `src/app/(admin)/admin/components/page.tsx`: wrap desktop `<table>`
  in `hidden md:block`; add `md:hidden` card list (linked name + id, category,
  readiness pill, status badge, stock-unit / lead-time facts, primary-supplier
  link/▵no-supplier, View + admin toggle ≥44px; tap-to-select parity). Reuses
  CategoryCell / ReadinessPill / ComponentStatusBadge / Badge — no new deps.

### Out of scope
- No backend/schema/endpoint change. No new dependency. Desktop markup
  unchanged (only wrapped).

## Manifest
manifest:
  - src/app/(admin)/admin/components/page.tsx
  - docs/portal-os/tranches/084-admin-components-mobile-cards.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Tests / verification
- `tsc --noEmit` → 0.
- `eslint` on the page → 0 errors.
- Visual mobile check via the PR Vercel preview.
