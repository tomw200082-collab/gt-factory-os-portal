# Tranche 013: receipt-po-linkage

status: landed-pending-review
created: 2026-04-22
landed: 2026-04-22
scorecard_target_category: flow_continuity + ops_surface
expected_delta: +2 (flow_continuity 7→8, ops_surface 7→8)
sizing: S (1 file)

## Why this tranche
The Goods Receipt form hardcodes `po_id: null` and `po_line_id: null` on every line — meaning **a PO can never be advanced from the operator side**. Combined with Tranche 012 (PO detail page now exists), this single-file edit closes the second of the three PO-chain breaks: receipts can finally reference the PO they fulfill, allowing the upstream API to advance po_line state from OPEN → PARTIAL → CLOSED. Optional selection — manual receipts (no PO) still work as before.

## Scope
- Add `useQuery` for open POs (`/api/purchase-orders?status=OPEN&status=PARTIAL&limit=200`).
- Add a header-level optional "Reference PO" dropdown. When selected, fetch detail via `/api/purchase-orders/{po_id}` (the proxy added in T012) so per-line dropdowns can offer that PO's `po_lines[]` for matching.
- Per receipt line: when a PO is selected, render a small "PO line" select beside the receivable picker; default to "(unmatched)" so freeform receipts still work.
- Send `envelope.po_id` from the header state and per-line `po_line_id` from each line's selection. Both still default to `null`.
- Document the partial-receipt expectation: backend resolves PARTIAL/RECEIVED status from cumulative receipts against po_lines.ordered_qty.

## Manifest (files that may be touched)
manifest:
  - src/app/(ops)/stock/receipts/page.tsx

## Revive directives (if any)
revive: []

## Out-of-scope
- Validation that `po_line_id` matches the line's `receivable_key` (server enforces this with 409).
- Receive-against-PO from the PO detail page directly (deferred — current pattern is "go to receipts and pick the PO" which mirrors the operator workflow).
- Filtering receivable items to only those in the selected PO's lines (deferred to a UX-polish tranche).

## Tests / verification
- typecheck clean.
- Manual trace: open Goods Receipt → select an OPEN PO from the dropdown → per-line PO-line picker appears → submit → receipt lands with `po_id` + `po_line_id` populated.
- Manual receipts (no PO) still submit with both fields null.

## Rollback
Revert; pure additive changes to a single file.

## Operator approval
- [x] Tom approves this plan (session directive 2026-04-22 — explicit "audit all and start the loop").

## Actual evidence
Filled in post-land.
