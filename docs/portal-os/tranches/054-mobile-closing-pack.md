# Tranche 054 — Final mobile closing pack (production board + admin table safety)

status: implemented (working tree; not yet committed/pushed)
phase: mobile-readiness audit follow-up, final closing tranche
approved_by: Tom (2026-06-11 dispatch — all six audit items pre-approved)
note: `_active.txt` left untouched (shared-tree convention from Tranche
050/051/053).

## Audit items closed
- **FLOW-001 (CRITICAL)** — production-plan board opens scrolled to Monday on
  phones; the TODAY lane is off-screen with no way back but blind swiping.
- **FLOW-002** — lane `minWidth: 196` inline style forces oversized lanes
  below md.
- **FLOW-006** — week navigation row (Previous/Next + range + This week +
  Updated + Refresh) overflows/wraps badly at 390px.
- **FLOW-020** — week-summary footer "View inventory impact" link wrapped in
  `hidden lg:flex` — invisible below lg.
- **FLOW-017** — AddFromRecommendations modal `max-h-[90vh]` lets the footer
  buttons fall below the fold on short phones.
- **FLOW-023** — admin LIST tables without a horizontal-scroll wrapper clip
  on mobile.

## File manifest
- `src/app/(planning)/planning/production-plan/_lib/board-scroll.ts` — NEW.
  Pure geometry for FLOW-001: `boardOverflows` (1px subpixel tolerance),
  `centeredScrollLeft` (clamped to [0, scrollWidth − containerWidth]),
  `isLaneOutOfView` (fully-outside test; partially visible = in view).
- `src/app/(planning)/planning/production-plan/_lib/board-scroll.test.ts` —
  NEW, 13 unit tests over the three helpers (overflow tolerance, centering
  math, both clamps, rounding, left/right/partial visibility).
- `src/app/(planning)/planning/production-plan/page.tsx` —
  - FLOW-001: `boardRef` on the overflow-x-auto board container +
    `todayLaneRef` on today's lane wrapper; a `useEffect` keyed on
    `toIsoDate(weekStart)` (via `autoCenteredWeekRef`) centers the today
    lane via `scrollTo({left, behavior:"auto"})` (manual `scrollLeft`
    fallback) once per week-view load, only after plans data lands
    (`hasData`), only when today is inside the visible week, and only when
    the container actually overflows — desktop never jolts. 60s refetches
    can't re-trigger (week key already consumed). New "Today" jump button in
    the week nav (`board-jump-today`, Calendar icon, smooth scroll): always
    visible below md while today is on the board; at md+ revealed only when
    the lane is fully out of view (`onScroll` + window resize listener feed
    `todayOutOfView` through the pure helpers).
  - FLOW-002: lane wrapper `style={{minWidth:196, flex:1}}` →
    `className="min-w-[140px] md:min-w-[196px] flex-1"` (140px floor below
    md; md+ keeps 196px and `flex:1 1 0%` exactly as before).
  - FLOW-006: week nav restructured. Below md: week-range label on its own
    centered line above (`week-range-mobile`), Previous/Next icon-only
    (labels `hidden md:inline`; aria-labels unchanged), "This week" stays
    text, Refresh icon-only (gains `aria-label`), Updated-HH:MM moves below
    the row as a `text-3xs` caption (`plans-updated-at-mobile`). md+ keeps
    the pre-054 row: inline range label, full button labels, inline
    `plans-updated-at` stamp (testid preserved, now `hidden md:inline`).
  - FLOW-020: footer link wrapper `hidden lg:flex` → `flex` (flex-wrap
    parent gives it its own row on narrow screens; lg layout unchanged).
  - FLOW-017: AddFromRecommendationsModal sheet `max-h-[90vh]` →
    `max-h-[min(90vh,600px)]`.
- `src/app/(economics)/admin/economics/page.tsx` — FLOW-023: the "Missing
  component costs" gap table container gains `overflow-x-auto` (class added
  alongside the existing `overflow-hidden`; zero other changes). This was
  the ONLY admin table in the checked set missing a scroll wrapper.
- `docs/portal-os/tranches/054-mobile-closing-pack.md` — this manifest.
- `docs/portal-os/registry.md` — one new index row.

## FLOW-023 sweep result (which pages actually needed the wrapper)
Checked: admin/items, groups, cost-drafts, components, suppliers,
supplier-items, sku-aliases, sku-health, sku-map, users, jobs, holidays,
planning-policy, masters/boms, masters/health, masters/archive, economics.
- **Needed the wrapper: admin/economics only** (1 of its 4 tables — the
  component-gaps table sat in `overflow-hidden` with no x-scroll).
- Already wrapped (no change, verified per-table): items, groups,
  cost-drafts, components, suppliers, supplier-items, sku-aliases (2/2),
  sku-health (2/2), sku-map, users, planning-policy, masters/boms,
  masters/health, masters/archive, holidays (desktop table already
  `hidden overflow-x-auto sm:block` with a card list below sm), and the
  other 3 economics tables.
- **admin/jobs has no `<table>` at all** (card-based) — nothing to wrap.

## Gates / evidence
- `npx tsc --noEmit` — clean.
- `vitest` — **580 passed / 0 failed (72 files)** = 567 baseline + 13 new
  board-scroll tests; zero existing tests touched.
- Desktop md+ visually unchanged except FLOW-020's link visibility
  (explicitly allowed by the dispatch): md+ keeps full button labels, inline
  range label, inline Updated stamp, 196px lanes; the Today button renders
  at md+ only when today's lane is scrolled fully out of view (impossible
  when the board fits, so wide desktops never show it).
- Existing testids preserved (`production-plan-week`,
  `production-day-lane`, `plans-updated-at`, `plans-refresh`, all modal and
  board testids). New testids: `board-jump-today`, `week-range-mobile`,
  `plans-updated-at-mobile`.

## Deviations (honest)
1. **ProductionDayLane.tsx not modified** — the dispatch listed it for
   FLOW-002, but the 196px floor lives entirely on the lane wrapper div in
   page.tsx (`style={{minWidth:196}}`); the component itself only sets
   `min-h-[180px]`. The fix landed in page.tsx; the component needed zero
   changes.
2. **FLOW-002 via responsive className, not matchMedia** — the dispatch
   offered either; arbitrary-value Tailwind classes
   (`min-w-[140px] md:min-w-[196px]`) are the simplest reliable approach,
   avoid hydration concerns, and keep md+ byte-equivalent.
3. **FLOW-020 visible from md too** — removing `hidden lg:` makes the link
   visible at ALL widths including md (768–1023px), per the item's "make it
   visible at all widths"; the md+-unchanged gate carves this out.
4. **FLOW-023 scope** — 16 of the 17 listed pages needed nothing (15 already
   wrapped per-table, jobs table-less); only one economics table changed.
   The economics div keeps its existing `overflow-hidden` (rounded-corner
   clipping) and gains `overflow-x-auto`, which wins for the x axis.
5. **Updated stamp / week-range duplicated in DOM** — md+ and mobile
   variants are separate CSS-gated elements; the original
   `plans-updated-at` testid stays unique (mobile uses
   `plans-updated-at-mobile`), so existing queries are unaffected.

## Checklist
- [x] Implemented  - [x] Typecheck  - [x] Vitest  - [ ] Pushed (Tom merges)
