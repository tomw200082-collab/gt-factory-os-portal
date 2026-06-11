# Tranche 051 — Mobile-readiness Tranche B: bottom nav, PO cards, scroll affordance

status: implemented (working tree; not yet committed/pushed)
phase: mobile-readiness audit follow-up, Tranche B
approved_by: Tom (2026-06-11 dispatch)
note: ran alongside Tranche 050 (production backend wiring) in the same working
tree; `_active.txt` left at 050 — the two lanes share zero files.

## Audit items closed
- **FLOW-016** — no persistent mobile navigation; every move required the hamburger drawer.
- **FLOW-018** — PO list rendered a 9-column table on phones (horizontal-scroll soup).
- **FLOW-009 / FLOW-015 / FLOW-019** — horizontally scrollable strips (dashboard quick
  actions, group chip rows, inbox view chips) gave no affordance that content continues
  off-screen; inbox bulk checkboxes / row actions under 32px touch minimum.
- **FLOW-010** — dashboard hero meta-rail "Total inventory" chip used full `fmtILS`,
  overflowing the rail on phone widths.

## File manifest
- `src/lib/nav/bottom-nav.ts` — NEW pure module: 5 curated tabs (Dashboard / Production /
  Procurement / Inventory / Inbox); `min_role` looked up from `NAV_MANIFEST` by href
  (drift-proof); `filterBottomNavByRole` (null role → all five, middleware gates),
  `isBottomTabActive` (segment-prefix match), `bottomTabTestId`.
- `src/lib/nav/bottom-nav.test.ts` — NEW 12 unit tests for the above.
- `src/components/layout/MobileBottomNav.tsx` — NEW fixed bottom tab bar, `<md` only:
  `fixed bottom-0 inset-x-0 z-30 border-t border-border/70 bg-bg` + safe-area
  padding-bottom; ≥56px touch targets; active tab via `usePathname` prefix match;
  role-filtered with the same `useSession` source SideNav uses (renders nothing while
  the session loads; all five on load error). z-30 sits below the MobileNav drawer
  backdrop (z-[45]) so the open drawer covers it — no hide logic needed.
- `src/components/layout/AppShellChrome.tsx` — renders `<MobileBottomNav />` below the
  shell flex container; `<main>` bottom padding becomes
  `pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-[max(4rem,env(safe-area-inset-bottom,0px))]`
  (md+ expression identical to the previous inline style).
- `src/components/ui/ScrollFade.tsx` — NEW reusable right-edge fade affordance:
  relative wrapper + caller-styled scroll container + 1px end sentinel watched by an
  IntersectionObserver (root = the container); fade
  (`pointer-events-none absolute right-0 inset-y-0 w-8 bg-gradient-to-l from-bg-raised to-transparent`)
  shows only while overflow exists and hides at scroll end. `contentProps` carries
  role/aria/data-testid through to the scroll container.
- `src/app/(shared)/dashboard/page.tsx` — FLOW-009: QuickActions strip wrapped in
  `ScrollFade` (same row classes); FLOW-010: hero meta-rail Total-inventory chip
  `fmtILS` → `fmtILSCompact` (full value moved into the chip's `title`).
- `src/components/filters/GroupFilterBar.tsx` — FLOW-015: below sm the chip row scrolls
  horizontally inside `ScrollFade` (chips `max-sm:shrink-0`); sm+ wraps exactly as
  before; `role="group"`, aria-label and `data-testid` stay on the row element, so all
  `*-chip-*` / `*-clear` testids are unchanged. Benefits `/inventory`, inventory-flow
  FilterBar and supply flow without touching those pages.
- `src/app/(inbox)/inbox/page.tsx` — FLOW-019: view-chip row wrapped in `ScrollFade`
  (max-sm nowrap scroll); touch targets lifted to ≥32px on `<md` only
  (`max-md:min-h-[32px]` on view chips, bulk select-all label, bulk Clear/Resolve, and
  all 7 row-action buttons/links; row-select checkbox label grows to a 32×32 hit area
  via negative margins with pixel-identical visual position). md+ renders unchanged.
- `src/app/(po)/purchase-orders/page.tsx` — FLOW-018: `<md` renders each PO as a card
  (`po-list-cards` / `po-list-card` + `data-po-id`/`data-status`): PO number prominent,
  supplier, status `POStatusBadge`, expected date with "N days late", total via
  `fmtMoney`; whole card links to the detail page; late rows get the danger left-edge
  bar (inventory mobile-card idiom). Table now `hidden md:block` — markup unchanged,
  `po-list-table` / `po-list-row` testids preserved. KPI tiles, filters, search,
  truncation banner, empty/error states untouched and shared by both layouts.

## Gates / evidence
- `npx tsc --noEmit` — clean.
- `vitest` — 515 passed / 1 failed (516). Baseline before this tranche: 503 passed /
  1 failed (504) — the single failure is pre-existing in
  `src/app/(ops)/stock/production-actual/_lib/report-helpers.test.ts` (Tranche 050
  lane, in flight by another agent). +12 new tests, zero new failures.
- Existing testids preserved (`po-list-table`, `po-list-row`, `inbox-*`,
  `group-filter` family, `inventory-category-filter`, `inventory-used-by-filter`).
- Desktop md+: PO table, inbox rows/chips, group chip rows and dashboard strip render
  with identical classes at md+; `<main>` md+ padding expression unchanged.

## Checklist
- [x] Implemented  - [x] Typecheck  - [x] Vitest  - [ ] Pushed (Tom merges)
