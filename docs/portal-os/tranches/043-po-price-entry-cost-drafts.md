# Tranche 043 — PO price entry UI + cost-drafts inbox (Phase 2 portal close)

status: active
phase: improvement-plan-2026-06 Phase 2 (D3 portal side) — backend landed in gt-factory-os 8a1aa40
approved_by: Tom (2026-06-11 plan approval; T3 threshold 25%)

## Goal
Make the new price-truth pipeline usable: enter a price where POs are created, confirm
catalog write-back at place, and give the admin a pending cost-drafts queue.

## Backend contract (landed, gt-factory-os 8a1aa40)
- POST /api/v1/mutations/purchase-orders (manual create): per-line optional `unit_price_net`,
  `supplier_item_id`; top-level optional `confirm_price_update: boolean`.
- Purchase-session place action: optional `line_prices[]` (keyed by session_po_line_id) +
  `confirm_price_update`.
- GET /api/v1/queries/cost-drafts (status/supplier_item filters, pending first, effective-cost
  context); POST /api/v1/queries/cost-drafts/:id/approve | /reject (admin, idempotent).
- Rule: delta ≤25% + confirm → auto-approved at place (full evidence rows); >25% or no
  confirm → pending draft.

## File manifest (only these may change)
- src/components/purchase-orders/PoLineEditor.tsx — optional per-line unit price input (pre-filled hint when supplier-item cost known; never required)
- src/components/purchase-orders/types.ts — LineDraft + payload types extended (unit_price_net)
- src/app/(po)/purchase-orders/new/page.tsx — include line prices in submit body; place-time "update catalog price" checkbox (default checked) shown only when a price was entered
- src/app/(planning)/planning/procurement/_components/FocusCard.tsx — editable price column (optional) + confirm checkbox at place; passes line_prices + confirm_price_update
- src/app/(planning)/planning/purchase-session/_lib/api.ts — place mutation body extended (additive)
- src/app/(planning)/planning/purchase-session/_lib/types.ts (if needed) — types for line_prices
- src/app/api/cost-drafts/route.ts — NEW proxy GET
- src/app/api/cost-drafts/[draft_id]/approve/route.ts — NEW proxy POST
- src/app/api/cost-drafts/[draft_id]/reject/route.ts — NEW proxy POST
- src/app/(admin)/admin/cost-drafts/page.tsx — NEW admin queue: pending drafts table (component/supplier, current vs proposed, delta %, source PO/GR link), approve/reject with loading + invalidation of ["stock","value"] + economics keys
- src/lib/nav/manifest.ts — admin nav entry for cost drafts (admin min_role)
- tests (unit) for new helpers if any pure logic is extracted
- docs/portal-os/tranches/043-po-price-entry-cost-drafts.md — this file
- docs/portal-os/tranches/_active.txt — 043
- docs/portal-os/registry.md — tranche row

## Keep-simple rules (Tom)
Nothing mandatory: price field optional everywhere, defaults from current cost; checkbox only
appears when a price was entered and differs from current cost; no new required steps.

## Verification gates
- `npx tsc --noEmit` clean; `npx vitest run` green (430 baseline, plus any new tests)
- No edits outside manifest

## Checklist
- [x] Implemented (2026-06-11)
- [x] Typecheck clean (`npx tsc --noEmit`)
- [x] Vitest green (435/435 — 430 baseline + 5 new unit-price validation tests)
- [ ] One bounded commit set pushed
