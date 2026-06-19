# Tranche 082: admin-suppliers-mobile-cards

status: landed-pending-review
created: 2026-06-19
landed: 2026-06-19
verification: tsc --noEmit → 0 · eslint (page) → 0 errors (3 pre-existing warnings, line 292, unrelated)
scorecard_target_category: technical_substrate / mobile
expected_delta: +0 (mobile-quality polish; pattern-setter for the list-page
mobile-card program in the 2026-06-19 UX/mobile audit)
sizing: S (1 page, additive responsive block; no backend change)

## Why this tranche
Per `docs/portal-os/audit-reports/2026-06-19-ux-mobile-audit.md`: the suppliers
master list renders a single `overflow-x-auto` table with no mobile card view,
so on a phone it is horizontal-scroll-only — the weakest pattern for scannable
list data. This tranche adds a `<md` card view (table preserved at `md+`),
mirroring the proven `InventoryCardMobile` pattern. Pattern-setter for the
remaining admin list pages.

## Scope (additive, in place — no backend change)
- **Edit** `src/app/(admin)/admin/suppliers/page.tsx`:
  - Wrap the existing desktop `<table>` in `hidden md:block`.
  - Add a `md:hidden` card list rendering the same rows: linked supplier name +
    short name + id, type / currency / lead chips, contact one-liner, status
    badge, and the View + (admin) Activate/Deactivate actions. Reuses the
    existing `SupplierTypeBadge` / `CurrencyChip` / `ContactCell` /
    `SupplierStatusBadge` components — no new tokens, no new deps.
  - Tap-to-select parity with the table row (sets the inline detail panel),
    inner links/buttons stopPropagation; action targets ≥44px.

### Out of scope
- No backend / schema / endpoint change. No new dependency. No copy change.
- Desktop table markup unchanged (only wrapped in `hidden md:block`).

## Manifest
manifest:
  - src/app/(admin)/admin/suppliers/page.tsx
  - docs/portal-os/tranches/082-admin-suppliers-mobile-cards.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Tests / verification
- `tsc --noEmit` → 0 (baseline was green pre-tranche).
- `eslint` on the page → 0.
- Visual mobile check via the PR's Vercel preview (iPhone width): cards render,
  no horizontal scroll, actions tappable. Desktop unchanged at md+.
