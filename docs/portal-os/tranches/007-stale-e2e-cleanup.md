# Tranche 007: stale-e2e-cleanup

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: regression_resistance
expected_delta: +1 (regression_resistance 5→6)
sizing: S (1 file — deletion)

## Why this tranche
`tests/e2e/goods-receipt-success.spec.ts` walks the deleted route `/ops/receipts` (current: `/stock/receipts`), uses `setFakeRole` (which writes `gt.fakeauth.v1` before render), and asserts text `Receipt recorded (mock)` that is no longer emitted by the live form. It cannot pass against the current portal and misleads anyone reading the spec tree. Delete it.

## Scope
- Delete `tests/e2e/goods-receipt-success.spec.ts`.

## Manifest (files that may be touched)
manifest:
  - tests/e2e/goods-receipt-success.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Deleting the stale `_todo_after_bootstrap[1]` reference in `quarantine.json` (hook Rule 6 blocks quarantine.json edits; requires separate kind=quarantine-update ritual).

## Tests / verification
- The other e2e specs still reference live routes and are unchanged.

## Rollback
Restore from git.

## Operator approval
- [x] Tom approves this plan (session directive "פשוט תתקן את הכל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
