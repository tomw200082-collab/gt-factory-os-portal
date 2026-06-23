# Tranche 083: inbox-price-decision-surfacing

status: in-progress
created: 2026-06-23
landed:
pr: 114
scorecard_target_category: flow_continuity
expected_delta: +2 (supplier price-change decisions reach a real one-tap terminal action inside the unified inbox instead of living only on /admin/cost-drafts — closing Exception Closure Model Gap 3 for the price half)
sizing: S–M (portal-only; new inbox source + inline card; reuses existing tested backend approve/reject endpoints)

## Why this tranche
Tom 2026-06-23 (`/goal`): build the one-tap terminal-action tranche for the
inbox decisions (Exception Closure Model Gap 3, production-brain
`docs/decisions/EXCEPTION_CLOSURE_MODEL.md`).

Investigation findings (grounded in the backend, not assumed):
- **Price (`supplier_price_anomaly`)** is NOT emitted as an exception. The real
  price-change-review substrate is **`supplier_cost_drafts`** (migrations
  0188/0227/0228) with tested, admin-only, atomic decision endpoints
  (`POST /api/v1/mutations/cost-drafts/:id/{approve,reject}` →
  `fn_{approve,reject}_supplier_cost_draft`, which rewrite
  `supplier_items.std_cost_per_inv_uom` + `price_history` + `change_log`).
  Pending drafts already render on `/admin/cost-drafts` but are **absent from
  the unified inbox** — so price decisions are easy to miss. This tranche
  surfaces them as first-class inbox decision rows with inline approve/reject,
  reusing the existing portal proxy routes.
- **PO over-receipt (`po_line_over_receipt`)** IS emitted (DB trigger 0055) and
  is **already** an inbox DECISION + PINNED category with inline acknowledge/
  resolve. The ledger receipt is append-only (trigger "never rejects"), so its
  terminal action is accept-and-resolve, which already works. No change needed;
  documented here for completeness.

## Scope (portal-only — no backend / schema / token change)
- **`src/features/inbox/types.ts`** — add `approval:cost_draft` to `InboxRowType`.
- **`src/features/inbox/client.ts`** — `CostDraftRow` mirror, `toCostDraftInboxRow`
  (exported, pure → unit-tested), `fetchPendingCostDrafts` (GET
  `/api/cost-drafts?status=pending`).
- **`src/features/inbox/meta.ts`** — friendly Hebrew label + DECISION/PINNED
  membership for `cost_draft_pending`.
- **`src/features/inbox/cost-draft-card.tsx`** — inline one-tap approve/reject
  card (mirrors `ApprovalInlineCard`; reads `row.raw`; posts to
  `/api/cost-drafts/:id/{approve,reject}`; Hebrew per the /inbox UI-language
  authorization).
- **`src/app/(inbox)/inbox/page.tsx`** — admin-gated cost-draft source in
  `useQueries`, merge, error tracking, refresh, and the render branch.
- **`src/features/inbox/cost-drafts.test.ts`** — Vitest for the mapping.

## Verification plan
- `tsc --noEmit` clean.
- `vitest run` green on the new mapping test.
- Playwright (inbox approve/reject happy path) — deferred to a running-app run;
  documented, not executed in the authoring sandbox.

## Out of scope
- Any backend/DB change (the decision endpoints already exist).
- PO over-receipt changes (already a working inbox decision).
- Emitting `supplier_price_anomaly` exceptions (the cost-draft substrate is the
  source of truth; the legacy category stays unemitted).
