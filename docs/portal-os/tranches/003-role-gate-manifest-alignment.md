# Tranche 003: role-gate-manifest-alignment

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: role_gate_correctness
expected_delta: +2 (role_gate_correctness 6→8)
sizing: S (2 files)

## Why this tranche
The audit flagged three manifest-vs-layout mismatches: `/dashboard` (manifest planner+admin; layout admits any auth), `/exceptions` (manifest planner+admin; layout admits viewer), and `/inbox/approvals/*` (layout admits viewer but server 403s on click). The pragmatic fix is to pin the manifest to the layouts' actual behavior for the first two (the UX intent is cross-role read-only access) and tighten only the approvals subtree where the server rejection is a real dead-end.

## Scope
- Widen `route-manifest.json` roles for `/dashboard` and `/exceptions` to `[operator, planner, admin, viewer]` to match `(shared)/layout.tsx` and `(planner)/layout.tsx` admit lists.
- Add a child layout at `src/app/(inbox)/inbox/approvals/layout.tsx` that tightens the approval-detail subtree to `[planner, admin]` so viewers get a proper "not for your role" card instead of a 403 after clicking Approve.

## Manifest (files that may be touched)
manifest:
  - docs/portal-os/route-manifest.json
  - src/app/(inbox)/inbox/approvals/layout.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Rewriting `(planner)/layout.tsx` allow list — that surface (the exceptions list + planning dashboard) is intentionally viewer-readable; tightening it would break designed UX.

## Tests / verification
- typecheck clean.
- Manifest reconciles with code via regression-sentinel.

## Rollback
Revert the single tranche commit; no runtime behavior change for viewer.

## Operator approval
- [x] Tom approves this plan (session directive "פשוט תתקן את הכל בריצה אחת" 2026-04-22).

## Actual evidence
Filled in post-land.
