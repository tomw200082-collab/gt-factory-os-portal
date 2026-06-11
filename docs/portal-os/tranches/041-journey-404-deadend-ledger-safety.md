# Tranche 041 — Journey 404s, dead-ends & ledger-safety hotfixes (Phase 1)

status: active
phase: improvement-plan-2026-06 Phase 1
approved_by: Tom (2026-06-11, plan decisions T1-T6 resolved; group vocab approved)

## Goal
Eliminate every confirmed 404 / dead-end on primary journeys, gate the unconfirmed
loss-direction ledger write, fix the scrap-consumption copy-truth conflict (per T1:
backend output+scrap is correct), and honor dropped deep-link params.

## File manifest (only these files may change)
- src/app/(planning)/planning/runs/[run_id]/recommendations/[rec_id]/page.tsx  — strip `/ops` prefix from production-actual hrefs (2 places)
- src/components/stock/StockTruthDrawer.tsx — `/stock/ledger?item_id=` → `/stock/movement-log?item_id=`
- src/app/(shared)/stock/movement-log/page.tsx — read `?item_id=` URL param into the item filter (like existing `?po_id=`)
- src/app/(ops)/stock/receipts/page.tsx — URL-locked "Post another receipt": re-seed poId=urlPoId, reset prefillApplied; INSUFFICIENT/unexpected error detail: no JSON.stringify(body) to operator
- src/app/(admin)/admin/page.tsx — NEW: redirect to /admin/items
- src/app/(admin)/admin/boms/page.tsx — empty-state CTA `/admin/masters/items` → `/admin/items`
- src/app/(admin)/admin/masters/boms/page.tsx — same CTA fix
- src/app/(admin)/admin/products/[item_id]/page.tsx — `/admin/planning/policy` → `/admin/planning-policy`
- src/app/(admin)/admin/masters/items/[item_id]/page.tsx — same link fix
- src/app/(admin)/admin/purchase-orders/parity-check/page.tsx — `/admin/purchase-orders/${po_id}` → `/purchase-orders/${po_id}` (2 places)
- src/app/(ops)/stock/waste-adjustments/page.tsx — loss-direction confirm gate (reuse positive-direction inline confirm panel); keep confirm panel visible w/ loading state until submit resolves (confirmSubmitting)
- src/app/(ops)/stock/production-actual/page.tsx — B1 copy fix ×2 (state output+scrap numerically); committedSnapshot for success consumption table; INSUFFICIENT_STOCK fallback message without raw UUIDs (use snapshot names when available)
- src/app/(planning)/planning/production-plan/_lib/helpers.ts — B1 tooltip copy fix
- src/app/(shared)/inventory/page.tsx — read `?item_id=` into search box on mount; row links role-aware: RM/PKG rows → /admin/masters/components/[component_id]; non-admin rows link to movement-log filtered by item instead of admin masters
- src/app/(planner)/exceptions/page.tsx — forward `?id=` to /inbox?view=exceptions&id=
- src/app/(planning)/planning/procurement/_components/FocusCard.tsx — wrap placed PO id in Link to /purchase-orders/[po_id]
- src/app/(ops)/stock/physical-count/page.tsx — read `?item_id=` deep-link param on mount (prefill item search like production-actual)
- docs/portal-os/tranches/_active.txt — set to 041
- docs/portal-os/tranches/041-journey-404-deadend-ledger-safety.md — this file
- docs/portal-os/registry.md — add tranche row

## Out of scope
Backend changes (B2 submission-detail endpoint, component_name in shortfalls), role-gate
middleware reconciliation (Phase 5), cache-invalidation sweep (Phase 2), B3 planner-403
(backend), Groups v1.

## Verification gates
- `npx tsc --noEmit` clean
- `npx vitest run` green (no new failures vs baseline)
- grep: no remaining `/ops/stock/`, `/stock/ledger`, `/admin/masters/items"` (bare list link),
  `/admin/planning/policy`, `/admin/purchase-orders/$` occurrences in src/
- Evidence paths in commit message

## Checklist
- [ ] All manifest fixes implemented
- [ ] Typecheck clean
- [ ] Vitest green
- [ ] Greps clean
- [ ] Committed as one bounded commit set on claude/system-audit-improvements-7sbbg7
