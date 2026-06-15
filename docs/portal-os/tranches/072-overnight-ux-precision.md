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

### Wave 3 — PO detail cost summary (committed / received / outstanding)  ✅
**Files:** `src/components/purchase-orders/po-cost-summary.ts` (+ test),
`src/app/(po)/purchase-orders/[po_id]/page.tsx`.

- New pure helper `summarizePoLineCosts(lines)` → ordered / received /
  outstanding value + received-by-value fraction (cancelled lines excluded;
  `hasPrices=false` when no line is priced).
- The PO detail **Lines** tab now opens with a cost-summary strip: Ordered
  value · Received (green) · Outstanding (amber when > 0) · a "% received by
  value" bar. Answers "how much have I committed, received, and still owe?" at
  a glance — the cost half of price/cost accuracy. Hidden when the PO carries
  no prices (no misleading ₪0).
- Evidence: 48/48 PO tests pass (5 new); `tsc --noEmit` exit 0.

### Wave 4 — Approval buttons: split busy flags + approve confirmation gate  ✅
**Files:** `src/app/(inbox)/inbox/approvals/physical-count/[submission_id]/page.tsx`,
`src/app/(inbox)/inbox/approvals/waste/[submission_id]/page.tsx`.
**Source:** interaction-design-specialist audit (INTER-001/002, BLOCKER).

- **Bug fixed:** both pages shared ONE `busy` flag — clicking *Approve* disabled
  **and** relabelled the *Reject* button "Submitting…" (and vice versa). Split
  into `approveBusy` / `rejectBusy`; each button now reflects only its own
  action (the other is disabled but keeps its label). Every button hits its own
  target.
- **Irreversible-action gate:** Approve replaces the stock anchor / posts to the
  ledger. It now goes through an inline confirm zone ("Approving replaces the
  stock anchor for X with N… / posts a loss of N… — confirm?") matching the
  existing PO-cancel inline-confirm pattern, instead of firing on first click.
- Waste page also: status raw-string → pill chip; plain-text loading → skeleton
  (matches the physical-count page).
- Evidence: full suite **698/698** green (86 files); `tsc --noEmit` exit 0.

### Wave 5 — Credit reject button gets destructive styling  ✅
**File:** `src/app/(inbox)/inbox/credit/[exception_id]/page.tsx`.
**Source:** interaction-design-specialist audit (INTER-004).

- "דחה זיכוי" (reject credit) trigger was `btn btn-sm` — visually identical to
  the benign "ראיתי" (acknowledge). Now danger-toned
  (`border-danger/40 text-danger-fg hover:bg-danger/10`) so a consequential
  reject is distinguishable from acknowledge at a glance. The final commit
  inside the reject panel keeps its full `btn-danger`.
- INTER-006 (add post-approve states to the exceptions query) deliberately
  **not** done — it depends on which `status` filter values the exceptions API
  accepts, which is backend knowledge outside this lane. Logged in the report.
- Evidence: `tsc --noEmit` exit 0.

### Wave 6 — Catalog write-back caution on price variance  ✅
**Files:** `src/components/purchase-orders/types.ts` (+ tests),
`src/app/(po)/purchase-orders/new/page.tsx`.

- New pure helpers `resolveLineCatalogCost(line, rows, headerSupplier)` and
  `countPriceVarianceWarnings(lines, map, headerSupplier)`.
- On `/purchase-orders/new`, when "Update catalog prices from this order" is
  checked AND any line's entered price diverges materially (warn/high) from the
  catalog, a caution appears: "N lines have prices that differ a lot from the
  catalog. Review them before letting this order update catalog prices." Closes
  the loop from wave 1 — a fat-finger price can no longer silently write back.
- Evidence: 53/53 PO tests pass (5 new); `tsc --noEmit` exit 0.

_Subsequent waves appended below as completed._
