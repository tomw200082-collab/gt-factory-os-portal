# Tranche 140 — Procurement corridor: 5-round /ux-release-gate audit-and-fix loop

**Status:** in progress
**Origin:** Tom-directed (2026-07-23 chat, after tranche-134-follow-on base-batch work): `/ux-release-gate` + `/frontend-design` + `/ui-ux-pro-max` — "תעבור שוב על הדף הזה ועל כל התהליך ותשפר כל מה שאתה מוצא לנכון. תעשה 5 איטרציות כאלה על כל תהליך הרכש מקצה לקצה" (go over this again and improve whatever you see fit; do 5 such iterations across the entire procurement process end to end).
**Scope:** the full procurement corridor — recommendation → weekly purchase session → PO approval → office-manager placement:
- `/planning/procurement` + `[session_po_id]/sheet` (`_components/*`, `_lib/*`)
- `/planning/purchase-session` (`_lib/*`)
- `/planning/purchase-calendar` (`_lib/*`)
- `/purchase-orders`, `/purchase-orders/new`, `/purchase-orders/[po_id]`
- `/purchase-orders/placement-queue` (`_components/*`, `_lib/*`)

Out of scope (explicit boundary, not silently dropped): `/stock/receipts` (goods receipt against a PO — a separate corridor with its own tranche 137), backend/schema/contract changes (portal lane only), and the Hebrew/RTL doctrine itself on `/planning/procurement` and `/purchase-orders/placement-queue` (locked exception, CLAUDE.md) — findings that would "fix" Hebrew to English are out of bounds; only content/flow/visual/a11y quality within the Hebrew surface is in scope.

**Departure from the read-only gate default:** `/ux-release-gate` is normally report-only (its own spec: "Not usable for: ... editing portal code to fix findings"). Tom's instruction this run explicitly directs applying fixes between audit rounds — a 5-round audit → fix → verify loop, not a single report. The five UX agents stay read-only per their tool grants; all fixes are applied by the orchestrating session directly, matching how the agents' `Edit`/`Write`-less tool sets are configured.

## Round log

### Round 1 — audit + fix (complete)

Five UX agents (`ux-flow-architect`, `interaction-design-specialist`,
`visual-system-designer`, `ux-content-state-designer`,
`accessibility-usability-auditor`) audited the full corridor in parallel
against rendered evidence (fixture-driven `ux-shot.spec.ts` screenshots +
code read). Findings deduped across dimensions (several were flagged 2-4x
independently) and fixed directly per this tranche's explicit fix-loop
mandate. No P0 shipped unresolved.

**Fixed, by file:**

- `[session_po_id]/sheet/page.tsx` — structured loading/error/not-found
  states (skeleton, `role="alert"`, in-content CTA back to `/planning/procurement`)
  replacing bare-text states; no raw API error message surfaced; print
  button token-drift fixed (`rounded-lg border-border bg-bg` →
  `rounded border-border/80 bg-bg-raised`).
- `purchase-orders/page.tsx` — `STATUS_LABEL_FILTER` map so filter chips
  render Hebrew/plain labels not raw enum values; search input
  `aria-label`; two `supplier_id` UUID leaks → "Unknown supplier";
  `LinesSummaryCell` progressbar `title`→`aria-label`; "Manage in
  placement queue →" link when `approvedCount > 0`; `NewPoDropdown`
  rewritten to the full WAI-ARIA Menu Button keyboard pattern
  (arrow-key cycling, focus return on close).
- `purchase-orders/[po_id]/page.tsx` (largest file this round) —
  `POStatusBadge` gained `APPROVED_TO_ORDER`; `ReceiptProgress` real
  `role="progressbar"` semantics + `aria-label` on both progress bars;
  table headers got `scope="col"` (attached-GRs, lines); `FIELD_LABELS`
  map for the history-diff table; cancel mutation rewritten to require
  a reason (mirrors `placement-queue/_lib/api.ts`'s
  PATCH-notes-then-POST-cancel pattern — no backend change) with a
  proper `role="alertdialog"` confirm (named PO number, consequence
  statement, `CANCEL_REASONS` select + "Other…" free text, focus
  management, always-mounted `role="alert"` error); three raw
  `source_run_id` UUID leaks fixed (header + two source-recommendation
  rows now show Yes/— , no link to the diagnostic-only runs page);
  sidebar Linkages "Source planning run" block removed, its Supplier
  row's `supplier_id` leak fixed to `supplier_name` (same bug class,
  own-initiative); "Attached GRs"→"Goods receipts", "{n} GR{s}"→"{n}
  receipt{s}"; line-edit labels wired `htmlFor`/`id`; close-edit "✕"
  button `aria-label`.
- `purchase-orders/new/page.tsx` — "Status: OPEN." → "Status: Open."
- `purchase-orders/placement-queue/page.tsx` — "X הזמנות ממתינות" → "X
  הזמנות בתור"; dropped "(ברירת מחדל)" from the sort option;
  `WorkflowHeader` gained `backHref`/`backLabel` to `/planning/procurement`;
  added a refresh button (spinner via `isFetching` + relative-time
  since last update via new `fmtRelativeHe`).
- `placement-queue/_components/PlacementRow.tsx` — cancel-reason
  `<select>` auto-focuses on open, Escape closes the cancel panel;
  "No open lines" message now points at the cancel action; price
  label wording fix + conditional required-asterisk; mobile
  cancel-toggle button meets the 44px touch target.
- `procurement/_components/ActionList.tsx` — handled-bucket hint
  wording fix; `SectionMeta.tone` narrowed to fix a TS2322 and wired
  to `SectionCard`'s `tone` prop (was unstyled); "open in focus"
  buttons changed from `btn-accent` to `btn-outline` (were competing
  with the row's real primary action); clearing filters also resets
  sort.
- `procurement/_components/FocusMode.tsx` — close-confirm dialog
  gained real focus management (auto-focus on open, Escape, a
  contained tab-trap) and lost its trailing emoji.
- `procurement/_components/IntegrityStrip.tsx` — session-created
  timestamp now shows the date too when not same-day; refresh button
  visual treatment brought onto token system; armed-refresh state
  announced via an `sr-only` live region.
- `procurement/_components/FocusCard.tsx` — fixed a wrong import path
  for `fmtDateHe`; place-date field no longer silently pre-fills from
  `earliest_need_date` (was indistinguishable from a real decision);
  `actionError` rewritten to fixed per-mutation Hebrew strings instead
  of chaining raw API messages; disambiguated the spinner between the
  two buttons sharing one mutation; added a `min` date on the place-date
  input; sheet link opens in a new tab; removed a raw UUID fragment
  from the placed-success banner; input/button a11y + styling touch-ups.
- `procurement/_components/RecommendationsToConvert.tsx` — "Try
  again" → "נסה שוב" (flagged independently by 3 agents); raw
  `(error as Error)?.message` dropped for a fixed Hebrew string; the
  conversion-success banner gained a dismiss control (it had no way to
  clear once `recs.length` hit 0); `order_by_date` now runs through
  `fmtDateHe` (own-initiative, same pattern already applied elsewhere
  this round).
- `procurement/_lib/session-warnings.ts` — `inboundIssueTooltip`'s
  `"PO"` English fallback → `"הזמנה"` (this is a Hebrew-only surface).
- `procurement/_components/AddLineForm.tsx` +
  `components/fields/SearchableSelect.tsx` — inline validation errors
  now wired via `aria-describedby`/`aria-invalid` (`SearchableSelect`
  gained an optional `describedBy` prop for this, additive/backward
  compatible).
- `procurement/page.tsx` — two raw error messages (session-start
  failure, session-load failure) replaced with fixed Hebrew strings;
  summary card's total-cost figure promoted to the visually dominant
  element (was smaller than the session-date line despite being the
  number that matters most); session date now runs through
  `fmtDateHe` instead of rendering the raw ISO string; the supersede
  `role="alertdialog"` warning gained real focus management (auto-focus
  first action, Escape, a contained tab-trap via the shared
  `useFocusTrap` hook, focus-return to the trigger button — careful to
  skip the return-focus effect on initial mount so page load doesn't
  steal focus) and its action buttons + the header start button now
  meet the 44px touch-target minimum.

**Deferred to a later round (M-effort, logged not dropped):**

- `CalendarView` — a tier-vs-bucket labeling conflict and missing ARIA
  grid semantics (bigger structural change, wants its own pass).
- `AddLineForm` — UOM select shows raw enum codes, not a label map
  (small but touches a shared enum list, better bundled with any other
  enum-label work Round 2 surfaces).
- A full "scroll to confirm" visual affordance for `IntegrityStrip`'s
  armed-refresh state (built the `sr-live` announcement now; the
  visual treatment is a Round 3 visual-polish candidate).

**Evidence:**
- `npx tsc --noEmit` — clean, 0 errors.
- `npx eslint` on every changed file — 0 errors; 3 pre-existing
  `react-hooks/exhaustive-deps` warnings confirmed present on the
  pre-round baseline (unrelated to this round, left as-is, out of
  scope).
- `npx vitest run` — 123 files / 1006 tests, all passing.
- Render evidence: hand-authored fixtures
  (`PurchaseSession`, `QueuePo`/`QueuePoLine` shapes) rendered via
  `ux-shot.spec.ts` under the sanctioned dev-shim auth for the initial
  audit pass.

## Files

(finalized at tranche close — every source file touched across all 5 rounds)

## Evidence

(finalized at tranche close — tsc/eslint/vitest/playwright per round + cumulative)
