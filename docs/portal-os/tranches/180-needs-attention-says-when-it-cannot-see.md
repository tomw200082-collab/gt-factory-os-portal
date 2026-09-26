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

- `KpiCard` gets an `unavailable` state: `—`, danger tone, "We couldn't load this. Try Refresh."
  (`portal_ux_standard.md` §3: an error state shows no counts). While loading it shows the skeleton
  alone, with no tone and no line under it. Before this, "Needs attention" showed a green "Nothing is
  out…" under the skeleton on every page load, and "Cost coverage" showed "Every item has a cost."
- All four headline cards use it. Items, Needs attention and Cost coverage are unavailable when
  either stock list has no data. Stock value and Cost coverage are unavailable when
  `/api/stock/value` fails, where they used to show a skeleton forever.
- A refetch that fails over cached data keeps the cached numbers, as the table does.

## Manifest (files that may be touched)
manifest:
  - src/app/(shared)/inventory/page.tsx
  - tests/unit/stock/inventory-needs-attention.test.tsx

## Revive directives (if any)
revive: []

## Out-of-scope

- Other review findings on this page (`na` shown as "No cost", mixed sources in cost coverage, no
  `as_of`). Separate tranches if Tom wants them.

## Tests / verification

- typecheck clean
- vitest: full run, plus `tests/unit/stock/inventory-needs-attention.test.tsx`: RM/PKG read fails
  (card shows `—` and the load message, never "Nothing is out"); still loading (label and skeleton
  only); both lists load empty (the real all-clear). The first two fail on the tranche 177 page.
- playwright: selectors untouched

## Rollback

Revert the PR on main. One client component and one test, no data-layer change, so the revert is clean.

## Operator approval

- [x] Tom asked for the fix directly in chat (2026-09-26); no separate plan step.

## Actual evidence (filled in by the run)

See PR body.
