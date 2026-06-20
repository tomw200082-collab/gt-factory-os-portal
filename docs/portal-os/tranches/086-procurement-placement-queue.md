# Tranche 086 — Procurement placement queue (Tom → office-manager handoff)

status: proposed — pending Tom approval + backend dependency (W1)
created: 2026-06-20
scorecard_target_category: flow-continuity (procurement → PO → receipt)
expected_delta: +1 flow-continuity (closes the decide→place handoff gap)
sizing: M (portal: 5-8 files) + backend dependency (separate lane, Tom-gated)

## Why this tranche
Today `/planning/procurement` mixes *deciding what to order* and *placing the PO*
under one role. Tom wants a clean handoff: Tom approves quantity → it lands in a
dedicated queue for the office/bookkeeping manager → she enters the real order
(supplier-confirmed price + payment terms) → PO goes OPEN → goods receipt closes
it. This tranche adds the missing **placement stage** (the queue + place action)
and a **one-tap full receive**. ~80% of the chain already exists; this is the
seam, not a rebuild.

## Target flow (locked with Tom 2026-06-20)
- Stage 1 · Tom decides — `/planning/procurement` approve → PO created in NEW
  state `מאושר להזמנה` (not OPEN). Owner: `planning:execute`.
- Stage 2 · office mgr places — new queue screen → enters price + payment terms
  → `בצע הזמנה` → PO → OPEN. Catalog price write-back fires here (= the "sync"
  Tom asked for; already built).
- Stage 3 · receipt — `/stock/receipts` against the OPEN PO; add `קיבלתי הכול`
  one-tap full receive on the open-PO row (qty = open). Mostly built.

## Split by lane

### Backend (gt-factory-os · W1 · Tom-approval-gated · NOT authored in this repo)
Contract-requirements for the backend lane to pick up after Tom approves. This
tranche does **not** write schema/handlers.
- state: PO header gains pre-OPEN status `APPROVED_TO_ORDER` (exact token backend's
  call; current place/convert paths go straight to OPEN — insert one state before).
  `∀ approve → status=APPROVED_TO_ORDER` ; `place → OPEN`.
- field: `purchase_orders.payment_terms text null`. Free text (mirrors supplier
  `payment_terms`, already free text). Default copied from supplier at place time;
  editable on place.
- audit: attribute `approved_by` (Tom) vs `placed_by` (office mgr) — two actors,
  two timestamps.
- read: `GET /queries/purchase-orders?status=APPROVED_TO_ORDER` → queue feed
  {po_id, po_number, supplier, lines[], suggested unit_price, supplier.payment_terms}.
- mutation: `POST /mutations/purchase-orders/:id/place {lines[].unit_price_net?, payment_terms}`
  → 200 OPEN ; idempotency key ; `FOR UPDATE` + status re-check (reuse 0244 place
  hardening pattern). `place on non-APPROVED_TO_ORDER → 409`.
- ! locked-decision note: a distinct **bookkeeper role** does NOT exist
  (`ROLES = operator|planner|admin|viewer`, Locked decision 5). True role
  separation = separate Tom decision + auth change. Until then the office mgr
  signs in as `planner` and the queue gates on `planning:execute`.

### Portal (this repo · this tranche)
Blocked on backend for live wiring → ships in two parts:
- **Part A — placement queue (Mode B, after backend RUNTIME_READY):**
  - `src/app/(po)/purchase-orders/placement-queue/page.tsx` — new. RTL Hebrew
    operator surface. RoleGate `planning:execute`. Lists `APPROVED_TO_ORDER` POs.
  - `src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx` — new.
    Per-PO card: ספק · שורות · כמות · מחיר מוצע; editable מחיר + תנאי תשלום;
    one primary CTA `בצע הזמנה` (inline confirm via existing `useConfirm`).
  - `src/app/(po)/purchase-orders/placement-queue/_lib/api.ts` — new. `useQueue`
    (GET APPROVED_TO_ORDER) + `usePlace` (POST place) with the usePlacePo
    invalidation set (purchase-orders, planner/purchase-orders, ops/receipts/open-pos).
  - `src/lib/nav/manifest.ts` — add queue nav item, `required_capability: planning:execute`.
- **Part B — one-tap full receive (portal-only, shippable NOW, no backend dep):**
  - open-PO row / `/stock/receipts` landing — add `קיבלתי הכול` action that posts
    a GR with qty = open_qty per line (the `?po_id=` prefill already computes this;
    Part B just skips the form for the full-receipt happy path). Partial/discrepancy
    still opens the detailed form.

## Payment-terms model (lazy)
Free-text string, default = supplier `payment_terms`, editable. Dropdown options =
distinct existing values via the existing `distinctWithCounts` pattern in
`src/lib/admin/supplier-field-options.ts` (current set: NET_14/30/45/60). No new
enum. `? confirm real terms with Tom (מזומן/שוטף+30/60…) before seeding the datalist`.

## UX spec — placement queue (ui-ux-pro-max, applied lazily)
Reuse existing tokens/components; no new design system.
- layout: `WorkflowHeader` (eyebrow `רכש`, title `הזמנות לביצוע`) + stack of cards
  (one per PO). Mobile-first cards, not a dense table (Tom drives mobile). `dir="rtl"`.
- row fields: visible labels (not placeholder-only); `מחיר` = number input
  `inputmode="numeric"`, tabular-nums; `תנאי תשלום` = input+datalist default-filled.
- one primary CTA per row (`בצע הזמנה`); consequential → inline confirm (mirror
  RecommendationsToConvert `useConfirm`). Money uses `formatIls` + tabular figures.
- states: skeleton while loading; empty `אין הזמנות לביצוע`; error + `נסה שוב`;
  per-row submitting/disabled; on success row leaves queue + `aria-live` confirm.
- a11y: error below field; focus first invalid on 422; touch target ≥44px; semantic
  tokens for contrast; lucide icons (no emoji).
- skipped: list virtualization (queue <50 rows), calendar view, multi-supplier
  compare strip (that lives on `/purchase-orders/new`). Add when measured.

## Governance flags (Tom)
- [ ] CLAUDE.md Hebrew-exception entry needed for `/purchase-orders/placement-queue`
      (new Hebrew operator surface). Tom is sole writer of CLAUDE.md.
- [ ] Backend dependency above must ship first for Part A (Mode B gate). Part B
      ships independently.
- [ ] Bookkeeper-as-role is a separate locked decision; not in this tranche.

## Manifest (files that may be touched — on execution)
manifest:
  - src/app/(po)/purchase-orders/placement-queue/page.tsx
  - src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx
  - src/app/(po)/purchase-orders/placement-queue/_lib/api.ts
  - src/lib/nav/manifest.ts
  - src/app/(ops)/stock/receipts/page.tsx            # Part B one-tap receive
  - tests/e2e/po-placement-queue.spec.ts
  - docs/portal-os/tranches/086-procurement-placement-queue.md

## Out-of-scope
- Backend schema/handlers/migrations (W1 lane).
- New bookkeeper role / auth lattice change.
- Green Invoice / Shopify sync (Tom: only catalog price write-back, already built).
- Procurement session decision logic (unchanged; only its terminal state changes,
  backend-side).

## Tests / verification
- typecheck clean
- vitest: PlacementRow + api hooks (place success / 409 already-placed / 422 price)
- playwright: tests/e2e/po-placement-queue.spec.ts (queue → place → leaves queue);
  Part B: full-receive path closes the PO
- regression-sentinel: no baseline regressions; no dead/quarantined re-entry

## Rollback
Additive route + one receipts action; no data-layer changes in portal. Revert the
PR; backend state/field are separately owned and unaffected by a portal revert.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 086` on the PR)
- [ ] Tom approves the backend contract-requirements (so W1 can ship the dependency)

## Actual evidence (filled by /portal-tranche-fix run)
<pasted after execution: typecheck, vitest N/N, playwright, PR URL, scorecard delta>
