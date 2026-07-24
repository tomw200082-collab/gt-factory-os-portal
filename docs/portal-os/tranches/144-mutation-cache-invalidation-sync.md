# Tranche 141 — Mutation cache-invalidation sync (post-cancel/delete stale views)

**Status:** in progress
**Origin:** Tom chat dispatch 2026-07-24 — "יש הזמנות רכש פתוחות שכבר מחקתי... כרגע חלק מהדברים שאני מוחק בפורטל כנראה לא נמחקים בדאטהבייס של הבקאנד." Deep investigation (portal + backend + live Postgres) found the *backend* is correct end-to-end (PO cancel persists fully, audited, DELETE is trigger-blocked by design — see `docs/integrations/purchase_orders_schema_contract.md` §6.2). The actual defect is client-side: TanStack Query `invalidateQueries` calls target the wrong/incomplete key after a mutation, so a sibling screen keeps showing pre-mutation state until its `staleTime` expires or a manual reload happens (`refetchOnWindowFocus` is disabled app-wide). A follow-up portal-wide sweep found the same bug class repeated across purchase orders, the office-manager placement queue, every stock-quantity-changing action (goods receipt / waste / physical count / inventory-movement approvals / FG-out undo / production-actual), and several admin master-data archive↔restore pairs.

## Goal

For every mutation that changes data another already-mounted screen depends on, invalidate the *actual* query key(s) that screen reads (verified by reading the `useQuery`/`useSuspenseQuery` call, not assumed) — so a successful backend write is reflected everywhere within one mutation's `onSuccess`, with no dependence on manual reload or `staleTime` expiry. Pure cache-key correctness fixes only; no behavior, schema, or endpoint changes.

## Root cause note (for the next person who hits this class of bug)

There is no centralized query-key factory in this repo (`src/lib/query/` only holds `QueryProvider`) — every page/hook rolls its own key array ad hoc. TanStack's `invalidateQueries({queryKey: K})` only matches queries whose key is a prefix-match of `K` starting at element 0, so `["purchase-orders"]` does **not** invalidate `["planner","purchase-orders",...]`. This tranche fixes every confirmed instance found by direct code sweep; it does not introduce a query-key factory (out of scope — flagged as a worthwhile follow-up tranche, not done here to keep this pass reviewable and low-risk).

## Confirmed findings fixed in this tranche

1. **PO cancel (whole order)** — `purchase-orders/[po_id]/page.tsx` `cancelMut` invalidated `["purchase-orders"]` only; planner list reads `["planner","purchase-orders",...]`. Fixed.
2. **PO line cancel** — same file, `lineCancelMut`; same missing key. Fixed.
3. **PO edit (notes / expected_receive_date)** — same file, `updateMut`; `expected_receive_date` drives the planner list's "Late" KPI and per-row flag, never refreshed. Fixed.
4. **Session PO "place"** — `planning/purchase-session/_lib/api.ts` `usePlacePo` never invalidated `["po-placement-queue"]`, so the office manager's placement queue didn't show a newly-placed order without reload. Fixed.
5. **Systemic — stock dashboard never invalidated by any stock-changing action.** None of goods receipt, waste-adjustment direct-post, physical-count direct-post, the three inbox approval surfaces (physical-count / waste / inventory-movement), `FgOutPickUndoControl`, movement-log's ledger-drawer undo, or production-actual submit/reverse invalidated `["stock","FG"]` / `["stock","RM_PKG"]` / `["stock","value"]` / `["stock-ledger",...]`. Fixed at every listed site.
6. **Admin archive ↔ restore pairs** (items, components, suppliers) — the Archive tab and the main Active list use disjoint query keys and neither mutation invalidated the other. Fixed both directions for all three entities.
7. **`supplier_items` three-way key split** — `QuickFixDrawer` (`["supplier-items","by-component",id]`), `admin/components` inline panel (`["api","supplier-items",...]`), and `admin/supplier-items` page (`["admin","supplier-items"]`) each mutate the same rows without invalidating the other two namespaces — including `admin/supplier-items`'s `archiveMutation` (a soft-delete). Fixed all three call sites to invalidate all three namespaces.
8. **Production-actual reverse** — didn't invalidate its own `["production-actuals","by-plan", planId]` used by the "already reported" live check on the entry form. Fixed.

## Explicitly NOT covered by this tranche (sweep coverage caveat, not verified either way)

`forecast/*`, `sku-aliases`/`sku-map`/`sku-health`, `admin/holidays`, `admin/groups`, `admin/users`, `admin/jobs`, `decision-board`, `credit-tracking`, `admin/masters/boms/[bom_head_id]/[version_id]` line-delete. Flagged as good candidates for the same bug class given how consistently it showed up elsewhere; needs its own sweep + tranche rather than guessing fixes without reading the code.

manifest:
- src/app/(po)/purchase-orders/[po_id]/page.tsx
- src/app/(planning)/planning/purchase-session/_lib/api.ts
- src/app/(ops)/stock/receipts/page.tsx
- src/app/(ops)/stock/waste-adjustments/page.tsx
- src/app/(ops)/stock/physical-count/page.tsx
- src/app/(inbox)/inbox/approvals/physical-count/[submission_id]/page.tsx
- src/app/(inbox)/inbox/approvals/waste/[submission_id]/page.tsx
- src/app/(inbox)/inbox/approvals/inventory-movement/[submission_id]/page.tsx
- src/components/stock/FgOutPickUndoControl.tsx
- src/app/(shared)/stock/movement-log/page.tsx
- src/app/(ops)/stock/production-actual/page.tsx
- src/app/(admin)/admin/items/page.tsx
- src/app/(admin)/admin/masters/items/[item_id]/page.tsx
- src/app/(admin)/admin/masters/archive/page.tsx
- src/app/(admin)/admin/components/page.tsx
- src/app/(admin)/admin/suppliers/page.tsx
- src/components/admin/recipe-health/QuickFixDrawer.tsx
- src/app/(admin)/admin/supplier-items/page.tsx

## Evidence

- Portal `npx tsc --noEmit` → clean.
- Portal `npx vitest run` → 125/125 test files, 1016/1016 tests green, no regressions.
- No backend/API/migration change (portal-only cache-key fix; the underlying data was always correct — confirmed by direct live-Postgres audit of `private_core.purchase_orders` + `change_log` in project `rvadsozabmxkkrktwgnv` before this tranche started).
