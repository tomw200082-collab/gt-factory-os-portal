# Tranche 006: ops-banner-deep-links

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: flow_continuity + ops_surface
expected_delta: +2 (flow_continuity 4→5, ops_surface 4→5)
sizing: S (2 files)

## Why this tranche
Closes the orphan-approval flow for waste + physical-count. When the server returns `status:"pending"`, the success banner currently shows `submission_id=...` as plain text — the operator has no way to hand the approval link to a planner, and the planner has no way to reach it without typing the URL. Adding a click-through link from the operator's own banner lets them paste/share the link, and makes the approval surface discoverable.

## Scope
- `src/app/(ops)/stock/waste-adjustments/page.tsx`: extend `DoneState` with optional `href` + `hrefLabel`; pending-status response sets `href=/inbox/approvals/waste/{submission_id}`; banner renders `<Link>` when href present.
- `src/app/(ops)/stock/physical-count/page.tsx`: same pattern; pending-status response sets `href=/inbox/approvals/physical-count/{submission_id}`.

## Manifest (files that may be touched)
manifest:
  - src/app/(ops)/stock/waste-adjustments/page.tsx
  - src/app/(ops)/stock/physical-count/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- `receipts/page.tsx` and `production-actual/page.tsx`: these always auto-post; there is no approval surface to deep-link yet. Tranche 008 adds a `/stock/submissions` read-back surface that all four banners will eventually link to.

## Tests / verification
- typecheck clean.

## Rollback
Revert the tranche commit.

## Operator approval
- [x] Tom approves this plan (session directive "פשוט תתקן את הכל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
