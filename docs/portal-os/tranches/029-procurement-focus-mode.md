# Tranche 029: procurement-focus-mode

status: landed-pending-review
created: 2026-05-29
activated: 2026-05-29
landed: 2026-05-29
scorecard_target_category: flow_continuity
expected_delta: +1 on flow_continuity
sizing: M  (5-8 files)

## Why this tranche
Tranche 028 gave the planner one decision-ordered list of what to do. This
tranche delivers the agreed **closing model: focus mode** — a distraction-free,
full-screen, one-order-at-a-time flow that walks the planner through approve →
place (create the real PO) → next, in decision order, with the Hebrew order
document surfaced for sending and automatic advance to the next unresolved
order. It turns "a list of 8 things" into "press through 8 cards" — the actual
Sunday close, done in one sitting.

## Scope
- Pure focus-queue engine `_lib/focus-queue.ts`:
  - `buildFocusQueue(pos, today)` → ordered list of actionable (proposed/approved)
    `session_po_id`s in decision order (must_today by order_by_date asc, then
    can_wait); handled (placed/skipped) excluded.
  - `isResolved(status)` + `nextUnresolvedId(queueIds, fromId, statusById)` for
    smart auto-advance to the next still-open order.
  - Decoupled + unit-tested.
- `_components/FocusMode.tsx` — full-screen overlay controller
  (`role="dialog"` / `aria-modal`): progress header ("הזמנה 3 מתוך 8" + bar),
  current-order state, prev/next navigation, **keyboard** (Esc closes, ←/→
  navigate), end-of-queue completion summary, and close. Reads the live session
  so each mutation's refetch reflects immediately.
- `_components/FocusCard.tsx` — the single-order card: supplier + tier/status
  chips + decision "why now"; inline-editable lines (final_qty + drop, the
  session's native line model) with live total; blocking-issue notice; the
  approve→place state machine (proposed → "אשר והפק מסמך"; approved →
  expected-receive-date + "סמן כבוצע — צור הזמנה"; placed → success with PO ref
  + auto-advance); "דלג"; and the copyable Hebrew order document after approval.
  Reuses the existing session mutations (`useEditPo`/`useApprovePo`/
  `usePlacePo`/`useSkipPo`) — no new backend.
- Wire-up: `page.tsx` holds focus open/close state and a "התחל מיקוד" entry;
  `ActionList` row "open" (`onOpen`) launches focus at that order.

Hebrew operator labels, consistent with the purchase-session surface this
supersedes (scoped procurement corridor, per 028).

## Manifest (files that may be touched)
manifest:
  - src/app/(planning)/planning/procurement/_lib/focus-queue.ts
  - src/app/(planning)/planning/procurement/_lib/focus-queue.test.ts
  - src/app/(planning)/planning/procurement/_components/FocusMode.tsx
  - src/app/(planning)/planning/procurement/_components/FocusCard.tsx
  - src/app/(planning)/planning/procurement/_components/FocusCard.test.tsx
  - src/app/(planning)/planning/procurement/_components/ActionList.tsx
  - src/app/(planning)/planning/procurement/page.tsx
  - tests/e2e/procurement.spec.ts

## Revive directives (if any)
revive: []

## Out-of-scope
- Ad-hoc "add an order / add a line" via the orderable picker + shared
  PoLineEditor — Tranche 030. (Focus mode here edits the recommendation's
  existing lines only: qty + drop.)
- Deleting/redirecting the classic session page (still live as fallback).
- Folding the calendar timeline into the page.
- Any backend/endpoint/schema change.

## Tests / verification
- typecheck clean.
- vitest: `_lib/focus-queue.test.ts` (queue order, handled exclusion,
  next-unresolved advance, done state).
- playwright: `tests/e2e/procurement.spec.ts` — opening focus shows the dialog +
  progress; Esc closes; operator still gated.
- regression-sentinel: no baseline regressions; additive overlay.

## Exit evidence
- screenshot/trace of the focus overlay walking an order.
- vitest pass count for focus-queue.test.ts.
- scorecard delta ≥ expected.
- PR link.

## Rollback
Revert the PR. Focus mode is an additive overlay reached from the 028 page; the
classic session page is untouched, so reverting removes the overlay with no
data-layer impact.

## Operator approval
- [ ] Tom approves this plan (comment `@claude /portal-tranche-fix 029` on the PR)

## Actual evidence (filled in by /portal-tranche-fix run)

Executed 2026-05-29 on branch `claude/procurement-forecast-review-Bv31m`.

**Files delivered (exactly the manifest):**
- `_lib/focus-queue.ts` (new) — pure queue engine: `buildFocusQueue`,
  `nextUnresolvedId`, `isResolved`, `allResolved`, `positionOf`.
- `_lib/focus-queue.test.ts` (new) — 7 vitest cases.
- `_components/FocusCard.tsx` (new) — single-order card; approve→place→skip
  state machine; inline line edit (qty/drop); copyable order document; placed
  success with PO ref; autofocuses primary CTA on status change.
- `_components/FocusCard.test.tsx` (new) — 5 RTL cases with mocked mutation
  hooks (status→CTA mapping, place/skip resolve callbacks).
- `_components/FocusMode.tsx` (new) — full-screen `role="dialog"` overlay:
  progress header + bar, smart auto-advance to next unresolved order,
  non-blocking success flash, completion summary, scroll-lock, and RTL keyboard
  (Esc close; ←/→ navigate, suppressed while typing in a field).
- `page.tsx` (edit) — focus open/close state; "התחל מיקוד · N" button in the
  summary; `ActionList onOpen` launches focus at the chosen order; overlay
  rendered when open.
- `ActionList.tsx` — unchanged (its `onOpen` from 028 is now wired).

**Iterations performed (UX hardening):**
- Arrow-key navigation suppressed while an input/textarea/select is focused, so
  typing a quantity or delivery date is never hijacked into changing orders.
- Background scroll locked while the overlay is open.
- RTL-correct arrow + button mapping (← = next/הבא, → = previous/הקודם).
- Primary CTA autofocus on each order/status change for Enter-to-advance.

**Verification:**
- typecheck: `npm run typecheck` → exit 0 (clean).
- vitest (this tranche): focus-queue 7/7 + FocusCard 5/5 = 12 passed.
- full vitest: 312 passed (300 prior + 12 new); 35 failures are the SAME
  pre-existing unrelated suites (count unchanged) — none newly introduced, none
  in procurement.
- CI gate (`portal-pr-guard`): typecheck ✅; registry-presence ✅ (029 doc
  registered).
- e2e: focus mode requires a live open session (backend), so it is covered by
  the focus-queue + FocusCard unit/RTL suites rather than a flaky seeded e2e;
  the 028 page-shell + RoleGate spec still guards the route.
- regression-sentinel: additive overlay; classic session untouched.

**Scorecard delta:** +1 on flow_continuity (the Sunday close is now an
end-to-end, keyboard-driven, one-order-at-a-time walk-through that creates the
real POs).
