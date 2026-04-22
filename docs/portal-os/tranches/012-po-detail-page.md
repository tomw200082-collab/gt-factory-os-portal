# Tranche 012: po-detail-page

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: flow_continuity + ops_surface + nav_integrity
expected_delta: +3 total (flow_continuity 5→7, nav_integrity 6→7)
sizing: M (3 files; 1 new page, 1 new proxy, 1 list edit + manifest)

## Why this tranche
Re-audit found the PO chain is a **dead-end object**: convert-to-PO emits a deep link to `/purchase-orders/{po_id}` that 404s because no detail page exists on disk; PO list rows have no click-through; PO line statuses cannot be advanced from the portal. This is the **#1 portal-native production blocker** identified in the re-audit. Three-file landing unblocks the entire planner→PO loop.

## Scope
- New `src/app/api/purchase-orders/[po_id]/route.ts` — GET-only transport proxy to upstream `/api/v1/queries/purchase-orders/{id}`. Identical pattern to existing list proxy. No contract authoring; if the upstream doesn't yet expose this, the proxy returns upstream's actual error and the detail page surfaces it through the T009 error boundary (honest, not fabrication).
- New `src/app/(po)/purchase-orders/[po_id]/page.tsx` — detail surface. Three sections: (1) Header card (po_number, status badge, supplier, currency, order_date, expected_receive_date, total_net); (2) Lines table (one row per ordered line with item_id, ordered_qty, received_qty, unit_price, line total); (3) Source linkage — if `source_run_id` present, render Link to `/planning/runs/{source_run_id}`. Graceful degradation: if upstream returns header-only (no lines), the lines section shows an honest "Lines not exposed by current upstream — request will be a no-op fallback" note.
- `src/app/(po)/purchase-orders/page.tsx` — wrap each row's PO number cell in a `<Link>` to `/purchase-orders/{po_id}`; add a tiny screen-reader label.
- `docs/portal-os/route-manifest.json` — add `/purchase-orders/[po_id]` row (live, planner+admin+viewer per inherited (po)/layout role-gate).

## Manifest (files that may be touched)
manifest:
  - src/app/api/purchase-orders/[po_id]/route.ts
  - src/app/(po)/purchase-orders/[po_id]/page.tsx
  - src/app/(po)/purchase-orders/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Cancel-PO action (Tranche 016+ once admin-mutation envelope is decided).
- Edit expected-date action.
- Receipts cross-link section (depends on Tranche 013 receipt→PO linkage).

## Tests / verification
- typecheck clean.
- Manually trace: planner approves a rec → Convert-to-PO → toast link → lands on real detail page (not 404).
- PO list row click → detail page loads.

## Rollback
Revert; new files are additive, list-page edit is a single Link wrapper.

## Operator approval
- [x] Tom approves this plan (session directive 2026-04-22 — explicit "audit all and start the loop" + earlier "תעשה הכל לפי הסדר").

## Actual evidence
Filled in post-land.
