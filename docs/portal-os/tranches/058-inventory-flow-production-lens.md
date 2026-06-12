# Tranche 058 — Inventory Flow production lens: numbers on mobile, operator-controlled ordering

status: implemented (branch `claude/mobile-navigation-redesign-hyf5o0`; Tom merges)
phase: inventory-flow production-planning UX (follow-up to Tranche 057)
approved_by: Tom (2026-06-12 dispatch with screenshot — "זה עדיין לא מראה מספרים. תשפר את העיצוב עוד יותר… תחשוב בצורה גאונית איך הסינון והסיווג צריכים לעבוד, גם שאוכל להחליט בקלות מה רואים מבחינת הסדר מלמעלה למטה")

## Design thesis
The operator's question on this page is "what do I produce next, and how much" —
not "what is red". Three gaps blocked that: (1) mobile showed colors with no
quantities; (2) the list order was fixed (risk sort) with no way to re-frame it
for batch planning; (3) items rescued by PLANNED production looked identical to
items needing a new decision.

## What landed
1. **Numbers everywhere on mobile**
   - Day-strip cells now carry the projected end-of-day on-hand number; on
     shortfall days they show the NEGATIVE unfilled gap (−120 = "how much is
     missing"), matching desktop DayCell semantics. Cells use the same 5-tier
     production-aware palette as the desktop grid (`dayCellClassNameProduction`)
     + the non-working stripe — color now reads identically on both surfaces.
   - New card digest row (`mobile-digest-row`): **On hand · Demand 14d ·
     Unfilled 14d (danger, = minimum batch) or Incoming 14d**.
2. **Operator-controlled ordering** — new pure module `_lib/production-lens.ts`,
   URL-backed `?sort=`, chips row ("Order") in FilterBar, honored by BOTH the
   mobile card stream and the desktop grid:
   - **Urgency** (default, param absent — identical to the pre-058 risk sort)
   - **Biggest gap** — Σ 14-day production-aware shortfall desc ("biggest batches needed")
   - **Demand** — Σ 14-day LionWheel+Forecast demand desc ("plan the volume runs")
   - **Product line** — family A→Z, urgency within (batch production by line)
   - Sort participates in `Clear all` + non-default detection; unknown values
     fall back to urgency (`parseSortKey`).
3. **Plan awareness** — `coveredByPlan(item)`: blind projection stocks out but
   production-aware does not ⇒ planned production is what saves it. Card gets an
   info badge **"Covered by plan"** (`mobile-covered-by-plan`) and the insight
   line says "Planned production covers the projected stockout — verify it
   lands" instead of an alarming stockout date that contradicted the
   production-aware hero. Stockout insights now use the production-aware date
   when present.

## File manifest
- `_lib/production-lens.ts` — NEW pure module: `FlowSortKey`, `FLOW_SORT_OPTIONS`,
  `parseSortKey`, `sortItems` (stable, non-mutating), `demandSum14`,
  `incomingSum14`, `shortfallSum14`, `coveredByPlan`.
- `_lib/production-lens.test.ts` — NEW 11 unit tests.
- `_components/FilterBar.tsx` — "Order" chip row (ScrollFade single row `<sm`),
  `?sort=` in clear-all + non-default detection. testids `flow-sort`,
  `flow-sort-<key>`.
- `_components/MobileItemCard.tsx` — cell numbers (EOD / −gap), 5-tier palette +
  non-working stripe, digest row, covered-by-plan badge, production-aware insight.
- `_components/MobileCardStream.tsx` — `sortKey` prop (default urgency) replaces
  internal fixed risk sort.
- `_components/FlowGridDesktop.tsx` — same `sortKey` prop, same default.
- `InventoryFlowClient.tsx` — reads `?sort=`, passes to both renderers.

## Behaviour preserved
- Default order (no `?sort=`) is byte-identical to the old `compareItemsByRisk`.
- Supply view passes no sortKey → unchanged (and FilterBar there is the FG one
  only; supply has its own filter row — untouched).
- All existing testids preserved; day-sheet tap behaviour (Tranche 057) unchanged.

## Gates / evidence
- `npx tsc --noEmit` — clean.
- `vitest` — 587 passed / 0 failed (73 files; +11 new production-lens tests).
- `eslint` on the route — 0 errors (1 pre-existing warning, untouched line).

## Checklist
- [x] Implemented  - [x] Typecheck  - [x] Vitest  - [x] Lint  - [ ] Merged (Tom)
