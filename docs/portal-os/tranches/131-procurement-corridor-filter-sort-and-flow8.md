# Tranche 131 — Procurement corridor: filter/sort + cancel-with-reason (session POs) + FLOW-8 closure

**Status:** implemented (pending merge)
**Origin:** `/ux-release-gate` procurement-corridor run (2026-07-16, wf_8a93229b-763) + Tom directives in chat (2026-07-16). Second tranche of the corridor overhaul, stacked on tranche 130.
**Scope:** one tranche, procurement corridor + the one dead-code cleanup FLOW-8 required. No backend/schema authoring — `skip_reason` was already a live column + write path on `purchase_session_po` (backend `handleSkipPo`); the frontend simply never collected it.

## Decisions this tranche closes (Tom, 2026-07-16 chat)

1. **FLOW-8 (P0 gate blocker):** Tom picked option A — formalize that the office manager (Doreen) is `planner`, not `viewer`. Live DB confirms `role='planner'` already (no DB change). The remaining contradiction was code-level: `src/features/home/cockpit.ts`'s placement-queue home tile carried a Hebrew `he` field that could **never render** — `ROLE_COCKPIT` gives `lang:"he"` only to the `viewer` persona, but the tile is (correctly) `minRole:"planner"` since placing an order needs `planning:execute`. Fixed by deleting the dead `he` field and adding a comment recording why (cross-referencing `ROLE_COCKPIT`'s lang map so nobody re-adds it without revisiting that). Zero behavior change for any real user — the strings could never have shown. `/purchase-orders/placement-queue` itself keeps its own route-level Hebrew authorization (CLAUDE.md 2026-06-20), unaffected.
2. **Defer vs. cancel-with-reason (session POs):** Tom confirmed the semantics — "if deferred, it automatically returns to the next round, but you can also cancel with a reason." Both map to the SAME backend transition (`status → 'skipped'`, via the existing `useSkipPo`/`handleSkipPo`) — "defer" (existing "דלג" button, unchanged, no reason) relies on the fact the engine recomputes fresh net demand every session, so a real, persisting need resurfaces on its own; "cancel with reason" is the deliberate, audited alternative, now collecting the `skip_reason` the backend already had a column and write path for. This is honestly scoped: neither action prevents recreation at the schema level (recreation is driven by live netting, which is correct DDMRP behavesior, not a bug) — the difference is audit intent, not suppression, and the UI copy says so (no false "won't come back" claim).

## Changes (files)

- `src/features/home/cockpit.ts` — removed the dead `he` field from the placement-queue tile; added the FLOW-8 explainer comment.
- `src/app/(planning)/planning/procurement/_components/FocusCard.tsx` — new "בטל עם סיבה" action (preset reasons + free text, inline panel, mirrors the placement-queue pattern from tranche 130) alongside the existing "דלג"; both call `useSkipPo`, the new one populates `skip_reason`. `skipped` status label reworded "דולג / בוטל" to cover both paths honestly.
- `src/app/(planning)/planning/procurement/_components/ActionList.tsx` — supplier-name filter + tier filter + sort (order-by-date / amount / supplier), applied **within** the existing must_today/can_wait/handled decision buckets (the classification engine itself is untouched). The "X חייב לצאת היום · ₪Y בסיכון" summary banner is computed from the **full, unfiltered** session on purpose — a filter must never visually shrink reported risk.
- `src/app/(po)/purchase-orders/placement-queue/page.tsx` — supplier-name filter + sort (order-by-date / amount / supplier) over the queue. The overdue-count banner is likewise always computed from the full queue, not the filtered view, for the same reason.

## Evidence

- `npx tsc --noEmit` → clean.
- `npx vitest run` over procurement + purchase-orders + `src/features/home` → **91/91 pass** (7 new: FocusCard F6 cancel-with-reason guard; ActionList L6 supplier-filter narrows rows, L7 risk-summary stays full-session under an active filter).
- `npx playwright test --grep @mocked` (meeting + placement-queue + procurement-focus specs, real dev server, dev-shim auth) → **14/14 pass** — confirms no regression from the header/panel restructuring in `PlacementRow`/`FocusCard`.
- `src/features/home/cockpit.test.ts` (23 tests, pre-existing) → still green after the dead-field removal.

## Deliberately NOT in this tranche

Delete-from-session (removing a PO line entirely rather than skip/cancel) and bulk multi-select actions — not asked for in this round; `/purchase-orders`'s raw-enum/UUID-leak P2s — cosmetic, lower priority, held for a follow-up polish tranche.
