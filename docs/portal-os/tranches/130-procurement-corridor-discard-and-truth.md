# Tranche 130 — Procurement corridor: discard-with-reason + hand-off truth

**Status:** implemented (pending merge)
**Origin:** `/ux-release-gate` procurement-corridor run (2026-07-16, wf_8a93229b-763) + Tom directives in chat (2026-07-16).
**Scope:** one tranche, procurement corridor only. No backend/schema authoring (reuses existing `PATCH /purchase-orders/{id}` + `POST /purchase-orders/{id}/cancel`, which already admits `APPROVED_TO_ORDER → CANCELLED` per backend migration 0258).

## Why

Two corridor problems, both verified in the gate and by live data (6 stale `APPROVED_TO_ORDER` POs sitting 13 days in the office manager's queue, 2026-07-16):

1. **No discard path (gate FLOW-5 / INTER-6, ranked #2; Tom explicit ask).** The office manager could only *place* an order from the queue — a PO that should no longer be ordered (stale / duplicate / ordered elsewhere) had no corrective action and rotted in the queue.
2. **False-completion copy on a money action (gate FLOW-6 / COPY-5, ranked #3; Tom explicit ask).** In focus mode the hand-off action read "סמן כבוצע — צור הזמנה" and the resulting status read "בוצע" — but the order is NOT placed with the supplier at that point; it is handed to the office manager's placement queue. Tom ended sessions believing an order was complete.

## Changes (files in this tranche)

- `src/app/(po)/purchase-orders/placement-queue/_lib/api.ts`
  - New `useCancelOrder()` hook: reads existing notes (best-effort), appends a dated Hebrew reason line, `PATCH`es notes, then `POST /cancel`. Notes-read/write failures degrade gracefully and never block the discard.
- `src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.tsx`
  - Header restructured into two sibling buttons (expand + discard) so both stay keyboard-reachable.
  - Inline cancel-with-reason panel: preset reason `<select>` (כבר לא נדרש / כפילות / הוזמן בערוץ אחר / הספק לא זמין / מחיר-תנאים לא מתאימים / אחר…) + free-text for "אחר", `tone:"danger"` confirm stating consequences, disabled until a reason is chosen.
- `src/app/(po)/purchase-orders/placement-queue/page.tsx`
  - Durable "order removed from queue" banner (mirrors the place-success banner) with the reason; wired via `onCancelled`.
- `src/app/(planning)/planning/procurement/_components/FocusCard.tsx`
  - Place CTA "סמן כבוצע — צור הזמנה" → **"העבר לביצוע רכש"** (Tom's phrase; the hand-off, not a completion).
  - Approve CTA "אשר והפק מסמך" → "הפק מסמך הזמנה" (de-conflates the doc-generation step from the hand-off).
  - `placed` status label "בוצע" → "הועבר לביצוע"; pending "יוצר PO…" → "מעביר…"; placed banner now names the destination (office-manager placement queue).
- `src/app/(planning)/planning/procurement/_components/ActionList.tsx`
  - `placed` status label "בוצע" → "הועבר לביצוע" (corridor vocabulary coherence).
- `src/app/(po)/purchase-orders/placement-queue/_components/PlacementRow.test.tsx`
  - Added guard test: discard stays disabled (with explanatory title) until a reason is chosen; a disabled discard never reaches `/cancel`.

## Evidence

- `npx tsc --noEmit` → clean (exit 0).
- `npx vitest run` over the placement-queue + FocusCard + ActionList test files → 13/13 pass.
- Hebrew/RTL surfaces touched are on the authorized exception list (CLAUDE.md 2026-06-17, 2026-06-20).

## Deliberately NOT in this tranche (→ tranche 131)

Filter / sort controls on the queue and ActionList; defer/postpone flow; delete-from-session for a session PO; raw-enum / UUID-leak fixes on `/purchase-orders`; the recount→inbox request. Kept out to hold this tranche tight and fully verified.

## Still open (Tom decision, not code)

- **FLOW-8 (P0, gate blocker):** role-lattice contradiction — the bookkeeper cockpit (tranche 090) treats the office manager as `viewer`, but the placement queue requires `planning:execute` (planner). Live DB role is `planner`, so the flow works today; the contradiction needs a written decision (formalize planner, or split a `purchasing:place_order` capability). Not resolved here — editing it would touch a Tom-owned locked decision.
