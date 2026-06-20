# Tranche 086: simplify-items-card-casepack

status: landed-pending-review
created: 2026-06-19
landed: 2026-06-19
verification: tsc 0 · eslint 0 errors · logically identical to prior expression (visual unchanged)
scorecard_target_category: technical_substrate
expected_delta: +0 (/simplify readability cleanup)
sizing: XS (1 expression; behavior-preserving)

## Why
`/simplify` review of the T082–T085 diff. The only zero-churn, in-diff,
behavior-preserving simplification found: the items card-view case-pack cell
used a triple-branch ternary that tests `r.case_pack != null` twice. Replace
with a single up-front null guard (same output).

The substantive finding (extract a shared `ResponsiveDataList`/`renderCard`
for the 3 admin card blocks) is recommended as a SEPARATE tranche, not applied
here — it is well outside the reviewed diff and changes the house pattern.

## Scope
- **Edit** `src/app/(admin)/admin/items/page.tsx`: simplify the mobile card
  case-pack `<dd>` expression. No behavior change.

## Manifest
manifest:
  - src/app/(admin)/admin/items/page.tsx
  - docs/portal-os/tranches/086-simplify-items-card-casepack.md
  - docs/portal-os/tranches/_active.txt
  - docs/portal-os/registry.md

## Verification
- tsc 0 · eslint (page) 0 · iPhone-14 Playwright shot unchanged.
