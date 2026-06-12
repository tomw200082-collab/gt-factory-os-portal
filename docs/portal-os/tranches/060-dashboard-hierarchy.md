# Tranche 060 — dashboard-hierarchy: Verdict, Flow Ribbon, Today's Work (Phase 2 of 4)

status: proposed (executes only after Tranche 059 lands; Tom screenshot round mid-tranche)
phase: dashboard convergence, Phase 2 (see ../dashboard-target-design.md §4, §7)
source: dashboard-target-design.md v2 (decisions resolved 2026-06-12 under Tom's delegation)

## Design thesis
Phase 1 made the numbers believable; Phase 2 makes the page *focus Tom every
morning*. Three new bands replace seven overlapping sections: a Verdict & Focus
band (Focus Engine + since-last-look deltas + sticky collapse), the Factory
Flow Ribbon (the signature visual: 4 live nodes + quiet OUTBOUND), and one
unified Today's Work queue replacing Critical Today + Urgent Procurement +
Slipped Plans as separate blocks. **No new data sources** — every number and
link is re-plumbed from queries that already exist on the page.

## What lands

1. **Focus Engine** — new pure module `_lib/focus-engine.ts`:
   `resolveFocus(inputs) → { sentence, tone, href, dayType }` implementing the
   7-rule cascade (critical → Sunday-session → due procurement → slipped →
   today's plan → late POs → all-clear + next commitment). Fully unit-tested
   (one test per rule + precedence tests).
2. **Band 0 — Verdict & Focus** — new `_components/bands/VerdictBand.tsx`:
   greeting+date (once), focus sentence, state pill (moved from hero), data
   as-of stamp (replaces "Auto-refreshing" chip), "since you last looked"
   chips (localStorage `gt-dash-last-visit`, max 3, hidden first visit),
   sticky 40px collapse after scroll. Deletes DashboardHero's date plate +
   "Here is the state…" sentence.
3. **Band 1 — Flow Ribbon** — new `_components/bands/FlowRibbon.tsx` +
   `FlowNode.tsx`: 5 nodes per the node spec table (INBOUND / MATERIALS /
   PRODUCTION / FG / quiet OUTBOUND), state dots, display numbers, as-of
   micro-footers, hover/tap popovers (top-3 drill rows), directional
   connectors with dash-flow **only when a movement crossed that edge today**
   (derived from the existing ledger/actuals queries; reduced-motion static).
   Mobile: horizontal scroll-snap + ScrollFade + snap dots, nodes ≥148px.
4. **Band 2 — Today's Work** — new `_components/bands/TodaysWork.tsx`:
   merges critical-today + urgent-procurement + slipped-plans + late-PO rows
   into one ranked queue (severity → category weight → age), verb-object
   titles, MRP why-now line (on-hand · incoming · demand → short-by, from
   useInventoryFlow where resolvable), one transaction button per row, cap 8
   + inbox link, empty state = all-clear + Tomorrow strip.
5. **Page reorder** — `page.tsx`: Bands 0/1/2 then existing Numbers / Trends /
   Activity sections; role content rules (operator: no Band 3; planner:
   procurement boost flag; viewer: 0/1/4); fix reveal-delay tail (unique
   delays); KPI grid `lg:grid-cols-2 xl:grid-cols-4`.
6. **Removals** (replaced, not lost): hero date plate + restated-date
   sentence, "Auto-refreshing" chip, the three separate live blocks
   (CriticalTodayBlock / UrgentProcurementBlock / SlippedPlansBlock render
   logic folds into TodaysWork; their queries, links, and copy are reused),
   duplicate "View movement log" footer in RecentProduction.

Out of scope: Band 3 neutralization, motion/color budget enforcement, chart
axes, merged activity feed, lazy mounting (Phase 3 / Tranche 061); component
file-size split beyond the new band files (Phase 4); OUTBOUND live data
(backend lane).

## File manifest
- `src/app/(shared)/dashboard/_lib/focus-engine.ts` — NEW pure module.
- `src/app/(shared)/dashboard/_lib/focus-engine.test.ts` — NEW unit tests.
- `src/app/(shared)/dashboard/_lib/queue.ts` — NEW pure module: row mapping +
  ranking + why-now derivation. With `queue.test.ts`.
- `src/app/(shared)/dashboard/_components/bands/VerdictBand.tsx` — NEW.
- `src/app/(shared)/dashboard/_components/bands/FlowRibbon.tsx` — NEW.
- `src/app/(shared)/dashboard/_components/bands/FlowNode.tsx` — NEW.
- `src/app/(shared)/dashboard/_components/bands/TodaysWork.tsx` — NEW.
- `src/app/(shared)/dashboard/_components/DashboardHero.tsx` — slimmed or
  retired into VerdictBand (decided at fix time; no orphan left).
- `src/app/(shared)/dashboard/page.tsx` — band reorder, role rules, removals,
  reveal/grid fixes.
- `src/app/globals.css` — NEW `.dash-ribbon*`, `.dash-queue*`,
  `.dash-verdict*` classes (additive, token-driven); deletions limited to
  rules orphaned by removed elements.
- `tests/e2e/dashboard.spec.ts` — extend the @mocked spec: focus sentence
  renders, ribbon nodes link, queue ranks + caps, sticky collapse exists.

## Verification gates
- `npx tsc --noEmit` clean; `vitest` green (N/N incl. focus-engine + queue);
  Playwright @mocked dashboard spec green.
- **Tom screenshot round** (light/dark × mobile/desktop) before merge — taste
  veto checkpoint per design-doc §8.
- Evidence pair: before/after full-page captures; section count 14 → ≤9;
  every removed element's job mapped to its replacement in the PR body.

## Behaviour preserved
- Every deep link, query key, refetch cadence, and role gate that exists
  today survives (links may move bands, never disappear).
- All-clear semantics preserved: empty queue shows one ribbon (not three) +
  Tomorrow strip.
- English-first UI, compact-₪ + tooltip, reduced-motion gating — unchanged.
