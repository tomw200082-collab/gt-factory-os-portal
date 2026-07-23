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

### Round 2 — re-audit + fix (complete)

Fresh dispatch of the same five agents against the Round 1-fixed code
(not a rehash — each was briefed to find what Round 1 missed or left
incomplete, plus give an explicit verdict on Round 1's three deferred
items). Heavy cross-dimension convergence this round — several findings
were independently raised by 2-4 agents, which is treated as a
confidence signal, not de-duplication busywork.

**Deferred items from Round 1, resolved:**
- `CalendarView` tier-vs-bucket conflict — confirmed real by two agents
  (flow, copy) with concrete cross-view evidence (the same PO reads
  "חובה השבוע" in the calendar and "יכול לחכות" in the action list).
  Fixed: `TIER_LABEL` now reuses ActionList's own bucket vocabulary
  (`urgent`→"חייב לצאת היום", `must`/`recommended`→"יכול לחכות", merged
  under one summary chip with the dot color carrying the remaining
  urgency signal); zero-count chips no longer render.
- `AddLineForm` UOM raw enum codes — fixed with a label map (metric/count
  abbreviations KG/L/ML/G/MG/TON kept as-is; UNIT/PCS/BAG/CASE/BOX/
  BOTTLE/TIN given Hebrew labels). `value` stays the enum code.
- `IntegrityStrip` armed-refresh affordance — turned out to be two real
  bugs, not one polish item: the sr-only live region sat inside a
  `display:none` mobile-collapsed parent (silenced screen readers
  exactly when armed) and used a non-standard `role="status"` +
  `aria-live="assertive"` pairing. Fixed both, and added a visible
  pulsing indicator in both the collapsed mobile bar and the expanded
  row (a live region only helps screen-reader users; sighted users
  scrolled away from the header needed a visual cue too).

**Fixed, by file (P0/P1 unless noted):**

- `procurement/page.tsx` — fixed a StrictMode-unsafe focus-return guard
  in my own Round 1 code (a "have I run once" ref flag isn't invariant
  to React 18's double-invoke-effects-on-mount; replaced with tracking
  the actual previous value of `confirmingStart`, which only reacts to
  a real close transition). Two raw error messages from Round 1 review
  turned out already fixed; this round's actual finds here were the
  StrictMode bug and the IntegrityStrip changes above.
- `purchase-orders/[po_id]/page.tsx` (largest file again) — the PO-level
  cancel dialog gained the same focus-trap/Escape/focus-return treatment
  as the procurement page's supersede-confirm (3-way convergence:
  interaction, flow, a11y all independently flagged the missing trap);
  the per-line cancel dialog gained an Escape handler and a stable
  ref-callback for its focus-on-open (the previous inline arrow-function
  ref re-fired on every render, stealing focus back mid-interaction —
  fixed via a per-line ref cache built once at the component's top
  level, not inside the row `.map()`, to stay hook-rule-compliant
  without a wider per-row-component refactor); added a `DRAFT` case to
  `POStatusBadge` (fell through to the raw enum); two `supplier_id`
  UUID-fallback leaks fixed (`supplierLabel`, two separate
  declarations); `AttachedGrCard`'s raw `item_id` fallback replaced;
  edit-mutation and line-edit-mutation raw error messages replaced with
  fixed strings; a raw ISO `expected_receive_date` in the "still
  awaiting" panel now formatted; line-edit inputs wired to their error
  via `aria-describedby`; an APPROVED_TO_ORDER PO now shows a link to
  the placement queue instead of a dead end (no cancel path exists here
  for that status); the Cancel PO button/dialog moved to the far edge
  of the header action row, separated from Receive/View-receipts;
  "Internal ID" relabeled "PO reference"; the sidebar Linkages card's GR
  subtitle now uses the same status labels as `GrStatusBadge` instead of
  the raw backend string.
- `RecommendationsToConvert.tsx` — the conversion mutation's `onError`
  rendered the raw `Error.message` (which itself can carry the
  backend's raw `detail` field, per `_lib/recommendations.ts`) —
  replaced with a fixed Hebrew string, independently flagged by both
  the flow and copy agents. Also fixed the success-banner grammar when
  `po_number` is absent (was "...הומרה ל.", now a full sentence either
  way).
- `PlacementRow.tsx` — both mutation `onError` handlers were missing the
  `instanceof ApiError` guard that `_lib/api.ts` was explicitly built
  for (its own doc comment states the rule) — a raw network `TypeError`
  could have reached the Hebrew UI verbatim; fixed both. Two raw ISO
  dates now formatted. The overdue indicator gained a danger icon (was
  color-only).
- `purchase-orders/page.tsx` — `NewPoDropdown`: Tab no longer leaves the
  menu open while focus silently moves elsewhere (WAI-ARIA Menu Button
  violation, runtime-confirmed by the interaction agent's own Playwright
  script); Home/End now jump to the first/last item. The header's
  "0 POs" badge no longer flashes before the real count loads.
- `purchase-orders/new/page.tsx` — a raw Zod validation message could
  reach the operator in the 422 fallback path; a raw supplier UUID
  fallback in the draft summary; a raw ISO expected-date in the same
  summary; "ref {uuid}" (developer shorthand) in the success state
  relabeled "Order ID:".
- `SearchableSelect.tsx` — the popover's search input had no accessible
  name (placeholder text only, not a programmatic label) — now derives
  one from the trigger's own `ariaLabel`.
- `[session_po_id]/sheet/page.tsx` — both back-link occurrences used
  `ArrowRight`, which points forward in the LTR context this toolbar
  actually inherits (only the printable sheet body itself is RTL) —
  fixed to `ArrowLeft`.
- `FocusCard.tsx` — `CANCEL_REASONS` gained the same two supplier/price
  reasons `PlacementRow` and `[po_id]` already offer, closing a parity
  gap the copy agent flagged.
- Test fixes for intentional behavior changes: `CalendarView.test.tsx`
  and `procurement-calendar-mobile.test.tsx` updated to the new tier
  labels; `AddLineForm.test.tsx`'s shared `pickOrderable` helper scoped
  its query to the open listbox after the new UOM label for CASE
  ("קרטון") happened to collide with the test's own mock component name
  — a real native-`<select>`-always-in-DOM test hazard, not a product
  bug.

**Investigated, not a bug (false positive):** the visual agent flagged
a P0 for the placement queue showing "Access restricted" under the
`viewer` role. Confirmed against tranche 086's locked decision — no
distinct bookkeeper role exists in this system; the real office-manager
account is provisioned as `planner`, which is what the `planning:execute`
gate correctly requires. No code change.

**Deferred to Round 3 (visual polish round) or later, logged not
dropped:**
- Systemic `.btn-sm` touch-target gap (28px, below WCAG's 44px) —
  flagged by both a11y and visual agents but explicitly scoped as
  needing a token-level design decision, not a per-instance patch.
- `DetailPage`'s shared tab-list wrapping on mobile (touches a component
  used beyond this corridor — wants its own look, not a rushed bundle
  into an already-large round) and the PO detail lines-table's 9-column
  mobile overflow.
- A cluster of P2 visual findings on `[po_id]/page.tsx`: zero-value stat
  tiles rendered in semantic danger/accent color, a mobile stat-tile
  grid orphan, the "FROM RECOMMENDATION" provenance chip using
  status-level accent weight, the expected-date chip never carrying
  urgency tone, a duplicated "ordered value" figure across two cards,
  a Hebrew supplier name interpolated into English prose without a
  `<bdi>` wrap.
- The cancel-reason notes-PATCH's best-effort silent failure (if the
  PATCH fails, the PO still cancels but the reason isn't persisted —
  an audit-completeness gap, not a broken flow) and the start-mutation
  error-retry re-arming the confirm zone instead of retrying directly.

**Evidence:**
- `npx tsc --noEmit` — clean, 0 errors.
- `npx eslint` on every changed file — 0 errors; same 3 pre-existing
  `react-hooks/exhaustive-deps` warnings as Round 1, confirmed
  unrelated.
- `npx vitest run` — 123 files / 1006 tests, all passing (after
  updating 2 tests for the intentional tier-label change and 1 test's
  query-scoping fix for the coincidental Hebrew-text collision above).
- Runtime keyboard verification: the interaction and accessibility
  agents each wrote small standalone Playwright scripts driving real
  Tab/Escape/Arrow key presses against the running dev server (rather
  than relying on static code reading) to confirm/refute focus-trap and
  menu-button claims — parked at
  `scratchpad/a11y-r2-keyboard.spec.ts` for reuse in later rounds
  rather than committed (ad hoc verification harness, not a reviewed
  addition to the tracked test suite).

## Files

(finalized at tranche close — every source file touched across all 5 rounds)

## Evidence

(finalized at tranche close — tsc/eslint/vitest/playwright per round + cumulative)
