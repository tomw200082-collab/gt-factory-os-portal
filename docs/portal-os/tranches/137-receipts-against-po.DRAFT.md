# Tranche 137: receipts-against-po (DRAFT)

status: DRAFT — proposed, NOT active. No registry entry yet; `_active.txt` untouched. Number provisional (renumber at approval per the tranche-121 precedent).
created: 2026-07-22
scorecard_target_category: operator_daily_fit
expected_delta: +1 (gr_entry actually operated by Dennis; 4-ever GR_POSTED events → daily use)
sizing: M (5–7 files)

## Why this tranche

Mapping v3 decision **Q10 (Tom, 22.7)**: goods receipt is entered **by Dennis, at the door, in the system form** — "בחירת PO → שורות מולאו מראש → מזין כמויות בפועל → פער מסומן", or a manual receipt when no PO exists. The `goods-receipt-from-invoice` skill stays a Tom-only bonus path. Explicit build derivative: "לשדרג את `/stock/receipts` הקיים לזרימת קבלה-מול-PO ידידותית לדניס + משתמש/הרשאה לדניס". **English UI per policy** ("אנגלית לפי המדיניות; אם ייתקע — הרחבת עברית באישור כתוב"). The ledger shows only 4 GR_POSTED events ever — the pipe exists but nobody at the door operates it.

## Current state (verified 2026-07-22 — most of the machinery already exists)

- `/stock/receipts` (`src/app/(ops)/stock/receipts/page.tsx`, English, `(ops)` group gated `stock:execute` → operator+planner+admin):
  - **Landing picker** (tranche 020, `_components/ReceiptLandingPicker.tsx`): open POs bucketed "expected ≤7 days" (overdue→today→soonest), free-text PO/supplier search, "Receive without PO" manual track.
  - **PO track** (cycle 16): `?po_id=` fetches header (`GET /api/purchase-orders/[po_id]`) + OPEN/PARTIAL lines (`GET /api/purchase-order-lines?po_id=`), locks the supplier, pre-fills one GR line per open PO line with `received_qty = open_qty`, editable down/up/zero; terminal-status guard.
  - **Express "receive all in full"** (tranche 086 Part B) straight from the picker.
  - Over-receipt two-step confirm with minor/major severity (tranche 065 / `POLineMatchCard`); retry-safe idempotency key held in a ref (tranche 094); post-submit links to the PO + movement log.
  - Submit: `POST /api/goods-receipts` → upstream `POST /api/v1/mutations/goods-receipts` (lines carry `po_line_id`; server flips PO OPEN→PARTIAL→RECEIVED and posts `stock_ledger` rows).

**So the gap is NOT "build PO receiving" — it is operator-fit, access, and short-receipt visibility.**

## Scope

1. **Dennis access** — provision a real `operator` user (Supabase auth + role via `/admin/users`). The `(ops)` gate already admits operator; zero lattice change (lattice is Tom-locked). Portal side: none beyond verifying the operator path.
2. **Door mode (Dennis-friendly pass on the existing flow, no new route):**
   - Landing defaults to "arriving today" first; manual track demoted to a clearly secondary action.
   - Fewer decisions per line: qty + confirm; `event_at` stays defaulted-now; notes optional; ≥44px touch targets on the qty steppers and per-line actions (mobile-first — he stands at the door with a phone).
   - Trim planner-oriented chrome (ledger history depth) behind a disclosure for the operator role.
3. **Short-receipt marking ("פער מסומן")** — over-receipt is already confirmed; add the symmetric under-receipt visibility: pre-submit summary lists lines received short vs `open_qty` ("Short vs ordered: N UOM — PO stays open for the rest"), and the success panel shows per-line delta. English copy. No backend change (open_qty math is already server-truth).
4. **Express-receive guard for the operator role** — one confirmation naming totals before "receive all in full" posts (it writes ledger rows; keep it, but never one-tap-blind for the door user). Verify current 086 behavior; add only if missing.

## Manifest (files that may be touched)

manifest:
  - src/app/(ops)/stock/receipts/page.tsx
  - src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.tsx
  - src/app/(ops)/stock/receipts/_components/POLineMatchCard.tsx
  - src/app/(ops)/stock/receipts/_components/POLedgerHeader.tsx
  - src/app/(ops)/stock/receipts/_components/types.ts
  - src/app/(ops)/stock/receipts/_components/ReceiptLandingPicker.test.tsx
  - tests/e2e/  # receipts @mocked spec (new or extended)
  - docs/portal-os/tranches/137-receipts-against-po.md, docs/portal-os/registry.md, docs/portal-os/scorecard.json, docs/portal-os/scorecard.md, docs/portal-os/tranches/_active.txt   # at execution time only

## Out-of-scope

- **Hebrew UI** — English per Q10 + the CLAUDE.md whitelist; any Hebrew here needs Tom's written whitelist extension first.
- Price entry / payment terms (bookkeeper's placement-queue flow, tranche 086) and cost-drafts.
- Green Invoice / invoice matching; the `goods-receipt-from-invoice` skill (stays Tom-only bonus, unchanged).
- Backend/API changes (`goods-receipts` mutation contract untouched; W1 lane).
- Role-lattice or middleware changes (locked; operator already passes `stock:execute`).
- Nav changes (tranche 138) and `/home` cockpit changes (tranche 136) beyond what they own.

## Tests / verification (evidence plan)

- `npx tsc --noEmit` clean; eslint clean on touched files.
- vitest: landing-picker default-bucket test, short-receipt summary builder test, express-confirm guard test; full suite N/N green (baseline 935).
- playwright `@mocked` chromium, dev-shim **as role=operator**: pick expected-today PO → edit one line short → pre-submit short-marking visible → submit → success panel with deltas + PO link; manual-track fallback still reachable. Mobile (iPhone-14) screenshots of the door flow attached to PR.
- regression-sentinel: no baseline drift.

## Dependencies

- **Dennis user provisioned** (Tom/admin action in Supabase + `/admin/users`; audit D4). Without it the tranche still ships but has no real operator.
- Upstream endpoints already RUNTIME_READY (goods-receipts mutation, purchase-orders + purchase-order-lines queries) — verify `runtime_ready.snapshot.json` is current at execution.
- **UX handoff packet required** for the door-mode layout (frontend-design pass) before build.
- Coordinates with tranche 136 (Today board "supplier arrivals" links deep-link here via `?po_id=`).

## Open questions

- **OQ-1**: does Dennis keep the express "receive all in full" path, or is line-by-line confirmation mandatory at the door? (Default: keep, behind one totals-confirm.)
- **OQ-2**: short-receipt reason — free-text note only (exists) or a preset reason list? Presets would need a backend field; default v1 = notes only.
- **OQ-3**: should the operator view hide the PO ledger history section entirely or collapse it? (Default: collapse.)
- **OQ-4**: Maxim explicitly does not touch the RM warehouse — confirm receipts stays out of his minimal nav (tranche 138 handles visibility; access remains role-wide `stock:execute`).

## Rollback

Revert the PR — presentation + flow-order changes only; contract and ledger semantics untouched, revert is clean.

## Operator approval

- [ ] Tom approves this plan (then renumber if needed, register in registry.md, set `_active.txt`)
