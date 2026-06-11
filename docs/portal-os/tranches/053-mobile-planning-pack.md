# Tranche 053 — Mobile planning pack (forecast editor, procurement calendar, planning nav, meeting cockpit)

status: implemented (working tree; not yet committed/pushed)
phase: mobile-readiness audit follow-up, Tranche C (planning surfaces)
approved_by: Tom (2026-06-11 dispatch — all six audit items pre-approved)
note: ran alongside another agent's lane (production-plan/** + production-actual/**)
in the same working tree; this tranche touches zero files in those paths.
`_active.txt` left untouched (shared-tree convention from Tranche 050/051).

## Audit items closed
- **FLOW-003 (CRITICAL)** — forecast MonthlyGrid uses fixed pixel tracks
  (`ITEM_COL_W=380` + 130px months + 140px total) and is unusable at 390px.
- **FLOW-014** — forecast surface used two `window.confirm` calls (item
  removal, discard local edits).
- **FLOW-021** — `.fc-bottom-bar` sticky action bar sat under the iOS home
  indicator (no safe-area inset).
- **FLOW-004 (CRITICAL)** — procurement CalendarView renders a 7-col month
  grid that collapses into unreadable slivers below 768px.
- **FLOW-005** — PlanningSubNav: the active tab can sit off-screen on phones
  with no affordance that more tabs exist.
- **FLOW-007 / FLOW-008** — meeting cockpit: FIRM week selector forced a
  `min-w-[14rem]` floor (overflow at 390px) with the Generate button crowding
  the same row; CadenceRail's three steps + Today badge didn't fit one row.

## File manifest
- `src/app/(planning)/planning/forecast/[version_id]/_components/MonthlyGrid.tsx`
  — FLOW-003: `useMediaQuery("(max-width: 767px)")` + `isMounted` guard
  (idiom copied from InventoryFlowClient.tsx; SSR/first paint = desktop grid,
  no hydration mismatch). New `MobileForecastList`: one collapsible row per
  item (name + supply chip + live row total), expanding to stacked month
  cells with ≥44px-tall (`min-h-[44px]`) numeric inputs wired to the SAME
  `effectiveValue`/`onCellEdit` state machine (shared `normalizeCellInput`
  helper, also now used by the desktop cells) so the parent's 800ms debounced
  auto-save keeps working unchanged; mobile grand-total footer; new
  `forecast-mobile-*` testids. Desktop grid markup/testids unchanged.
  FLOW-014: the remove button no longer `window.confirm`s — it requests
  removal; the page owns the confirm.
- `src/app/(planning)/planning/forecast/[version_id]/page.tsx` — FLOW-014:
  `onItemRemove` → `performItemRemove` + `requestItemRemove`; item removal
  opens a bottom sheet naming the item (`forecast-remove-sheet[-confirm|
  -cancel|-backdrop]`, role=dialog, confirm-focus like FirmPanel; full-width
  sheet on phones, centered floating card sm+); confirm zeroes the buckets
  via the same auto-save queue. "Discard local edits" is a two-step inline
  confirm inside the bottom bar (FirmPanel pattern): Keep editing /
  Discard edits (`forecast-bottom-bar-discard-cancel|-confirm`); the
  original `forecast-bottom-bar-discard` testid stays on the first-step
  button; two-step auto-resets when pending count drains to 0. The grid is
  passed `requestItemRemove`; ItemAutocompleteAdder toolbar is unchanged and
  remains above the grid on mobile (FLOW-003 reachability).
- `src/app/globals.css` — FLOW-021: one additive rule inside `.fc-bottom-bar`:
  `padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px))`. Its
  existing `z-index: 35` already sits below the TopBar (z-40) — unchanged.
- `src/app/(planning)/planning/procurement/_components/CalendarView.tsx` —
  FLOW-004: below md a grouped-by-week list (`procurement-calendar-list`,
  `calendar-week-group` with `data-week-start`, `calendar-list-entry-<id>`):
  week header "שבוע 7 ביוני – 13 ביוני", rows = tier dot + supplier + tier
  chip (reuses `tierDot`/`tierChip`) + Hebrew date ("יום ה׳ · 11 ביוני") +
  ₪ amount; ≥44px rows; tap = `onOpen(session_po_id)` exactly like the
  desktop cell button; placed/skipped rows dimmed (opacity-50 parity); empty
  state "אין הזמנות מתוכננות בתקופה הקרובה."; only weeks carrying orders
  render. Desktop grid card gains `hidden md:block` — markup/testids
  otherwise byte-identical. Pure CSS breakpoint switch; same single byDay
  source of truth.
- `src/components/layout/PlanningSubNav.tsx` — FLOW-005: active tab ref +
  `scrollIntoView({ inline: "nearest", block: "nearest" })` on mount/route
  change (guarded for environments without scrollIntoView); scroll row
  rewrapped in the shared `<ScrollFade>` (Tranche 051 component — NOT
  re-implemented) with `from-bg` fade; tab links, classes, badge query and
  aria-current semantics unchanged.
- `src/app/(planning)/planning/meeting/page.tsx` — FLOW-007: week-selector
  label `min-w-[14rem]` → `min-w-0` + `truncate`; Generate / refresh drafts
  button moved to its own row below the week nav (`mt-3 flex justify-end`).
  FLOW-008: CadenceRail steps stack icon above a `text-xs` label below sm
  (`flex-col` base, `sm:flex-row` restores the original row + `sm:text-sm`);
  Today badge becomes a corner dot (`cadence-today-dot`, `sm:hidden`,
  accent-fg on the active step) below sm, full Badge wrapped
  `hidden sm:inline-flex`; aria-labels (incl. "(today)") unchanged so all
  tranche-037/038 a11y anchors hold.
- `src/app/(planning)/planning/procurement/_components/CalendarView.test.tsx`
  — pre-existing test updated (see Deviations): tier-label assertion
  `getByText` → `getAllByText(...).length >= 1` because the label now also
  legitimately appears in the mobile list rows.
- `tests/unit/features/forecast-grid-mobile.test.tsx` — NEW, 8 tests
  (desktop grid intact + no-confirm removal; mobile list, 44px inputs,
  same-pipeline edits incl. floor/empty/negative, local-overlay parity,
  remove request, read-only).
- `tests/unit/features/forecast-confirm-flows.test.tsx` — NEW, 4 page-level
  tests (removal sheet naming the item: cancel + confirm-zeroes-via-queue;
  discard two-step: reveal/cancel + confirm; `window.confirm` never called).
- `tests/unit/features/procurement-calendar-mobile.test.tsx` — NEW, 5 tests
  (desktop grid gated `hidden md:block` with testids intact; week grouping;
  tap → onOpen; placed dimming; empty state).
- `tests/unit/features/planning-subnav-mobile.test.tsx` — NEW, 4 tests
  (single aria-current; scrollIntoView inline:nearest on mount; ScrollFade
  overlay present; all 8 tab links survive the rewrap).
- `tests/unit/features/meeting-mobile.test.tsx` — EXTENDED, +4 tests
  (cadence rail flex-col/sm:flex-row; corner dot + sm-gated Today badge;
  week selector min-w-0 + truncate; Generate row mt-3 flex justify-end).
- `docs/portal-os/tranches/053-mobile-planning-pack.md` — this manifest.
- `docs/portal-os/registry.md` — one new index row.

## Gates / evidence
- `npx tsc --noEmit` — clean.
- `vitest` — **567 passed / 0 failed (71 files)**. Dispatch quoted a 516
  baseline; the shared working tree had already moved to 542 passed (Tranche
  050/052 lanes landed +26). This tranche adds 25 tests (8+4+5+4+4) and
  fixes 1 stale assertion → 567, zero failures.
- Desktop (md+): forecast grid, procurement calendar grid, planning sub-nav
  tabs and meeting cockpit render with identical classes at md+ (see
  Deviations for the two spec-mandated exceptions).
- Existing testids preserved (`forecast-monthly-grid`, `forecast-grid-*`,
  `forecast-bottom-bar-*`, `procurement-calendar`, `calendar-entry-*`,
  planning-tab markup, meeting aria-labels). Mobile alternatives use new
  testids (`forecast-mobile-*`, `procurement-calendar-list`,
  `calendar-week-group`, `calendar-list-entry-*`, `cadence-today-dot`,
  `forecast-remove-sheet*`, `forecast-bottom-bar-discard-cancel/-confirm`).

## Deviations (honest)
1. **FLOW-007 applies at all widths** — the Generate button's move to its own
   row and the removal of the 14rem floor are unconditional (as specified:
   "moves to its own row below the nav"), so md+ layout of that one row
   changes by design.
2. **FLOW-014 sheet is shared** — the item-removal bottom sheet replaces
   window.confirm on desktop too (full-width sheet <sm, centered floating
   card sm+); window.confirm had to go everywhere, not just mobile.
3. **Pre-existing test updated** — `CalendarView.test.tsx` V1 asserted the
   tier label appears exactly once; the mobile list legitimately repeats it
   per row → `getAllByText`. Reported per dispatch ("if grid tests assert
   desktop-only rendering update only those").
4. **Vitest baseline drift** — 516 quoted vs 542 found (other lanes landed in
   the shared tree before this run). No failures either way.

## Checklist
- [x] Implemented  - [x] Typecheck  - [x] Vitest  - [ ] Pushed (Tom merges)
