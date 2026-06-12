# Tranche 057 — Inventory Flow mobile pack (ux-flow-audit follow-up)

status: implemented (branch `claude/mobile-navigation-redesign-hyf5o0`; Tom merges)
phase: mobile-readiness, inventory-flow (NOT covered by Tranches 053/054)
approved_by: Tom (2026-06-12 direct dispatch — "הדף inventory flow לא תואם למובייל — תבדוק לעומק ותשפר אותו" + /ux-flow-audit)
audit: ux-flow-architect mobile-focus audit of /planning/inventory-flow, 2026-06-12, 18 findings (FLOW-M01…M18)

## Findings addressed
- **FLOW-M04 + FLOW-M05 + FLOW-M13 (P0, DECISION_GRADE)** — day-level numbers were
  unreachable on touch (hover-only `title` on 24px cells). New `MobileDaySheet`
  bottom sheet (demand LionWheel/Forecast, incoming PO supply, planned-production
  inflow, projected EOD, 14-day sparkline, planned-overlay section, drill-down link);
  day strip redesigned 14-flex-cells → 7-col × 2-row grid of ≥44px buttons.
  M13 resolved via option B (1023px breakpoint kept; card stream now has
  day-level parity — applies to tablets too).
- **FLOW-M01 (P1)** — `useMediaQuery` now returns `boolean | null` (null =
  unresolved); both flow clients render the skeleton until viewport is known, so
  `FlowGridDesktop` can never mount on a phone. (Note: React 18 batching already
  prevented the visible flash in practice; this makes it structural.)
- **FLOW-M02 (P1)** — header Refresh button icon-only `<sm` (aria-label added);
  FG + supply parity.
- **FLOW-M03 (P1)** — `.filter-bar-sticky` top: 0 → `calc(4rem + env(safe-area-inset-top))`
  (below the z-40 TopBar); data-stuck IntersectionObserver rootMargin −64px to match.
  Mobile synopsis strip de-stickied (see M10).
- **FLOW-M07 (P1)** — WorkflowHeader `size="section"` + one-line description on both
  flow tabs; first card visible above the fold on 667px-tall phones.
- **FLOW-M08 (P1)** — InsightsHero banner CTA `basis-full` on phones (own line under
  the count), `sm:ml-auto sm:basis-auto` preserves desktop; min-h-[32px].
- **FLOW-M11 (P1)** — [itemId] KPI strip `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`.
- **FLOW-M17 (P1)** — InventoryFlowTabs `py-1.5` → `py-2` (≥36px targets).
- **FLOW-M06 (P2)** — FilterBar group label "קו מוצר" → "Product line" (English-first
  standard; group NAMES stay Hebrew data values via dir="auto").
- **FLOW-M09 (P2)** — "as of" chip `max-sm:hidden` (FreshnessBadge in header covers it).
- **FLOW-M10 (P2)** — synopsis strip moved out of sticky/-mx-4 full-bleed into a plain
  bordered strip at the top of the card list.
- **FLOW-M12 (P2)** — [itemId] order sub-line `truncate` (long lw_task_id safe).
- **FLOW-M14 (P2, partial)** — family chips single horizontal-scroll row `<sm` inside
  `ScrollFade` (GroupFilterBar/051 idiom, chips max-sm:shrink-0); full disclosure-collapse
  deferred.
- **FLOW-M15 (P2)** — hero row: value block `min-w-0`, sparkline 96→80px shrink-0,
  movement sparkline `hidden sm:inline-block` — "STOCKOUT" safe at 360px.
- **FLOW-M16 (P2)** — VERIFIED NO-FIX-NEEDED: page scrolls on `window`
  (AppShellChrome `<main>` is not an overflow container), so the `window.scrollY`
  pull-to-refresh check is correct. Documented in MobileCardStream header comment.
- **FLOW-M18 (P2)** — ⌘K hint `hidden md:block`; search input `pr-8 md:pr-16`.

## Structural note (MobileItemCard)
The card wrapper changed from one whole-card `<Link>` to: outer `<div>` →
`<Link>` around the body (header/hero/insight/planned-chip) + sibling day-strip
grid of `<button>`s. Buttons cannot legally nest inside an anchor; navigation via
the body, day detail via the strip.

## File manifest
- `src/lib/hooks/useMediaQuery.ts` — `boolean` → `boolean | null` (null until resolved).
  Other consumer (forecast MonthlyGrid) uses truthiness; null ≡ previous `false` default.
- `src/app/(planning)/planning/inventory-flow/_components/MobileDaySheet.tsx` — NEW
  bottom sheet (portal to body, backdrop z-[45]/panel z-50, Escape/backdrop/button close,
  body scroll lock, focus capture+restore, safe-area pb, max-h min(85vh,560px)).
  testids: `mobile-day-sheet`, `mobile-day-sheet-close`.
- `src/app/(planning)/planning/inventory-flow/_components/MobileItemCard.tsx` — strip
  → 7×2 button grid (`mobile-day-strip`), sheet state, hero min-w-0/sparkline 80,
  movement sparkline sm+; `mobile-planned-summary` / `mobile-planned-dot` preserved.
- `src/app/(planning)/planning/inventory-flow/_components/MobileCardStream.tsx` —
  synopsis de-stickied, -mx-4 removed; pull-to-refresh scroll model documented.
- `src/app/(planning)/planning/inventory-flow/InventoryFlowClient.tsx` — null-gate
  skeleton, size="section" + short description, refresh icon-only `<sm` + aria-label.
- `src/app/(planning)/planning/inventory-flow/supply/SupplyFlowClient.tsx` — same three
  changes (parity).
- `src/app/(planning)/planning/inventory-flow/_components/FilterBar.tsx` — family chips
  ScrollFade row `<sm`, "Product line" label, kbd hint md+, pr-8 md:pr-16, observer
  rootMargin −64px.
- `src/app/(planning)/planning/inventory-flow/_components/InsightsHero.tsx` — CTA
  basis-full `<sm`, as-of chip `max-sm:hidden`.
- `src/app/(planning)/planning/inventory-flow/_components/InventoryFlowTabs.tsx` — py-2.
- `src/app/(planning)/planning/inventory-flow/[itemId]/page.tsx` — KPI grid stack `<sm`,
  order sub-line truncate.
- `src/app/globals.css` — `.filter-bar-sticky` top offset.

## Gates / evidence
- `npx tsc --noEmit` — clean.
- `vitest` — 576 passed / 0 failed (72 files), identical to pre-tranche baseline.
- `eslint` on all 10 touched files — 0 errors (1 pre-existing warning in
  InventoryFlowClient.tsx:79 `plannedRows` useMemo deps, untouched by this tranche).
- Desktop ≥1024px: FlowGridDesktop / DayCell / DayPopover / StickyItemPanel / WeekCell
  untouched; header size change (section) and tab py-2 are the only md+ visual deltas.
- Existing testids preserved: `inventory-flow-refresh`, `supply-flow-refresh`,
  `planned-overlay-toggle`, `mobile-planned-summary`, `mobile-planned-dot`,
  `insights-banner-*`, `insights-subrow`, `flow-filter-clear-all`,
  `flow-product-group-filter`, `flow-grid-scroller`, `day-cell*`, `week-cell*`.
- New testids: `mobile-day-sheet`, `mobile-day-sheet-close`, `mobile-day-strip`.

## Deferred (named, not silently dropped)
- FLOW-M14 full filter disclosure-collapse on mobile (current fix caps height via
  single-row scroll; ≤80px target needs a "More filters" disclosure).
- Supply view Hebrew labels ("קבוצת חומר", "לפי קו מוצר") — same English-first
  question as M06 but outside the audited FG surface; Tom to confirm before changing.

## Checklist
- [x] Implemented  - [x] Typecheck  - [x] Vitest  - [x] Lint  - [ ] Merged (Tom)
