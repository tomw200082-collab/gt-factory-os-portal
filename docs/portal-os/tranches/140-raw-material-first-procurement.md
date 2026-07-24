# Tranche 140 — Raw-material-first procurement + supplier re-route

**Status:** in progress
**Origin:** Tom chat dispatch 2026-07-23 — "בדף הרכש ובדף ההזמנות שמחכות לביצוע … חומר הגלם הוא הדגש ולא הספק … אם אין לספק הראשי במלאי או לא יכלנו לקנות ממנו — דורין עוברת לספק הבא בתור ויכולה להזין סיבה אבל לא חובה. הפורטל חייב לתמוך בזה ב-100% וזרימת ה-UX צריכה להיות חלקה ונעימה." Grilled + locked §G/§C in chat; then "בצע מקצה לקצה", and a UX/UI polish pass (`/ux-release-gate` + `/ui-ux-pro-max`).

## Goal

Both procurement surfaces become **raw-material-first**: each raw material (line) is the hero, its supplier is a secondary attribute with a **click-to-call** phone link, materials are **clustered by supplier** (one call clears a supplier's basket), and a **switch-to-next-candidate-supplier** control (with an OPTIONAL reason) re-routes the material when the current supplier is out / unreachable. No dead-ends: a material with no alternative surfaces a "return to planner" state.

## Two surfaces, two data paths

- **`/planning/procurement`** — purchase-*session* drafts (planner). **Per-material supplier switch** lives here (backend migration 0288 `handleRerouteLine`, companion PR `gt-factory-os` #182): each material shows its supplier + call link + "החלף ספק" (next candidate preselected, optional reason, no-alternative → return-to-planner).
- **`/purchase-orders/placement-queue`** — real `APPROVED_TO_ORDER` purchase orders (office manager / Dorin, who phones suppliers). Ships **material-first presentation + click-to-call** AND a **whole-PO supplier switch** (Tom-directed 2026-07-24): while the order is still in the queue (pre-send, pre-ledger), Dorin switches it to another supplier that can fulfil every material, optionally recording why. Backend: `handleSwitchPoSupplier` — an in-place, status-preserving `supplier_id` UPDATE with an explicit `change_log` PO_UPDATE audit row (no line/price mutation — prices are re-entered at place time; no `stock_ledger` touch). No migration (supplier_id is mutable in `APPROVED_TO_ORDER`). Candidate suppliers = ACTIVE suppliers with approved `supplier_items` for **every** active line; when none exists the control shows "no alternative → return to planner". This real-PO mutation is validated by the `phase10` CI-DB suite (it can't run in the authoring sandbox — no local Postgres).

**Cross-lane note:** the backend halves live in `gt-factory-os` on the same branch — companion PR (#182 + follow-up). Authorized by Tom's direct dispatch.

## Hebrew scope

Both routes are already on the CLAUDE.md authorized Hebrew-operator-label list (procurement: 2026-06-17; placement-queue: 2026-06-20). New Hebrew strings on these two routes are in-scope; no third surface is touched.

manifest:
- src/app/api/purchase-session/po/[id]/lines/[lineId]/reroute/route.ts
- src/app/api/purchase-orders/[po_id]/switch-supplier/route.ts
- src/components/purchase/SupplierCallLink.tsx
- src/components/purchase/SupplierCallLink.test.tsx
- src/components/purchase/SwitchSupplierControl.tsx
- src/components/purchase/SwitchSupplierControl.test.tsx
- src/components/purchase/CandidateSupplierList.tsx
- src/app/(planning)/planning/purchase-session/_lib/types.ts
- src/app/(planning)/planning/purchase-session/_lib/api.ts
- src/app/(planning)/planning/procurement/_components/ActionList.tsx
- src/app/(planning)/planning/procurement/_components/ActionList.test.tsx
- src/app/(planning)/planning/procurement/_components/FocusCard.tsx
- src/app/(planning)/planning/procurement/_components/FocusCard.test.tsx
- src/app/(planning)/planning/procurement/page.tsx
- src/app/(po)/purchase-orders/placement-queue/_lib/api.ts
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx
- src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.test.tsx
- src/app/(po)/purchase-orders/placement-queue/page.tsx

## Files

Portal (`gt-factory-os-portal`):
- New shared: `src/components/purchase/SupplierCallLink.tsx`, `SwitchSupplierControl.tsx`, `CandidateSupplierList.tsx` (+ colocated tests).
- Data layer: `purchase-session/_lib/types.ts` (+ `candidate_suppliers`, `supplier_phone`, `LineCandidateSupplier`), `_lib/api.ts` (`useRerouteLine`).
- Procurement: `procurement/_components/ActionList.tsx`, `FocusCard.tsx` (+ tests), `procurement/page.tsx`.
- Placement queue: `placement-queue/_lib/api.ts` (candidate fields + `useSwitchSupplier`), `_components/PlacementRow.tsx` (+ test), `placement-queue/page.tsx`.
- e2e: `tests/e2e/procurement.spec.ts`, `procurement-focus.spec.ts`, `placement-queue.spec.ts` (structural assertions for call link + switch).

Backend (`gt-factory-os`, companion PR):
- Migration 0288 (session-line re-route) — done.
- `fn_switch_po_supplier` + `PO_SUPPLIER_SWITCH` change_log action + placement-queue read (supplier_phone + candidate_suppliers) — follow-up.

## Evidence

- Portal `npx tsc --noEmit` → clean.
- Portal `npx vitest run` → green (new component tests + updated surface tests).
- Playwright `@mocked` run → see PR check.
