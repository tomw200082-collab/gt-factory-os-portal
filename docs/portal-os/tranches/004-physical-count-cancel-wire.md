# Tranche 004: physical-count-cancel-wire

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: flow_continuity + ops_surface
expected_delta: +2 (flow_continuity 2→3, ops_surface 3→4)
sizing: S (1 file)

## Why this tranche
The flow-continuity audit flagged the Physical Count "Cancel snapshot" button as a snapshot leak: it only calls `resetFlow()` (client-only), never the existing `POST /api/physical-count/[id]/cancel` proxy. Every operator cancel leaves an open server snapshot. One-file fix: add an async `handleCancel()` that POSTs to the proxy with an idempotency key, then resets client state regardless of server outcome (so the UX stays snappy even on transient errors).

## Scope
- Add `handleCancel()` async function in `physical-count/page.tsx` that POSTs `/api/physical-count/{snapshot_id}/cancel` with an idempotency key.
- Wire the "Cancel snapshot" button `onClick` to `handleCancel` instead of `resetFlow` directly.
- Keep `resetFlow()` as the post-cancel client reset (called from handleCancel's .finally()).

## Manifest (files that may be touched)
manifest:
  - src/app/(ops)/stock/physical-count/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- TanStack cache invalidation (no list query exists for physical-counts yet).

## Tests / verification
- typecheck clean.
- manual trace: Cancel button now issues a POST to the proxy before client state resets.

## Rollback
Revert the single tranche commit.

## Operator approval
- [x] Tom approves this plan (session directive "פשוט תתקן את הכל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
