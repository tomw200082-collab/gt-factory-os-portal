# Tranche 083: admin-items-mobile-cards

status: landed-pending-review
created: 2026-06-19
landed: 2026-06-19
verification: tsc --noEmit → 0 · eslint (page) → 0 errors (2 pre-existing warnings, line 397, unrelated)
scorecard_target_category: technical_substrate / mobile
expected_delta: +0 (mobile-quality polish; list-page mobile-card program)
sizing: S (1 page, additive responsive block; no backend change)

## Why this tranche
Second page in the list-page mobile-card program (see
`docs/portal-os/audit-reports/2026-06-19-ux-mobile-audit.md` and the T082
pattern). The items master list was horizontal-scroll-only on a phone.

## Scope (additive, in place — no backend change)
- **Edit** `src/app/(admin)/admin/items/page.tsx`:
  - Wrap the desktop `<table>` in `hidden md:block`.
  - Add a `md:hidden` card list: linked item name + id/sku, supply-method
    badge, health pill, status badge, family / sales-unit / case-pack facts,
    inline product-group assignment (admin) or label, and View + (admin)
    Activate/Deactivate actions at >=44px. Reuses SupplyMethodBadge /
    HealthPill / ItemStatusBadge / InlineEditSelectCell — no new deps.

### Out of scope
- No backend/schema/endpoint change. No new dependency. Desktop markup
  unchanged (only wrapped). Highlight-scroll ref is desktop-only (not
  replicated to cards); highlight background IS replicated.

## Manifest
manifest:
  - src/app/(admin)/admin/items/page.tsx
  - docs/portal-os/tranches/083-admin-items-mobile-cards.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Tests / verification
- `tsc --noEmit` → 0.
- `eslint` on the page → 0 errors.
- Visual mobile check via the PR Vercel preview.
