# Tranche 044 — Groups v1 portal: shared taxonomy, group filters, /admin/groups (Phase 3)

status: executed 2026-06-11 — pending merge
phase: improvement-plan-2026-06 Phase 3 (portal side) — backend landed gt-factory-os 48d2433
approved_by: Tom (2026-06-11 — group vocabularies approved)

## Backend contract (landed)
- GET /api/v1/queries/groups → { product_groups: [...], material_groups: [...] } each row:
  key, name_en, name_he, display_order, color_token, active (+component_class_hint on material).
- Stock rows (/api/v1/queries/stock): FG rows add product_group_key + family; RM/PKG rows add
  material_group_key + component_class + used_by_product_groups (string[]).
- Inventory flow accepts ?product_group=; supply flow accepts ?material_group= and
  ?used_by_product_group=.
- Items/components list rows include product_group_key / material_group_key.
- Admin mutations: POST /mutations/groups/:kind, PATCH /mutations/groups/:kind/:key (If-Match),
  POST /mutations/groups/assign { kind, key, item_ids[]|component_ids[] }.

## File manifest (only these may change)
- src/lib/taxonomy/groups.ts — NEW shared module: types, useGroups() hook, tone/color mapping, labels, "no group" handling
- src/components/filters/GroupFilterBar.tsx — NEW shared URL-backed group chip bar (counts, clear-all, RTL-safe)
- src/app/api/groups/route.ts — NEW proxy (GET)
- src/app/api/groups/[kind]/route.ts — NEW proxy (POST create)
- src/app/api/groups/[kind]/[key]/route.ts — NEW proxy (PATCH)
- src/app/api/groups/assign/route.ts — NEW proxy (POST)
- src/app/(shared)/inventory/page.tsx — replace hardcoded SKU-regex categories with real group fields from the API; chips from taxonomy; group-by uses groups; "ללא קבוצה" bucket preserved honestly
- src/app/(planning)/planning/inventory-flow/_lib/types.ts — FlowQueryParams + product_group
- src/app/(planning)/planning/inventory-flow/_components/FilterBar.tsx — product-group chips (URL param product_group), alongside existing family chips
- src/app/(planning)/planning/inventory-flow/InventoryFlowClient.tsx — pass-through of the new param
- src/app/(planning)/planning/inventory-flow/_lib/useInventoryFlow.ts — buildQuerystring + product_group (manifest addendum: required for param wiring)
- src/app/(planning)/planning/inventory-flow/supply/_lib/useSupplyFlow.ts — buildQuerystring + both params (manifest addendum)
- src/app/(planning)/planning/inventory-flow/supply/SupplyFlowClient.tsx — material_group + used_by_product_group chips (URL-backed)
- src/app/(admin)/admin/items/page.tsx — Product group filter dropdown (client-side on product_group_key) + per-row group select that calls /api/groups/assign (single id)
- src/app/(admin)/admin/groups/page.tsx — NEW management page: product/material tabs, list (he/en names, order, color, active, member counts), inline rename/reorder/active via PATCH (If-Match), create form
- src/lib/nav/manifest.ts — admin nav entry "Groups"
- new unit tests for pure taxonomy helpers
- docs/portal-os/tranches/044-groups-v1-portal.md, _active.txt, registry.md

## Out of scope (later tranches)
Economics group breakdown, movement-log group filter, production_track filter, bulk-assign UI
beyond per-row select.

## Verification gates
- `npx tsc --noEmit` clean; `npx vitest run` green (435 baseline + new)
- No remaining FG_TEA_LINES / RAW_CATEGORY_RULES / PKG_PREFIX_CATEGORY regex taxonomy in inventory page

## Checklist
- [x] Implemented (2026-06-11; gate grep clean — no FG_TEA_LINES / RAW_CATEGORY_RULES / PKG_PREFIX_CATEGORY in src/)
- [x] Typecheck clean (`npx tsc --noEmit`)
- [x] Vitest green (451/451 = 435 baseline + 16 new taxonomy tests)
- [x] One bounded commit set pushed
