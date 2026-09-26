# Tranche 180: "Needs attention" says when it cannot see

status: built
created: 2026-09-26
scorecard_target_category: ops_surface
expected_delta: +0 on ops_surface (one card's failure state; no route, role or data change)
sizing: S

**Origin:** code review of tranches 176–179 (2026-09-26), highest-severity finding, verified against
prod. Tom, 2026-09-26: "תתקן".

## Why this tranche

Tranche 177's "Needs attention" card counts across both stock lists with `fgRows ?? []` and
`rmRows ?? []`. A list that failed to load is `undefined`, so it was counted as empty: when a stock
read failed, the card showed a green `0` and "Nothing is out, critical or below floor" on the
stock-truth page (prod has 58 rows it should be counting today). With one list failed it silently
undercounted, and the error banner only covers the open tab.

## Scope

- When either stock list has no data after loading, the card shows `—`, danger tone, and says the
  stock did not load. It never shows a count it could not make.
- Everything else unchanged. A refetch that fails over cached data keeps the cached count, as the
  table does.

## Manifest (files that may be touched)
manifest:
  - src/app/(shared)/inventory/page.tsx
  - tests/unit/stock/inventory-needs-attention.test.tsx

## Revive directives (if any)
revive: []

## Out-of-scope

- The "Items" and "Cost coverage" cards also sum over lists that may have failed. They show a
  lower number, not an all-clear, so they are left alone here.
- Other review findings on this page (`na` shown as "No cost", mixed sources in cost coverage, no
  `as_of`). Separate tranches if Tom wants them.

## Tests / verification

- typecheck clean
- vitest: full run, plus `tests/unit/stock/inventory-needs-attention.test.tsx` (RM/PKG read fails:
  the card shows `—` and the load message, never "Nothing is out")
- playwright: selectors untouched

## Rollback

Revert the PR on main. One client component and one test, no data-layer change, so the revert is clean.

## Operator approval

- [x] Tom asked for the fix directly in chat (2026-09-26); no separate plan step.

## Actual evidence (filled in by the run)

See PR body.
