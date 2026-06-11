# Tranche 047 — Procurement/PO interaction pack (Phase 6, portal-only)

status: active
phase: improvement-plan-2026-06 Phase 6 item 1 (D1/D2) + interaction P1s + 045 follow-ups
approved_by: Tom (2026-06-11 full-run authorization)

## File manifest
- src/components/purchase-orders/useOrderables.ts (or sibling hook) — fetch supplier_items per selected line (existing /api/supplier-items?component_id=/item_id=)
- src/components/purchase-orders/PoLineEditor.tsx — multi-supplier comparison strip (price · lead days · MOQ, primary pre-selected); gray suppliers w/o mapping; MOQ hint under qty; price placeholder from chosen supplier-item
- src/components/purchase-orders/types.ts — types as needed (additive)
- src/app/(po)/purchase-orders/new/page.tsx — expected date default = today + chosen supplier lead time (helper text); falls back to +7
- src/app/(po)/purchase-orders/page.tsx — truncation banner when rows hit the 500 cap (INTER-008 fallback); skeleton KPI tiles while counts load (INTER-006)
- src/app/(planning)/planning/inventory-flow/_components/FilterBar.tsx — "Clear all" when any filter active (INTER-007)
- src/components/bom-edit/PublishConfirmModal.tsx + its caller (BOM draft editor page) — isSubmitting prop: disable both buttons + spinner during publish (INTER-013)
- src/app/(shared)/dashboard/page.tsx — 045 follow-up: urgent-procurement block links purchase-session/calendar → /planning/procurement
- src/app/(planning)/planning/procurement/page.tsx — 045 follow-up: empty-session state link to purchase-calendar removed/self-referencing fixed
- docs/portal-os/tranches/047-procurement-po-interaction-pack.md, _active.txt (shared 047+048), registry.md

## Gates
tsc clean; vitest green (451 baseline + new); no href to /planning/purchase-(session|calendar) outside redirect stubs

## Checklist
- [x] Implemented  - [x] Typecheck  - [x] Vitest  - [ ] Pushed

## Evidence (2026-06-11)
- tsc --noEmit: clean
- vitest: 478/478 green (451 baseline + 13 tranche-047 tests: 3 supplier-item
  helper, 7 PoLineEditor comparison-strip/hint, 3 PublishConfirmModal
  isSubmitting; remaining new tests belong to the concurrent
  production-plan/actual tranche sharing this worktree)
- href gate: `grep -rn "planning/purchase-(session|calendar)"` (excluding
  redirect stubs + kept `_lib`/`_components` dirs) → no matches
- Deviation: gate required touching `procurement/_components/ActionList.tsx`
  + its test (fallback open-link constant pointed at the superseded
  session URL) — two files outside the manifest, minimal repoint only.
