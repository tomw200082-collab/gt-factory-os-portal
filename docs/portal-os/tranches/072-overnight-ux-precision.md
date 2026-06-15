# Tranche 072 — Overnight UX precision pass

> Status: **in progress** (autonomous overnight session, started 2026-06-15)
> Branch: `claude/system-ux-review-yfobyn`
> Owner of merge: **Tom** (draft PR only — no autonomous merge)

## Mandate (Tom, 2026-06-14)

Review the UX of every page in the system. Iterate UX/UI improvements through the
night. Make every button "hit the bullseye" — precise labels, states,
confirmations, hierarchy, hit-areas, a11y. Emphasis on the **purchase-order
process as it happens today**, and within that on **price & cost accuracy**.
Skip backend-blocked surfaces entirely (only improve what works end-to-end with
today's APIs). No backend / schema / integration authoring (portal-only lane).

## Operating rules for this tranche

- Green baseline before edits: typecheck exit 0, **679 tests / 84 files** passing.
- Every wave: implement → `tsc --noEmit` → `vitest run` (affected) → commit.
- Additive-first: new elements + new `data-testid`s; do not break existing test ids.
- Professional UX grounding cited per wave (buttons, destructive actions, price
  input) — see report.
- Draft PR; Tom merges. Honors invariant 5 (no destructive op without human merge).

## Waves

### Wave 1 — PO line price intelligence (price & cost accuracy)  ✅
**Files:** `src/components/purchase-orders/types.ts`,
`src/components/purchase-orders/PoLineEditor.tsx`,
`src/components/purchase-orders/PoLineEditor.test.tsx`.

- New pure helper `computeLinePriceInsight(qty, enteredPrice, catalogCost)` →
  `{ lineTotal, effectiveSource, variancePct, varianceLevel }`.
- Each PO order line now shows a **live line total** (using the entered price, or
  the catalog cost when blank, labelled "using catalog cost").
- Each line shows a **price-variance signal** vs the catalog cost, bucketed:
  `none` (<5%, quiet) · `info` (<50%) · `warn` (<200%) · `high` (≥200%,
  danger-styled, "double-check for a typo"). Catches a fat-fingered unit price
  (e.g. 125 vs 12.5) **before** it becomes PO truth and writes back to catalog.
- Evidence: 43/43 PO tests pass (11 new); `tsc --noEmit` exit 0.

### Wave 2 — App-wide keyboard focus visibility  ✅
**Files:** `src/app/globals.css`, `tests/unit/globals-css-focus-visible.test.ts`.

- The base `.btn` class had hover/active/disabled states but **no focus-visible
  ring** — keyboard users could not see which button was focused (WCAG 2.4.7).
  Added `focus-visible:ring-2 ring-accent/55 ring-offset-1 ring-offset-bg`.
- `.input` / `.textarea` did `focus:outline-none` with only a border-colour
  change (weak indicator). Added `focus:ring-2 focus:ring-accent/25`.
- One base-class change lifts **every button and field in the app at once**.
- New `globals-css-focus-visible` guard test locks it in (3 assertions).
- Evidence: focus + mobile-zoom guard tests green; `next build` compiled OK.

### CI note
The `ci` workflow enforces that every new `docs/portal-os/**` file is listed in
`registry.md` (registry-guard step). Tranche docs added this session are
registered there. typecheck / vitest / `@mocked` Playwright all pass on the code.

_Subsequent waves appended below as completed._
